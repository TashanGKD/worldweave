#!/bin/bash
set -Eeuo pipefail

WORLD_WORKSPACE_PATH="${WORLD_WORKSPACE_PATH:-$(pwd)}"

cd "${WORLD_WORKSPACE_PATH}"

echo "Cleaning generated research and cache artifacts..."

rm -rf .cache
rm -f tsconfig.tsbuildinfo

mkdir -p logs
find logs -maxdepth 1 -type f -name 'pm2-*.log' -exec truncate -s 0 {} \;

echo "Workspace cleanup completed."
