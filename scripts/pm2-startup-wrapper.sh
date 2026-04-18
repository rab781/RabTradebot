#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm not found at $NVM_DIR/nvm.sh"
  exit 1
fi

# Load nvm and use the version pinned in .nvmrc (or default alias).
# This avoids hardcoding a versioned Node path in startup services.
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
if [[ -f "$REPO_DIR/.nvmrc" ]]; then
  nvm use --silent >/dev/null
else
  nvm use default --silent >/dev/null
fi

cd "$REPO_DIR"

# Restore previous process list if present; otherwise start from ecosystem.
if npx pm2 resurrect; then
  exit 0
fi

npx pm2 start ecosystem.config.js --env production
npx pm2 save
