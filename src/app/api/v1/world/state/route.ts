import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveRequestOrigin } from '@/lib/request-origin';
import {
  getCachedWorldDashboardState,
  getWorldDashboardState,
  isRenderableDashboardState,
  isWorldRuntimeHeavyRefreshEnabled,
} from '@/lib/world/runtime';
import { isPublicEventSignal, isSourceSnapshotLikeSignal } from '@/lib/world/signal-quality';
import type { WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATE_TIMEOUT_MS = 30000;
const DASHBOARD_STATE_MAX_AGE_MS = 30 * 60 * 1000;
const CACHED_STATE_TIMEOUT_MS = 1500;
const SIGNAL_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-signal-cache.json');

type CachedDashboardState = Awaited<ReturnType<typeof getCachedWorldDashboardState>>;

function withCachedStateTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), CACHED_STATE_TIMEOUT_MS);
    }),
  ]);
}

function isDashboardStateFresh(state: CachedDashboardState): state is NonNullable<CachedDashboardState> {
  const timestamp = state?.generated_at ? new Date(state.generated_at).getTime() : NaN;
  return Number.isFinite(timestamp) && Date.now() - timestamp <= DASHBOARD_STATE_MAX_AGE_MS;
}

function hasSourceSnapshotPollution(state: CachedDashboardState): boolean {
  if (!state) return false;
  const feeds = [
    ...(Array.isArray(state.graph_signals) ? state.graph_signals : []),
    ...(Array.isArray(state.top_signals) ? state.top_signals : []),
    ...(Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []),
  ];
  return feeds.some(isSourceSnapshotLikeSignal);
}

function sanitizeCachedDashboardState(state: NonNullable<CachedDashboardState>) {
  const graphSignals = (Array.isArray(state.graph_signals) ? state.graph_signals : []).filter(isPublicEventSignal).slice(0, 32);
  const topSignals = (Array.isArray(state.top_signals) ? state.top_signals : []).filter(isPublicEventSignal).slice(0, 120);
  const knowledgeSignals = (Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []).filter(isPublicEventSignal).slice(0, 12);
  const eventIds = new Set([...graphSignals, ...topSignals, ...knowledgeSignals].map((signal) => signal.id));
  const nodes = (Array.isArray(state.nodes) ? state.nodes : [])
    .filter((node) => isPublicEventSignal(node) && (eventIds.size === 0 || eventIds.has(String(node.node_id || '').replace(/:explore$/, ''))))
    .slice(0, 240);
  return {
    ...state,
    nodes,
    graph_signals: graphSignals,
    top_signals: topSignals,
    knowledge_signals: knowledgeSignals,
  };
}

async function isDashboardStateCurrentWithSignals(state: CachedDashboardState): Promise<boolean> {
  if (!isDashboardStateFresh(state)) return false;
  const timestamp = new Date(state.generated_at).getTime();
  try {
    const stat = await fs.stat(SIGNAL_CACHE_FILE);
    return stat.mtimeMs <= timestamp + 5000;
  } catch {
    return true;
  }
}

function buildSkillEntry(origin: string | null) {
  if (!origin) return null;
  return {
    mode: 'bound' as const,
    title: '信源 Skill',
    description: '主口径是过去 30 天信源查询。模型可直接查信号、AI Hot 和信源流回答；LiveBench 先作为独立入口保留。',
    copy_hint: '先接入主 skill；需要 AI Hot 时可直接调用 AI 场景信号接口，不必先走知识库。',
    url: `${origin}/api/v1/openclaw/skill.md`,
  };
}

function buildFallbackState(scene: WorldScene, requestOrigin: string | null) {
  return {
    generated_at: new Date().toISOString(),
    scene,
    dashboard_kind: 'world-dashboard',
    metrics: {
      active_signal_count: 0,
      mapped_signal_count: 0,
      active_question_count: 0,
      resolved_question_count: 0,
      watchlist_question_count: 0,
      avg_hotspot_score: 0,
      avg_coverage_gap: 0,
      hottest_region: '',
      least_covered_region: '',
    },
    source_health: {
      stable_source_count: 0,
      watchlist_source_count: 0,
      blocked_or_unknown_source_count: 0,
      note: '后台正在刷新世界看板，先返回可用入口。',
    },
    nodes: [],
    graph_signals: [],
    top_signals: [],
    knowledge_signals: [],
    skill_entry: buildSkillEntry(requestOrigin),
    world_view_summary: {
      title: '世界视图正在刷新',
      summary: '地图与信号会在后台同步完成后补齐。',
      updated_at: new Date().toISOString(),
    },
    pending_question_previews: [],
    resolved_question_previews: [],
    evaluation_summary: null,
    source_refresh_summary: null,
    livebench_summary: null,
    what_to_do_next: ['主 skill 已可用，世界看板与信号会在后台继续刷新。'],
    quick_links: buildSkillEntry(requestOrigin)?.url
      ? [
          {
            label: '打开主 skill',
            href: `${requestOrigin}/api/v1/openclaw/skill.md`,
            description: '先接入信源 skill。',
            kind: 'primary',
            audience: 'shared',
          },
        ]
      : [],
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const batchRequested = url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    const freshRequested = url.searchParams.get('fresh') === '1';
    const heavyRefreshEnabled = isWorldRuntimeHeavyRefreshEnabled();
    const forceLive = (freshRequested || batchRequested) && heavyRefreshEnabled;
    const rebuildDashboard = url.searchParams.get('rebuild') === '1';
    const allowModelRefresh = batchRequested && heavyRefreshEnabled;
    const timeoutMs = allowModelRefresh || forceLive ? 120000 : STATE_TIMEOUT_MS;
    const requestOrigin = resolveRequestOrigin({ headers: request.headers, requestUrl: request.url });
    const bypassCachedDashboard = rebuildDashboard;
    const cachedState = await withCachedStateTimeout(getCachedWorldDashboardState(scene), null);
    const cachedStateRenderable = isRenderableDashboardState(cachedState);
    const cachedStatePolluted = scene === 'global' && hasSourceSnapshotPollution(cachedState);
    const cachedStateCurrent =
      scene === 'tech-ai' ? await isDashboardStateCurrentWithSignals(cachedState) : isDashboardStateFresh(cachedState);
    if (!bypassCachedDashboard && !forceLive && !allowModelRefresh && cachedState && cachedStateRenderable) {
      const responseState = cachedStatePolluted ? sanitizeCachedDashboardState(cachedState) : cachedState;
      return NextResponse.json(
        {
          ...responseState,
          skill_entry: buildSkillEntry(requestOrigin) || responseState.skill_entry,
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-snapshot': '1',
            ...(cachedStateCurrent ? {} : { 'x-world-stale-snapshot': '1' }),
            ...(cachedStatePolluted ? { 'x-world-sanitized-snapshot': '1' } : {}),
            ...(freshRequested && !forceLive ? { 'x-world-heavy-sync': 'deferred' } : {}),
          },
        },
      );
    }
    const state = await Promise.race([
      getWorldDashboardState(scene, { requestOrigin, allowModelRefresh, forceSignalRefresh: forceLive }),
      new Promise((resolve) => {
        const fallbackState =
          !bypassCachedDashboard && cachedState && cachedStateRenderable
            ? cachedStatePolluted
              ? sanitizeCachedDashboardState(cachedState)
              : cachedState
            : buildFallbackState(scene, requestOrigin);
        setTimeout(() => resolve(fallbackState), timeoutMs);
      }),
    ]);
    return NextResponse.json(state, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load world state' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
