#!/usr/bin/env bash
set -euo pipefail

APP_NAME="rabtradebot"
BRANCH="main"

printf "\n==> Pull latest code (%s)\n" "$BRANCH"
git pull origin "$BRANCH"

printf "\n==> Install dependencies (including dev for build)\n"
npm ci

printf "\n==> Run Prisma migrations\n"
npx prisma migrate deploy

printf "\n==> Build project\n"
npm run build

printf "\n==> Prune devDependencies\n"
npm prune --production

printf "\n==> Restart PM2 app\n"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start ecosystem.config.js --env production
fi

printf "\n==> Deployment complete\n"
pm2 status "$APP_NAME"
