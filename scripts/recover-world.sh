#!/bin/bash
set -Eeuo pipefail

WORLD_WORKSPACE_PATH="${WORLD_WORKSPACE_PATH:-$(pwd)}"

cd "${WORLD_WORKSPACE_PATH}"

echo "Rebuilding production bundle..."
bash ./scripts/build.sh

echo "Restarting PM2 app..."
pm2 restart xia-report-world --update-env

echo "Running health check..."
pnpm health:world

echo "Recovery flow completed."
