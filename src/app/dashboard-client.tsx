'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Bot, FileText, Globe2, Link2, Map as MapIcon, Radio, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  asArray,
  cleanNarrativeText,
  cleanPresentationText,
  compactText,
  formatBrierScore,
  formatPercent,
  formatTime,
  isAlertBoardCandidate,
  liveQuestionStatusLabel,
  liveQuestionStatusTone,
  officialOutcomeLabel,
  regionDisplayLabel,
  sceneDisplayLabel,
  severityLabel,
  severitySoftTone,
  shellCardClass,
  signalDetailHref,
  voteSideLabel,
  voteSideTone,
  worldHref,
  worldMountedHref,
} from '@/components/world-ui';
import {
  dashboardNodeMatchesScene,
  dashboardSignalMatchesScene,
  isTrustedTechAiDashboardSignal,
  mainWorldSignalPriority,
  mainWorldSignalRank,
  readableSignalSourceLine,
  readableSignalSummary,
  readableSignalTags,
  readableSignalTitle,
  techAiRelevanceScore,
  techAiSignalRank,
} from '@/lib/world/dashboard-presentation';

import type {
  LiveBenchPlatformModelSummary,
  LiveBenchQuestionPreview,
  WorldDashboardAction,
  WorldDashboardLiveBenchSummary,
  WorldDashboardSourceRefreshSummary,
  WorldScene,
  WorldSourceKnowledgeState,
  WorldSourceReliability,
  WorldStateMetrics,
  WorldStateNode,
} from '@/lib/world/types';

function WorldGlobeShell() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(124,196,184,0.08)_0%,rgba(248,250,252,0)_28%),linear-gradient(180deg,var(--bg-page)_0%,var(--bg-secondary)_100%)]">
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="absolute left-1/2 top-1/2 aspect-square w-[72%] max-w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border-hover)] bg-[radial-gradient(circle_at_44%_34%,rgba(255,255,255,0.76)_0%,rgba(232,237,242,0.9)_42%,rgba(203,213,225,0.62)_100%)] shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
        <div className="absolute inset-[8%] rounded-full border border-[var(--border-default)]" />
        <div className="absolute inset-[20%] rounded-full border border-[var(--border-default)]" />
        <div className="absolute left-1/2 top-[7%] h-[86%] w-px -translate-x-1/2 bg-[var(--border-hover)]" />
        <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-[var(--border-hover)]" />
      </div>
      <div className="absolute bottom-4 left-4 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)]/85 px-3.5 py-2 text-xs text-[var(--text-secondary)] shadow-sm backdrop-blur">
        地图加载中
      </div>
    </div>
  );
}
const WorldGlobe = dynamic(() => import('@/components/world-globe'), { ssr: false, loading: WorldGlobeShell });

const dashboardPanelClass =
  'gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] !py-0 shadow-[var(--shadow-md)]';
const dashboardHeaderClass = '!flex h-11 !items-center border-b border-[var(--border-default)] bg-[var(--bg-container)] !px-4 !py-0';
const timelineTabButtonClass =
  'h-7 whitespace-nowrap rounded-[var(--radius-md)] border px-3 text-[12px] font-semibold leading-none transition';
const dashboardInsetPanelClass = 'rounded-[var(--radius-lg)] bg-transparent px-1 py-1';
const dashboardTileClass =
  'group rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:bg-[var(--bg-container)] hover:shadow-sm';

const AUTO_REFRESH_MS = 60 * 1000;
const INITIAL_BACKGROUND_REFRESH_DELAY_MS = 1800;
const DASHBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_CACHE_VERSION = 4;
const DASHBOARD_CACHE_PREFIX = `world-v2:${DASHBOARD_CACHE_VERSION}:dashboard`;
const GLOBE_MEMORY_DAYS = 30;

type EmptySignalCheckStatus = 'checking' | 'fresh' | 'stale' | 'deferred' | 'error';

type EmptySignalCheck = {
  status: EmptySignalCheckStatus;
  checkedAt: string;
  reason: string;
  message: string;
  latestSignalPublishedAt?: string | null;
  latestSignalAgeHours?: number | null;
  freshnessStatus?: string | null;
  syncDeferred?: boolean;
  syncStatus?: number | null;
};

type WorldSubworld = {
  key: WorldScene;
  title: string;
  summary: string;
  signal_count: number;
  matched_tags: string[];
  recommended_bundles?: Array<{
    name: string;
    note: string;
    source_count: number;
  }>;
};

type DashboardSignal = {
  id: string;
  title: string;
  summary?: string;
  display_title: string;
  display_summary: string;
  scene: WorldScene;
  region: string;
  source_name: string;
  published_at: string;
  source_url?: string;
  location_name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  alignment_tags: string[];
  intensity: number | null;
  mention_count: number | null;
  urgency_reason: string;
  severity: number;
  display_level: 'high' | 'elevated' | 'monitoring';
  relevance_score?: number;
  hotspot_score: number;
  exploration_score: number;
  source_reliability?: WorldSourceReliability;
};

type WorldDashboardResponse = {
  generated_at: string;
  scene: WorldScene;
  dashboard_kind?: string;
  metrics: WorldStateMetrics;
  source_health?: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    note: string;
  };
  nodes: WorldStateNode[];
  graph_signals: DashboardSignal[];
  top_signals: DashboardSignal[];
  knowledge_signals: DashboardSignal[];
  skill_entry?: {
    mode: 'bound' | 'anonymous';
    title: string;
    description: string;
    copy_hint: string;
    url: string;
  } | null;
  world_view_summary?: {
    title: string;
    summary: string;
    updated_at: string;
  } | null;
  pending_question_previews: LiveBenchQuestionPreview[];
  resolved_question_previews: LiveBenchQuestionPreview[];
  evaluation_summary?: LiveBenchPlatformModelSummary | null;
  source_refresh_summary?: WorldDashboardSourceRefreshSummary | null;
  livebench_summary?: WorldDashboardLiveBenchSummary | null;
  what_to_do_next: string[];
  quick_links: WorldDashboardAction[];
};

type WorldSignalsApiSignal = {
  id?: string;
  title?: string;
  summary?: string;
  display_title?: string;
  display_summary?: string;
  scene?: string;
  display_level?: DashboardSignal['display_level'];
  severity?: number;
  region_label?: string;
  published_at?: string;
  updated_at?: string;
  tags?: string[];
  alignment_tags?: string[];
  source_name?: string;
  source_url?: string;
  url?: string;
};

type DashboardCachePayload = {
  version: number;
  saved_at: number;
  scene: WorldScene;
  state: WorldDashboardResponse | null;
  subworlds: WorldSubworld[];
};

type PageClientProps = {
  initialScene?: WorldScene;
  initialState?: WorldDashboardResponse | null;
  initialSubworlds?: WorldSubworld[];
};

type TimelineView = 'geo-politics-daily' | 'tech-ai' | 'livebench';

const DAILY_PAGE_HREFS: Record<TimelineView, string> = {
  'geo-politics-daily': './daily/geo',
  'tech-ai': './daily/ai',
  livebench: './daily/livebench',
};

function timelineViewLabel(view: TimelineView) {
  if (view === 'tech-ai') return 'AI 线索';
  if (view === 'livebench') return '演绎题池';
  return '地缘线索';
}

