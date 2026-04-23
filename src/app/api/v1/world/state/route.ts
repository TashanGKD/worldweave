import { NextResponse } from 'next/server';

import { resolveRequestOrigin } from '@/lib/request-origin';
import { getCachedWorldDashboardState, getWorldDashboardState } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATE_TIMEOUT_MS = 15000;
const DASHBOARD_STATE_MAX_AGE_MS = 30 * 60 * 1000;
const CACHED_STATE_TIMEOUT_MS = 1500;

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

function buildSkillEntry(origin: string | null) {
  if (!origin) return null;
  return {
    mode: 'bound' as const,
    title: '信源 Skill',
    description: '主口径是过去 30 天信源查询，系统会顺手把这轮判断带去校准题池，再把经验带回后续回答。',
    copy_hint: '先接入主 skill，后面的判断和回看会自己接上。',
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
      summary: '地图与题池会在后台同步完成后补齐。',
      updated_at: new Date().toISOString(),
    },
    pending_question_previews: [],
    resolved_question_previews: [],
    evaluation_summary: null,
    source_refresh_summary: null,
    livebench_summary: null,
    what_to_do_next: ['主 skill 已可用，世界看板与题池会在后台继续刷新。'],
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
    const allowModelRefresh =
      url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    const timeoutMs = allowModelRefresh ? 120000 : STATE_TIMEOUT_MS;
    const requestOrigin = resolveRequestOrigin({ headers: request.headers, requestUrl: request.url });
    const cachedState = await withCachedStateTimeout(getCachedWorldDashboardState(scene), null);
    if (!allowModelRefresh && cachedState) {
      return NextResponse.json(
        {
          ...cachedState,
          skill_entry: buildSkillEntry(requestOrigin) || cachedState.skill_entry,
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-snapshot': '1',
            ...(isDashboardStateFresh(cachedState) ? {} : { 'x-world-stale-snapshot': '1' }),
          },
        },
      );
    }
    if (!allowModelRefresh && !cachedState) {
      return NextResponse.json(buildFallbackState(scene, requestOrigin), {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'x-world-fallback': '1',
        },
      });
    }
    const state = await Promise.race([
      getWorldDashboardState(scene, { requestOrigin, allowModelRefresh }),
      new Promise((resolve) =>
        setTimeout(() => resolve(cachedState || buildFallbackState(scene, requestOrigin)), timeoutMs),
      ),
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
