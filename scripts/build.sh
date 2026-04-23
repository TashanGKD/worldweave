#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
BUILD_LOCK_FILE="${BUILD_LOCK_FILE:-/tmp/world-threads-build.lock}"

cd "${COZE_WORKSPACE_PATH}"

run_build() {
    echo "Installing dependencies..."
    pnpm install --prod=false --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

    echo "Building the project..."
    npx next build

    echo "Build completed successfully!"
}

if [[ "${WORLD_SKIP_BUILD_LOCK:-0}" == "1" ]]; then
    run_build
else
    (
        exec 9>"${BUILD_LOCK_FILE}"
        flock 9
        run_build
    )
fi
