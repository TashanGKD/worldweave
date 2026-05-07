import type { WorldScene, WorldSourceKnowledgeState, WorldSignal } from './types';
import { getSourceKnowledgeSnapshot, syncSourceKnowledgeSnapshot } from './livebench';
import { loadSourceCatalog } from './source-catalog';

const SOURCE_LATEST_SIGNAL_STALE_HOURS = 48;

function sourceFreshness(latestSignalPublishedAt: string | null) {
  if (!latestSignalPublishedAt) {
    return {
      latest_signal_age_hours: null,
      freshness_status: 'unknown' as const,
      issues: ['信源知识库还没有可用的 latest_signal_published_at。'],
    };
  }
  const ageHours = (Date.now() - Date.parse(latestSignalPublishedAt)) / 3600000;
  if (!Number.isFinite(ageHours)) {
    return {
      latest_signal_age_hours: null,
      freshness_status: 'unknown' as const,
      issues: ['latest_signal_published_at 无法解析。'],
    };
  }
  const roundedAgeHours = Number(ageHours.toFixed(2));
  return {
    latest_signal_age_hours: roundedAgeHours,
    freshness_status: roundedAgeHours > SOURCE_LATEST_SIGNAL_STALE_HOURS ? ('stale' as const) : ('fresh' as const),
    issues:
      roundedAgeHours > SOURCE_LATEST_SIGNAL_STALE_HOURS
        ? [`最新 signal 已经 ${roundedAgeHours} 小时未更新，超过 ${SOURCE_LATEST_SIGNAL_STALE_HOURS} 小时健康线。`]
        : [],
  };
}

async function enrichSourceKnowledgeState(state: WorldSourceKnowledgeState): Promise<WorldSourceKnowledgeState> {
  const catalog = await loadSourceCatalog().catch(() => null);
  const freshness = sourceFreshness(state.latest_signal_published_at);
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
        ...freshness,
        next_batch: [],
        note:
          freshness.freshness_status === 'stale'
            ? 'source catalog 当前不可用，且信源快照已经偏旧；需要确认后台刷新是否仍在推进。'
            : 'source catalog 当前不可用；稳定信源上架与降级策略暂时只能按运行时观测执行。',
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
      ...freshness,
      next_batch: catalog.intake_summary?.next_batch || [],
      note:
        freshness.freshness_status === 'stale'
          ? '信源 catalog 可用，但最新 signal 已偏旧；应优先检查后台 source refresh 是否卡住。'
          : 'anchor/context 信源会优先进入稳定池；运行失败的信源会在冷却期内自动降权，下一批可接入 skill 会从 source catalog 的 next_batch 中持续补位。',
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
