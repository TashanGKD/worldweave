#!/bin/bash
set -Eeuo pipefail

WORLD_WORKSPACE_PATH="${WORLD_WORKSPACE_PATH:-$(pwd)}"

cd "${WORLD_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