const DEFAULT_SUBWORLDS: WorldSubworld[] = [
  { key: 'geo-politics-daily', title: '地缘日报', summary: '冲突、外交、制裁、选举、公共安全和区域风险。', signal_count: 0, matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'], recommended_bundles: [] },
  { key: 'tech-ai', title: 'AI 日报', summary: '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。', signal_count: 0, matched_tags: ['technology', 'ai', 'llm', 'agent', 'chip', 'aihot'], recommended_bundles: [] },
];
const PRIMARY_SUBWORLD_ORDER = ['geo-politics-daily', 'tech-ai'];
function techAiDayLabel(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '未知日期';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function techAiTimeLabel(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dashboardCacheKey(scene: WorldScene) {
  return `${DASHBOARD_CACHE_PREFIX}:${scene}`;
}

function mountedHomeHref(href: string, scene: WorldScene = 'global') {
  const normalized = worldHref(href, scene);
  return normalized.startsWith('/') ? `.${normalized}` : normalized;
}

function normalizePrimaryScene(scene: WorldScene): WorldScene {
  if (scene === 'finance' || scene === 'global') return 'geo-politics-daily';
  return scene === 'tech-ai' ? 'tech-ai' : 'geo-politics-daily';
}

function normalizeSubworlds(subworlds: WorldSubworld[] | null | undefined) {
  const normalized = asArray(subworlds)
    .filter((item): item is WorldSubworld => Boolean(item?.key && item?.title))
    .map((item) => ({
      ...item,
      title:
        item.key === 'tech-ai'
          ? 'AI 日报'
          : item.key === 'geo-politics-daily' || item.key === 'global'
            ? '地缘日报'
            : item.title,
      summary:
        item.key === 'tech-ai'
          ? '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。'
          : item.key === 'geo-politics-daily' || item.key === 'global'
            ? '冲突、外交、制裁、选举、公共安全和区域风险。'
            : item.summary,
      matched_tags: asArray(item.matched_tags),
      recommended_bundles: asArray(item.recommended_bundles),
    }));

  const byKey = new Map(normalized.map((item) => [item.key, item]));
  if (!byKey.has('tech-ai')) {
    const technology = byKey.get('technology-daily');
    const ai = byKey.get('ai-daily');
    if (technology || ai) {
      byKey.set('tech-ai', {
        key: 'tech-ai',
        title: 'AI 日报',
        summary: '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。',
        signal_count: (technology?.signal_count || 0) + (ai?.signal_count || 0),
        matched_tags: Array.from(new Set([...(technology?.matched_tags || []), ...(ai?.matched_tags || []), 'ai', 'aihot'])),
        recommended_bundles: [...(technology?.recommended_bundles || []), ...(ai?.recommended_bundles || [])],
      });
    }
  }
  if (!byKey.has('geo-politics-daily')) {
    const global = byKey.get('global');
    byKey.set('geo-politics-daily', {
      key: 'geo-politics-daily',
      title: '地缘日报',
      summary: '冲突、外交、制裁、选举、公共安全和区域风险。',
      signal_count: global?.signal_count || 0,
      matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'],
      recommended_bundles: global?.recommended_bundles || [],
    });
  }
  byKey.delete('finance');

  const primary = PRIMARY_SUBWORLD_ORDER.map((key) => byKey.get(key) || DEFAULT_SUBWORLDS.find((item) => item.key === key)).filter(
    (item): item is WorldSubworld => Boolean(item),
  );
  return primary.length > 0 ? primary : DEFAULT_SUBWORLDS;
}

function normalizeStateNode(node: WorldStateNode): WorldStateNode {
  return {
    ...node,
    tags: asArray(node.tags),
    alignment_tags: asArray(node.alignment_tags),
    activities: asArray(node.activities),
  };
}

function normalizeSignal(signal: DashboardSignal): DashboardSignal {
  return {
    ...signal,
    tags: asArray(signal.tags),
    alignment_tags: asArray(signal.alignment_tags),
  };
}

function normalizeDashboardState(state: WorldDashboardResponse | null): WorldDashboardResponse | null {
  if (!state || typeof state !== 'object') return null;
  const pendingQuestionPreviews = asArray(state.pending_question_previews);
  const resolvedQuestionPreviews = asArray(state.resolved_question_previews);
  return {
    ...state,
    metrics: {
      active_signal_count: typeof state.metrics?.active_signal_count === 'number' ? state.metrics.active_signal_count : 0,
      mapped_signal_count: typeof state.metrics?.mapped_signal_count === 'number' ? state.metrics.mapped_signal_count : 0,
      active_question_count: typeof state.metrics?.active_question_count === 'number' ? state.metrics.active_question_count : 0,
      resolved_question_count: typeof state.metrics?.resolved_question_count === 'number' ? state.metrics.resolved_question_count : 0,
      watchlist_question_count: typeof state.metrics?.watchlist_question_count === 'number' ? state.metrics.watchlist_question_count : 0,
      avg_hotspot_score: typeof state.metrics?.avg_hotspot_score === 'number' ? state.metrics.avg_hotspot_score : 0,
      avg_coverage_gap: typeof state.metrics?.avg_coverage_gap === 'number' ? state.metrics.avg_coverage_gap : 0,
      hottest_region: state.metrics?.hottest_region || '',
      least_covered_region: state.metrics?.least_covered_region || '',
    },
    nodes: asArray(state.nodes).map(normalizeStateNode),
    graph_signals: asArray(state.graph_signals).map(normalizeSignal),
    top_signals: asArray(state.top_signals).map(normalizeSignal),
    knowledge_signals: asArray(state.knowledge_signals).map(normalizeSignal),
    pending_question_previews: pendingQuestionPreviews,
    resolved_question_previews: resolvedQuestionPreviews,
    what_to_do_next: asArray(state.what_to_do_next),
    quick_links: asArray(state.quick_links),
    world_view_summary: state.world_view_summary || null,
    evaluation_summary: state.evaluation_summary || null,
    source_refresh_summary: state.source_refresh_summary || null,
    livebench_summary: state.livebench_summary || null,
    skill_entry:
      state.skill_entry && typeof state.skill_entry.url === 'string'
        ? {
            mode: state.skill_entry.mode === 'bound' ? 'bound' : 'anonymous',
            title: state.skill_entry.title || '世界入口',
            description: state.skill_entry.description || '',
            copy_hint: state.skill_entry.copy_hint || '',
            url: state.skill_entry.url,
          }
        : null,
  };
}

function normalizeQuestionPreviews(previews: LiveBenchQuestionPreview[] | null | undefined) {
  return asArray(previews).filter((item): item is LiveBenchQuestionPreview => Boolean(item?.question_id && item?.title));
}

function questionPoolFromState(state: WorldDashboardResponse | null | undefined) {
  return normalizeQuestionPreviews([...(state?.pending_question_previews || []), ...(state?.resolved_question_previews || [])]);
}

async function fetchLiveBenchQuestionFallback(scene: WorldScene) {
  const load = async (targetScene: WorldScene) => {
    const response = await fetch(`/api/v1/world/livebench/questions?scene=${encodeURIComponent(targetScene)}&limit=12`, {
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const data = (await response.json()) as LiveBenchQuestionPreview[];
    return normalizeQuestionPreviews(data);
  };
  try {
    if (scene === 'tech-ai') {
      const globalPreviews = await load('global');
      const aiPreviews = globalPreviews.filter((preview) =>
        /ai|llm|model|agent|openai|anthropic|claude|gemini|英伟达|nvidia|大模型|模型|智能体|人工智能/i.test(
          `${preview.title} ${preview.background} ${preview.topic_label}`,
        ),
      );
      return aiPreviews.length > 0 ? aiPreviews : globalPreviews;
    }
    if (scene === 'geo-politics-daily') {
      const globalPreviews = await load('global');
      const geopoliticsPreviews = globalPreviews.filter((preview) =>
        /war|conflict|military|election|sanction|diplomacy|iran|ukraine|russia|israel|gaza|战争|冲突|军事|选举|制裁|外交|伊朗|乌克兰|俄罗斯|以色列|加沙/i.test(
          `${preview.title} ${preview.background} ${preview.topic_label}`,
        ),
      );
      return geopoliticsPreviews.length > 0 ? geopoliticsPreviews : globalPreviews;
    }
    const scenePreviews = await load(scene);
    if (scenePreviews.length > 0) return scenePreviews;
    if (scene !== 'global') return load('global');
    return scenePreviews;
  } catch {
    return [];
  }
}

function hasUsefulDashboardState(state: WorldDashboardResponse | null | undefined) {
  if (!state) return false;
  if ((state.nodes || []).length > 0) return true;
  if ((state.top_signals || []).length > 0) return true;
  if ((state.knowledge_signals || []).length > 0) return true;
  if ((state.pending_question_previews || []).length > 0) return true;
  if ((state.resolved_question_previews || []).length > 0) return true;
  return false;
}

function quickSignalToDashboardSignal(signal: WorldSignalsApiSignal, scene: WorldScene = 'tech-ai'): DashboardSignal | null {
  if (!signal.id || !signal.title) return null;
  const summary = signal.display_summary || signal.summary || '';
  return {
    id: signal.id,
    title: signal.title,
    summary,
    display_title: signal.display_title || signal.title,
    display_summary: summary,
    scene,
    region: signal.region_label || (scene === 'tech-ai' ? 'AI' : 'Global'),
    source_name: signal.source_name || 'AI 信源',
    published_at: signal.published_at || signal.updated_at || new Date(0).toISOString(),
    source_url: signal.source_url || signal.url,
    location_name: signal.region_label || (scene === 'tech-ai' ? 'AI' : 'Global'),
    country: '',
    latitude: null,
    longitude: null,
    tags: signal.tags || [],
    alignment_tags: signal.alignment_tags || [],
    intensity: null,
    mention_count: null,
    urgency_reason: 'AI signal cache',
    severity: signal.severity || 2,
    display_level: signal.display_level || 'monitoring',
    relevance_score: 0.72,
    hotspot_score: 0.5,
    exploration_score: 0.55,
  };
}

function uniqueDashboardSignals(...sources: Array<DashboardSignal[] | null | undefined>) {
  return Array.from(
    new Map(
      sources
        .flatMap((source) => source || [])
        .map((signal) => [signal.id, signal]),
    ).values(),
  );
}

function groupItemsByDay<T>(items: T[], getIso: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = techAiDayLabel(getIso(item));
    groups.set(day, [...(groups.get(day) || []), item]);
  }
  return Array.from(groups.entries()).map(([day, groupItems]) => ({ day, items: groupItems }));
}

function signalDailyDigest(signals: DashboardSignal[], fallback: string) {
  if (signals.length === 0) return fallback;
  return `已整理 ${signals.length} 条精选线索，进入日报看主线、来源和后续阅读。`;
}

function livebenchDailyDigest(previews: LiveBenchQuestionPreview[], fallback: string) {
  if (previews.length === 0) return fallback;
  return `正在跟踪 ${previews.length} 道题，进入日报看结算时间、当前判断和结果反馈。`;
}

function livebenchDailyTopicLabel(preview: LiveBenchQuestionPreview) {
  let text = questionTitleLabel(preview);
  text = text.replace(/会发生吗[？?]?$/u, '').replace(/[？?]\s*$/u, '').trim();
  const anyNewBefore = text.match(/^Any new (.+?) Before ([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?$/i);
  if (anyNewBefore) {
    text = `${formatEnglishMonthDayLabel(anyNewBefore[2], anyNewBefore[3])}前新 ${anyNewBefore[1]} 发布窗口`;
  }
  const releasedBy = text.match(/^(.+?) released by (\d{4}年\d{1,2}月\d{1,2}日)$/i);
  if (releasedBy) {
    text = `${releasedBy[2]}前 ${releasedBy[1]} 发布窗口`;
  }
  const announceAt = text.match(/^(Google|谷歌) announce (.+?) at (.+)$/i);
  if (announceAt) {
    text = `${announceAt[1] === 'Google' ? 'Google' : '谷歌'} ${announceAt[3]} ${announceAt[2]} 发布窗口`;
  }
  text = text
    .replace(/\bARR\b/giu, '年度经常性收入')
    .replace(/\bClaude Model\b/giu, 'Claude 模型')
    .replace(/\s+or\s+/giu, ' 或 ')
    .replace(/\(May (\d{1,2})-(\d{1,2})\)/giu, '（5月$1日至$2日）')
    .replace(/'s next 年度经常性收入 figure show an accelerating % growth rate/iu, '下一期年度经常性收入增速')
    .replace(/^Will\s+/iu, '')
    .replace(/模型\s+发布窗口/gu, '模型发布窗口')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return compactText(text, 56);
}

function readDashboardCache(scene: WorldScene): DashboardCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(dashboardCacheKey(scene));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCachePayload;
    if (!parsed || parsed.version !== DASHBOARD_CACHE_VERSION || parsed.scene !== scene || typeof parsed.saved_at !== 'number') {
      return null;
    }
    if (Date.now() - parsed.saved_at > DASHBOARD_CACHE_TTL_MS) return null;
    const normalizedState = normalizeDashboardState(parsed.state);
    if (!hasUsefulDashboardState(normalizedState)) return null;
    return {
      ...parsed,
      state: normalizedState,
      subworlds: normalizeSubworlds(parsed.subworlds),
    };
  } catch {
    return null;
  }
}

function persistDashboardCache(payload: DashboardCachePayload) {
  if (typeof window === 'undefined') return;
  if (!hasUsefulDashboardState(payload.state)) return;
  try {
    window.localStorage.setItem(dashboardCacheKey(payload.scene), JSON.stringify(payload));
  } catch {
    // ignore cache write failure
  }
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back to execCommand
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

function ageOpacityFromTimestamp(timestamp: string, memoryDays: number) {
  const ageMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const ageDays = ageMs / 86400000;
  const ratio = Math.min(1, ageDays / memoryDays);
  return Number((1 - ratio * 0.82).toFixed(2));
}

function markerDisplayLevel(node: Pick<WorldStateNode, 'severity' | 'display_level'>): 'high' | 'elevated' | 'monitoring' {
  if (node.display_level === 'high' || node.display_level === 'elevated' || node.display_level === 'monitoring') {
    return node.display_level;
  }
  if (node.severity >= 4) return 'high';
  if (node.severity >= 3) return 'elevated';
  return 'monitoring';
}

function chooseDefaultActiveSignalId(nextState: WorldDashboardResponse | null) {
  const candidates =
    nextState?.nodes
      ?.filter((node) => node.geo.lat !== null && node.geo.lng !== null)
      .sort((a, b) => {
        const displayRank = { high: 3, elevated: 2, monitoring: 1 };
        const leftLevel = markerDisplayLevel(a);
        const rightLevel = markerDisplayLevel(b);
        return (
          displayRank[rightLevel] - displayRank[leftLevel] ||
          b.severity - a.severity ||
          b.hotspot_score - a.hotspot_score ||
          new Date(b.updated_at || b.published_at).getTime() - new Date(a.updated_at || a.published_at).getTime()
        );
      }) || [];

  return candidates[0]?.node_id || null;
}

function previewStatsLabel(preview: LiveBenchQuestionPreview) {
  const pieces = [
    `信源 ${preview.evidence_count}`,
    `规则 ${preview.rule_count}`,
    `讨论 ${preview.discussion_count}`,
  ];
  if (preview.status === 'resolved' && preview.aggregate_vote.participant_count === 0) {
    pieces.push('结算前未形成模型票');
  }
  return pieces.join(' · ');
}

function cleanQuestionCardText(value: string | null | undefined) {
  return cleanPresentationText(value || '')
    .replace(/我现在偏向赞成/gu, '当前偏向赞成')
    .replace(/我现在偏向不赞成/gu, '当前偏向不赞成')
    .replace(/我现在更看重的是/gu, '当前更需要核对')
    .replace(/我现在最看重的依据是/gu, '当前最关键的依据是')
    .replace(/我现在最看重的是/gu, '当前最关键的是')
    .replace(/我先给出一版保守判断/gu, '暂按保守口径记录')
    .replace(/在我看到/gu, '在看到')
    .replace(/我不会轻易/gu, '不宜轻易')
    .replace(/\b(Manifold|Polymarket|Metaculus|Metaforecast)\b/giu, '')
    .replace(/当前运行环境直连\s*结算接口不稳定[，,。]?\s*/giu, '')
    .replace(/当前先走\s*聚合补位[，,。]?\s*/giu, '')
    .replace(/直连题源[，,。]?\s*/giu, '')
    .replace(/当前[，,、\s]*并可看到参与人数、成交量和流动性[，,。]?/giu, '')
    .replace(/当前[，,、\s]*并可看到成交量、流动性和结果项[，,。]?/giu, '')
    .replace(/作为最近已结算平台题保留在题池中/giu, '作为最近已结算题保留在题池中')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，,、。；;：:\s]+/u, '')
    .trim();
}

function formatEnglishDateLabel(monthName: string, day: string, year: string) {
  const monthIndex =
    [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ].indexOf(monthName.toLowerCase()) + 1;
  return monthIndex > 0 ? `${year}年${monthIndex}月${Number(day)}日` : `${year}年${monthName}${Number(day)}日`;
}

function formatEnglishMonthDayLabel(monthName: string, day: string) {
  const year = String(new Date().getFullYear());
  return formatEnglishDateLabel(monthName, day, year).replace(`${year}年`, '');
}

function formatEnglishMonthLabel(monthName: string) {
  const monthIndex =
    [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ].indexOf(monthName.toLowerCase()) + 1;
  return monthIndex > 0 ? `${monthIndex}月` : monthName;
}

function localizeQuestionTitle(text: string) {
  const diplomaticMeeting = text.match(/^US x Iran diplomatic meeting by ([A-Za-z]+) (\d{1,2}), (\d{4})[。.]?$/i);
  if (diplomaticMeeting) {
    return `${formatEnglishDateLabel(diplomaticMeeting[1], diplomaticMeeting[2], diplomaticMeeting[3])}前，美国与伊朗会举行外交会谈吗？`;
  }

  const ceasefireExtended = text.match(/^US x Iran ceasefire extended by ([A-Za-z]+) (\d{1,2}), (\d{4})[。.]?$/i);
  if (ceasefireExtended) {
    return `${formatEnglishDateLabel(ceasefireExtended[1], ceasefireExtended[2], ceasefireExtended[3])}前，美国与伊朗停火会延长吗？`;
  }

  const aiModelRanking = text.match(
    /^Will (.+?) be the (best|top) AI model on ([A-Za-z]+) (\d{1,2}), (\d{4})(?: \(Style Control On\))?[。.]?$/i,
  );
  if (aiModelRanking) {
    const dateLabel = formatEnglishDateLabel(aiModelRanking[3], aiModelRanking[4], aiModelRanking[5]);
    const suffix = /\(Style Control On\)/i.test(text) ? '（风格控制开启）' : '';
    return `${dateLabel}，${aiModelRanking[1]} 会成为榜首 AI 模型吗？${suffix}`;
  }

  const oilHit = text.match(/^Will (.+?) hit \((HIGH|LOW)\) \$(\d+(?:\.\d+)?) in ([A-Za-z]+)[。.]?$/i);
  if (oilHit) {
    const side = oilHit[2].toLowerCase() === 'high' ? '高点' : '低点';
    return `${formatEnglishMonthLabel(oilHit[4])}内，${oilHit[1]} 会触及 ${oilHit[3]} 美元${side}吗？`;
  }

  return text;
}

function questionCardAccentClass(preview: LiveBenchQuestionPreview) {
  if (preview.status === 'resolved') return 'border-emerald-200/90';
  if (preview.aggregate_vote.side === 'yes') return 'border-emerald-200/90';
  if (preview.aggregate_vote.side === 'no') return 'border-rose-200/90';
  return 'border-[var(--border-default)]';
}

function questionTimingLabel(preview: LiveBenchQuestionPreview) {
  if (preview.status === 'resolved') return officialOutcomeLabel(preview.official_outcome);
  if (preview.settlement_status === 'pending_official') return '到期待核票';
  return `见分晓 ${formatTime(preview.official_resolved_at || preview.resolve_at)}`;
}

function questionTitleLabel(preview: LiveBenchQuestionPreview) {
  const cleaned = cleanQuestionCardText(preview.title).replace(/^这道题在问[:：]\s*/u, '');
  return compactText(localizeQuestionTitle(cleaned), 88);
}

function questionModeratorLabel(preview: LiveBenchQuestionPreview) {
  const cleaned = cleanQuestionCardText(preview.moderator_line || '');
  if (cleaned && !/参与人数|成交量|流动性|结算接口|聚合补位/iu.test(cleaned)) {
    return compactText(cleaned, 92);
  }
  const background = cleanQuestionCardText(preview.background || '');
  if (background) return compactText(background, 92);
  return '主持人已整理题目背景、结算规则和当前判断。';
}

function questionAggregateLabel(preview: LiveBenchQuestionPreview) {
  return preview.aggregate_vote.side ? `模型总票偏向 ${voteSideLabel(preview.aggregate_vote.side)}` : '模型总票还在汇总';
}

function questionParticipationLabel(preview: LiveBenchQuestionPreview) {
  const aggregate = preview.aggregate_vote;
  return `参与虾 ${aggregate.participant_count}/${aggregate.participant_count + aggregate.missing_count}`;
}

function questionCompletionLabel(preview: LiveBenchQuestionPreview) {
  if (preview.aggregate_vote.participant_count === 0 && preview.aggregate_vote.missing_count === 0) {
    return '等待首票';
  }
  return preview.aggregate_vote.complete ? '本轮已齐票' : `待齐 ${preview.aggregate_vote.missing_count}`;
}

function livebenchQuestionTime(preview: LiveBenchQuestionPreview) {
  return preview.official_resolved_at || preview.resolve_at || new Date().toISOString();
}

function markerDotClass(level: 'high' | 'elevated' | 'monitoring') {
  if (level === 'high') return 'bg-[#e8475f] shadow-[0_0_12px_rgba(232,71,95,0.42)]';
  if (level === 'elevated') return 'bg-[#1aafdb] shadow-[0_0_12px_rgba(26,175,219,0.38)]';
  return 'bg-[#34c79a] shadow-[0_0_12px_rgba(52,199,154,0.38)]';
}

function signalDisplayLevel(signal: Pick<DashboardSignal, 'display_level' | 'severity'>): 'high' | 'elevated' | 'monitoring' {
  if (signal.display_level === 'high' || signal.display_level === 'elevated' || signal.display_level === 'monitoring') {
    return signal.display_level;
  }
  if (signal.severity >= 4) return 'high';
  if (signal.severity >= 3) return 'elevated';
  return 'monitoring';
}

function timelineTabClass(active: boolean) {
  return active
    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
    : 'border-[var(--border-default)] bg-[var(--bg-container)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]';
}

function performanceSummaryHeadline(summary: LiveBenchPlatformModelSummary | null | undefined) {
  if (!summary) return '模型评分还在同步。';
  const scored = summary.source_formal_scored_question_count || summary.formal_scored_question_count || summary.scored_question_count;
  const error = summary.source_formal_avg_brier ?? summary.formal_avg_brier ?? summary.avg_brier;
  if (scored > 0) {
    const label =
      summary.source_formal_scored_question_count > 0
        ? '信源接入正式题'
        : summary.formal_scored_question_count > 0
          ? '正式计分题'
          : '历史基线题目';
    const hitRate =
      summary.source_formal_scored_question_count > 0
        ? summary.source_formal_hit_rate
        : summary.formal_scored_question_count > 0
          ? summary.formal_hit_rate
          : summary.hit_rate;
    return `过去 ${scored} 道${label}里，预测命中率 ${formatPercent(hitRate)}，平均误差 ${formatBrierScore(error)}。`;
  }
  if ((summary.source_formal_vote_count || summary.formal_vote_count) > 0) {
    return `Hermes 等正式接入虾已经提交 ${summary.source_formal_vote_count || summary.formal_vote_count} 票，等待对应题目结算后计分。`;
  }
  return `已结算 ${summary.resolved_question_count} 题，正式模型票还在等待对应题目结算。`;
}

function displayScoredQuestionCount(summary: LiveBenchPlatformModelSummary | null | undefined) {
  if (!summary) return 0;
  if (summary.source_formal_scored_question_count > 0) return summary.source_formal_scored_question_count;
  return summary.formal_scored_question_count > 0 ? summary.formal_scored_question_count : summary.scored_question_count;
}

function displayAverageError(summary: LiveBenchPlatformModelSummary | null | undefined) {
  if (!summary) return null;
  if (summary.source_formal_scored_question_count > 0) return summary.source_formal_avg_brier;
  return summary.formal_scored_question_count > 0 ? summary.formal_avg_brier : summary.avg_brier;
}

function performanceSummarySupport(summary: LiveBenchPlatformModelSummary | null | undefined) {
  if (!summary) return '评分同步完成后会补上覆盖率、已结算数量和当前活跃题。';
  const coverage =
    summary.source_formal_scored_question_count > 0
      ? summary.source_formal_scoring_coverage_rate
      : summary.formal_scored_question_count > 0
        ? summary.formal_scoring_coverage_rate
        : summary.scoring_coverage_rate;
  if (summary.source_formal_scored_question_count === 0 && summary.formal_scored_question_count === 0) {
    if ((summary.source_formal_vote_count || summary.formal_vote_count) > 0) {
      return `${summary.formal_participant_count} 只正式虾已接入；历史基线已计分 ${summary.scored_question_count} 题，当前还有 ${summary.active_question_count} 道题在跟踪。`;
    }
    return summary.scored_question_count > 0
      ? `历史基线已计分 ${summary.scored_question_count} 题；正式接入票还在等待对应题目结算，当前还有 ${summary.active_question_count} 道题在跟踪。`
      : `已结算 ${summary.resolved_question_count} 题，正式计分 0 题；当前还有 ${summary.active_question_count} 道题在跟踪。`;
  }
  return `已结算 ${summary.resolved_question_count} 题，计分覆盖 ${formatPercent(coverage)}，当前还有 ${summary.active_question_count} 道题在跟踪。`;
}

function livebenchPoolHeadline(summary: WorldDashboardLiveBenchSummary | null | undefined) {
  if (!summary) return '题池覆盖还在同步。';
  const pendingSettlement = summary.settlement_pending_count || 0;
  if (pendingSettlement > 0) {
    return `当前有 ${summary.current_question_count} 道题在跟踪，累计已核票 ${summary.resolved_question_count} 道，另有 ${pendingSettlement} 道到期待核票。`;
  }
  return `当前有 ${summary.current_question_count} 道题在跟踪，累计已核票 ${summary.resolved_question_count} 道。`;
}

function summarizeEmptySignalCheck(
  statusPayload: WorldSourceKnowledgeState | null,
  statusOk: boolean,
  syncPayload: { deferred?: boolean } | null,
  syncStatus: number | null,
  reason: string,
): EmptySignalCheck {
  const freshnessStatus = statusPayload?.source_health?.freshness_status || null;
  const latestSignalAgeHours = statusPayload?.source_health?.latest_signal_age_hours ?? null;
  const latestSignalPublishedAt = statusPayload?.latest_signal_published_at || null;
  const syncDeferred = Boolean(syncPayload?.deferred);
  const status: EmptySignalCheckStatus = !statusOk
    ? 'error'
    : freshnessStatus === 'fresh'
      ? 'fresh'
      : syncDeferred
        ? 'deferred'
        : 'stale';
  const message =
    status === 'fresh'
      ? '当前页面暂时没有足够线索，但最近内容仍在正常更新。'
      : status === 'deferred'
        ? '当前页面暂时没有足够线索，系统会继续补齐可读内容。'
      : status === 'error'
          ? '当前页面暂时没有足够线索，正在等待下一次内容更新。'
          : '当前页面暂时没有足够线索，最近内容可能偏旧。';
  return {
    status,
    checkedAt: new Date().toISOString(),
    reason,
    message,
    latestSignalPublishedAt,
    latestSignalAgeHours,
    freshnessStatus,
    syncDeferred,
    syncStatus,
  };
}

export default function DashboardClient({
  initialScene = 'global',
  initialState = null,
  initialSubworlds = DEFAULT_SUBWORLDS,
}: PageClientProps) {
  const normalizedInitialState = useMemo(() => normalizeDashboardState(initialState), [initialState]);
  const normalizedInitialSubworlds = useMemo(() => normalizeSubworlds(initialSubworlds), [initialSubworlds]);
  const normalizedInitialScene = useMemo(() => normalizePrimaryScene(initialScene), [initialScene]);
  const normalizedInitialQuestionPool = useMemo(
    () => questionPoolFromState(normalizedInitialState),
    [normalizedInitialState],
  );
  const initialTimelineScene: TimelineView = normalizedInitialScene === 'tech-ai' ? 'tech-ai' : 'geo-politics-daily';
  const scene = normalizedInitialScene;
  const [timelineScene, setTimelineScene] = useState<TimelineView>(initialTimelineScene);
  const [state, setState] = useState<WorldDashboardResponse | null>(normalizedInitialState);
  const [geoTimelineState, setGeoTimelineState] = useState<WorldDashboardResponse | null>(
    normalizedInitialScene === 'geo-politics-daily' ? normalizedInitialState : null,
  );
  const [techAiTimelineState, setTechAiTimelineState] = useState<WorldDashboardResponse | null>(
    normalizedInitialScene === 'tech-ai' ? normalizedInitialState : null,
  );
  const [quickGeoSignals, setQuickGeoSignals] = useState<DashboardSignal[]>([]);
  const [quickTechAiSignals, setQuickTechAiSignals] = useState<DashboardSignal[]>([]);
  const [questionPool, setQuestionPool] = useState<LiveBenchQuestionPreview[]>(normalizedInitialQuestionPool);
  const [globeTimeMode, setGlobeTimeMode] = useState<'today' | 'memory30'>('memory30');
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [globeAutoPauseUntil, setGlobeAutoPauseUntil] = useState<number>(0);
  const [skillEntryCopied, setSkillEntryCopied] = useState(false);
  const [loading, setLoading] = useState(!hasUsefulDashboardState(normalizedInitialState));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptySignalCheck, setEmptySignalCheck] = useState<EmptySignalCheck | null>(null);
  const hasUsefulStateRef = useRef(hasUsefulDashboardState(normalizedInitialState));
  const emptySignalCheckKeyRef = useRef<string | null>(null);
  const worldMapPanelRef = useRef<HTMLDivElement | null>(null);
  const timelinePanelRef = useRef<HTMLDivElement | null>(null);
  const [worldMapPanelHeight, setWorldMapPanelHeight] = useState<number | null>(null);
  const sidePanelStyle = worldMapPanelHeight
    ? ({ '--world-map-panel-height': `${worldMapPanelHeight}px` } as CSSProperties)
    : undefined;

  useEffect(() => {
    hasUsefulStateRef.current = hasUsefulDashboardState(state);
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('scene') === scene) return;
    url.searchParams.set('scene', scene);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [scene]);

  useEffect(() => {
    const panel = worldMapPanelRef.current;
    if (!panel) return;

    const updatePanelHeight = () => {
      if (!window.matchMedia('(min-width: 1280px)').matches) {
        setWorldMapPanelHeight(null);
        return;
      }
      setWorldMapPanelHeight(Math.ceil(panel.offsetHeight || panel.getBoundingClientRect().height));
    };

    updatePanelHeight();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updatePanelHeight);
      return () => window.removeEventListener('resize', updatePanelHeight);
    }

    const observer = new ResizeObserver(updatePanelHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const loadDashboard = useCallback(async (nextScene: WorldScene, options: { manual?: boolean; background?: boolean } = {}) => {
    if (!options.background) setLoading(true);
    if (options.manual) setRefreshing(true);
    setError(null);

    try {
      const requestStamp = Date.now();
      const stateRequest = fetch(`/api/v1/world/state?scene=${nextScene}&_=${requestStamp}`, { cache: 'no-store' });
      const subworldsRequest = fetch(`/api/v1/world/subworlds?_=${requestStamp}`, { cache: 'no-store' });
      const [stateRes, subworldsRes] = await Promise.all([stateRequest, subworldsRequest]);
      const [stateData, subworldsData] = await Promise.all([stateRes.json(), subworldsRes.json()]);
      if (!stateRes.ok) throw new Error(stateData.error || '加载世界状态失败');

      const normalizedState = normalizeDashboardState(stateData);
      if (nextScene === 'geo-politics-daily') {
        setGeoTimelineState(normalizedState);
      }
      if (nextScene === 'tech-ai') {
        setTechAiTimelineState(normalizedState);
      }
      const nextSubworlds = normalizeSubworlds(subworldsData?.subworlds);
      let nextQuestionPool = questionPoolFromState(normalizedState);
      if (nextQuestionPool.length === 0) {
        nextQuestionPool = await fetchLiveBenchQuestionFallback(nextScene);
      }
      const nextStateIsUseful = hasUsefulDashboardState(normalizedState);

      if (nextStateIsUseful || !hasUsefulStateRef.current) {
        hasUsefulStateRef.current = nextStateIsUseful;
        setState(normalizedState);
        setActiveSignalId((current) =>
          current && normalizedState?.nodes?.some((node) => node.node_id === current)
            ? current
            : chooseDefaultActiveSignalId(normalizedState),
        );
        persistDashboardCache({
          version: DASHBOARD_CACHE_VERSION,
          saved_at: Date.now(),
          scene: nextScene,
          state: normalizedState,
          subworlds: nextSubworlds,
        });
      }
      setQuestionPool((currentPool) => (nextQuestionPool.length > 0 || currentPool.length === 0 ? nextQuestionPool : currentPool));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载世界状态失败');
    } finally {
      setLoading(false);
      if (options.manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let backgroundTimer: number | null = null;
    if (scene === normalizedInitialScene && hasUsefulDashboardState(normalizedInitialState)) {
      persistDashboardCache({
        version: DASHBOARD_CACHE_VERSION,
        saved_at: Date.now(),
        scene,
        state: normalizedInitialState,
        subworlds: normalizedInitialSubworlds,
      });
      setLoading(false);
      setQuestionPool(questionPoolFromState(normalizedInitialState));
      setActiveSignalId((current) =>
        current && normalizedInitialState?.nodes?.some((node) => node.node_id === current)
          ? current
          : chooseDefaultActiveSignalId(normalizedInitialState),
      );
      backgroundTimer = window.setTimeout(() => {
        void loadDashboard(scene, { background: true });
      }, INITIAL_BACKGROUND_REFRESH_DELAY_MS);
    } else {
      const cached = readDashboardCache(scene);
      if (cached) {
        setState(cached.state);
        setQuestionPool(questionPoolFromState(cached.state));
        setActiveSignalId((current) =>
          current && cached.state?.nodes?.some((node) => node.node_id === current)
            ? current
            : chooseDefaultActiveSignalId(cached.state),
        );
        setLoading(false);
        backgroundTimer = window.setTimeout(() => {
          void loadDashboard(scene, { background: true });
        }, INITIAL_BACKGROUND_REFRESH_DELAY_MS);
      } else {
        void loadDashboard(scene);
      }
    }
    return () => {
      if (backgroundTimer !== null) window.clearTimeout(backgroundTimer);
    };
  }, [loadDashboard, normalizedInitialScene, normalizedInitialState, normalizedInitialSubworlds, scene]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadDashboard(scene, { background: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard, scene]);

  useEffect(() => {
    if (quickGeoSignals.length > 0) return;
    let cancelled = false;
    const requestStamp = Date.now();
    void fetch(`/api/v1/world/signals?scene=geo-politics-daily&limit=24&_=${requestStamp}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as { signals?: WorldSignalsApiSignal[] };
        if (!response.ok) throw new Error('加载地缘快速信号失败');
        return (data.signals || [])
          .map((signal) => quickSignalToDashboardSignal(signal, 'geo-politics-daily'))
          .filter((signal): signal is DashboardSignal => Boolean(signal));
      })
      .then((signals) => {
        if (!cancelled) setQuickGeoSignals(signals);
      })
      .catch(() => {
        if (!cancelled) setQuickGeoSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [quickGeoSignals.length]);

  useEffect(() => {
    if (quickTechAiSignals.length > 0) return;
    let cancelled = false;
    const requestStamp = Date.now();
    void fetch(`/api/v1/world/signals?scene=tech-ai&limit=24&_=${requestStamp}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as { signals?: WorldSignalsApiSignal[] };
        if (!response.ok) throw new Error('加载 AI 快速信号失败');
        return (data.signals || [])
          .map((signal) => quickSignalToDashboardSignal(signal, 'tech-ai'))
          .filter((signal): signal is DashboardSignal => Boolean(signal));
      })
      .then((signals) => {
        if (!cancelled) setQuickTechAiSignals(signals);
      })
      .catch(() => {
        if (!cancelled) setQuickTechAiSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [quickTechAiSignals.length]);

  useEffect(() => {
    if (timelineScene !== 'geo-politics-daily' || geoTimelineState) return;
    let cancelled = false;
    const requestStamp = Date.now();
    void fetch(`/api/v1/world/state?scene=geo-politics-daily&_=${requestStamp}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || '加载地缘时间线失败');
        return normalizeDashboardState(data);
      })
      .then((nextState) => {
        if (!cancelled) setGeoTimelineState(nextState);
      })
      .catch(() => {
        if (!cancelled) setGeoTimelineState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [geoTimelineState, timelineScene]);

  useEffect(() => {
    if (timelineScene !== 'tech-ai' || techAiTimelineState) return;
    let cancelled = false;
    const requestStamp = Date.now();
    void fetch(`/api/v1/world/state?scene=tech-ai&fresh=1&_=${requestStamp}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || '加载 AI 时间线失败');
        return normalizeDashboardState(data);
      })
      .then((nextState) => {
        if (!cancelled) setTechAiTimelineState(nextState);
      })
      .catch(() => {
        if (!cancelled) setTechAiTimelineState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [techAiTimelineState, timelineScene]);

  useEffect(() => {
    if (techAiTimelineState || scene === 'tech-ai') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const requestStamp = Date.now();
      void fetch(`/api/v1/world/state?scene=tech-ai&fresh=1&_=${requestStamp}`, { cache: 'no-store' })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || '加载 AI 摘要失败');
          return normalizeDashboardState(data);
        })
        .then((nextState) => {
          if (!cancelled) setTechAiTimelineState(nextState);
        })
        .catch(() => {
          if (!cancelled) setTechAiTimelineState(null);
        });
    }, 1400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scene, techAiTimelineState]);

  useEffect(() => {
    if (geoTimelineState || scene === 'geo-politics-daily') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const requestStamp = Date.now();
      void fetch(`/api/v1/world/state?scene=geo-politics-daily&_=${requestStamp}`, { cache: 'no-store' })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || '加载主世界地图失败');
          return normalizeDashboardState(data);
        })
        .then((nextState) => {
          if (!cancelled) setGeoTimelineState(nextState);
        })
        .catch(() => {
          if (!cancelled) setGeoTimelineState(null);
        });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [geoTimelineState, scene]);

  useEffect(() => {
    if (questionPool.length > 0) return;
    let cancelled = false;
    void fetchLiveBenchQuestionFallback(scene).then((previews) => {
      if (!cancelled && previews.length > 0) {
        setQuestionPool(previews);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [questionPool.length, scene]);

  useEffect(() => {
    const handleFocusRefresh = () => {
      void loadDashboard(scene, { background: true });
    };
    window.addEventListener('focus', handleFocusRefresh);
    window.addEventListener('online', handleFocusRefresh);
    return () => {
      window.removeEventListener('focus', handleFocusRefresh);
      window.removeEventListener('online', handleFocusRefresh);
    };
  }, [loadDashboard, scene]);

  const mapScene: WorldScene = scene === 'tech-ai' ? 'geo-politics-daily' : scene;
  const mapState = scene === 'tech-ai' ? geoTimelineState : state;
  const markers = useMemo(() => {
    const todayStart = startOfToday();
    return (mapState?.nodes || [])
      .filter((node) => dashboardNodeMatchesScene(node, mapScene))
      .filter((node) => node.geo.lat !== null && node.geo.lng !== null)
      .filter((node) => {
        const timestamp = node.updated_at || node.last_report_at || node.published_at || mapState?.generated_at || new Date().toISOString();
        if (globeTimeMode === 'today') {
          return new Date(timestamp).getTime() >= todayStart;
        }
        return Date.now() - new Date(timestamp).getTime() <= GLOBE_MEMORY_DAYS * 86400000;
      })
      .map((node) => ({
        id: node.node_id,
        lat: node.geo.lat!,
        lng: node.geo.lng!,
        severity: node.severity,
        displayLevel: markerDisplayLevel(node),
        title: readableSignalTitle(node),
        timestamp: node.updated_at || node.last_report_at || node.published_at || mapState?.generated_at || new Date().toISOString(),
        nodeType: node.node_type,
        scene: sceneDisplayLabel(node.scene),
        summary: readableSignalSummary(node, 120),
        sourceName: node.source_name,
        locationLabel: cleanPresentationText([node.geo.label, node.geo.country].filter(Boolean).join(', ')),
        confidence: node.confidence,
        ageOpacity:
          globeTimeMode === 'today'
            ? 1
            : ageOpacityFromTimestamp(
                node.updated_at || node.last_report_at || node.published_at || mapState?.generated_at || new Date().toISOString(),
                GLOBE_MEMORY_DAYS,
              ),
        activities: node.activities,
      }));
  }, [globeTimeMode, mapScene, mapState]);

  useEffect(() => {
    if (!markers.some((marker) => marker.id === activeSignalId)) {
      setActiveSignalId(markers[0]?.id || null);
    }
  }, [activeSignalId, markers]);

  useEffect(() => {
    if (markers.length <= 1) return;
    const timer = window.setInterval(() => {
      if (Date.now() < globeAutoPauseUntil) return;
      setActiveSignalId((current) => {
        const currentIndex = markers.findIndex((marker) => marker.id === current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % markers.length : 0;
        return markers[nextIndex]?.id || current || null;
      });
    }, 12000);
    return () => window.clearInterval(timer);
  }, [globeAutoPauseUntil, markers]);

  const alertBoard = useMemo(() => {
    const candidates = (mapState?.nodes || [])
      .filter((node) => isAlertBoardCandidate(node))
      .filter((node) => dashboardNodeMatchesScene(node, mapScene))
      .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score);
    const highNodes = candidates.filter((node) => node.node_type === 'hotspot' && node.severity >= 4).slice(0, 12);
    if (highNodes.length > 0) {
      return {
        title: '红色热点',
        titleClassName: 'text-red-500',
        emptyText: '当前没有明显升温到需要单独盯住的条目。',
        nodes: highNodes,
      };
    }
    return {
      title: '当前信号',
      titleClassName: 'text-slate-500',
      emptyText: '当前分类还没有需要单独盯住的条目。',
      nodes: candidates.slice(0, 12),
    };
  }, [mapScene, mapState]);
  const alertNodes = alertBoard.nodes;

  useEffect(() => {
    if (!state || loading) return;
    const hasSignalFeed =
      (state.top_signals?.length || 0) > 0 ||
      (state.knowledge_signals?.length || 0) > 0 ||
      (state.graph_signals?.length || 0) > 0;
    const canRenderWithoutMap = (scene === 'tech-ai' || scene === 'global' || scene === 'geo-politics-daily') && hasSignalFeed;
    const missing = [
      markers.length === 0 && !canRenderWithoutMap ? `地图落点为 0（${globeTimeMode === 'today' ? '今天' : '近 30 天'}）` : null,
      alertNodes.length === 0 && !canRenderWithoutMap
        ? '当前信号列表为 0'
        : null,
    ].filter(Boolean) as string[];
    if (missing.length === 0) {
      emptySignalCheckKeyRef.current = null;
      setEmptySignalCheck(null);
      return;
    }

    const checkKey = `${scene}:${globeTimeMode}:${state.generated_at}:${markers.length}:${alertNodes.length}`;
    if (emptySignalCheckKeyRef.current === checkKey) return;
    emptySignalCheckKeyRef.current = checkKey;
    let cancelled = false;
    const reason = missing.join('；');
    setEmptySignalCheck({
      status: 'checking',
      checkedAt: new Date().toISOString(),
      reason,
      message: '当前页面暂时没有足够线索，正在检查内容状态。',
    });

    void (async () => {
      let statusPayload: WorldSourceKnowledgeState | null = null;
      let statusOk = false;
      let syncPayload: { deferred?: boolean } | null = null;
      let syncStatus: number | null = null;
      try {
        const stamp = Date.now();
        const statusResponse = await fetch(`/api/v1/world/source-knowledge/status?scene=${scene}&fresh=1&_=${stamp}`, {
          cache: 'no-store',
          headers: { 'x-world-empty-dashboard-check': '1' },
        });
        statusOk = statusResponse.ok;
        statusPayload = (await statusResponse.json().catch(() => null)) as WorldSourceKnowledgeState | null;
        const freshnessStatus = statusPayload?.source_health?.freshness_status;
        if (!statusOk || freshnessStatus !== 'fresh') {
          const syncResponse = await fetch(`/api/v1/world/source-knowledge/sync?scene=${scene}&batch=1&_=${Date.now()}`, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'x-world-batch-refresh': '1', 'x-world-empty-dashboard-check': '1' },
          });
          syncStatus = syncResponse.status;
          syncPayload = (await syncResponse.json().catch(() => null)) as { deferred?: boolean } | null;
        }
      } catch {
        statusOk = false;
      }
      if (!cancelled) {
        setEmptySignalCheck(summarizeEmptySignalCheck(statusPayload, statusOk, syncPayload, syncStatus, reason));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [alertNodes.length, globeTimeMode, loading, markers.length, scene, state]);

  const activeSignalNode = useMemo(() => {
    if (!activeSignalId) return null;
    return (mapState?.nodes || []).find((node) => node.node_id === activeSignalId) || null;
  }, [activeSignalId, mapState]);

  const focusCard = useMemo(() => {
    if (activeSignalNode) {
      return {
        label: sceneDisplayLabel(activeSignalNode.scene),
        title: readableSignalTitle(activeSignalNode),
        summary: readableSignalSummary(activeSignalNode, 140),
        updatedAt: activeSignalNode.updated_at || activeSignalNode.published_at,
        watchNext: readableSignalSourceLine({
          ...activeSignalNode,
          location_name: activeSignalNode.geo.label || activeSignalNode.geo.region,
        }),
      };
    }
    const primarySignal = mapState?.top_signals?.[0] || mapState?.graph_signals?.[0] || mapState?.knowledge_signals?.[0];
    if (primarySignal) {
      return {
        label: sceneDisplayLabel(primarySignal.scene),
        title: readableSignalTitle(primarySignal),
        summary: readableSignalSummary(primarySignal, 140),
        updatedAt: primarySignal.published_at || mapState?.generated_at,
        watchNext: readableSignalSourceLine(primarySignal),
      };
    }
    if (mapState?.world_view_summary) {
      return {
        label: '世界视图',
        title: mapState.world_view_summary.title,
        summary: cleanNarrativeText(mapState.world_view_summary.summary),
        updatedAt: mapState.world_view_summary.updated_at,
        watchNext: '',
      };
    }
    return null;
  }, [activeSignalNode, mapState]);

  const dashboardQuestionPool = useMemo(
    () =>
      questionPool.length > 0
        ? questionPool
        : questionPoolFromState(state),
    [questionPool, state],
  );
  const currentQuestions = useMemo(
    () => dashboardQuestionPool.filter((preview) => preview.status !== 'resolved'),
    [dashboardQuestionPool],
  );
  const resolvedQuestions = useMemo(
    () => dashboardQuestionPool.filter((preview) => preview.status === 'resolved'),
    [dashboardQuestionPool],
  );
  const questionList = dashboardQuestionPool;
  const evaluationSummary = state?.evaluation_summary || null;
  const livebenchSummary = state?.livebench_summary || null;
  const isTimelineScene = scene === 'global' || scene === 'geo-politics-daily' || scene === 'tech-ai';
  const timelineSignalState =
    timelineScene === 'tech-ai'
      ? techAiTimelineState || (scene === 'tech-ai' ? state : null)
      : timelineScene === 'geo-politics-daily'
        ? geoTimelineState || (scene === 'geo-politics-daily' ? state : null)
        : state;
  const mainWorldSignals = useMemo(
    () => {
      if (timelineScene === 'livebench') return [];
      const quickSignals =
        timelineScene === 'tech-ai'
          ? quickTechAiSignals
          : timelineScene === 'geo-politics-daily'
            ? quickGeoSignals
            : [];
      const signals = uniqueDashboardSignals(
        quickSignals,
        timelineSignalState?.graph_signals,
        timelineSignalState?.top_signals,
        timelineSignalState?.knowledge_signals,
      ).filter((signal) =>
        timelineScene === 'tech-ai'
          ? isTrustedTechAiDashboardSignal(signal)
          : dashboardSignalMatchesScene(signal, timelineScene),
      );
      return signals
        .sort((left, right) => {
          if (timelineScene === 'tech-ai') {
            return (
              techAiSignalRank(left) - techAiSignalRank(right) ||
              techAiRelevanceScore(right) - techAiRelevanceScore(left) ||
              new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
            );
          }
          return (
            mainWorldSignalRank(left) - mainWorldSignalRank(right) ||
            mainWorldSignalPriority(right) - mainWorldSignalPriority(left) ||
            new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
          );
        })
        .slice(0, timelineScene === 'tech-ai' ? 24 : 12);
    },
    [quickGeoSignals, quickTechAiSignals, timelineScene, timelineSignalState],
  );
  const mainWorldSignalGroups = useMemo(() => groupItemsByDay(mainWorldSignals, (signal) => signal.published_at), [mainWorldSignals]);
  const livebenchTimelineGroups = useMemo(() => {
    const sortedQuestions = [...questionList].sort(
      (left, right) => new Date(livebenchQuestionTime(right)).getTime() - new Date(livebenchQuestionTime(left)).getTime(),
    );
    return groupItemsByDay(sortedQuestions, livebenchQuestionTime);
  }, [questionList]);
  const geoSignalState = scene === 'geo-politics-daily' ? state : null;
  const geoDigestSignals = useMemo(
    () =>
      uniqueDashboardSignals(
        quickGeoSignals,
        geoSignalState?.graph_signals,
        geoSignalState?.top_signals,
        geoSignalState?.knowledge_signals,
      )
        .filter((signal) => dashboardSignalMatchesScene(signal, 'geo-politics-daily'))
        .sort(
          (left, right) =>
            mainWorldSignalRank(left) - mainWorldSignalRank(right) ||
            mainWorldSignalPriority(right) - mainWorldSignalPriority(left) ||
            new Date(right.published_at).getTime() - new Date(left.published_at).getTime(),
        )
        .slice(0, 3),
    [geoSignalState, quickGeoSignals],
  );
  const techSignalState = techAiTimelineState || (scene === 'tech-ai' ? state : null);
  const techCurationSignals = useMemo(
    () =>
      uniqueDashboardSignals(
        quickTechAiSignals,
        techSignalState?.top_signals,
        techSignalState?.knowledge_signals,
        techSignalState?.graph_signals,
      )
        .filter(isTrustedTechAiDashboardSignal)
        .sort(
          (left, right) =>
            techAiSignalRank(left) - techAiSignalRank(right) ||
            new Date(right.published_at).getTime() - new Date(left.published_at).getTime(),
        )
        .slice(0, 12),
    [quickTechAiSignals, techSignalState],
  );
  const aseanTopicHref = worldMountedHref('/demo/asean');
  const dashboardBriefCards = useMemo(() => {
    const livebenchLead = currentQuestions[0] || resolvedQuestions[0] || null;
    const livebenchDailyItems = [...currentQuestions, ...resolvedQuestions];
    return [
      {
        key: 'world',
        label: '主世界',
        title: '地缘与公共风险',
        summary: signalDailyDigest(geoDigestSignals, '地缘、公共安全和区域风险信号会在这里先聚合成今日摘要。'),
        meta: geoDigestSignals.length > 0 ? `${geoDigestSignals.length} 条精选线索` : '打开日报',
        view: 'geo-politics-daily' as TimelineView,
        href: DAILY_PAGE_HREFS['geo-politics-daily'],
      },
      {
        key: 'ai',
        label: 'AI',
        title: '模型、Agent 与产业',
        summary: signalDailyDigest(techCurationSignals, '模型、Agent、论文和开源信源会在这里形成今日 AI 日报。'),
        meta: techCurationSignals.length > 0 ? `${techCurationSignals.length} 条 AI 线索` : '打开日报',
        view: 'tech-ai' as TimelineView,
        href: DAILY_PAGE_HREFS['tech-ai'],
      },
      {
        key: 'livebench',
        label: '演绎',
        title: '题池与结算反馈',
        summary: livebenchDailyDigest(livebenchDailyItems, '预测题会作为校准闭环保留，用来检验信源判断是否真正有用。'),
        meta: livebenchLead ? questionTimingLabel(livebenchLead) : '打开题池',
        view: 'livebench' as TimelineView,
        href: DAILY_PAGE_HREFS.livebench,
      },
      {
        key: 'asean',
        label: '东盟',
        title: '东盟区域专题',
        summary: '围绕能源电力、数据中心需求、区域产业链和公开信源，进入东盟专题地图与关联图谱。',
        meta: '进入专题',
        view: 'geo-politics-daily' as TimelineView,
        href: aseanTopicHref,
      },
    ];
  }, [aseanTopicHref, currentQuestions, geoDigestSignals, resolvedQuestions, techCurationSignals]);
  const geoTimelineCount = geoTimelineState?.top_signals?.length || quickGeoSignals.length || geoDigestSignals.length;
  const techTimelineCount = techSignalState?.top_signals?.length || quickTechAiSignals.length || techCurationSignals.length;
  const livebenchTimelineCount = currentQuestions.length + resolvedQuestions.length;
  const sourceKnowledgeHref = mountedHomeHref('/source-knowledge', scene);
  const mainSkillHref = './api/v1/openclaw/skill.md';
  const aihotSkillHref = './api/v1/openclaw/ai.skill.md';
  const skillEntry = useMemo(() => {
    const base = state?.skill_entry || {
      mode: 'bound' as const,
      title: '信源 Skill',
      description: '',
      copy_hint: '',
      url: mainSkillHref,
    };
    return {
      ...base,
      description:
        '把这个地址交给接入方。它会按近 30 天信源回答问题，也能读取 AI 日报和主世界日报。',
      copy_hint: '日常回答优先用当前精选线索；需要深挖时再进入全部信源。',
    };
  }, [state?.skill_entry]);
  const skillEntryHref = mainSkillHref;
  const [skillEntryDisplayUrl, setSkillEntryDisplayUrl] = useState(mainSkillHref);
  useEffect(() => {
    setSkillEntryDisplayUrl(new URL(mainSkillHref, window.location.href).toString());
  }, [mainSkillHref]);
  const handleCopySkillEntry = async () => {
    if (!skillEntry?.url) return;
    const copied = await copyTextWithFallback(skillEntryDisplayUrl);
    if (!copied) return;
    setSkillEntryCopied(true);
    window.setTimeout(() => setSkillEntryCopied(false), 1600);
  };
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      <div className="relative mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-3 sm:px-6 2xl:px-8">
        <section className="flex min-h-[58px] w-full min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] pb-3">
          <div className="min-w-0">
            <h1 className="min-w-0 text-[1.65rem] font-bold leading-tight text-[var(--text-primary)]">世界脉络</h1>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 text-sm sm:ml-auto sm:w-auto sm:justify-end">
            <nav className="inline-flex min-w-0 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] p-1">
              <Link
                href="/?scene=geo-politics-daily"
                className="rounded-[var(--radius-md)] bg-[var(--bg-container)] px-4 py-2 font-semibold text-[var(--text-primary)] shadow-sm"
              >
                整体态势
              </Link>
              <Link
                href={aseanTopicHref}
                className="rounded-[var(--radius-md)] px-4 py-2 font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-container)] hover:text-[var(--text-primary)]"
              >
                东盟专题
              </Link>
            </nav>
            <span className="px-3 py-2 font-medium text-[var(--text-tertiary)]">AI</span>
            <span className="px-3 py-2 font-medium text-[var(--text-tertiary)]">
              {state ? formatTime(state.generated_at) : '--'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-[var(--radius-md)] border-[var(--border-default)] bg-[var(--bg-container)] px-3 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] sm:px-4"
              onClick={() => void loadDashboard(scene, { manual: true })}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </section>

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(720px,1.28fr)] xl:items-stretch">
          {skillEntry ? (
            <div className={`${dashboardInsetPanelClass} h-full`}>
              <div className="flex h-full flex-col gap-3">
                <div className="flex h-8 items-center justify-between gap-3">
                  <span className="inline-flex h-8 items-center gap-2 text-[13px] font-bold uppercase leading-none tracking-[0.12em] text-[var(--text-primary)]">
                    <Link2 className="h-4 w-4" />
                    Skill 接入
                  </span>
                  <div className="flex h-8 shrink-0 items-center gap-5 text-[12px] font-medium leading-none text-[var(--text-secondary)]">
                    <a href={skillEntryHref} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center transition hover:text-[#08201c]">
                      打开
                    </a>
                    <button type="button" onClick={() => void handleCopySkillEntry()} className="inline-flex h-8 items-center transition hover:text-[#08201c]">
                      {skillEntryCopied ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
                <a
                  href={skillEntryHref}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-h-[58px] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-3 font-mono text-[12px] leading-6 text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--border-hover)] sm:min-h-[64px] sm:px-4 sm:text-[13px]"
                  title={skillEntryDisplayUrl}
                >
                  <span className="line-clamp-2 break-all">{skillEntryDisplayUrl}</span>
                </a>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <a href={DAILY_PAGE_HREFS['geo-politics-daily']} className={dashboardTileClass}>
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#0f766e]">
                      <Globe2 className="h-4 w-4" />
                      主世界
                    </span>
                  </a>
                  <a href={DAILY_PAGE_HREFS['tech-ai']} className={dashboardTileClass}>
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#2563eb]">
                      <Bot className="h-4 w-4" />
                      AI
                    </span>
                  </a>
                  <a href={sourceKnowledgeHref} className={`${dashboardTileClass} hover:border-amber-300`}>
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#d97706]">
                      <FileText className="h-4 w-4" />
                      全部信源
                    </span>
                  </a>
                  <Link href={aseanTopicHref} className={dashboardTileClass}>
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#0f766e]">
                      <MapIcon className="h-4 w-4" />
                      东盟专题
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-container)] px-4 py-4 text-sm leading-7 text-[var(--text-secondary)]">
              当前还没有可公开展示的 skills 地址。
            </div>
          )}

          <div className={dashboardInsetPanelClass}>
            <div className="flex h-full flex-col gap-3">
              <div className="flex h-8 items-center justify-between gap-3">
                <p className="inline-flex h-8 items-center text-[13px] font-bold leading-none tracking-[0.08em] text-[var(--text-primary)]">今日简报</p>
                <span className="inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-teal-200 bg-teal-50 px-3 text-[12px] font-medium leading-none text-[#087265]">
                  精华版
                </span>
              </div>
              <div className="grid flex-1 gap-3 lg:grid-cols-4">
                {dashboardBriefCards.map((card) => {
                  const Icon = card.key === 'world' ? Globe2 : card.key === 'ai' ? Bot : card.key === 'asean' ? MapIcon : FileText;
                  return (
                    <a
                      key={`top-daily-card-${card.key}`}
                      href={card.href}
                      className="group animate-rise-in relative flex min-h-[104px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3 text-left text-[var(--text-primary)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:bg-[var(--bg-container)] hover:shadow-sm sm:min-h-[112px]"
                      style={{ animationDelay: `${120 + (card.key === 'ai' ? 80 : card.key === 'livebench' ? 160 : card.key === 'asean' ? 240 : 0)}ms` } as CSSProperties}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#087265]">
                          <Icon className="h-4 w-4" />
                          {card.label}
                        </span>
                        <span className="text-[12px] font-medium text-[#b25c18]">{card.meta}</span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-[14px] font-bold leading-6 text-[var(--text-primary)]">{card.title}</h3>
                      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-medium text-[#087265]">
                        阅读精华
                        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <Card className="rounded-[var(--radius-lg)] border-red-200 bg-red-50 shadow-none">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {emptySignalCheck ? (
          <Card className="rounded-[var(--radius-lg)] border-amber-200 bg-amber-50 shadow-none">
            <CardContent className="flex flex-col gap-2 p-4 text-sm leading-6 text-amber-900 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">
                  {emptySignalCheck.status === 'checking' ? '正在检查内容' : '内容正在补齐'}
                </p>
                <p className="text-amber-800">{emptySignalCheck.message}</p>
                <p className="text-xs text-amber-700">
                  提示：{emptySignalCheck.reason}
                  {emptySignalCheck.latestSignalAgeHours != null
                    ? `；最近内容约 ${emptySignalCheck.latestSignalAgeHours} 小时前`
                    : ''}
                </p>
              </div>
              <div className="shrink-0 rounded-[var(--radius-md)] border border-amber-200 bg-white px-3 py-1 text-xs text-amber-700">
                {emptySignalCheck.status === 'checking' ? '检查中' : '等待更新'}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {isTimelineScene ? (
        <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_minmax(520px,1fr)] xl:items-start 2xl:grid-cols-[minmax(660px,1fr)_minmax(660px,1fr)]">
          <Card id="world-map-panel" ref={worldMapPanelRef} className={`${dashboardPanelClass} min-w-0 xl:order-1`}>
            <CardContent className="flex h-full min-h-0 flex-col p-0">
              <div className={`${dashboardHeaderClass} flex items-center justify-between gap-3`}>
                <div>
                  <h2 className="text-[16px] font-bold text-[var(--text-primary)]">
                    3D 地球时间地图
                  </h2>
                </div>
                <div className="rounded-[var(--radius-md)] bg-[var(--bg-container)] px-2.5 py-0.5 text-[12px] text-[var(--text-tertiary)]">
                  最近更新 {mapState ? formatTime(mapState.generated_at) : '--'}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">

              {focusCard ? (
                <div className="mb-3 animate-rise-in rounded-[var(--radius-lg)] border border-teal-200 bg-teal-50/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-[var(--radius-md)] border border-teal-200 bg-[var(--bg-container)] px-2.5 py-1 font-semibold text-[#087265]">
                      {focusCard.label}
                    </span>
                    <span className="text-[#8a5a12]">{formatTime(focusCard.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-6 text-[var(--text-primary)]">{focusCard.title}</p>
                      <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">{compactText(focusCard.summary, 110)}</p>
                    </div>
                    {focusCard.watchNext ? (
                      <div className="rounded-[var(--radius-md)] border border-teal-200 bg-[var(--bg-container)] px-3 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)] lg:max-w-[22rem]">
                        <span className="font-semibold text-[#087265]">线索：</span>
                        {compactText(focusCard.watchNext, 64)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-default)] px-1 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: 'memory30', label: '近 30 天' },
                    { key: 'today', label: '今天' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setGlobeTimeMode(item.key as 'today' | 'memory30')}
                      className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-[13px] font-medium transition ${
                        globeTimeMode === item.key
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[var(--border-default)] bg-[var(--bg-container)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="text-[13px] text-[var(--text-tertiary)]">{markers.length} 个地图落点</span>
              </div>

              <div
                id="world-globe-shell"
                className="w-full max-w-full shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)]"
                style={{ height: 'clamp(380px, 100vw, 760px)' }}
              >
                {/* 中间栏固定保留 3D 地球，左右信息都围绕它组织。 */}
                <WorldGlobe
                  markers={markers}
                  trails={[]}
                  activeMarkerId={activeSignalId}
                  onSelectMarker={(signalId) => {
                    setActiveSignalId(signalId);
                    setGlobeAutoPauseUntil(Date.now() + 15000);
                  }}
                />
              </div>

              </div>
            </CardContent>
          </Card>

          {isTimelineScene ? (
          <Card ref={timelinePanelRef} className={`${dashboardPanelClass} xl:order-2 xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
            <CardHeader className={dashboardHeaderClass}>
              <div className="flex h-full w-full items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-[16px] font-bold text-[var(--text-primary)]">
                    线索时间线
                  </CardTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTimelineScene('geo-politics-daily')}
                    className={`${timelineTabButtonClass} ${timelineTabClass(timelineScene === 'geo-politics-daily')}`}
                  >
                    地缘 {geoTimelineCount > 0 ? geoTimelineCount : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineScene('tech-ai')}
                    className={`${timelineTabButtonClass} ${timelineTabClass(timelineScene === 'tech-ai')}`}
                  >
                    AI {techTimelineCount > 0 ? techTimelineCount : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineScene('livebench')}
                    className={`${timelineTabButtonClass} ${timelineTabClass(timelineScene === 'livebench')}`}
                  >
                    演绎
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex h-full min-h-0 flex-col p-4">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                {timelineScene === 'livebench' ? (
                  livebenchTimelineGroups.length > 0 ? (
                    livebenchTimelineGroups.map((group) => (
                      <div key={`livebench-timeline-group-${group.day}`} className="grid gap-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                        <div className="pt-4 text-[14px] font-bold text-[var(--text-secondary)]">{group.day}</div>
                        <div className="relative border-l border-[var(--border-default)] pl-5">
                          {group.items.map((preview) => {
                            const aggregate = preview.aggregate_vote;
                            return (
                              <a
                                key={`livebench-timeline-${preview.question_id}`}
                                href={mountedHomeHref(preview.href, scene)}
                                className="group relative block border-b border-[var(--border-default)] bg-[var(--bg-container)] py-4 pr-4 transition hover:bg-[var(--bg-hover)]"
                              >
                                <span className="absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full bg-[#1aafdb] shadow-[0_0_12px_rgba(26,175,219,0.38)]" />
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-[6px] border px-2.5 py-1 text-[12px] ${liveQuestionStatusTone(preview.status)}`}>
                                    {preview.settlement_status === 'pending_official' ? '待核票' : liveQuestionStatusLabel(preview.status)}
                                  </span>
                                  <span className="text-[13px] text-[var(--text-tertiary)]">
                                    {preview.topic_label}
                                  </span>
                                  <span className="ml-auto text-[13px] text-[var(--text-tertiary)]">{techAiTimeLabel(livebenchQuestionTime(preview))}</span>
                                </div>
                                <p className="mt-3 text-[17px] font-bold leading-7 text-[var(--text-primary)]">{livebenchDailyTopicLabel(preview)}</p>
                                <p className="mt-2 line-clamp-3 text-[14px] leading-7 text-[var(--text-secondary)]">{questionModeratorLabel(preview)}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-secondary)]">
                                  <span className={`${voteSideTone(aggregate.side)} rounded-[6px] border px-2 py-0.5`}>
                                    {questionAggregateLabel(preview)}
                                  </span>
                                  <span>{questionTimingLabel(preview)}</span>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
                      当前还没有可展示的演绎题目。
                    </div>
                  )
                ) : mainWorldSignalGroups.length > 0 ? (
                  mainWorldSignalGroups.map((group) => (
                    <div key={`main-world-group-${group.day}`} className="grid gap-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                      <div className="pt-4 text-[14px] font-bold text-[var(--text-secondary)]">{group.day}</div>
                      <div className="relative border-l border-[var(--border-default)] pl-5">
                        {group.items.map((signal) => (
                          <a
                            key={signal.id}
                            href={mountedHomeHref(signalDetailHref(signal.id), timelineScene)}
                            className="group relative block border-b border-[var(--border-default)] bg-[var(--bg-container)] py-4 pr-4 transition hover:bg-[var(--bg-hover)]"
                          >
                            <span className={`absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full ${markerDotClass(signalDisplayLevel(signal))}`} />
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-[6px] border px-2.5 py-1 text-[12px] ${severitySoftTone(signal.severity)}`}>
                                {severityLabel(signal.severity)}
                              </span>
                              <span className="text-[13px] text-[var(--text-tertiary)]">
                                {readableSignalSourceLine(signal)}
                              </span>
                              <span className="ml-auto text-[13px] text-[var(--text-tertiary)]">{techAiTimeLabel(signal.published_at)}</span>
                            </div>
                            <p className="mt-3 text-[17px] font-bold leading-7 text-[var(--text-primary)]">{readableSignalTitle(signal)}</p>
                            <p className="mt-2 line-clamp-3 text-[14px] leading-7 text-[var(--text-secondary)]">
                              {readableSignalSummary(signal, 190)}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-secondary)]">
                              {readableSignalTags(signal.tags, 3).map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
                    {timelineScene === 'tech-ai' && !techAiTimelineState
                      ? '正在加载 AI 时间线。'
                      : `当前还没有可展示的${timelineViewLabel(timelineScene)}。`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          ) : (
          <Card id="arena-panel" className={`${dashboardPanelClass} xl:order-1 xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
            <CardHeader className={dashboardHeaderClass}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Radio className="h-4 w-4" />
                    当前新评测问题
                  </CardTitle>
                  <p className="text-xs text-[var(--text-secondary)]">题池摘要、主持人简报和结算状态集中展示。</p>
                  <p className="text-[12px] leading-6 text-[var(--text-secondary)]">{livebenchPoolHeadline(livebenchSummary)}</p>
                  <p className="text-[11px] leading-6 text-[var(--text-tertiary)]">
                    {livebenchSummary
                      ? `${livebenchSummary.window_days} 天窗口 · ${livebenchSummary.current_question_count} 道跟踪 · ${livebenchSummary.resolved_question_count} 道已核票`
                      : displayScoredQuestionCount(evaluationSummary) > 0
                        ? `计分 ${displayScoredQuestionCount(evaluationSummary)} / ${evaluationSummary?.resolved_question_count || 0} · 平均误差 ${formatBrierScore(displayAverageError(evaluationSummary))}`
                        : `0 / ${evaluationSummary?.resolved_question_count || 0} 题形成计分样本`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex h-full min-h-0 flex-col gap-3 p-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-4">
                <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-tertiary)]">模型表现概括</p>
                <p className="mt-1 text-[13px] leading-7 text-[var(--text-primary)]">{performanceSummaryHeadline(evaluationSummary)}</p>
                <p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">{performanceSummarySupport(evaluationSummary)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-tertiary)]">平均误差</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{formatBrierScore(evaluationSummary?.avg_brier)}</p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-tertiary)]">预测命中</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {evaluationSummary ? formatPercent(evaluationSummary.hit_rate) : '--'}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-tertiary)]">计分题数</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {evaluationSummary
                        ? `${evaluationSummary.scored_question_count} / ${evaluationSummary.resolved_question_count}`
                        : '--'}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-2">
                    <p className="text-[11px] text-[var(--text-tertiary)]">已结算 / 活跃</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {evaluationSummary
                        ? `${evaluationSummary.resolved_question_count} / ${evaluationSummary.active_question_count}`
                        : '--'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                <span>全部题目 {questionList.length}</span>
                <span>待结算 {currentQuestions.length} · 已结算 {resolvedQuestions.length}</span>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {loading && !state && questionList.length === 0 ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
                    正在同步题池和评分数据。
                  </div>
                ) : questionList.length > 0 ? (
                  questionList.map((preview) => {
                    const href = mountedHomeHref(preview.href, scene);
                    const aggregate = preview.aggregate_vote;
                    return (
                      <a
                        key={preview.question_id}
                        href={href}
                        className={`group block rounded-[var(--radius-lg)] border bg-[var(--bg-container)] p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${questionCardAccentClass(preview)}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-[var(--radius-md)] border px-2.5 py-1 text-[11px] ${liveQuestionStatusTone(preview.status)}`}>
                            {preview.settlement_status === 'pending_official'
                              ? '待核票'
                              : liveQuestionStatusLabel(preview.status)}
                          </span>
                          <span className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                            {preview.topic_label}
                          </span>
                          <span className="rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700">
                            {regionDisplayLabel(preview.region_label)}
                          </span>
                        </div>
                        <p className="mt-3 text-[15px] font-semibold leading-7 text-[var(--text-primary)]">{questionTitleLabel(preview)}</p>
                        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-3">
                          <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-tertiary)]">主持人简报</p>
                          <p className="mt-1 text-[13px] leading-7 text-[var(--text-secondary)]">{questionModeratorLabel(preview)}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
                          <span className={`rounded-[var(--radius-md)] border px-2.5 py-1 ${voteSideTone(aggregate.side)}`}>
                            {questionAggregateLabel(preview)}
                          </span>
                          <span className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2.5 py-1">
                            {questionTimingLabel(preview)}
                          </span>
                          <span className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2.5 py-1">
                            {questionParticipationLabel(preview)}
                          </span>
                          <span className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-2.5 py-1">
                            {questionCompletionLabel(preview)}
                          </span>
                        </div>
                        <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">{previewStatsLabel(preview)}</p>
                        <div className="mt-4 flex items-center justify-end gap-3">
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-primary)]">
                            查看详情
                            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
                    当前这条场景下还没有可展示的问题摘要。
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )}
        </section>
        ) : null}
      </div>
    </main>
  );
}
