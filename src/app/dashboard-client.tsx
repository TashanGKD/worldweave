'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Bot, FileText, Globe2, Link2, Radio, RefreshCw } from 'lucide-react';

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
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(18,78,96,0.42)_0%,rgba(3,16,24,0.2)_54%,rgba(2,6,23,0.96)_100%)]">
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(33,199,168,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,199,168,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="absolute left-1/2 top-1/2 aspect-square w-[72%] max-w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/24 bg-[radial-gradient(circle_at_44%_34%,rgba(45,212,191,0.18)_0%,rgba(8,47,73,0.24)_34%,rgba(2,6,23,0.96)_74%)] shadow-[0_0_80px_rgba(45,212,191,0.18)]">
        <div className="absolute inset-[8%] rounded-full border border-emerald-200/10" />
        <div className="absolute inset-[20%] rounded-full border border-emerald-200/10" />
        <div className="absolute left-1/2 top-[7%] h-[86%] w-px -translate-x-1/2 bg-emerald-200/12" />
        <div className="absolute left-[11%] top-1/2 h-px w-[78%] -translate-y-1/2 bg-emerald-200/12" />
      </div>
      <div className="absolute bottom-4 left-4 rounded-full border border-emerald-400/20 bg-slate-950/72 px-3.5 py-2 text-xs text-slate-200 shadow-[0_16px_36px_rgba(2,6,23,0.45)] backdrop-blur">
        地图加载中
      </div>
    </div>
  );
}

const WorldGlobe = dynamic(() => import('@/components/world-globe'), { ssr: false, loading: WorldGlobeShell });

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
  'geo-politics-daily': '/daily/geo',
  'tech-ai': '/daily/ai',
  livebench: '/daily/livebench',
};

function timelineViewLabel(view: TimelineView) {
  if (view === 'tech-ai') return 'AI 线索';
  if (view === 'livebench') return '演绎题池';
  return '地缘线索';
}

const DEFAULT_SUBWORLDS: WorldSubworld[] = [
  { key: 'geo-politics-daily', title: '地缘日报', summary: '冲突、外交、制裁、选举、公共安全和区域风险。', signal_count: 0, matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'], recommended_bundles: [] },
  { key: 'tech-ai', title: 'AI 日报', summary: '模型、Agent、AI 产品、论文、开源和 AI Hot 精选动态。', signal_count: 0, matched_tags: ['technology', 'ai', 'llm', 'agent', 'chip', 'aihot'], recommended_bundles: [] },
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
          ? '模型、Agent、AI 产品、论文、开源和 AI Hot 精选动态。'
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
        summary: '模型、Agent、AI 产品、论文、开源和 AI Hot 精选动态。',
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
  const seen = new Set<string>();
  const items: string[] = [];
  for (const signal of signals) {
    const title = readableSignalTitle(signal);
    if (!title) continue;
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, '');
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    items.push(title);
    if (items.length >= 3) break;
  }
  return items.length > 0 ? compactText(`今日重点：${items.join('；')}。`, 150) : fallback;
}

function livebenchDailyDigest(previews: LiveBenchQuestionPreview[], fallback: string) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const preview of previews) {
    const topic = livebenchDailyTopicLabel(preview);
    if (!topic) continue;
    const normalizedTopic = topic.toLowerCase().replace(/\s+/g, '');
    if (seen.has(normalizedTopic)) continue;
    seen.add(normalizedTopic);
    items.push(topic);
    if (items.length >= 2) break;
  }
  return items.length > 0 ? compactText(`今日跟踪：${items.join('；')}。`, 150) : fallback;
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
  return 'border-slate-200';
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
  if (level === 'high') return 'bg-[#ff5c73] shadow-[0_0_12px_rgba(255,92,115,0.65)]';
  if (level === 'elevated') return 'bg-[#28d7ff] shadow-[0_0_12px_rgba(40,215,255,0.6)]';
  return 'bg-[#86ffd8] shadow-[0_0_12px_rgba(134,255,216,0.65)]';
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
    ? 'border-slate-300 bg-white text-[#08201c] shadow-[0_10px_22px_rgba(20,43,39,0.07)]'
    : 'border-[#d3ddd7] bg-white/82 text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-[#08201c]';
}

