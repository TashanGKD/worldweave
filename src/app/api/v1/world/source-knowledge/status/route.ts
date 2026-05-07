import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getWorldSourceKnowledge } from '@/lib/world/runtime';
import { readWorldApiSnapshot, writeWorldApiSnapshot } from '@/lib/world/api-snapshot';
import type { WorldScene, WorldSourceKnowledgeState } from '@/lib/world/types';

const SOURCE_STATUS_FAST_TIMEOUT_MS = 2500;
const SOURCE_STATUS_FRESH_TIMEOUT_MS = 45000;
const SOURCE_STATUS_SNAPSHOT_MAX_AGE_MS = 90 * 60 * 1000;
const SOURCE_STATUS_STALE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SOURCE_LATEST_SIGNAL_STALE_HOURS = 48;

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function isStateFresh(state: WorldSourceKnowledgeState | null, maxAgeMs: number) {
  const timestamp = state?.generated_at ? new Date(state.generated_at).getTime() : NaN;
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
}

function fallbackFreshness(latestSignalPublishedAt: string | null) {
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

async function readFallbackSourceStatus(scene: WorldScene): Promise<WorldSourceKnowledgeState | null> {
  try {
    const statePath = path.join(process.cwd(), '.cache', 'world-source-knowledge-state.json');
    const refreshStatusPath = path.join(process.cwd(), '.cache', 'world-source-refresh-status.json');
    const [stateRaw, refreshRaw] = await Promise.all([
      fs.readFile(statePath, 'utf-8'),
      fs.readFile(refreshStatusPath, 'utf-8').catch(() => '{}'),
    ]);
    const state = JSON.parse(stateRaw) as {
      last_source_knowledge_synced_at?: string | null;
      last_source_knowledge_signal_count?: number | null;
      last_embedding_backend?: string | null;
      source_status?: { embeddings?: string | null };
      chunks?: Array<{
        signal_id?: string | null;
        published_at?: string | null;
        embedding_backend?: string | null;
        embedding_model?: string | null;
        embedding?: unknown;
      }>;
    };
    const refresh = JSON.parse(refreshRaw) as {
      finished_at?: string | null;
      outputs?: {
        connectivity_counts?: { direct?: number; unstable?: number; blocked_or_unknown?: number };
        coverage?: { high_value_total?: number; endpoint_covered?: number; site_covered?: number };
      };
      self_healing?: {
        runtime_failure_count?: number;
        failure_groups?: Record<string, unknown[]>;
      };
    };
    const chunks = Array.isArray(state.chunks) ? state.chunks : [];
    const signalIds = new Set(chunks.map((chunk) => chunk.signal_id).filter(Boolean));
    const timestamps = chunks
      .map((chunk) => (chunk.published_at ? Date.parse(chunk.published_at) : NaN))
      .filter((value) => Number.isFinite(value));
    const backendCounts = new Map<string, number>();
    for (const chunk of chunks) {
      const backend = String(chunk.embedding_backend || state.last_embedding_backend || 'unknown');
      backendCounts.set(backend, (backendCounts.get(backend) || 0) + 1);
    }
    const primaryBackend = [...backendCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || state.last_embedding_backend || null;
    const direct = refresh.outputs?.connectivity_counts?.direct || 0;
    const unstable = refresh.outputs?.connectivity_counts?.unstable || 0;
    const blocked = refresh.outputs?.connectivity_counts?.blocked_or_unknown || 0;
    const runtimeFailures = refresh.self_healing?.runtime_failure_count || 0;
    const latestSignalPublishedAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
    const freshness = fallbackFreshness(latestSignalPublishedAt);
    return {
      generated_at: state.last_source_knowledge_synced_at || refresh.finished_at || new Date().toISOString(),
      scene,
      window_days: 30,
      signal_count: typeof state.last_source_knowledge_signal_count === 'number' ? state.last_source_knowledge_signal_count : signalIds.size,
      indexed_signal_count: signalIds.size,
      chunk_count: chunks.length,
      zvec_group_count: backendCounts.size,
      last_synced_at: state.last_source_knowledge_synced_at || refresh.finished_at || null,
      last_embedding_backend: primaryBackend,
      latest_signal_published_at: latestSignalPublishedAt,
      oldest_signal_published_at: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
      source_status: {
        embeddings:
          state.source_status?.embeddings ||
          `${primaryBackend || '本地索引'} 正在提供信源知识库兜底快照。`,
      },
      source_health: {
        stable_source_count: direct,
        watchlist_source_count: unstable,
        blocked_or_unknown_source_count: blocked,
        runtime_ready_skill_count: direct,
        context_ready_skill_count: refresh.outputs?.coverage?.high_value_total || 0,
        weak_signal_skill_count: unstable,
        blocked_skill_count: blocked,
        ...freshness,
        next_batch: [],
        note:
          freshness.freshness_status === 'stale'
            ? '完整信源状态正在刷新，但最近一次落盘 signal 已偏旧；需要检查后台 source refresh。'
            : '完整信源状态正在刷新，当前返回最近一次落盘的信源知识库简报。',
      },
      governance: {
        generated_at: refresh.finished_at || new Date().toISOString(),
        runtime_failure_count: runtimeFailures,
        cooling_down_count: 0,
        monitor_source_count: direct + unstable + blocked,
        changed_source_count: 0,
        high_quality_source_count: refresh.outputs?.coverage?.endpoint_covered || direct,
        recommended_source_count: refresh.outputs?.coverage?.site_covered || 0,
        latest_poll_finished_at: refresh.finished_at || null,
        recent_runtime_failures: [],
        cooling_down_sources: [],
        recommended_sources: [],
      },
      embedding_groups: [...backendCounts.entries()].map(([backend, count]) => ({
        backend,
        model: backend,
        dimension: 0,
        count,
      })),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const bypassSnapshot = url.searchParams.get('fresh') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    let staleSnapshot: WorldSourceKnowledgeState | null = null;
    if (!bypassSnapshot) {
      const snapshot = await readWorldApiSnapshot<WorldSourceKnowledgeState>(
        scene,
        'source_status',
        SOURCE_STATUS_SNAPSHOT_MAX_AGE_MS,
      );
      if (isStateFresh(snapshot, SOURCE_STATUS_SNAPSHOT_MAX_AGE_MS)) {
        return NextResponse.json(snapshot, {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-snapshot': '1',
          },
        });
      }
      staleSnapshot = await readWorldApiSnapshot<WorldSourceKnowledgeState>(
        scene,
        'source_status',
        SOURCE_STATUS_STALE_SNAPSHOT_MAX_AGE_MS,
      );
      if (staleSnapshot) {
        const snapshot = staleSnapshot;
        return NextResponse.json(
          {
            ...snapshot,
            snapshot_warning: '信源知识库正在刷新，当前返回上一版可用快照。',
          },
          {
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              'x-world-snapshot': '1',
              'x-world-stale-snapshot': '1',
            },
          },
        );
      }
    }

    const timeoutMs = bypassSnapshot ? SOURCE_STATUS_FRESH_TIMEOUT_MS : SOURCE_STATUS_FAST_TIMEOUT_MS;
    const sourceStatus = await Promise.race([
      getWorldSourceKnowledge(scene),
      timeout<WorldSourceKnowledgeState | null>(timeoutMs, null),
    ]);
    if (!sourceStatus) {
      const fallbackStatus = await readFallbackSourceStatus(scene);
      if (fallbackStatus) {
        void writeWorldApiSnapshot(scene, 'source_status', fallbackStatus);
        return NextResponse.json(
          {
            ...fallbackStatus,
            snapshot_warning: '完整信源状态正在刷新，当前返回最近一次落盘简报。',
          },
          {
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              'x-world-fallback': 'disk-source-status',
            },
          },
        );
      }
      if (staleSnapshot) {
        const snapshot = staleSnapshot as WorldSourceKnowledgeState;
        return NextResponse.json(
          {
            ...snapshot,
            snapshot_warning: '信源知识库正在刷新，当前返回上一版可用快照。',
          },
          {
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              'x-world-snapshot': '1',
              'x-world-stale-snapshot': '1',
            },
          },
        );
      }
      return NextResponse.json(
        { error: 'Source knowledge is warming; retry after the next background snapshot.' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }
    void writeWorldApiSnapshot(scene, 'source_status', sourceStatus);
    return NextResponse.json(sourceStatus, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'x-world-snapshot': '0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load source knowledge state' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
