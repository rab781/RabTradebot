# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Native dependencies for packages such as canvas and Prisma engines
RUN apk add --no-cache python3 make g++ libc6-compat cairo-dev pango-dev jpeg-dev giflib-dev pixman-dev

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY config ./config 2>/dev/null || true
COPY public ./public 2>/dev/null || true

RUN npx prisma generate
RUN npm run build

# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Runtime native libraries
RUN apk add --no-cache libc6-compat cairo pango jpeg giflib pixman wget

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output, prisma client, and static assets
COPY prisma ./prisma
COPY config ./config 2>/dev/null || true
COPY public ./public 2>/dev/null || true
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Create directories for runtime data
RUN mkdir -p logs models data

# Health check for container orchestrators (Docker Compose, K8s, etc.)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

EXPOSE 3000

# Volume hints for persistent data:
#   /app/data    — SQLite database (dev) or connection cache
#   /app/models  — Trained ML model files (.json weights)
#   /app/logs    — Structured log output
VOLUME ["/app/data", "/app/models", "/app/logs"]

CMD ["node", "dist/enhancedBot.js"]