function SignalLevelDots() {
  return (
    <span className="mt-2 inline-flex items-center gap-1.5" aria-label="高热点、升温、监测">
      <span className="h-2 w-2 rounded-full bg-[#ff5c73] shadow-[0_0_8px_rgba(255,92,115,0.45)]" />
      <span className="h-2 w-2 rounded-full bg-[#28d7ff] shadow-[0_0_8px_rgba(40,215,255,0.42)]" />
      <span className="h-2 w-2 rounded-full bg-[#86ffd8] shadow-[0_0_8px_rgba(134,255,216,0.42)]" />
    </span>
  );
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
  const [subworlds, setSubworlds] = useState<WorldSubworld[]>(normalizedInitialSubworlds);
  const [questionPool, setQuestionPool] = useState<LiveBenchQuestionPreview[]>(normalizedInitialQuestionPool);
  const [globeTimeMode, setGlobeTimeMode] = useState<'today' | 'memory30'>('memory30');
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [globeAutoPauseUntil, setGlobeAutoPauseUntil] = useState<number>(0);
  const [skillEntryCopied, setSkillEntryCopied] = useState(false);
  const [loading, setLoading] = useState(!hasUsefulDashboardState(normalizedInitialState));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptySignalCheck, setEmptySignalCheck] = useState<EmptySignalCheck | null>(null);
  const [sourceStatusState, setSourceStatusState] = useState<WorldSourceKnowledgeState | null>(null);
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
    let cancelled = false;
    void fetch(`/api/v1/world/source-knowledge/status?scene=global&_=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as WorldSourceKnowledgeState) : null))
      .then((payload) => {
        if (!cancelled) setSourceStatusState(payload);
      })
      .catch(() => {
        if (!cancelled) setSourceStatusState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      setWorldMapPanelHeight(Math.ceil(panel.getBoundingClientRect().height));
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
      setSubworlds(nextSubworlds);
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
        setSubworlds(cached.subworlds);
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

  const markerLevelCounts = useMemo(
    () =>
      markers.reduce(
        (counts, marker) => {
          counts[marker.displayLevel] += 1;
          return counts;
        },
        { high: 0, elevated: 0, monitoring: 0 },
      ),
    [markers],
  );

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
  const dashboardBriefCards = useMemo(() => {
    const livebenchLead = currentQuestions[0] || resolvedQuestions[0] || null;
    const livebenchDailyItems = [...currentQuestions, ...resolvedQuestions];
    return [
      {
        key: 'world',
        label: '主世界',
        title: '地缘与公共风险',
        summary: signalDailyDigest(geoDigestSignals, '地缘、公共安全和区域风险信号会在这里先聚合成今日摘要。'),
        meta: geoDigestSignals.length > 0 ? `${geoDigestSignals.length} 条精选线索` : '暂无精选',
        view: 'geo-politics-daily' as TimelineView,
        href: DAILY_PAGE_HREFS['geo-politics-daily'],
      },
      {
        key: 'ai',
        label: 'AI',
        title: '模型、Agent 与产业',
        summary: signalDailyDigest(techCurationSignals, 'AI Hot、模型、Agent、论文和开源信源会在这里形成今日 AI 日报。'),
        meta: techCurationSignals.length > 0 ? `${techCurationSignals.length} 条 AI 线索` : '暂无精选',
        view: 'tech-ai' as TimelineView,
        href: DAILY_PAGE_HREFS['tech-ai'],
      },
      {
        key: 'livebench',
        label: '演绎',
        title: '题池与结算反馈',
        summary: livebenchDailyDigest(livebenchDailyItems, '预测题会作为校准闭环保留，用来检验信源判断是否真正有用。'),
        meta: livebenchLead ? questionTimingLabel(livebenchLead) : '暂无题目',
        view: 'livebench' as TimelineView,
        href: DAILY_PAGE_HREFS.livebench,
      },
    ];
  }, [currentQuestions, geoDigestSignals, resolvedQuestions, techCurationSignals]);
  const sourceKnowledgeHref = worldHref('/source-knowledge', scene);
  const mainSkillHref = '/api/v1/openclaw/skill.md';
  const aihotSkillHref = '/api/v1/openclaw/aihot.skill.md';
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
        '把这个地址交给接入方。它会按近 30 天信源回答问题，也能读取 AI Hot 和主世界日报。',
      copy_hint: '日常回答优先用当前精选线索；需要深挖时再进入全部信源。',
    };
  }, [state?.skill_entry]);
  const skillEntryHref = skillEntry?.url || mainSkillHref;
  const skillEntryDisplayUrl = skillEntryHref;
  const handleCopySkillEntry = async () => {
    if (!skillEntry?.url) return;
    const copied = await copyTextWithFallback(skillEntryDisplayUrl);
    if (!copied) return;
    setSkillEntryCopied(true);
    window.setTimeout(() => setSkillEntryCopied(false), 1600);
  };
  const handleBriefCardClick = (view: TimelineView) => {
    setTimelineScene(view);
    window.setTimeout(() => {
      timelinePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f5f7f4_0%,#fbfcf8_42%,#eef5f1_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(20,184,166,0.58),rgba(217,159,72,0.45),transparent)]" />
      <div className="relative mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 2xl:px-8">
        <section className="animate-fade-in-soft rounded-[28px] border border-[#cfd8d2]/80 bg-white/82 p-4 shadow-[0_18px_44px_rgba(20,43,39,0.065)] backdrop-blur-sm">
          <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(247,250,247,0.96)_58%,rgba(241,248,244,0.94))] p-3 sm:p-4">
            <div
              className="pointer-events-none absolute inset-x-6 top-0 h-px animate-tashan-scan"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.62), rgba(217,159,72,0.52), transparent)' }}
            />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">世界脉络</p>
                    <h1 className="mt-1 font-serif text-[1.9rem] font-semibold text-[#08201c] sm:text-[2.35rem]">
                      世界脉络
                    </h1>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-slate-600">
                      首页只呈现地缘和 AI 两条主线；其他来源作为补充材料参与筛选。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#d7ded8] bg-white/92 px-3 py-1 text-xs text-slate-500">
                      {sceneDisplayLabel(scene)}
                    </span>
                    <span className="rounded-full border border-[#d7ded8] bg-white/92 px-3 py-1 text-xs text-slate-500">
                      最近更新 {state ? formatTime(state.generated_at) : '--'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-[#cbd8d1] bg-white/85 px-3 text-xs text-[#143d35] transition hover:border-teal-300 hover:bg-[#f1faf5]"
                      onClick={() => void loadDashboard(scene, { manual: true })}
                      disabled={refreshing}
                    >
                      <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      刷新
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)] xl:items-stretch">
                  {skillEntry ? (
                    <div className="h-full rounded-[22px] border border-[#cfd8d2]/80 bg-white/88 px-4 py-3 shadow-[0_12px_30px_rgba(20,43,39,0.045)]">
                      <div className="flex h-full flex-col gap-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                              <Link2 className="h-3.5 w-3.5" />
                              Skill 接入
                            </span>
                            <p className="mt-2 text-[13px] leading-6 text-slate-900">
                              {skillEntry.description || '把这个地址交给虾，主口径是过去 30 天信源查询与整理。'}
                            </p>
                            <a
                              href={skillEntryHref}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 block truncate rounded-2xl border border-[#d6ded8] bg-[#f6faf7] px-3 py-2 font-mono text-[11px] leading-5 text-slate-600 transition hover:border-teal-300 hover:bg-white hover:text-[#08201c]"
                              title={skillEntryDisplayUrl}
                            >
                              {skillEntryDisplayUrl}
                            </a>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <a
                              href={skillEntryHref}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-[#d3ddd7] bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:border-teal-300 hover:text-[#08201c]"
                            >
                              打开 Skill
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopySkillEntry()}
                              className="rounded-full border border-[#d3ddd7] bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:border-teal-300 hover:text-[#08201c]"
                            >
                              {skillEntryCopied ? '已复制' : '复制地址'}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-full border border-teal-200/80 bg-[#effaf4] px-4 py-2 text-[12px] font-medium text-[#087265]">
                          Skill 地址可直接接入
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <a
                            href={DAILY_PAGE_HREFS['geo-politics-daily']}
                            className="group rounded-[18px] border border-[#d3ddd7] bg-[#f8fbf8] px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-[0_10px_22px_rgba(20,184,166,0.08)]"
                          >
                            <span className="block text-[12px] font-semibold text-[#08201c]">主世界</span>
                            <span className="mt-1 block text-[11px] leading-5 text-slate-500">地缘与公共风险</span>
                          </a>
                          <a
                            href={DAILY_PAGE_HREFS['tech-ai']}
                            className="group rounded-[18px] border border-[#d3ddd7] bg-[#f8fbf8] px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-[0_10px_22px_rgba(20,184,166,0.08)]"
                          >
                            <span className="block text-[12px] font-semibold text-[#08201c]">AI</span>
                            <span className="mt-1 block text-[11px] leading-5 text-slate-500">AI Hot 与模型线索</span>
                          </a>
                          <a
                            href={sourceKnowledgeHref}
                            className="group rounded-[18px] border border-[#d3ddd7] bg-[#f8fbf8] px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:shadow-[0_10px_22px_rgba(217,159,72,0.08)]"
                          >
                            <span className="block text-[12px] font-semibold text-[#08201c]">全部信源</span>
                            <span className="mt-1 block text-[11px] leading-5 text-slate-500">查看已接入来源</span>
                          </a>
                          <a
                            href={aihotSkillHref}
                            target="_blank"
                            rel="noreferrer"
                            className="group rounded-[18px] border border-[#d3ddd7] bg-[#f8fbf8] px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-[0_10px_22px_rgba(20,184,166,0.08)]"
                          >
                            <span className="block text-[12px] font-semibold text-[#08201c]">AI Hot Skill</span>
                            <span className="mt-1 block text-[11px] leading-5 text-slate-500">读取 AI 精选源</span>
                          </a>
                        </div>
                        <p className="text-[12px] leading-5 text-slate-500">
                          {skillEntry.copy_hint || '日常回答优先用当前精选线索；需要深挖时再进入全部信源。'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm leading-7 text-slate-500">
                      当前还没有可公开展示的 skills 地址。
                    </div>
                  )}

                  <div className="rounded-[22px] border border-[#cfd8d2]/80 bg-white/88 px-4 py-3 shadow-[0_12px_30px_rgba(20,43,39,0.045)]">
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">今日简报</p>
                          <p className="mt-2 text-[13px] leading-6 text-slate-900">
                            先看三份整理好的日报。
                          </p>
                          <p className="mt-1 text-[12px] leading-5 text-slate-500">
                            每份只保留当前最值得读的精华线索，完整原始线索仍在下方时间线。
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-teal-200 bg-[#effaf4] px-3 py-1 text-[11px] text-[#087265]">
                          精华版
                        </span>
                      </div>

                      <div className="mt-3 grid flex-1 gap-2 lg:grid-cols-3">
                        {dashboardBriefCards.map((card) => {
                          const Icon = card.key === 'world' ? Globe2 : card.key === 'ai' ? Bot : FileText;
                          return (
                            <a
                              key={`top-daily-card-${card.key}`}
                              href={card.href}
                              className="group animate-rise-in relative flex min-h-[9.5rem] flex-col overflow-hidden rounded-[20px] border border-[#d2ddd6] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(243,250,246,0.92))] px-3.5 py-3 text-left text-[#08201c] transition duration-300 hover:-translate-y-1 hover:border-teal-300 hover:shadow-[0_18px_32px_rgba(20,43,39,0.09)]"
                              style={{ animationDelay: `${120 + (card.key === 'ai' ? 80 : card.key === 'livebench' ? 160 : 0)}ms` } as CSSProperties}
                            >
                              <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(20,184,166,0.55),rgba(217,159,72,0.35),transparent)] opacity-70 transition group-hover:opacity-100" />
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white/86 px-2 py-1 text-[11px] font-semibold text-[#087265]">
                                  <Icon className="h-3.5 w-3.5" />
                                  {card.label}
                                </span>
                                <span className="rounded-full border border-amber-200 bg-amber-50/60 px-2 py-1 text-[11px] text-[#8a5a12]">{card.meta}</span>
                              </div>
                              <h3 className="mt-3 line-clamp-2 text-[14px] font-semibold leading-6 text-slate-950">{card.title}</h3>
                              <p className="mt-2 line-clamp-4 text-[12px] leading-6 text-slate-600">{card.summary}</p>
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
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <Card className="rounded-[24px] border-red-200 bg-red-50/90 shadow-[0_14px_30px_rgba(239,68,68,0.08)]">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {emptySignalCheck ? (
          <Card className="rounded-[24px] border-amber-200 bg-amber-50/90 shadow-[0_14px_30px_rgba(245,158,11,0.08)]">
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
              <div className="shrink-0 rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-xs text-amber-700">
                {emptySignalCheck.status === 'checking' ? '检查中' : '等待更新'}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {isTimelineScene ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(520px,1fr)_minmax(520px,1fr)] xl:items-start 2xl:grid-cols-[minmax(640px,1fr)_minmax(640px,1fr)]">
          <Card id="world-map-panel" ref={worldMapPanelRef} className={`${shellCardClass()} xl:order-2`}>
            <CardContent className="flex h-full min-h-0 flex-col p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-[#08201c]">
                    3D 地球时间地图
                  </h2>
                  <p className="text-xs text-slate-500">
                    把焦点放回地图，正在发生的事会先落到这颗地球上。
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-500">
                  最近更新 {mapState ? formatTime(mapState.generated_at) : '--'}
                </div>
              </div>

              {focusCard ? (
                <div className="mb-3 animate-rise-in rounded-[28px] border border-teal-200/70 bg-[linear-gradient(135deg,rgba(240,250,244,0.96),rgba(252,250,241,0.92))] px-4 py-3 shadow-[0_10px_22px_rgba(20,43,39,0.06)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-teal-200 bg-white/85 px-2.5 py-1 font-semibold text-[#087265]">
                      {focusCard.label}
                    </span>
                    <span className="text-[#8a5a12]">{formatTime(focusCard.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-6 text-[#08201c]">{focusCard.title}</p>
                      <p className="mt-1 text-[12px] leading-6 text-slate-700">{compactText(focusCard.summary, 110)}</p>
                    </div>
                    {focusCard.watchNext ? (
                      <div className="rounded-full border border-teal-200/90 bg-white/85 px-3 py-1.5 text-[11px] leading-5 text-slate-700 lg:max-w-[22rem]">
                        <span className="font-semibold text-[#087265]">线索：</span>
                        {compactText(focusCard.watchNext, 64)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { key: 'memory30', label: '近 30 天' },
                    { key: 'today', label: '今天' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setGlobeTimeMode(item.key as 'today' | 'memory30')}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        globeTimeMode === item.key
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white/80 text-slate-500'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400">{markers.length} 个地图落点</span>
              </div>

              <div
                id="world-globe-shell"
                className="mx-auto w-full shrink-0 overflow-hidden rounded-[30px] border border-slate-200/70"
                style={{ height: 'clamp(400px, 42vw, 680px)', maxWidth: 'clamp(400px, 42vw, 680px)' }}
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

              <div className="mt-3 grid gap-2 rounded-[24px] border border-slate-200/70 bg-slate-50/65 px-3 py-3 text-xs text-slate-600 sm:grid-cols-3">
                <div className="flex items-center justify-between gap-2 rounded-full border border-red-100 bg-white px-3 py-2 text-red-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5c73] shadow-[0_0_12px_rgba(255,92,115,0.75)]" />
                    高热点
                  </span>
                  <span>{markerLevelCounts.high}</span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-full border border-sky-100 bg-white px-3 py-2 text-sky-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28d7ff] shadow-[0_0_12px_rgba(40,215,255,0.7)]" />
                    升温
                  </span>
                  <span>{markerLevelCounts.elevated}</span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-emerald-700">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#86ffd8] shadow-[0_0_12px_rgba(134,255,216,0.75)]" />
                    监测
                  </span>
                  <span>{markerLevelCounts.monitoring}</span>
                </div>
              </div>
              <div className="mt-2 rounded-[24px] border border-slate-200/70 bg-white/80 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">
                    {sceneDisplayLabel(mapScene)}信号
                  </p>
                  <span className="text-[11px] text-slate-400">{markers.length} 条</span>
                </div>
                <div className="max-h-[132px] space-y-1.5 overflow-y-auto pr-1 2xl:max-h-[150px]">
                  {markers.length > 0 ? (
                    markers.map((signal, index) => (
                      <button
                        key={`map-signal-${signal.id}-${index}`}
                        type="button"
                        onClick={() => {
                          setActiveSignalId(signal.id);
                          setGlobeAutoPauseUntil(Date.now() + 15000);
                        }}
                        className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-2 text-left transition ${
                          activeSignalId === signal.id
                            ? 'border-teal-200 bg-[#eefaf4]'
                            : 'border-slate-100 bg-slate-50/80 hover:border-slate-200 hover:bg-white'
                        }`}
                      >
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${markerDotClass(signal.displayLevel)}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-slate-800">
                            {signal.title}
                          </span>
                          <span className="mt-1 block line-clamp-2 text-[11px] leading-5 text-slate-500">
                            {signal.summary}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>{signal.locationLabel || signal.sourceName || signal.scene}</span>
                            <span>{formatTime(signal.timestamp)}</span>
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
                      当前没有可展示的地图信号。
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isTimelineScene ? (
          <Card ref={timelinePanelRef} className={`${shellCardClass()} xl:order-1 xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
            <CardHeader className="border-b border-[#dce5df] bg-[linear-gradient(180deg,rgba(249,252,249,0.98),rgba(255,255,255,0.86))] py-4">
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#08201c]">
                    <Radio className="h-4 w-4 text-[#087265]" />
                    线索时间线
                  </CardTitle>
                  <p className="text-xs text-slate-500">这里只保留原始线索流；日报精华从上方今日简报进入。</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setTimelineScene('geo-politics-daily')}
                    className={`group rounded-[18px] border px-3 py-2.5 text-left transition duration-300 ${timelineTabClass(timelineScene === 'geo-politics-daily')}`}
                  >
                    <span className="block text-[12px] font-semibold">地缘线索</span>
                    <span className="mt-1 block text-[11px] leading-5 opacity-70">冲突、外交、公共风险</span>
                    <SignalLevelDots />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineScene('tech-ai')}
                    className={`group rounded-[18px] border px-3 py-2.5 text-left transition duration-300 ${timelineTabClass(timelineScene === 'tech-ai')}`}
                  >
                    <span className="block text-[12px] font-semibold">AI 线索</span>
                    <span className="mt-1 block text-[11px] leading-5 opacity-70">模型、Agent、开源</span>
                    <SignalLevelDots />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineScene('livebench')}
                    className={`group rounded-[18px] border px-3 py-2.5 text-left transition duration-300 ${timelineTabClass(timelineScene === 'livebench')}`}
                  >
                    <span className="block text-[12px] font-semibold">演绎题池</span>
                    <span className="mt-1 block text-[11px] leading-5 opacity-70">题池与结果</span>
                    <SignalLevelDots />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex h-full min-h-0 flex-col gap-3 p-3">
              <p className="rounded-[18px] border border-[#d8e3dd] bg-[#f7fbf8] px-3 py-2 text-[12px] leading-6 text-slate-500">
                {timelineScene === 'livebench'
                  ? `下方按到期和结算时间保留演绎题池，当前跟踪 ${currentQuestions.length} 道。`
                  : `下方按发布时间保留${timelineViewLabel(timelineScene)}原始流。`}
              </p>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                {timelineScene === 'livebench' ? (
                  livebenchTimelineGroups.length > 0 ? (
                    livebenchTimelineGroups.map((group) => (
                      <div key={`livebench-timeline-group-${group.day}`} className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)]">
                        <div className="pt-3 text-sm font-semibold text-slate-500">{group.day}</div>
                        <div className="relative space-y-3 border-l border-slate-200 pl-4">
                          {group.items.map((preview) => {
                            const aggregate = preview.aggregate_vote;
                            return (
                              <a
                                key={`livebench-timeline-${preview.question_id}`}
                                href={worldHref(preview.href, scene)}
                                className={`group relative block rounded-[28px] border bg-white/92 p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(20,43,39,0.08)] ${questionCardAccentClass(preview)}`}
                              >
                                <span className="absolute -left-[21px] top-5 h-2.5 w-2.5 rounded-full bg-[#28d7ff] shadow-[0_0_12px_rgba(40,215,255,0.6)]" />
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] ${liveQuestionStatusTone(preview.status)}`}>
                                    {preview.settlement_status === 'pending_official' ? '待核票' : liveQuestionStatusLabel(preview.status)}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                                    {preview.topic_label}
                                  </span>
                                  <span className="ml-auto text-[11px] text-slate-400">{techAiTimeLabel(livebenchQuestionTime(preview))}</span>
                                </div>
                                <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-950">{livebenchDailyTopicLabel(preview)}</p>
                                <p className="mt-2 text-[13px] leading-7 text-slate-600">{questionModeratorLabel(preview)}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                  <span className={`rounded-full border px-2.5 py-1 ${voteSideTone(aggregate.side)}`}>
                                    {questionAggregateLabel(preview)}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                    {questionTimingLabel(preview)}
                                  </span>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
                      当前还没有可展示的演绎题目。
                    </div>
                  )
                ) : mainWorldSignalGroups.length > 0 ? (
                  mainWorldSignalGroups.map((group) => (
                    <div key={`main-world-group-${group.day}`} className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)]">
                      <div className="pt-3 text-sm font-semibold text-slate-500">{group.day}</div>
                      <div className="relative space-y-3 border-l border-slate-200 pl-4">
                        {group.items.map((signal) => (
                          <a
                            key={signal.id}
                            href={worldHref(signalDetailHref(signal.id), timelineScene)}
                            className="group relative block rounded-[28px] border border-[#d4ded8] bg-white/92 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_32px_rgba(20,43,39,0.08)]"
                          >
                            <span className={`absolute -left-[21px] top-5 h-2.5 w-2.5 rounded-full ${markerDotClass(signalDisplayLevel(signal))}`} />
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${severitySoftTone(signal.severity)}`}>
                                {severityLabel(signal.severity)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                                {readableSignalSourceLine(signal)}
                              </span>
                              <span className="ml-auto text-[11px] text-slate-400">{techAiTimeLabel(signal.published_at)}</span>
                            </div>
                            <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-950">{readableSignalTitle(signal)}</p>
                            <p className="mt-2 text-[13px] leading-7 text-slate-600">
                              {readableSignalSummary(signal, 190)}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              {readableSignalTags(signal.tags, 3).map((tag) => (
                                <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
                    {timelineScene === 'tech-ai' && !techAiTimelineState
                      ? '正在加载 AI 时间线。'
                      : `当前还没有可展示的${timelineViewLabel(timelineScene)}。`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          ) : (
          <Card id="arena-panel" className={`${shellCardClass()} xl:order-1 xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
            <CardHeader className="border-b border-slate-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.82))] py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Radio className="h-4 w-4" />
                    当前新评测问题
                  </CardTitle>
                  <p className="text-xs text-slate-500">题池摘要、主持人简报和结算状态集中展示。</p>
                  <p className="text-[12px] leading-6 text-slate-700">{livebenchPoolHeadline(livebenchSummary)}</p>
                  <p className="text-[11px] leading-6 text-slate-400">
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
              <div className="rounded-[22px] border border-slate-200/90 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(241,245,249,0.94))] px-4 py-4">
                <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">模型表现概括</p>
                <p className="mt-1 text-[13px] leading-7 text-slate-900">{performanceSummaryHeadline(evaluationSummary)}</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-500">{performanceSummarySupport(evaluationSummary)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[16px] border border-white/90 bg-white/90 px-3 py-2">
                    <p className="text-[11px] text-slate-400">平均误差</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatBrierScore(evaluationSummary?.avg_brier)}</p>
                  </div>
                  <div className="rounded-[16px] border border-white/90 bg-white/90 px-3 py-2">
                    <p className="text-[11px] text-slate-400">预测命中</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {evaluationSummary ? formatPercent(evaluationSummary.hit_rate) : '--'}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/90 bg-white/90 px-3 py-2">
                    <p className="text-[11px] text-slate-400">计分题数</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {evaluationSummary
                        ? `${evaluationSummary.scored_question_count} / ${evaluationSummary.resolved_question_count}`
                        : '--'}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/90 bg-white/90 px-3 py-2">
                    <p className="text-[11px] text-slate-400">已结算 / 活跃</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {evaluationSummary
                        ? `${evaluationSummary.resolved_question_count} / ${evaluationSummary.active_question_count}`
                        : '--'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-500">
                <span>全部题目 {questionList.length}</span>
                <span>待结算 {currentQuestions.length} · 已结算 {resolvedQuestions.length}</span>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {loading && !state && questionList.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-500">
                    正在同步题池和评分数据。
                  </div>
                ) : questionList.length > 0 ? (
                  questionList.map((preview) => {
                    const href = worldHref(preview.href, scene);
                    const aggregate = preview.aggregate_vote;
                    return (
                      <a
                        key={preview.question_id}
                        href={href}
                        className={`group block rounded-[24px] border bg-white/94 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)] ${questionCardAccentClass(preview)}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${liveQuestionStatusTone(preview.status)}`}>
                            {preview.settlement_status === 'pending_official'
                              ? '待核票'
                              : liveQuestionStatusLabel(preview.status)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            {preview.topic_label}
                          </span>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700">
                            {regionDisplayLabel(preview.region_label)}
                          </span>
                        </div>
                        <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-950">{questionTitleLabel(preview)}</p>
                        <div className="mt-3 rounded-[18px] border border-slate-100 bg-slate-50/90 px-3 py-3">
                          <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">主持人简报</p>
                          <p className="mt-1 text-[13px] leading-7 text-slate-700">{questionModeratorLabel(preview)}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                          <span className={`rounded-full border px-2.5 py-1 ${voteSideTone(aggregate.side)}`}>
                            {questionAggregateLabel(preview)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {questionTimingLabel(preview)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {questionParticipationLabel(preview)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {questionCompletionLabel(preview)}
                          </span>
                        </div>
                        <p className="mt-3 text-[12px] leading-6 text-slate-500">{previewStatsLabel(preview)}</p>
                        <div className="mt-4 flex items-center justify-end gap-3">
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-900">
                            查看详情
                            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </a>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
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
