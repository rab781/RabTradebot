# Multi-stage Docker build for RabTradebot
# Base image follows roadmap requirement: node:20-alpine

FROM node:20-alpine AS builder

WORKDIR /app

# Native dependencies for packages such as canvas and Prisma engines
RUN apk add --no-cache python3 make g++ libc6-compat cairo-dev pango-dev jpeg-dev giflib-dev pixman-dev

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY config ./config
COPY public ./public

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat cairo pango jpeg giflib pixman

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
COPY config ./config
COPY public ./public
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/enhancedBot.js"]
