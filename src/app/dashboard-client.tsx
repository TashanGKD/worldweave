'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Link2, MapPin, Radio, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
  severityTone,
  shellCardClass,
  voteSideLabel,
  voteSideTone,
  worldHref,
} from '@/components/world-ui';
import type {
  LiveBenchPlatformModelSummary,
  LiveBenchQuestionPreview,
  WorldDashboardAction,
  WorldDashboardLiveBenchSummary,
  WorldDashboardSourceRefreshSummary,
  WorldScene,
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
const DASHBOARD_CACHE_VERSION = 2;
const DASHBOARD_CACHE_PREFIX = `world-v2:${DASHBOARD_CACHE_VERSION}:dashboard`;
const GLOBE_MEMORY_DAYS = 30;

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

const DEFAULT_SUBWORLDS: WorldSubworld[] = [
  { key: 'global', title: '主世界', summary: '观察全部信号与世界标点。', signal_count: 0, matched_tags: [], recommended_bundles: [] },
  { key: 'war', title: '冲突', summary: '冲突、外交、军事与制裁链条。', signal_count: 0, matched_tags: ['war'], recommended_bundles: [] },
  { key: 'technology', title: '科技', summary: '模型、论文、芯片与实验室。', signal_count: 0, matched_tags: ['technology'], recommended_bundles: [] },
  { key: 'capacity', title: '产能与供应链', summary: '能源、航运、制造与物流联动。', signal_count: 0, matched_tags: ['capacity'], recommended_bundles: [] },
  { key: 'finance', title: '市场', summary: '市场、监管、财报、宏观与政策定价。', signal_count: 0, matched_tags: ['finance'], recommended_bundles: [] },
  { key: 'health', title: '公共卫生', summary: '疫情、疾病、临床与生物安全。', signal_count: 0, matched_tags: ['health'], recommended_bundles: [] },
  { key: 'weak-signal', title: '弱信号', summary: '社媒、论坛、预测市场与早期回响。', signal_count: 0, matched_tags: ['social'], recommended_bundles: [] },
];

function dashboardCacheKey(scene: WorldScene) {
  return `${DASHBOARD_CACHE_PREFIX}:${scene}`;
}

function normalizeSubworlds(subworlds: WorldSubworld[] | null | undefined) {
  const normalized = asArray(subworlds)
    .filter((item): item is WorldSubworld => Boolean(item?.key && item?.title))
    .map((item) => ({
      ...item,
      matched_tags: asArray(item.matched_tags),
      recommended_bundles: asArray(item.recommended_bundles),
    }));

  return normalized.length > 0 ? normalized : DEFAULT_SUBWORLDS;
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
    pending_question_previews: asArray(state.pending_question_previews),
    resolved_question_previews: asArray(state.resolved_question_previews),
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

function hasUsefulDashboardState(state: WorldDashboardResponse | null | undefined) {
  if (!state) return false;
  if ((state.nodes || []).length > 0) return true;
  if ((state.top_signals || []).length > 0) return true;
  if ((state.knowledge_signals || []).length > 0) return true;
  if ((state.pending_question_previews || []).length > 0) return true;
  if ((state.resolved_question_previews || []).length > 0) return true;
  return false;
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

function markerDisplayLevel(node: Pick<WorldStateNode, 'severity'>): 'high' | 'elevated' | 'monitoring' {
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

function focusFallbackWatchNext(scene: WorldScene, region?: string | null) {
  const place = cleanPresentationText(region || '');
  if (scene === 'finance') {
    return `${place || '这条市场线'}接下来重点看价格和成交会不会继续同向走，监管表态会不会跟上。`;
  }
  if (scene === 'capacity') {
    return `${place || '这条产能线'}接下来重点看装运节奏、价格变化和政策动作会不会一起放大影响。`;
  }
  if (scene === 'technology') {
    return `${place || '这条科技线'}接下来重点看产品动作、机构反应和相邻主题会不会一起变化。`;
  }
  if (scene === 'health') {
    return `${place || '这条卫生线'}接下来重点看病例变化、正式通报和周边地区会不会同步出现。`;
  }
  return `${place || '这条线'}接下来重点看执行层变化、官方回应和周边地点会不会一起出现新动向。`;
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

function scenePickerButtonClass(selected: boolean) {
  return selected
    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]'
    : 'border-slate-200 bg-white/88 text-slate-600 hover:border-slate-300 hover:text-slate-900';
}

function markerDotClass(level: 'high' | 'elevated' | 'monitoring') {
  if (level === 'high') return 'bg-[#ff5c73] shadow-[0_0_12px_rgba(255,92,115,0.65)]';
  if (level === 'elevated') return 'bg-[#28d7ff] shadow-[0_0_12px_rgba(40,215,255,0.6)]';
  return 'bg-[#86ffd8] shadow-[0_0_12px_rgba(134,255,216,0.65)]';
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

function sourceRuntimeHeadline(
  summary: WorldDashboardSourceRefreshSummary | null | undefined,
  livebench: WorldDashboardLiveBenchSummary | null | undefined,
  evaluation: LiveBenchPlatformModelSummary | null | undefined,
) {
  if (!summary) return '信源摘要还在同步。';
  const resolved = evaluation?.resolved_question_count ?? livebench?.resolved_question_count ?? 0;
  const active = evaluation?.active_question_count ?? livebench?.active_question_count ?? 0;
  const job = summary.refresh_job;
  const status = job?.running ? '正在校验' : job && !job.ok ? '部分完成' : '完成';
  return `本次看板校验${status}，监测池 ${summary.monitor_runtime.monitor_source_count} 条，高质量 ${summary.monitor_runtime.high_quality_source_count} 条，题池已结算 ${resolved} 道、跟踪 ${active} 道。`;
}

function latestSourceRefreshTime(...values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestMs = 0;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latest = value;
    latestMs = ms;
  }
  return formatTime(latest);
}

function sourceRuntimeSupport(
  summary: WorldDashboardSourceRefreshSummary | null | undefined,
  livebench: WorldDashboardLiveBenchSummary | null | undefined,
  evaluation: LiveBenchPlatformModelSummary | null | undefined,
) {
  if (!summary) return '治理摘要同步后会补上变动和冷却情况。';
  const job = summary.refresh_job;
  const resolved = evaluation?.resolved_question_count ?? livebench?.resolved_question_count ?? 0;
  const scored = evaluation ? displayScoredQuestionCount(evaluation) : resolved;
  const jobLine = job
    ? job.running
      ? '巡检任务正在运行。'
      : job.ok
        ? `巡检任务已完成，最近结束 ${formatTime(job.finished_at)}。`
        : `巡检任务部分完成，最近结束 ${formatTime(job.finished_at)}；失败源保留旧缓存，等待下轮重试。`
    : '';
  return [
    `最近一轮变动 ${summary.monitor_runtime.changed_source_count} 条，临时降权 ${summary.monitor_runtime.cooling_down_count} 条，待补位 ${summary.monitor_runtime.next_batch_count} 条。`,
    `题池核票 ${resolved} 道，进入计分 ${scored} 道。`,
    jobLine,
  ]
    .filter(Boolean)
    .join(' ');
}

function livebenchPoolHeadline(summary: WorldDashboardLiveBenchSummary | null | undefined) {
  if (!summary) return '题池覆盖还在同步。';
  const pendingSettlement = summary.settlement_pending_count || 0;
  if (pendingSettlement > 0) {
    return `最近 30 天窗口里有 ${summary.current_question_count} 道题在跟踪，已核票 ${summary.resolved_question_count} 道，另有 ${pendingSettlement} 道到期待核票。`;
  }
  return `最近 30 天窗口里有 ${summary.current_question_count} 道题在跟踪，已核票 ${summary.resolved_question_count} 道。`;
}

export default function DashboardClient({
  initialScene = 'global',
  initialState = null,
  initialSubworlds = DEFAULT_SUBWORLDS,
}: PageClientProps) {
  const normalizedInitialState = useMemo(() => normalizeDashboardState(initialState), [initialState]);
  const normalizedInitialSubworlds = useMemo(() => normalizeSubworlds(initialSubworlds), [initialSubworlds]);
  const normalizedInitialQuestionPool = useMemo(
    () => questionPoolFromState(normalizedInitialState),
    [normalizedInitialState],
  );
  const [scene, setScene] = useState<WorldScene>(initialScene);
  const [state, setState] = useState<WorldDashboardResponse | null>(normalizedInitialState);
  const [subworlds, setSubworlds] = useState<WorldSubworld[]>(normalizedInitialSubworlds);
  const [questionPool, setQuestionPool] = useState<LiveBenchQuestionPreview[]>(normalizedInitialQuestionPool);
  const [globeTimeMode, setGlobeTimeMode] = useState<'today' | 'memory30'>('today');
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [globeAutoPauseUntil, setGlobeAutoPauseUntil] = useState<number>(0);
  const [skillEntryCopied, setSkillEntryCopied] = useState(false);
  const [loading, setLoading] = useState(!hasUsefulDashboardState(normalizedInitialState));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasUsefulStateRef = useRef(hasUsefulDashboardState(normalizedInitialState));
  const worldMapPanelRef = useRef<HTMLDivElement | null>(null);
  const [worldMapPanelHeight, setWorldMapPanelHeight] = useState<number | null>(null);
  const sidePanelStyle = worldMapPanelHeight
    ? ({ '--world-map-panel-height': `${worldMapPanelHeight}px` } as CSSProperties)
    : undefined;

  useEffect(() => {
    hasUsefulStateRef.current = hasUsefulDashboardState(state);
  }, [state]);

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
      const nextSubworlds = normalizeSubworlds(subworldsData?.subworlds);
      const nextQuestionPool = questionPoolFromState(normalizedState);
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
    if (scene === initialScene && hasUsefulDashboardState(normalizedInitialState)) {
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
  }, [initialScene, loadDashboard, normalizedInitialState, normalizedInitialSubworlds, scene]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadDashboard(scene, { background: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard, scene]);

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

  useEffect(() => {
    if (globeTimeMode !== 'today') return;
    const todayStart = startOfToday();
    const nodes = state?.nodes || [];
    const hasTodayMarkers = nodes.some((node) => {
      if (node.geo.lat === null || node.geo.lng === null) return false;
      const timestamp = node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString();
      return new Date(timestamp).getTime() >= todayStart;
    });
    if (hasTodayMarkers) return;
    const hasMemoryMarkers = nodes.some((node) => {
      if (node.geo.lat === null || node.geo.lng === null) return false;
      const timestamp = node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString();
      return Date.now() - new Date(timestamp).getTime() <= GLOBE_MEMORY_DAYS * 86400000;
    });
    if (hasMemoryMarkers) {
      setGlobeTimeMode('memory30');
    }
  }, [globeTimeMode, state]);

  const markers = useMemo(() => {
    const todayStart = startOfToday();
    return (state?.nodes || [])
      .filter((node) => node.geo.lat !== null && node.geo.lng !== null)
      .filter((node) => {
        const timestamp = node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString();
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
        title: cleanPresentationText(node.display_title || node.title),
        timestamp: node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString(),
        nodeType: node.node_type,
        scene: sceneDisplayLabel(node.scene),
        summary: cleanPresentationText(node.display_summary || node.summary),
        sourceName: node.source_name,
        locationLabel: cleanPresentationText([node.geo.label, node.geo.country].filter(Boolean).join(', ')),
        confidence: node.confidence,
        ageOpacity:
          globeTimeMode === 'today'
            ? 1
            : ageOpacityFromTimestamp(
                node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString(),
                GLOBE_MEMORY_DAYS,
              ),
        activities: node.activities,
      }));
  }, [globeTimeMode, state]);

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
    const nodes = state?.nodes || [];
    const freshCandidates = nodes
      .filter((node) => isAlertBoardCandidate(node))
      .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score);
    const staleFallbackCandidates =
      freshCandidates.length > 0
        ? []
        : nodes
            .filter((node) => {
              const timestamp = node.updated_at || node.last_report_at || node.published_at || state?.generated_at || new Date().toISOString();
              return Date.now() - new Date(timestamp).getTime() <= GLOBE_MEMORY_DAYS * 86400000;
            })
            .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score);
    const candidates = freshCandidates.length > 0 ? freshCandidates : staleFallbackCandidates;
    const highNodes = candidates.filter((node) => node.node_type === 'hotspot' && node.severity >= 4).slice(0, 12);
    if (highNodes.length > 0) {
      return {
        title: freshCandidates.length > 0 ? '红色热点' : '近 30 天热点',
        titleClassName: 'text-red-500',
        emptyText: '近 30 天内还没有可展示的热点条目。',
        nodes: highNodes,
      };
    }
    return {
      title: freshCandidates.length > 0 ? '当前信号' : '近 30 天信号',
      titleClassName: 'text-slate-500',
      emptyText: '近 30 天内还没有可展示的信号条目。',
      nodes: candidates.slice(0, 12),
    };
  }, [state]);
  const alertNodes = alertBoard.nodes;

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
    return (state?.nodes || []).find((node) => node.node_id === activeSignalId) || null;
  }, [activeSignalId, state]);

  const focusCard = useMemo(() => {
    if (activeSignalNode) {
      return {
        label: sceneDisplayLabel(activeSignalNode.scene),
        title: cleanPresentationText(activeSignalNode.display_title || activeSignalNode.title),
        summary: cleanNarrativeText(activeSignalNode.display_summary || activeSignalNode.summary),
        updatedAt: activeSignalNode.updated_at || activeSignalNode.published_at,
        watchNext: focusFallbackWatchNext(activeSignalNode.scene, activeSignalNode.geo.label || activeSignalNode.geo.region),
      };
    }
    if (state?.world_view_summary) {
      return {
        label: '世界视图',
        title: state.world_view_summary.title,
        summary: cleanNarrativeText(state.world_view_summary.summary),
        updatedAt: state.world_view_summary.updated_at,
        watchNext: '',
      };
    }
    return null;
  }, [activeSignalNode, state]);

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
  const sourceRefreshSummary = state?.source_refresh_summary || null;
  const livebenchSummary = state?.livebench_summary || null;
  const sourceHealth = state?.source_health || null;
  const skillEntry = useMemo(() => {
    const base = state?.skill_entry || null;
    if (!base) return null;
    return {
      ...base,
      description:
        '把这个地址交给接入方。它用于近 30 天信源查询、整理和回答；后台会用结算反馈持续复盘。',
      copy_hint: '信源查询会沉淀为复盘样本，后续回答会吸收验证过的方法。',
    };
  }, [state?.skill_entry]);
  const handleCopySkillEntry = async () => {
    if (!skillEntry?.url) return;
    const copied = await copyTextWithFallback(skillEntry.url);
    if (!copied) return;
    setSkillEntryCopied(true);
    window.setTimeout(() => setSkillEntryCopied(false), 1600);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] text-slate-900">
      <div className="relative mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 2xl:px-8">
        <section className={`${shellCardClass()} animate-fade-in-soft px-3 py-3 sm:px-4`}>
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_88%_12%,rgba(191,219,254,0.42)_0%,rgba(255,255,255,0)_24%),linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] p-3 shadow-[0_18px_38px_rgba(15,23,42,0.06)] sm:p-4">
            <div
              className="pointer-events-none absolute right-[-2rem] top-[-2rem] h-40 w-40 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 72%)' }}
            />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex flex-col gap-3 rounded-[24px] border border-white/60 bg-white/25 px-3 py-3 backdrop-blur-[2px]">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">世界总览</p>
                    <h1 className="mt-1 font-serif text-[2.1rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.55rem]">
                      世界脉络
                    </h1>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-slate-600">
                      实时信号、地球落点、题池和信源状态在同一张看板里。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white/92 px-3 py-1 text-xs text-slate-500">3D 地球</span>
                    <span className="rounded-full border border-slate-200 bg-white/92 px-3 py-1 text-xs text-slate-500">
                      {sceneDisplayLabel(scene)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white/92 px-3 py-1 text-xs text-slate-500">
                      最近更新 {state ? formatTime(state.generated_at) : '--'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-slate-200 bg-white/85 px-3 text-xs"
                      onClick={() => void loadDashboard(scene, { manual: true })}
                      disabled={refreshing}
                    >
                      <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                      刷新
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:items-stretch">
                  {skillEntry ? (
                    <div className="h-full rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                      <div className="flex h-full flex-col gap-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                              <Link2 className="h-3.5 w-3.5" />
                              信源 Skill
                            </span>
                            <p className="mt-2 text-[13px] leading-6 text-slate-900">
                              {skillEntry.description || '把这个地址交给虾，主口径是过去 30 天信源查询与整理。'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <a
                              href={skillEntry.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:text-slate-900"
                            >
                              打开
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopySkillEntry()}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 transition hover:text-slate-900"
                            >
                              {skillEntryCopied ? '已复制' : '复制'}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-slate-50/90 px-3 py-2.5">
                          <code className="block break-all text-[12px] font-medium leading-6 text-slate-800">{skillEntry.url}</code>
                        </div>
                        <p className="text-[12px] leading-5 text-slate-500">
                          {skillEntry.copy_hint || '信源查询会沉淀为复盘样本，后续回答会吸收验证过的方法。'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm leading-7 text-slate-500">
                      当前还没有可公开展示的 skills 地址。
                    </div>
                  )}

                  <div className="rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">信源监测</p>
                          <p className="mt-2 text-[13px] leading-6 text-slate-900">
                            {sourceRuntimeHeadline(sourceRefreshSummary, livebenchSummary, evaluationSummary)}
                          </p>
                          <p className="mt-1 text-[12px] leading-5 text-slate-500">
                            {sourceRuntimeSupport(sourceRefreshSummary, livebenchSummary, evaluationSummary)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="whitespace-nowrap text-[11px] tracking-[0.08em] text-slate-400">入口池</p>
                            <span className="whitespace-nowrap text-[11px] text-slate-400">
                              {latestSourceRefreshTime(
                                sourceRefreshSummary?.skillhub_snapshot?.last_refreshed_at,
                                sourceRefreshSummary?.source_skill_snapshot?.last_refreshed_at,
                                sourceRefreshSummary?.monitor_runtime.latest_poll_finished_at,
                                sourceRefreshSummary?.refresh_job?.finished_at,
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-slate-900">
                            入口 {sourceRefreshSummary?.source_skill_snapshot?.active_hub_count || 0} 个，沉淀 {sourceRefreshSummary?.source_skill_snapshot?.yielded_skill_count || 0} 条。
                          </p>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="whitespace-nowrap text-[11px] tracking-[0.08em] text-slate-400">目录候选</p>
                            <span className="whitespace-nowrap text-[11px] text-slate-400">
                              {latestSourceRefreshTime(
                                sourceRefreshSummary?.repo_discovery_snapshot?.last_refreshed_at,
                                sourceRefreshSummary?.refresh_job?.finished_at,
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-slate-900">
                            本地沉淀 {sourceRefreshSummary?.repo_discovery_snapshot?.local_repo_count || 0} 组样本，候选 {sourceRefreshSummary?.repo_discovery_snapshot?.github_candidate_count || 0} 条。
                            目录扩充 {sourceRefreshSummary?.repo_discovery_snapshot?.directory_candidate_count || 0} 条。
                          </p>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            可转信源 {sourceRefreshSummary?.repo_discovery_snapshot?.endpoint_candidate_count || 0} 条，方法样本 {sourceRefreshSummary?.repo_discovery_snapshot?.method_candidate_count || 0} 条。
                          </p>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="whitespace-nowrap text-[11px] tracking-[0.08em] text-slate-400">稳定</p>
                            <span className="whitespace-nowrap text-[11px] text-slate-400">
                              {sourceHealth ? `${sourceHealth.stable_source_count} 条` : '--'}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-slate-900">
                            观察 {sourceHealth?.watchlist_source_count || 0} 条，待确认 {sourceHealth?.blocked_or_unknown_source_count || 0} 条。
                          </p>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="whitespace-nowrap text-[11px] tracking-[0.08em] text-slate-400">题池</p>
                            <span className="whitespace-nowrap text-[11px] text-slate-400">
                              {evaluationSummary ? `${evaluationSummary.resolved_question_count} 已结算` : '--'}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-5 text-slate-900">
                            跟踪 {evaluationSummary?.active_question_count ?? livebenchSummary?.active_question_count ?? 0} 道，计分 {displayScoredQuestionCount(evaluationSummary)} 道。
                          </p>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            待核票 {livebenchSummary?.settlement_pending_count || 0} 道。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {subworlds.map((world) => (
                    <button
                      key={world.key}
                      type="button"
                      onClick={() => setScene(world.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${scenePickerButtonClass(scene === world.key)}`}
                      title={world.summary}
                    >
                      {world.title} {world.signal_count}
                    </button>
                  ))}
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

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.82fr)_minmax(560px,1.46fr)_minmax(300px,0.9fr)] xl:items-start 2xl:grid-cols-[minmax(340px,0.9fr)_minmax(680px,1.35fr)_minmax(420px,0.95fr)]">
          <Card className={`${shellCardClass()} xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
            <CardContent className="flex h-full min-h-0 flex-col gap-3 p-3">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[11px] font-medium tracking-[0.08em] ${alertBoard.titleClassName}`}>
                      {alertBoard.title}
                    </p>
                    <span className="text-[11px] text-slate-400">{alertNodes.length} 条</span>
                  </div>
                  {alertNodes.length > 0 ? (
                    alertNodes.map((node, index) => (
                      <article
                        key={`${node.node_id}-${node.published_at}-${index}`}
                        className={`min-w-0 rounded-[20px] border p-4 transition hover:opacity-95 ${severitySoftTone(node.severity)}`}
                        onMouseEnter={() => setActiveSignalId(node.node_id)}
                      >
                        <div className="mb-2 flex min-w-0 items-start gap-2">
                          <Badge className={`shrink-0 rounded-full border ${severityTone(node.severity)}`}>{severityLabel(node.severity)}</Badge>
                          <p className="min-w-0 flex-1 break-words text-sm font-medium leading-6 text-slate-900">
                            {cleanPresentationText(node.display_title || node.title)}
                          </p>
                        </div>
                        <p className="break-words text-xs leading-6 text-slate-600">
                          {compactText(cleanPresentationText(node.display_summary || node.summary), 128)}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">
                            {cleanPresentationText(node.geo.label || node.geo.region)}
                          </span>
                          <span className="shrink-0 text-slate-400">{formatTime(node.updated_at || node.published_at)}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-500">
                      {alertBoard.emptyText}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="world-map-panel" ref={worldMapPanelRef} className={shellCardClass()}>
            <CardContent className="flex h-full min-h-0 flex-col p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <h2 className="font-serif text-xl font-semibold tracking-[-0.02em] text-slate-950">3D 地球时间地图</h2>
                  <p className="text-xs text-slate-500">把焦点放回地图，正在发生的事会先落到这颗地球上。</p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-500">
                  最近更新 {state ? formatTime(state.generated_at) : '--'}
                </div>
              </div>

              {focusCard ? (
                <div className="mb-3 rounded-[20px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(240,253,248,0.96),rgba(247,254,250,0.92))] px-4 py-3 shadow-[0_10px_22px_rgba(16,185,129,0.07)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-emerald-200 bg-white/85 px-2.5 py-1 font-semibold text-emerald-700">
                      {focusCard.label}
                    </span>
                    <span className="text-emerald-600">{formatTime(focusCard.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold leading-6 text-emerald-950">{focusCard.title}</p>
                      <p className="mt-1 text-[12px] leading-6 text-emerald-900">{compactText(focusCard.summary, 110)}</p>
                    </div>
                    {focusCard.watchNext ? (
                      <div className="rounded-full border border-emerald-200/90 bg-white/85 px-3 py-1.5 text-[11px] leading-5 text-emerald-800 lg:max-w-[22rem]">
                        <span className="font-semibold text-emerald-700">下一步：</span>
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
                className="mx-auto w-full shrink-0 overflow-hidden rounded-[24px] border border-slate-200/80"
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

              <div className="mt-3 grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50/75 px-3 py-3 text-xs text-slate-600 sm:grid-cols-3">
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
              <div className="mt-2 rounded-[18px] border border-slate-200 bg-white/85 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">全部信号</p>
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
                            ? 'border-sky-200 bg-sky-50/80'
                            : 'border-slate-100 bg-slate-50/80 hover:border-slate-200 hover:bg-white'
                        }`}
                      >
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${markerDotClass(signal.displayLevel)}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-slate-800">
                            {signal.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span>{signal.locationLabel || signal.scene}</span>
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

          <Card id="arena-panel" className={`${shellCardClass()} xl:h-[var(--world-map-panel-height)]`} style={sidePanelStyle}>
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
        </section>
      </div>
    </main>
  );
}
