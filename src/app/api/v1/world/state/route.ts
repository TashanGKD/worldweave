import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolvePublicBaseUrl } from '@/lib/request-origin';
import {
  getCachedWorldDashboardState,
  getWorldDashboardState,
  isRenderableDashboardState,
  isWorldRuntimeHeavyRefreshEnabled,
} from '@/lib/world/runtime';
import { dashboardNodeMatchesScene, dashboardSignalMatchesScene } from '@/lib/world/dashboard-presentation';
import { isPublicEventSignal, isSourceSnapshotLikeSignal, sanitizePublicNarrativeText, sanitizePublicSignal } from '@/lib/world/signal-quality';
import type { LiveBenchQuestionPreview, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATE_TIMEOUT_MS = 30000;
const DASHBOARD_STATE_MAX_AGE_MS = 30 * 60 * 1000;
const CACHED_STATE_TIMEOUT_MS = 5000;
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
  const graphSignals = (Array.isArray(state.graph_signals) ? state.graph_signals : []).filter(isPublicEventSignal).map(sanitizePublicSignal).slice(0, 32);
  const topSignals = (Array.isArray(state.top_signals) ? state.top_signals : []).filter(isPublicEventSignal).map(sanitizePublicSignal).slice(0, 120);
  const knowledgeSignals = (Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []).filter(isPublicEventSignal).map(sanitizePublicSignal).slice(0, 12);
  const eventIds = new Set([...graphSignals, ...topSignals, ...knowledgeSignals].map((signal) => signal.id));
  const nodes = (Array.isArray(state.nodes) ? state.nodes : [])
    .filter((node) => isPublicEventSignal(node) && (eventIds.size === 0 || eventIds.has(String(node.node_id || '').replace(/:explore$/, ''))))
    .map(sanitizePublicSignal)
    .slice(0, 240);
  return {
    ...state,
    nodes,
    graph_signals: graphSignals,
    top_signals: topSignals,
    knowledge_signals: knowledgeSignals,
    pending_question_previews: (state.pending_question_previews || []).map(sanitizeQuestionPreview),
    resolved_question_previews: (state.resolved_question_previews || []).map(sanitizeQuestionPreview),
  };
}

function sanitizeQuestionPreview(preview: LiveBenchQuestionPreview): LiveBenchQuestionPreview {
  const aggregateVoteRecord =
    preview.aggregate_vote && typeof preview.aggregate_vote === 'object'
      ? (preview.aggregate_vote as unknown as Record<string, unknown>)
      : null;
  const aggregateVote = aggregateVoteRecord
    ? {
        ...preview.aggregate_vote,
        human_readable_prediction: sanitizePublicNarrativeText(aggregateVoteRecord.human_readable_prediction as string | null | undefined),
        human_readable_why: sanitizePublicNarrativeText(aggregateVoteRecord.human_readable_why as string | null | undefined),
        what_changes_my_mind: sanitizePublicNarrativeText(aggregateVoteRecord.what_changes_my_mind as string | null | undefined),
      }
    : preview.aggregate_vote;
  return {
    ...preview,
    background: sanitizePublicNarrativeText(preview.background as string | null | undefined),
    moderator_line: sanitizePublicNarrativeText(preview.moderator_line as string | null | undefined),
    aggregate_vote: aggregateVote as LiveBenchQuestionPreview['aggregate_vote'],
  } as LiveBenchQuestionPreview;
}

function isAiHotLikeNode(node: unknown) {
  const record = node && typeof node === 'object' ? (node as Record<string, unknown>) : {};
  const text = [
    record.source_name,
    record.source_url,
    record.title,
    record.summary,
    Array.isArray(record.tags) ? record.tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');
  return /(aihot|ai hot|ai-news-radar|daily:ai|source:aihot|source:ai-news-radar)/i.test(text);
}

function filterCachedDashboardStateForScene(state: NonNullable<CachedDashboardState>, scene: WorldScene) {
  if (scene === 'global') return sanitizeCachedDashboardState(state);
  const graphSignals = (Array.isArray(state.graph_signals) ? state.graph_signals : []).filter((signal) =>
    isPublicEventSignal(signal) && dashboardSignalMatchesScene(signal, scene),
  ).map(sanitizePublicSignal);
  const topSignals = (Array.isArray(state.top_signals) ? state.top_signals : []).filter((signal) =>
    isPublicEventSignal(signal) && dashboardSignalMatchesScene(signal, scene),
  ).map(sanitizePublicSignal);
  const knowledgeSignals = (Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []).filter((signal) =>
    isPublicEventSignal(signal) && dashboardSignalMatchesScene(signal, scene),
  ).map(sanitizePublicSignal);
  const signalIds = new Set([...graphSignals, ...topSignals, ...knowledgeSignals].map((signal) => signal.id));
  const nodes = (Array.isArray(state.nodes) ? state.nodes : []).filter((node) => {
    if (scene === 'geo-politics-daily' && isAiHotLikeNode(node)) return false;
    const nodeId = String((node as { node_id?: unknown }).node_id || '').replace(/:explore$/, '');
    return dashboardNodeMatchesScene(node, scene) && (signalIds.size === 0 || signalIds.has(nodeId));
  }).map(sanitizePublicSignal);
  return {
    ...state,
    nodes,
    graph_signals: graphSignals,
    top_signals: topSignals,
    knowledge_signals: knowledgeSignals,
    pending_question_previews: (state.pending_question_previews || []).map(sanitizeQuestionPreview),
    resolved_question_previews: (state.resolved_question_previews || []).map(sanitizeQuestionPreview),
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
    description: '可查询近 30 天信源、AI 日报和主世界日报。',
    copy_hint: '日常回答先读精选线索；需要深挖时再进入全部信源。',
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
      note: '世界看板正在更新，先返回可用入口。',
    },
    nodes: [],
    graph_signals: [],
    top_signals: [],
    knowledge_signals: [],
    skill_entry: buildSkillEntry(requestOrigin),
    world_view_summary: {
      title: '世界视图正在刷新',
      summary: '地图与信号更新完成后会自动补齐。',
      updated_at: new Date().toISOString(),
    },
    pending_question_previews: [],
    resolved_question_previews: [],
    evaluation_summary: null,
    source_refresh_summary: null,
    livebench_summary: null,
    what_to_do_next: ['主 skill 已可用，世界看板与信号会继续更新。'],
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
    const timeoutMs = allowModelRefresh || forceLive ? 300000 : STATE_TIMEOUT_MS;
    const requestOrigin = resolvePublicBaseUrl({ headers: request.headers, requestUrl: request.url });
    const bypassCachedDashboard = rebuildDashboard;
    const cachedState = bypassCachedDashboard
      ? null
      : await withCachedStateTimeout(getCachedWorldDashboardState(scene), null);
    const cachedStateRenderable = isRenderableDashboardState(cachedState);
    const cachedStatePolluted = scene === 'global' && hasSourceSnapshotPollution(cachedState);
    const cachedStateCurrent =
      scene === 'tech-ai' ? await isDashboardStateCurrentWithSignals(cachedState) : isDashboardStateFresh(cachedState);
    if (!bypassCachedDashboard && !forceLive && !allowModelRefresh && cachedState && cachedStateRenderable) {
      const responseState = filterCachedDashboardStateForScene(
        cachedStatePolluted ? sanitizeCachedDashboardState(cachedState) : cachedState,
        scene,
      );
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
    return NextResponse.json(filterCachedDashboardStateForScene(state as NonNullable<CachedDashboardState>, scene), {
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
