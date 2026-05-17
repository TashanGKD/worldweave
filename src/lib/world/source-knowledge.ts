import type { WorldScene, WorldSourceKnowledgeState, WorldSignal } from './types';
import { getSourceKnowledgeSnapshot, syncSourceKnowledgeSnapshot } from './livebench';
import { loadRuntimeCatalogSources, loadSourceCatalog } from './source-catalog';

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
  const [catalog, runtimeSources] = await Promise.all([
    loadSourceCatalog().catch(() => null),
    loadRuntimeCatalogSources().catch(() => []),
  ]);
  const freshness = sourceFreshness(state.latest_signal_published_at);
  const runtimeSourceCount = runtimeSources.length;
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
            ? '当前信号快照已经偏旧；优先恢复现有运行源的更新。'
            : '当前按核心 API 与已验证可直连的 RSS/API 可用池组织日报；失败源保留归档等待复检。',
      },
    };
  }

  return {
    ...state,
    source_health: {
      stable_source_count: runtimeSourceCount || catalog.intake_summary?.stable_source_count || 0,
      watchlist_source_count: catalog.intake_summary?.watchlist_source_count || 0,
      blocked_or_unknown_source_count: catalog.connectivity_counts?.blocked_or_unknown || 0,
      runtime_ready_skill_count: catalog.intake_summary?.runtime_ready_skill_count || 0,
      context_ready_skill_count: catalog.intake_summary?.context_ready_skill_count || 0,
      weak_signal_skill_count: catalog.intake_summary?.weak_signal_skill_count || 0,
      blocked_skill_count: catalog.intake_summary?.blocked_skill_count || 0,
      ...freshness,
      next_batch: [],
      note:
        freshness.freshness_status === 'stale'
          ? '当前信号快照已经偏旧；优先恢复现有运行源的更新。'
          : '当前服务核心 API 与已验证可直连的 RSS/API 可用池；失败源保留归档等待复检。',
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
