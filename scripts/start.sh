#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
BUILD_LOCK_FILE="${BUILD_LOCK_FILE:-/tmp/world-threads-build.lock}"

has_production_build() {
    [[ -s ".next/BUILD_ID" && -f ".next/routes-manifest.json" && -d ".next/server/app" ]]
}

ensure_production_build() {
    (
        exec 9>"${BUILD_LOCK_FILE}"
        flock 9

        cd "${COZE_WORKSPACE_PATH}"
        if has_production_build; then
            echo "Production build detected."
            exit 0
        fi

        echo "Production build missing, rebuilding before start..."
        WORLD_SKIP_BUILD_LOCK=1 bash "./scripts/build.sh"
    )
}

start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    if [[ -f ".env.local" ]]; then
        set -a
        # Prefer workspace-local runtime values over outer shell leftovers.
        source ".env.local"
        export ANTHROPIC_BASE_URL="${MINIMAX_BASE_URL:-${ANTHROPIC_BASE_URL:-https://api.minimaxi.com/anthropic}}"
        export ANTHROPIC_API_KEY="${MINIMAX_API_KEY:-${ANTHROPIC_API_KEY:-}}"
        unset ANTHROPIC_AUTH_TOKEN || true
        set +a
    fi
    ensure_production_build
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    npx next start --port ${DEPLOY_RUN_PORT}
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
