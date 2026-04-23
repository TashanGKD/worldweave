import type { WorldScene, WorldSourceKnowledgeState, WorldSignal } from './types';
import { getSourceKnowledgeSnapshot, syncSourceKnowledgeSnapshot } from './livebench';
import { loadSourceCatalog } from './source-catalog';

async function enrichSourceKnowledgeState(state: WorldSourceKnowledgeState): Promise<WorldSourceKnowledgeState> {
  const catalog = await loadSourceCatalog().catch(() => null);
  if (!catalog) {
    return {
      ...state,
      source_health: {
        stable_source_count: 0,
        watchlist_source_count: 0,
        blocked_or_unknown_source_count: 0,
        runtime_ready_skill_count: 0,
        context_ready_skill_count: 0,
        weak_signal_skill_count: 0,
        blocked_skill_count: 0,
        next_batch: [],
        note: 'source catalog 当前不可用；稳定信源上架与降级策略暂时只能按运行时观测执行。',
      },
    };
  }

  return {
    ...state,
    source_health: {
      stable_source_count: catalog.intake_summary?.stable_source_count || 0,
      watchlist_source_count: catalog.intake_summary?.watchlist_source_count || 0,
      blocked_or_unknown_source_count: catalog.connectivity_counts?.blocked_or_unknown || 0,
      runtime_ready_skill_count: catalog.intake_summary?.runtime_ready_skill_count || 0,
      context_ready_skill_count: catalog.intake_summary?.context_ready_skill_count || 0,
      weak_signal_skill_count: catalog.intake_summary?.weak_signal_skill_count || 0,
      blocked_skill_count: catalog.intake_summary?.blocked_skill_count || 0,
      next_batch: catalog.intake_summary?.next_batch || [],
      note:
        'anchor/context 信源会优先进入稳定池；运行失败的信源会在冷却期内自动降权，下一批可接入 skill 会从 source catalog 的 next_batch 中持续补位。',
    },
  };
}

export async function getWorldSourceKnowledgeState(
  scene: WorldScene,
  signals: WorldSignal[],
): Promise<WorldSourceKnowledgeState> {
  return enrichSourceKnowledgeState(await getSourceKnowledgeSnapshot(scene, signals));
}

export async function syncWorldSourceKnowledgeState(
  scene: WorldScene,
  signals: WorldSignal[],
): Promise<WorldSourceKnowledgeState> {
  return enrichSourceKnowledgeState(await syncSourceKnowledgeSnapshot(scene, signals));
}
