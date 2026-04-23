#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

RUNTIME_HISTORY_FILE=".cache/world-runtime-history.json"
SOURCE_KNOWLEDGE_STATE_FILE=".cache/world-source-knowledge-state.json"
SOURCE_KNOWLEDGE_GRAPH_DIR=".cache/world-source-knowledge-graphs"
SOURCE_KNOWLEDGE_ARENA_CACHE_FILE=".cache/world-source-knowledge-arena-cache.json"
SOURCE_KNOWLEDGE_ZVEC_DIR=".cache/world-source-knowledge-zvec"
SOURCE_KNOWLEDGE_GRAPHIFY_FILE=".cache/graphify_run_result.json"
LEGACY_GRAPHIFY_DIR=".cache/world-graphify"
LEGACY_LIVEBENCH_STATE_FILE=".cache/world-livebench-state.json"
LEGACY_LIVEBENCH_GRAPH_DIR=".cache/world-livebench-graphs"
LEGACY_LIVEBENCH_ARENA_CACHE_FILE=".cache/world-livebench-arena-cache.json"
LEGACY_LIVEBENCH_ZVEC_DIR=".cache/world-livebench-zvec"
LEGACY_WORLD_QUESTION_SNAPSHOTS=(
  ".cache/world_questions_5000.json"
  ".cache/world_questions_5001_after_graphify_opt.json"
)

echo "Resetting world source-knowledge and livebench runtime data..."

rm -f "${RUNTIME_HISTORY_FILE}"
rm -f "${SOURCE_KNOWLEDGE_STATE_FILE}"
rm -rf "${SOURCE_KNOWLEDGE_GRAPH_DIR}"
rm -f "${SOURCE_KNOWLEDGE_ARENA_CACHE_FILE}"
rm -rf "${SOURCE_KNOWLEDGE_ZVEC_DIR}"
rm -f "${SOURCE_KNOWLEDGE_GRAPHIFY_FILE}"
rm -rf "${LEGACY_GRAPHIFY_DIR}"
rm -f "${LEGACY_LIVEBENCH_STATE_FILE}"
rm -rf "${LEGACY_LIVEBENCH_GRAPH_DIR}"
rm -f "${LEGACY_LIVEBENCH_ARENA_CACHE_FILE}"
rm -rf "${LEGACY_LIVEBENCH_ZVEC_DIR}"
for snapshot in "${LEGACY_WORLD_QUESTION_SNAPSHOTS[@]}"; do
  rm -f "${snapshot}"
done
find .cache -maxdepth 1 -type f \( -name 'world-livebench-state.json.*.tmp' -o -name 'world-livebench-arena-cache.json.*.tmp' \) -delete
find .cache -maxdepth 2 -type f -name '*.tmp' -path '.cache/world-livebench-graphs/*' -delete

echo "Removed:"
echo "- ${RUNTIME_HISTORY_FILE}"
echo "- ${SOURCE_KNOWLEDGE_STATE_FILE}"
echo "- ${SOURCE_KNOWLEDGE_GRAPH_DIR}"
echo "- ${SOURCE_KNOWLEDGE_ARENA_CACHE_FILE}"
echo "- ${SOURCE_KNOWLEDGE_ZVEC_DIR}"
echo "- ${SOURCE_KNOWLEDGE_GRAPHIFY_FILE}"
echo "- ${LEGACY_GRAPHIFY_DIR}"
echo "- ${LEGACY_LIVEBENCH_STATE_FILE}"
echo "- ${LEGACY_LIVEBENCH_GRAPH_DIR}"
echo "- ${LEGACY_LIVEBENCH_ARENA_CACHE_FILE}"
echo "- ${LEGACY_LIVEBENCH_ZVEC_DIR}"
for snapshot in "${LEGACY_WORLD_QUESTION_SNAPSHOTS[@]}"; do
  echo "- ${snapshot}"
done
echo "- legacy tmp files under .cache/"
echo
echo "Preserved:"
echo "- signal cache"
echo "- translation cache"
echo "- alignment cache"
echo
echo "World source-knowledge runtime reset completed."
