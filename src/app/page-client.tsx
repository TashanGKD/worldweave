'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, MapPin, Radio, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  LiveBenchArenaState,
  LiveBenchPlatformModelSummary,
  LiveQuestionSnapshot,
  LiveVote,
  WorldDashboardLiveBenchSummary,
  WorldDashboardSourceRefreshSummary,
  WorldMarketSnapshot,
  WorldScene,
  WorldSourceCatalog,
  WorldSourceKnowledgeState,
  WorldSourceReliability,
  WorldSourceIntakeStats,
  WorldStateMetrics,
  WorldStateNode,
} from '@/lib/world/types';

const WorldGlobe = dynamic(() => import('@/components/world-globe'), { ssr: false });
const AUTO_REFRESH_MS = 60 * 1000;
const DASHBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_CACHE_VERSION = 7;
const DASHBOARD_CACHE_PREFIX = `world-threads:v${DASHBOARD_CACHE_VERSION}:dashboard`;
const LEGACY_DASHBOARD_CACHE_PREFIX = 'world-threads:dashboard:';
const DASHBOARD_VIEW_LIMIT = 100;
const ALERT_HIGH_HOURS = 18;
const ALERT_ELEVATED_HOURS = 12;
const ALERT_MONITORING_HOURS = 8;
const REPORT_MEMORY_DAYS = 30;
const WEEKLY_PREDICTION_WINDOW_DAYS = 7;
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

type WorldStateResponse = {
  generated_at: string;
  scene: WorldScene;
  metrics: WorldStateMetrics;
  coverage_policy: {
    hotspot_ratio: number;
    exploration_ratio: number;
    note: string;
  };
  source_health?: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    note: string;
  };
  nodes: WorldStateNode[];
  graph_signals: Array<{
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
  }>;
  top_signals: Array<{
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
  }>;
  knowledge_signals: Array<{
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
  }>;
  source_catalog: WorldSourceCatalog | null;
  evaluation_summary?: LiveBenchPlatformModelSummary | null;
  source_refresh_summary?: WorldDashboardSourceRefreshSummary | null;
  livebench_summary?: WorldDashboardLiveBenchSummary | null;
  skill_entry?: {
    mode: 'bound' | 'anonymous';
    title: string;
    description: string;
    copy_hint: string;
    url: string;
  } | null;
  source_intake_stats: WorldSourceIntakeStats | null;
  source_knowledge?: WorldSourceKnowledgeState | null;
  livebench_arena: LiveBenchArenaState | null;
};

type DashboardCachePayload = {
  version: number;
  saved_at: number;
  scene: WorldScene;
  state: WorldStateResponse | null;
  marketSnapshot: WorldMarketSnapshot | null;
  subworlds: WorldSubworld[];
  explain: WorldExplainResponse | null;
};

type WorldExplainResponse = {
  scene: WorldScene;
  strategy: {
    title: string;
    summary: string;
    source_first: boolean;
    question_translation_only: boolean;
    anti_simplification: string;
  };
  current_snapshot: {
    question_pool_count: number;
    active_questions: number;
    watchlist_questions: number;
    resolved_questions: number;
    mapped_signal_count: number;
    active_signal_count: number;
  };
  source_health?: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    note: string;
  };
  knowledge_contract: string[];
  onboarding_flow: string[];
  reading_flow: string[];
  output_contract: string[];
  participation_contract: string[];
  vote_contract: {
    endpoint: string;
    required_fields: string[];
    recommended_fields: string[];
    probability_format: string;
    side_rule: string;
  };
  frontend_contract: string[];
  backend_contract: string[];
};

type PageClientProps = {
  initialScene?: WorldScene;
  initialState?: WorldStateResponse | null;
  initialSubworlds?: WorldSubworld[];
  initialMarketSnapshot?: WorldMarketSnapshot | null;
  initialExplain?: WorldExplainResponse | null;
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

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
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
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function normalizeQuestionSnapshot(value: LiveQuestionSnapshot): LiveQuestionSnapshot {
  const {
    ...rest
  } = value as LiveQuestionSnapshot & Record<string, unknown>;
  return {
    ...rest,
    question: {
      ...value.question,
      display_mode: value?.question?.display_mode === 'market-structure' ? 'market-structure' : 'consensus',
      platform_commentary: asArray(value?.question?.platform_commentary),
      platform_participants: asArray(value?.question?.platform_participants),
      platform_market_structure: asArray(value?.question?.platform_market_structure),
    },
    xia_votes: asArray(value?.xia_votes),
    zvec_chunks: asArray(value?.zvec_chunks),
    references: asArray(value?.references),
  } as LiveQuestionSnapshot;
}

function normalizeLiveBenchArena(value: LiveBenchArenaState | null | undefined): LiveBenchArenaState | null {
  if (!value) return null;
  return {
    ...value,
    sticky_question: value.sticky_question ? normalizeQuestionSnapshot(value.sticky_question) : null,
    active_questions: asArray(value.active_questions).map(normalizeQuestionSnapshot),
    resolved_questions: asArray(value.resolved_questions).map(normalizeQuestionSnapshot),
    watchlist_questions: asArray(value.watchlist_questions).map(normalizeQuestionSnapshot),
    odds_board: asArray(value.odds_board),
    quality_board: asArray(value.quality_board),
  };
}

function normalizeStateNode(node: WorldStateNode): WorldStateNode {
  return {
    ...node,
    tags: asArray(node?.tags),
    alignment_tags: asArray(node?.alignment_tags),
    activities: asArray(node?.activities),
  };
}

function normalizeSourceCatalog(catalog: WorldSourceCatalog | null): WorldSourceCatalog | null {
  if (!catalog || typeof catalog !== 'object') return null;

  return {
    ...catalog,
    connectivity_counts: {
      direct: typeof catalog.connectivity_counts?.direct === 'number' ? catalog.connectivity_counts.direct : 0,
      unstable: typeof catalog.connectivity_counts?.unstable === 'number' ? catalog.connectivity_counts.unstable : 0,
      blocked_or_unknown:
        typeof catalog.connectivity_counts?.blocked_or_unknown === 'number' ? catalog.connectivity_counts.blocked_or_unknown : 0,
    },
    admission_counts: {
      anchor: typeof catalog.admission_counts?.anchor === 'number' ? catalog.admission_counts.anchor : 0,
      context: typeof catalog.admission_counts?.context === 'number' ? catalog.admission_counts.context : 0,
      weak_signal: typeof catalog.admission_counts?.weak_signal === 'number' ? catalog.admission_counts.weak_signal : 0,
      blocked: typeof catalog.admission_counts?.blocked === 'number' ? catalog.admission_counts.blocked : 0,
    },
    intake_summary: {
      runtime_ready_skill_count:
        typeof catalog.intake_summary?.runtime_ready_skill_count === 'number' ? catalog.intake_summary.runtime_ready_skill_count : 0,
      context_ready_skill_count:
        typeof catalog.intake_summary?.context_ready_skill_count === 'number' ? catalog.intake_summary.context_ready_skill_count : 0,
      weak_signal_skill_count:
        typeof catalog.intake_summary?.weak_signal_skill_count === 'number' ? catalog.intake_summary.weak_signal_skill_count : 0,
      blocked_skill_count: typeof catalog.intake_summary?.blocked_skill_count === 'number' ? catalog.intake_summary.blocked_skill_count : 0,
      stable_source_count:
        typeof catalog.intake_summary?.stable_source_count === 'number' ? catalog.intake_summary.stable_source_count : 0,
      watchlist_source_count:
        typeof catalog.intake_summary?.watchlist_source_count === 'number' ? catalog.intake_summary.watchlist_source_count : 0,
      scene_counts:
        catalog.intake_summary?.scene_counts && typeof catalog.intake_summary.scene_counts === 'object'
          ? catalog.intake_summary.scene_counts
          : {},
      next_batch: asArray(catalog.intake_summary?.next_batch),
    },
    hubs: asArray(catalog.hubs),
    overflow_pools: asArray(catalog.overflow_pools),
  };
}

function normalizeSourceIntakeStats(stats: WorldSourceIntakeStats | null): WorldSourceIntakeStats | null {
  if (!stats || typeof stats !== 'object') return null;

  return {
    ...stats,
    total_emitted_count: typeof stats.total_emitted_count === 'number' ? stats.total_emitted_count : 0,
    total_kept_count: typeof stats.total_kept_count === 'number' ? stats.total_kept_count : 0,
    total_collapsed_count: typeof stats.total_collapsed_count === 'number' ? stats.total_collapsed_count : 0,
    bursty_sources: asArray(stats.bursty_sources),
  };
}

function normalizeWorldStateResponse(state: WorldStateResponse | null): WorldStateResponse | null {
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
    graph_signals: asArray(state.graph_signals),
    top_signals: asArray(state.top_signals),
    knowledge_signals: asArray(state.knowledge_signals),
    source_catalog: normalizeSourceCatalog(state.source_catalog),
    skill_entry:
      state.skill_entry && typeof state.skill_entry === 'object' && typeof state.skill_entry.url === 'string'
        ? {
            mode: state.skill_entry.mode === 'bound' ? 'bound' : 'anonymous',
            title: state.skill_entry.title || '加入 Agent World',
            description: state.skill_entry.description || '',
            copy_hint: state.skill_entry.copy_hint || '',
            url: state.skill_entry.url,
          }
        : null,
    source_intake_stats: normalizeSourceIntakeStats(state.source_intake_stats),
    source_knowledge:
      state.source_knowledge && typeof state.source_knowledge === 'object'
        ? {
            generated_at: state.source_knowledge.generated_at || new Date().toISOString(),
            scene: state.source_knowledge.scene || state.scene,
            window_days: typeof state.source_knowledge.window_days === 'number' ? state.source_knowledge.window_days : 30,
            signal_count: typeof state.source_knowledge.signal_count === 'number' ? state.source_knowledge.signal_count : 0,
            indexed_signal_count:
              typeof state.source_knowledge.indexed_signal_count === 'number' ? state.source_knowledge.indexed_signal_count : 0,
            chunk_count: typeof state.source_knowledge.chunk_count === 'number' ? state.source_knowledge.chunk_count : 0,
            zvec_group_count: typeof state.source_knowledge.zvec_group_count === 'number' ? state.source_knowledge.zvec_group_count : 0,
            last_synced_at: state.source_knowledge.last_synced_at || null,
            last_embedding_backend: state.source_knowledge.last_embedding_backend || null,
            latest_signal_published_at: state.source_knowledge.latest_signal_published_at || null,
            oldest_signal_published_at: state.source_knowledge.oldest_signal_published_at || null,
            source_status: {
              embeddings: state.source_knowledge.source_status?.embeddings || '',
            },
            source_health:
              state.source_knowledge.source_health && typeof state.source_knowledge.source_health === 'object'
                ? {
                    stable_source_count: typeof state.source_knowledge.source_health.stable_source_count === 'number' ? state.source_knowledge.source_health.stable_source_count : 0,
                    watchlist_source_count: typeof state.source_knowledge.source_health.watchlist_source_count === 'number' ? state.source_knowledge.source_health.watchlist_source_count : 0,
                    blocked_or_unknown_source_count:
                      typeof state.source_knowledge.source_health.blocked_or_unknown_source_count === 'number'
                        ? state.source_knowledge.source_health.blocked_or_unknown_source_count
                        : 0,
                    runtime_ready_skill_count:
                      typeof state.source_knowledge.source_health.runtime_ready_skill_count === 'number'
                        ? state.source_knowledge.source_health.runtime_ready_skill_count
                        : 0,
                    context_ready_skill_count:
                      typeof state.source_knowledge.source_health.context_ready_skill_count === 'number'
                        ? state.source_knowledge.source_health.context_ready_skill_count
                        : 0,
                    weak_signal_skill_count:
                      typeof state.source_knowledge.source_health.weak_signal_skill_count === 'number'
                        ? state.source_knowledge.source_health.weak_signal_skill_count
                        : 0,
                    blocked_skill_count:
                      typeof state.source_knowledge.source_health.blocked_skill_count === 'number'
                        ? state.source_knowledge.source_health.blocked_skill_count
                        : 0,
                    next_batch: asArray(state.source_knowledge.source_health.next_batch),
                    note: state.source_knowledge.source_health.note || '',
                  }
                : undefined,
            governance:
              state.source_knowledge.governance && typeof state.source_knowledge.governance === 'object'
                ? {
                    generated_at: state.source_knowledge.governance.generated_at || new Date().toISOString(),
                    runtime_failure_count:
                      typeof state.source_knowledge.governance.runtime_failure_count === 'number'
                        ? state.source_knowledge.governance.runtime_failure_count
                        : 0,
                    cooling_down_count:
                      typeof state.source_knowledge.governance.cooling_down_count === 'number'
                        ? state.source_knowledge.governance.cooling_down_count
                        : 0,
                    monitor_source_count:
                      typeof state.source_knowledge.governance.monitor_source_count === 'number'
                        ? state.source_knowledge.governance.monitor_source_count
                        : 0,
                    high_quality_source_count:
                      typeof state.source_knowledge.governance.high_quality_source_count === 'number'
                        ? state.source_knowledge.governance.high_quality_source_count
                        : 0,
                    recommended_source_count:
                      typeof state.source_knowledge.governance.recommended_source_count === 'number'
                        ? state.source_knowledge.governance.recommended_source_count
                        : 0,
                    latest_poll_finished_at: state.source_knowledge.governance.latest_poll_finished_at || null,
                    recent_runtime_failures: asArray(state.source_knowledge.governance.recent_runtime_failures),
                    cooling_down_sources: asArray(state.source_knowledge.governance.cooling_down_sources),
                    recommended_sources: asArray(state.source_knowledge.governance.recommended_sources),
                  }
                : undefined,
            embedding_groups: asArray(state.source_knowledge.embedding_groups).map((group) => ({
              backend: group?.backend || 'unknown',
              model: group?.model || 'unknown',
              dimension: typeof group?.dimension === 'number' ? group.dimension : 0,
              count: typeof group?.count === 'number' ? group.count : 0,
            })),
          }
        : null,
    livebench_arena: normalizeLiveBenchArena(state.livebench_arena),
  };
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

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cleanPresentationText(value?: string | null) {
  if (!value) return '';
  return String(value)
    .replace(/^Inkwell\s+/gi, '')
    .replace(/^Signal Arena\s+/gi, '')
    .replace(/\bworld-monitor\b/gi, '')
    .replace(/\bworld monitor\b/gi, '')
    .replace(/\bWorld Monitor\b/gi, '')
    .replace(/\bInkwell\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanNarrativeText(value?: string | null) {
  if (!value) return '';

  return cleanPresentationText(String(value))
    .replace(/^我的看法是[，,:：]?\s*/u, '')
    .replace(/^我这次真正想判断的是[，,:：]?\s*/u, '')
    .replace(/^我这次要判断的是[，,:：]?\s*/u, '')
    .replace(/^接下来我只盯两件事[，,:：]?\s*/u, '接下来只看两件事：')
    .replace(/^接下来我只看两件事[，,:：]?\s*/u, '接下来只看两件事：')
    .replace(/^后面我只看/u, '接下来只看')
    .replace(/这更像预期被重新拎了一下，不急着把影响讲满/gu, '这次更像旧压力重新抬头，但还要看会不会继续扩散')
    .replace(/映射还没完全稳定/gu, '这条线目前还缺更稳的旁证')
    .replace(/映射还没稳定/gu, '这条线目前还缺更稳的旁证')
    .replace(/World Monitor 这条信源还在\s*观察池\s*里[，,。]?\s*/giu, '')
    .replace(/信源(?:可靠性)?(?:是|还在)?\s*观察池\/?unmapped-?信源[，,。]?\s*/giu, '')
    .replace(/当前这条信源还没有和 source catalog 中的稳定映射完全对上，先按观察中信源处理。/giu, '这条消息目前还缺更稳的侧面印证。')
    .replace(/\bmention_?count\s*=\s*\d+/giu, '')
    .replace(/\bintensity\s*=\s*\d+/giu, '')
    .replace(/\bcoverage_?gap\s*=\s*\d+/giu, '')
    .replace(/\b(?:severity|relevance|exploration|hotspot|confidence)_?score\s*=\s*[0-9.]+/giu, '')
    .replace(/\bseverity\s*=\s*\d+\s*(?:\([^)]*\))?/giu, '')
    .replace(/\bwatchlist\b/giu, '旁证不足')
    .replace(/\bmonitoring\b/giu, '持续观察')
    .replace(/\bstable source\b/giu, '稳定信源')
    .replace(/\bsource\b/giu, '信源')
    .replace(/\(\s*\)/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[，,]\s*[，,]/gu, '，')
    .replace(/[。]\s*[。]/gu, '。')
    .trim();
}

function looksLikeInternalWatchText(value?: string | null) {
  const text = cleanNarrativeText(value);
  const readable = text.replace(/[，,。；;：:\-_/()[\]{}]/gu, '').trim();
  if (!readable) return true;
  return /world-?monitor|rss snapshot|signal arena|inkwell|mention_?count|intensity=|source[-_\s]?feed|public-anchor|alpha vantage|binance|coingecko/i.test(
    text,
  );
}

function focusFallbackWatchNext(scene: WorldScene, region?: string | null) {
  const place = cleanPresentationText(region || '');
  if (scene === 'finance') {
    return `${place || '这条市场线'}接下来更关键的是价格和成交会不会继续同向变化，以及监管表态会不会把判断坐实。`;
  }
  if (scene === 'capacity') {
    return `${place || '这条产能线'}接下来更关键的是装运节奏、价格变化和政策动作会不会一起把影响放大。`;
  }
  if (scene === 'technology') {
    return `${place || '这条科技线'}接下来更关键的是产品动作、机构反应和相邻主题会不会一起变化。`;
  }
  if (scene === 'health') {
    return `${place || '这条卫生线'}接下来更关键的是病例变化、正式通报和周边地区会不会同步出现。`;
  }
  return `${place || '这条线'}接下来更关键的是执行层变化、官方回应和周边地点会不会一起出现新动向。`;
}

function _validationStatusLabel(value: string) {
  if (value === 'confirmed') return '已验证';
  if (value === 'falsified') return '已证伪';
  return '待确认';
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMetric(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatSourceTime(value?: string | null) {
  return value ? formatTime(value) : '暂无记录';
}

function markerDisplayLevel(node: WorldStateNode): 'high' | 'elevated' | 'monitoring' {
  if (node.severity >= 4) return 'high';
  if (node.severity >= 3) return 'elevated';
  return 'monitoring';
}

function questionResolvedAt(snapshot: LiveQuestionSnapshot) {
  return snapshot.question.official_resolved_at || snapshot.question.resolve_at || snapshot.question.updated_at || snapshot.question.created_at;
}

function questionAggregateSide(snapshot: LiveQuestionSnapshot) {
  const votes = asArray(snapshot.xia_votes).filter((vote) => vote.source !== 'external');
  if (votes.length === 0) return null;
  const probability = votes.reduce((sum, vote) => sum + vote.probability_yes, 0) / votes.length;
  return probability >= 0.5 ? 'yes' : 'no';
}

function buildAccuracyTrail(snapshots: LiveQuestionSnapshot[]) {
  let scored = 0;
  let hit = 0;
  return [...snapshots]
    .filter((snapshot) => snapshot.question.official_outcome)
    .sort((left, right) => new Date(questionResolvedAt(left)).getTime() - new Date(questionResolvedAt(right)).getTime())
    .map((snapshot) => {
      const side = questionAggregateSide(snapshot);
      if (side) {
        scored += 1;
        if (side === snapshot.question.official_outcome) hit += 1;
      }
      return scored > 0 ? hit / scored : null;
    })
    .filter((value): value is number => value !== null)
    .slice(-12);
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

function severityLabel(severity: number) {
  if (severity >= 4) return '严重';
  if (severity >= 3) return '高关注';
  return '普通';
}

function severityTone(severity: number) {
  if (severity >= 4) return 'border-red-200 bg-red-50 text-red-700';
  if (severity >= 3) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function severitySoftTone(severity: number) {
  if (severity >= 4) return 'border-red-200/80 bg-white text-red-700';
  if (severity >= 3) return 'border-amber-200/80 bg-white text-amber-700';
  return 'border-slate-200/80 bg-white text-slate-600';
}

function sceneDisplayLabel(scene: WorldScene) {
  const labels: Record<string, string> = {
    global: '主世界',
    war: '冲突',
    technology: '科技',
    capacity: '产能与供应链',
    finance: '市场',
    health: '公共卫生',
    'weak-signal': '弱信号',
  };

  return labels[scene] || scene;
}

function _integrationShapeLabel(value: string | null) {
  const labels: Record<string, string> = {
    'direct-source': '可直连',
    'aggregator-layer': '聚合层',
    'tooling-reference': '工具参考',
  };

  return value ? labels[value] || value : '待定';
}

function _priorityTone(value: string | null) {
  if (value === 'p0') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (value === 'p1') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function _sourceCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    'world-monitor': '实时监测',
    literature: '论文源',
    'source-feed': '信源池',
    'public-anchor': '公共锚点',
    other: '其他',
  };

  return labels[value] || value || '其他';
}

function _alignmentTagLabel(tag: string) {
  const labels: Record<string, string> = {
    'geo:mapped': '落点',
    'geo:unmapped': '关联点',
    'source:ic': '信源库',
    'source:world-threads': '世界脉络',
    'model:aligned': '模型对齐',
    'severity:severe': '严重',
    'severity:elevated': '高关注',
    'severity:normal': '普通',
    'severity:background': '背景',
  };

  if (tag.startsWith('scene:')) return sceneDisplayLabel(tag.replace(/^scene:/, ''));
  if (tag.startsWith('region:')) return tag.replace(/^region:/, '');
  if (tag.startsWith('feed:')) return tag.replace(/^feed:/, '');
  if (tag.startsWith('wm:intensity:')) return `强度 ${tag.replace(/^wm:intensity:/, '')}`;
  if (tag.startsWith('wm:mentions:')) return tag.replace(/^wm:mentions:/, '提及 ');
  return labels[tag] || tag;
}

function _compactText(value?: string | null, max = 160) {
  const text = cleanNarrativeText(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function _arenaQuestionAsked(snapshot: LiveQuestionSnapshot) {
  return cleanPresentationText(snapshot.question.title_zh || snapshot.question.title);
}

function arenaTopicLabel(topicBucket?: string | null) {
  const labels: Record<string, string> = {
    geopolitics: '地缘',
    'ai-supply-chain': 'AI / 关键部件',
    'market-risk': '市场风险',
    'oil-price': '油价',
    'shipping-flow': '航运',
    'chip-supply': '芯片 / 关键部件',
    'frontier-ai': '前沿 AI',
    'geopolitical-escalation': '升级风险',
    'public-health': '公共卫生',
    policy: '政策',
    world: '世界',
  };
  const normalized = String(topicBucket || '').trim();
  return labels[normalized] || cleanPresentationText(normalized) || '世界';
}

function arenaResolveTime(snapshot: LiveQuestionSnapshot) {
  return formatTime(snapshot.question.resolve_at || snapshot.question.close_at || snapshot.question.updated_at);
}

function arenaReferenceList(snapshot: LiveQuestionSnapshot) {
  return asArray(snapshot.references).filter((reference) => Boolean(reference?.label && reference?.url && reference.url !== '#'));
}

function arenaCoreReferenceList(snapshot: LiveQuestionSnapshot, role: 'zvec-core') {
  return arenaReferenceList(snapshot).filter((reference) => reference.source_kind === 'signal' && reference.recall_role === role);
}

function arenaRuleReferenceList(snapshot: LiveQuestionSnapshot) {
  return arenaReferenceList(snapshot).filter((reference) => reference.source_kind === 'question_rule');
}

function arenaCitationNumbers(snapshot: LiveQuestionSnapshot, citationIds?: string[] | null) {
  const references = arenaReferenceList(snapshot);
  const referenceOrder = new Map(references.map((reference, index) => [reference.ref_id, index + 1]));
  return asArray(citationIds)
    .map((citationId) => referenceOrder.get(citationId))
    .filter((value): value is number => typeof value === 'number');
}

function _arenaCitationLabel(snapshot: LiveQuestionSnapshot, citationIds?: string[] | null) {
  return arenaCitationNumbers(snapshot, citationIds)
    .map((value) => `[${value}]`)
    .join('');
}

function _arenaCitedReferences(snapshot: LiveQuestionSnapshot, citationIds?: string[] | null) {
  const citationSet = new Set(asArray(citationIds).filter(Boolean));
  if (citationSet.size === 0) return [];
  return arenaReferenceList(snapshot).filter((reference) => citationSet.has(reference.ref_id)).slice(0, 3);
}

function arenaQuestionHref(snapshot: LiveQuestionSnapshot) {
  return snapshot.question.origin_url || snapshot.question.platform_question_url || null;
}

function _arenaQuestionMeta(snapshot: LiveQuestionSnapshot) {
  const parts = [arenaTopicLabel(snapshot.question.topic_bucket), snapshot.question.region_hint]
    .map((value) => {
      const cleaned = cleanPresentationText(value);
      if (!cleaned) return '';
      if (/^global$/i.test(cleaned)) return '主世界';
      return cleaned;
    })
    .filter(Boolean);
  return parts.join(' · ');
}

function arenaQuestionPrompt(snapshot: LiveQuestionSnapshot) {
  return cleanPresentationText(snapshot.question.title_zh || snapshot.question.title || snapshot.question.background || '');
}

function arenaQuestionContextSummary(snapshot: LiveQuestionSnapshot) {
  const summary = cleanNarrativeText(snapshot.question.background_zh || snapshot.question.background || '');
  if (summary) return summary;
  return '这道题需要用平台规则和近 30 天信源一起核对。';
}

function arenaResolutionSummary(snapshot: LiveQuestionSnapshot) {
  const summary = stripArenaPlatformMentions(
    cleanNarrativeText(snapshot.question.resolution_criteria_zh || snapshot.question.resolution_criteria || ''),
  );
  if (summary) return summary;
  return '以题目官方结算结果作为最终验证。';
}

function arenaPercent(probability?: number | null) {
  if (typeof probability !== 'number' || !Number.isFinite(probability)) return '--';
  return `${Math.round(probability * 100)}%`;
}

function stripArenaPlatformMentions(value: string) {
  return cleanPresentationText(value)
    .replace(/\b(?:Metaculus|Manifold|Polymarket|Fallback)\b/giu, '题目方')
    .replace(/内部题池/gu, '当前题池')
    .replace(/平台官方/gu, '题目官方')
    .replace(/平台规则/gu, '题目规则');
}

function arenaPlatformProbability(snapshot: LiveQuestionSnapshot) {
  return snapshot.question.platform_probability_yes;
}

function _arenaPlatformProbabilityLabel(snapshot: LiveQuestionSnapshot) {
  const probability = arenaPlatformProbability(snapshot);
  return typeof probability === 'number' ? `YES ${arenaPercent(probability)}` : '暂未给出';
}

function arenaPlatformContext(snapshot: LiveQuestionSnapshot) {
  if (snapshot.question.source_platform === 'internal') {
    return stripArenaPlatformMentions(
      snapshot.question.platform_context || '当前题池没有公开定价，这题先以信源知识向量库和题目规则来判断。',
    );
  }
  const probability = arenaPlatformProbability(snapshot);
  if (typeof probability === 'number') {
    return `主持人按当前公开定价整理，YES 一侧约为 ${arenaPercent(probability)}。`;
  }
  return '主持人当前还没拿到稳定可用的公开概率，这题先以题目规则和信源强弱来判断。';
}

function arenaDisplayMode(snapshot: LiveQuestionSnapshot) {
  return snapshot.question.display_mode === 'market-structure' ? 'market-structure' : 'consensus';
}

function arenaPlatformCommentary(snapshot: LiveQuestionSnapshot) {
  return asArray(snapshot.question.platform_commentary)
    .map((item) => stripArenaPlatformMentions(String(item || '')))
    .filter(Boolean)
    .slice(0, 4);
}

function arenaPlatformParticipants(snapshot: LiveQuestionSnapshot) {
  return asArray(snapshot.question.platform_participants)
    .map((item) => stripArenaPlatformMentions(String(item || '')))
    .filter(Boolean)
    .slice(0, 4);
}

function arenaPlatformMarketStructure(snapshot: LiveQuestionSnapshot) {
  return asArray(snapshot.question.platform_market_structure)
    .map((item) => cleanPresentationText(String(item || '')))
    .filter(Boolean)
    .slice(0, 6);
}

function arenaXiaLabel(vote: LiveVote) {
  const raw = cleanPresentationText(vote.contributor_label || vote.xia_id || '参与虾');
  if (raw === 'arena-harbor') return '节奏观察虾';
  if (raw === 'arena-citadel') return '政策观察虾';
  return raw || '参与虾';
}

function arenaDiscussionBriefs(snapshot: LiveQuestionSnapshot) {
  return [...arenaPlatformCommentary(snapshot), ...arenaPlatformParticipants(snapshot)].slice(0, 4);
}

function isArenaSyntheticXia(vote: LiveVote) {
  return vote.source === 'xia' && /^arena-/i.test(String(vote.xia_id || ''));
}

function arenaDiscussionVotes(snapshot: LiveQuestionSnapshot) {
  const discussionVotes = asArray(snapshot.discussion_votes).length > 0 ? snapshot.discussion_votes : snapshot.xia_votes;
  return asArray(discussionVotes)
    .filter((vote) => vote.source === 'xia' || vote.source === 'external')
    .sort((left, right) => {
      const leftPriority =
        left.source === 'external' ? 0 : left.source === 'xia' && !isArenaSyntheticXia(left) ? 1 : 2;
      const rightPriority =
        right.source === 'external' ? 0 : right.source === 'xia' && !isArenaSyntheticXia(right) ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .slice(0, 6);
}

function arenaDiscussionAuthorLabel(vote: LiveVote) {
  if (vote.source === 'external') {
    return cleanPresentationText(vote.contributor_label || '讨论区参与者') || '讨论区参与者';
  }
  return arenaXiaLabel(vote);
}

function arenaDiscussionEntryLabel(vote: LiveVote) {
  if (vote.source === 'external') return '原帖';
  if (!isArenaSyntheticXia(vote)) return '跟帖';
  return '主持跟帖';
}

function arenaDiscussionCount(snapshot: LiveQuestionSnapshot) {
  return arenaDiscussionBriefs(snapshot).length + arenaDiscussionVotes(snapshot).length;
}

function arenaVoteSideTone(vote: LiveVote) {
  return vote.side === 'yes'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-orange-200 bg-orange-50 text-orange-700';
}

function arenaVoteSideLabel(vote: LiveVote) {
  return vote.side === 'yes' ? '赞成' : '反对';
}

function arenaSignalsSummary(snapshot: LiveQuestionSnapshot) {
  if (arenaDisplayMode(snapshot) === 'market-structure') {
    return '重点看当前价格、盘口和结构信息。';
  }
  return '主持人先整理题目背景，再接上讨论区里可读的内容。';
}

function arenaContextItems(snapshot: LiveQuestionSnapshot) {
  const statusLabel =
    snapshot.question.status === 'resolved'
      ? '已结算'
      : snapshot.question.status === 'watchlist'
        ? '待结算'
        : '待结算';
  return [
    {
      label: '当前倾向',
      value: questionAggregateSide(snapshot) === 'yes' ? '偏向是' : questionAggregateSide(snapshot) === 'no' ? '偏向否' : '待观察',
    },
    {
      label: '讨论区',
      value: `${arenaDiscussionCount(snapshot)} 条`,
    },
    {
      label: '时间',
      value: arenaResolveTime(snapshot),
    },
    {
      label: '状态',
      value: statusLabel,
    },
    {
      label: '参考依据',
      value: `${snapshot.zvec_chunks?.length || 0} 条`,
    },
  ];
}

function arenaSourceNote(snapshot: LiveQuestionSnapshot) {
  return stripArenaPlatformMentions(snapshot.question.source_note || '');
}

function arenaOfficialResult(snapshot: LiveQuestionSnapshot) {
  if (snapshot.question.official_outcome === 'yes') return '官方结果：YES';
  if (snapshot.question.official_outcome === 'no') return '官方结果：NO';
  return '';
}

function arenaFeedHint(
  tab: 'pending' | 'resolved',
  livebenchArena: LiveBenchArenaState | null,
) {
  if (tab === 'pending') {
    return `待结算题还没有官方结果，当前 ${((livebenchArena?.active_questions?.length || 0) + (livebenchArena?.watchlist_questions?.length || 0))} 题。`;
  }
  return `已结算题已有官方结果，可以回看规则、判断和最终结果。当前 ${livebenchArena?.resolved_questions?.length || 0} 题。`;
}

function arenaRuleReference(snapshot: LiveQuestionSnapshot) {
  return arenaReferenceList(snapshot).find((reference) => reference.source_kind === 'question_rule') || null;
}

function arenaRegionLabel(snapshot: LiveQuestionSnapshot) {
  const cleaned = cleanPresentationText(snapshot.question.region_hint);
  if (!cleaned) return '主世界';
  if (/^global$/i.test(cleaned)) return '主世界';
  return cleaned;
}

function _arenaReferenceNote(reference: { note?: string | null }) {
  const note = cleanPresentationText(reference.note || '');
  return /[\u4e00-\u9fa5]/.test(note) ? note : '';
}

function arenaReferenceTitle(reference: {
  label?: string | null;
  note?: string | null;
  source_kind?: string | null;
}) {
  if (reference.source_kind === 'question_rule') return '题目规则说明';
  const note = cleanPresentationText(reference.note || '');
  if (note && note.length >= 12) return note;
  return cleanPresentationText(reference.label || '') || '参考依据';
}

function arenaReferenceMeta(reference: {
  source_name?: string | null;
  published_at?: string | null;
  source_kind?: 'signal' | 'question_rule';
}) {
  const parts = [
    reference.source_kind === 'question_rule' ? '规则' : '',
    cleanPresentationText(reference.source_name || ''),
    reference.published_at ? formatTime(reference.published_at) : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function arenaReferenceLinkLabel(reference: { source_kind?: 'signal' | 'question_rule' }) {
  return reference.source_kind === 'question_rule' ? '打开规则原文' : '打开信源原文';
}

function arenaRecallRoleLabel(role?: string | null) {
  if (role === 'zvec-core') return '核心证据';
  if (role === 'question-rule') return '规则';
  return '';
}

function arenaReferenceSectionDescription(role: 'zvec-core' | 'question-rule') {
  if (role === 'zvec-core') return '这些是这道题最直接依赖的信源。';
  return '这些是平台规则和结算口径，方便对照题目到底怎么算。';
}

function renderArenaReferenceRows(
  snapshot: LiveQuestionSnapshot,
  references: ReturnType<typeof arenaReferenceList>,
  referenceOrder: Map<string, number>,
) {
  return references.map((reference) => {
    const index = referenceOrder.get(reference.ref_id) || 0;
    return (
      <a
        key={reference.ref_id}
        href={reference.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 transition hover:text-slate-900"
      >
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500">
          [{index}]
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="block text-[12px] font-medium text-slate-700">{arenaReferenceTitle(reference)}</span>
            {arenaRecallRoleLabel(reference.recall_role) ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                {arenaRecallRoleLabel(reference.recall_role)}
              </span>
            ) : null}
          </span>
          {arenaReferenceMeta(reference) ? (
            <span className="mt-0.5 block text-[11px] text-slate-500">{arenaReferenceMeta(reference)}</span>
          ) : null}
          <span className="mt-1 block text-[11px] text-sky-600">{arenaReferenceLinkLabel(reference)}</span>
        </span>
      </a>
    );
  });
}



function _threadRelationLabel(value?: string | null) {
  if (value === 'upgrade') return '把旧判断往上推了一格';
  if (value === 'downgrade') return '把旧判断往下收了一格';
  if (value === 'revise') return '对旧判断做了修正';
  if (value === 'branch') return '从旧线里分出了一条支线';
  if (value === 'echo') return '和旧线形成了回响';
  if (value === 'continue') return '沿着上一轮继续往前看';
  return '这轮是一次新的观察';
}

function isFreshAlertTime(value: string, hours = 24) {
  const ageHours = (Date.now() - new Date(value).getTime()) / 36e5;
  return ageHours <= hours;
}

function hasAlignmentTag(tags: string[] | undefined, predicate: (tag: string) => boolean) {
  return Array.isArray(tags) && tags.some(predicate);
}

function hasEscalationMarker(node: WorldStateNode) {
  return (
    node.severity >= 5 ||
    (typeof node.intensity === 'number' && node.intensity >= 4) ||
    (typeof node.mention_count === 'number' && node.mention_count >= 20) ||
    hasAlignmentTag(node.alignment_tags, (tag) => /^wm:(briefing|summary)-changed$/.test(tag))
  );
}

function hasSeverityAlignment(node: WorldStateNode, level: 'elevated' | 'severe') {
  return hasAlignmentTag(node.alignment_tags, (tag) => tag === `severity:${level}`);
}

function hasSceneAlertTag(node: WorldStateNode) {
  const tags = [...(node.alignment_tags || []), ...(node.tags || [])];
  const sceneTags: Record<string, string[]> = {
    war: ['security', 'conflict', 'outbreak', 'supply-chain', 'policy', 'incident'],
    technology: ['technology', 'ai', 'research', 'policy', 'outbreak', 'protest'],
    capacity: ['capacity', 'supply-chain', 'shipping', 'energy', 'incident', 'policy'],
    finance: ['finance', 'market', 'policy', 'monitor-snapshot', 'anchor'],
    health: ['health', 'outbreak', 'biosecurity', 'incident', 'clinical'],
  };
  const allowedTags = sceneTags[node.scene] || ['security', 'conflict', 'outbreak', 'supply-chain', 'policy'];
  return tags.some((tag) => allowedTags.includes(tag));
}

function alertFreshnessHours(node: WorldStateNode) {
  if (node.display_level === 'high' || node.severity >= 4 || hasSeverityAlignment(node, 'severe')) {
    return ALERT_HIGH_HOURS;
  }
  if (node.display_level === 'elevated' || node.severity >= 3 || hasSeverityAlignment(node, 'elevated')) {
    return ALERT_ELEVATED_HOURS;
  }
  return ALERT_MONITORING_HOURS;
}

function isAlertBoardCandidate(node: WorldStateNode) {
  const freshnessHours = alertFreshnessHours(node);
  if (!isFreshAlertTime(node.updated_at || node.published_at, freshnessHours)) {
    return false;
  }

  const hasSceneTag = hasSceneAlertTag(node);
  const hasStrongSeverity = node.severity >= 4 || hasSeverityAlignment(node, 'severe');
  const hasElevatedSeverity = node.severity >= 3 || hasSeverityAlignment(node, 'elevated');

  if (node.display_level === 'high') {
    return node.severity >= 4 || node.hotspot_score >= 0.58 || hasEscalationMarker(node) || hasSceneTag;
  }

  if (node.display_level === 'elevated') {
    return hasStrongSeverity || hasEscalationMarker(node) || (hasElevatedSeverity && hasSceneTag) || node.hotspot_score >= 0.42;
  }

  if (node.display_level === 'monitoring') {
    return (
      hasStrongSeverity ||
      hasEscalationMarker(node) ||
      (node.scene === 'health' && hasElevatedSeverity) ||
      (node.scene === 'finance' && node.severity >= 2 && node.hotspot_score >= 0.44) ||
      (hasSceneTag && node.severity >= 3)
    );
  }

  return false;
}

function hasOpenableSourceUrl(url?: string) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

function signalDetailHref(id?: string) {
  return id ? `/signals/${encodeURIComponent(id)}` : '#';
}

function signalOpenHref(id: string, url?: string) {
  return hasOpenableSourceUrl(url) ? url! : signalDetailHref(id);
}

function _reliabilityTone(tier?: string) {
  if (tier === 'stable') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tier === 'watchlist') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (tier === 'blocked_or_unknown') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function _reliabilityLabel(tier?: string) {
  if (tier === 'stable') return '稳定信源';
  if (tier === 'watchlist') return '观察中';
  if (tier === 'blocked_or_unknown') return '受限';
  return '待定';
}

function markIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className="h-8 w-8">
      <circle cx="14" cy="14" r="12.5" fill="#0f172a" />
      <circle cx="14" cy="14" r="7.4" fill="none" stroke="#f8fafc" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="2.4" fill="#f8fafc" />
      <path d="M4.8 14h18.4M14 4.8c3.1 2.7 4.9 5.8 4.9 9.2S17.1 20.5 14 23.2c-3.1-2.7-4.9-5.8-4.9-9.2S10.9 7.5 14 4.8Z" fill="none" stroke="#f8fafc" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function shellCardClass() {
  return 'overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/88 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur';
}

function _visibleAlignmentTags(tags: string[]) {
  return tags.filter((tag) => {
    if (!tag) return false;
    if (tag.startsWith('feed:')) return false;
    if (tag.startsWith('type:')) return false;
    if (tag.startsWith('source:')) return false;
    if (tag === 'model:aligned') return false;
    return true;
  });
}

function dashboardCacheKey(scene: WorldScene) {
  return `${DASHBOARD_CACHE_PREFIX}:${scene}`;
}

function purgeLegacyDashboardCaches() {
  if (typeof window === 'undefined') return;

  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith(LEGACY_DASHBOARD_CACHE_PREFIX) && !key.startsWith(DASHBOARD_CACHE_PREFIX)) {
        legacyKeys.push(key);
      }
    }
    legacyKeys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore cache cleanup failure
  }
}

function chooseDefaultActiveSignalId(nextState: WorldStateResponse | null) {
  const candidates =
    nextState?.nodes
      ?.filter((node) => node.node_type === 'hotspot' && node.geo.lat !== null && node.geo.lng !== null)
      .sort((a, b) => {
        const displayRank = { high: 3, elevated: 2, monitoring: 1 };
        return (
          displayRank[b.display_level] - displayRank[a.display_level] ||
          b.severity - a.severity ||
          b.hotspot_score - a.hotspot_score ||
          new Date(b.updated_at || b.published_at).getTime() - new Date(a.updated_at || a.published_at).getTime()
        );
      }) || [];

  return candidates[0]?.node_id || null;
}

function hasUsefulDashboardState(state: WorldStateResponse | null | undefined) {
  if (!state) return false;
  if ((state.nodes || []).length > 0) return true;
  if ((state.top_signals || []).length > 0) return true;
  if ((state.knowledge_signals || []).length > 0) return true;
  if ((state.graph_signals || []).length > 0) return true;
  if ((state.livebench_arena?.active_questions || []).length > 0) return true;
  if ((state.livebench_arena?.watchlist_questions || []).length > 0) return true;
  if ((state.livebench_arena?.resolved_questions || []).length > 0) return true;
  return false;
}

function hasUsefulMarketSnapshot(snapshot: WorldMarketSnapshot | null | undefined) {
  if (!snapshot) return false;
  if ((snapshot.leaderboard || []).length > 0) return true;
  if ((snapshot.markets?.CN?.movers || []).length > 0) return true;
  if ((snapshot.markets?.HK?.movers || []).length > 0) return true;
  if ((snapshot.markets?.US?.movers || []).length > 0) return true;
  return false;
}

function hasUsefulExplain(explain: WorldExplainResponse | null | undefined) {
  if (!explain) return false;
  if ((explain.frontend_contract || []).length > 0) return true;
  if ((explain.backend_contract || []).length > 0) return true;
  if ((explain.onboarding_flow || []).length > 0) return true;
  return false;
}

function readDashboardCache(scene: WorldScene): DashboardCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(dashboardCacheKey(scene));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCachePayload;
    if (!parsed || parsed.version !== DASHBOARD_CACHE_VERSION || parsed.scene !== scene || typeof parsed.saved_at !== 'number') return null;
    if (Date.now() - parsed.saved_at > DASHBOARD_CACHE_TTL_MS) return null;
    const normalizedState = normalizeWorldStateResponse(parsed.state);
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
    // ignore local cache write failure
  }
}

export default function PageClient({
  initialScene = 'global',
  initialState = null,
  initialSubworlds = DEFAULT_SUBWORLDS,
  initialMarketSnapshot = null,
  initialExplain = null,
}: PageClientProps) {
  const normalizedInitialState = normalizeWorldStateResponse(initialState);
  const [scene, setScene] = useState<WorldScene>(initialScene);
  const [state, setState] = useState<WorldStateResponse | null>(normalizedInitialState);
  const [subworlds, setSubworlds] = useState<WorldSubworld[]>(normalizeSubworlds(initialSubworlds));
  const [marketSnapshot, setMarketSnapshot] = useState<WorldMarketSnapshot | null>(initialMarketSnapshot);
  const [explain, setExplain] = useState<WorldExplainResponse | null>(initialExplain);
  const [globeTimeMode, setGlobeTimeMode] = useState<'today' | 'memory30'>('today');
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [globeAutoPauseUntil, setGlobeAutoPauseUntil] = useState<number>(0);
  const [arenaFeedTab, setArenaFeedTab] = useState<'pending' | 'resolved'>('pending');
  const [selectedArenaQuestionId, setSelectedArenaQuestionId] = useState<string | null>(null);
  const [skillEntryCopied, setSkillEntryCopied] = useState(false);
  const [loading, setLoading] = useState(!hasUsefulDashboardState(normalizedInitialState));
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (nextScene: WorldScene) => {
    setLoading(true);
    setError(null);

    try {
      const requestStamp = Date.now();
      const [stateRes, subworldsRes] = await Promise.all([
        fetch(`/api/v1/world/state?scene=${nextScene}&_=${requestStamp}`, { cache: 'no-store' }),
        fetch(`/api/v1/world/subworlds?_=${requestStamp}`, { cache: 'no-store' }),
      ]);

      const [stateData, subworldsData] = await Promise.all([
        stateRes.json(),
        subworldsRes.json(),
      ]);

      if (!stateRes.ok) throw new Error(stateData.error || '加载世界状态失败');

      const normalizedState = normalizeWorldStateResponse(stateData);
      const nextSubworlds = normalizeSubworlds(subworldsData?.subworlds);

      setState(normalizedState);
      setSubworlds(nextSubworlds);
      setActiveSignalId((current) =>
        current && normalizedState?.nodes?.some((node: WorldStateNode) => node.node_id === current)
          ? current
          : chooseDefaultActiveSignalId(normalizedState),
      );
      persistDashboardCache({
        version: DASHBOARD_CACHE_VERSION,
        saved_at: Date.now(),
        scene: nextScene,
        state: normalizedState,
        marketSnapshot: hasUsefulMarketSnapshot(marketSnapshot) ? marketSnapshot : null,
        subworlds: nextSubworlds,
        explain: hasUsefulExplain(explain) ? explain : null,
      });

      void Promise.allSettled([
        fetch(`/api/v1/world/market-snapshot?_=${requestStamp}`, { cache: 'no-store' }),
        fetch(`/api/v1/world/explain?scene=${nextScene}&_=${requestStamp}`, { cache: 'no-store' }),
      ]).then(
        async ([marketSnapshotResult, explainResult]) => {
          if (marketSnapshotResult.status === 'fulfilled') {
            const marketResponse = marketSnapshotResult.value;
            const marketData = await marketResponse.json().catch(() => null);
            if (marketResponse.ok && marketData) {
              setMarketSnapshot(marketData);
            }
          }

          if (explainResult.status === 'fulfilled') {
            const explainResponse = explainResult.value;
            const explainData = await explainResponse.json().catch(() => null);
            if (explainResponse.ok && explainData) {
              setExplain(explainData);
            }
          }
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [explain, marketSnapshot]);

  useEffect(() => {
    purgeLegacyDashboardCaches();
    if (scene === initialScene && hasUsefulDashboardState(normalizedInitialState)) {
      persistDashboardCache({
        version: DASHBOARD_CACHE_VERSION,
        saved_at: Date.now(),
        scene,
        state: normalizedInitialState,
        marketSnapshot: hasUsefulMarketSnapshot(initialMarketSnapshot) ? initialMarketSnapshot : null,
        subworlds: normalizeSubworlds(initialSubworlds),
        explain: hasUsefulExplain(initialExplain) ? initialExplain : null,
      });
      setLoading(false);
    } else {
      const cached = readDashboardCache(scene);
      if (cached) {
        setState(cached.state);
        setMarketSnapshot(cached.marketSnapshot || null);
        setSubworlds(normalizeSubworlds(cached.subworlds));
        setExplain(cached.explain || null);
        setActiveSignalId((current) =>
          current && cached.state?.nodes?.some((node: WorldStateNode) => node.node_id === current)
            ? current
            : chooseDefaultActiveSignalId(cached.state),
        );
        setLoading(false);
      }
    }
    void loadDashboard(scene);
  }, [initialExplain, initialMarketSnapshot, initialScene, initialSubworlds, loadDashboard, normalizedInitialState, scene]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadDashboard(scene);
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [loadDashboard, scene]);

  useEffect(() => {
    const handleFocusRefresh = () => {
      void loadDashboard(scene);
    };

    window.addEventListener('focus', handleFocusRefresh);
    window.addEventListener('online', handleFocusRefresh);
    return () => {
      window.removeEventListener('focus', handleFocusRefresh);
      window.removeEventListener('online', handleFocusRefresh);
    };
  }, [loadDashboard, scene]);

  const markers = useMemo(
    () => {
      const todayStart = startOfToday();
      return (state?.nodes || [])
        .filter((node) => node.node_type === 'hotspot' && node.geo.lat !== null && node.geo.lng !== null)
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
          locationLabel: [node.geo.label, node.geo.country].filter(Boolean).join(', '),
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
    },
    [globeTimeMode, state],
  );

  useEffect(() => {
    if (!markers.some((marker) => marker.id === activeSignalId)) {
      setActiveSignalId(markers[0]?.id || null);
    }
  }, [activeSignalId, markers]);

  const alertNodes = useMemo(
    () => {
      const nodes = (state?.nodes || [])
        .filter((node) => node.node_type === 'hotspot')
        .filter((node) => isAlertBoardCandidate(node));
      const byLevel = {
        high: nodes
          .filter((node) => node.display_level === 'high')
          .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score)
          .slice(0, 40),
        elevated: nodes
          .filter((node) => node.display_level === 'elevated')
          .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score)
          .slice(0, 32),
        monitoring: nodes
          .filter((node) => node.display_level === 'monitoring')
          .sort((a, b) => b.severity - a.severity || b.hotspot_score - a.hotspot_score)
          .slice(0, 28),
      };
      return [...byLevel.high, ...byLevel.elevated, ...byLevel.monitoring].slice(0, DASHBOARD_VIEW_LIMIT);
    },
    [state],
  );

  const mergedSignalPool = useMemo(() => {
    const merged = new Map<string, WorldStateResponse['top_signals'][number]>();
    for (const signal of [...(state?.top_signals || []), ...(state?.knowledge_signals || [])]) {
      if (!merged.has(signal.id)) {
        merged.set(signal.id, signal);
      }
    }
    return [...merged.values()];
  }, [state]);

  const worldMarkList = useMemo(() => {
    const freshCutoff = Date.now() - 48 * 60 * 60 * 1000;
    const freshSignals = mergedSignalPool.filter((signal) => new Date(signal.published_at).getTime() >= freshCutoff);
    const basePool = freshSignals.length > 0 ? freshSignals : mergedSignalPool;
    return basePool
      .sort((a, b) => {
        const levelOrder = { high: 3, elevated: 2, monitoring: 1 };
        return (
          levelOrder[b.display_level] - levelOrder[a.display_level] ||
          b.severity - a.severity ||
          b.hotspot_score - a.hotspot_score ||
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        );
      })
      .slice(0, DASHBOARD_VIEW_LIMIT);
  }, [mergedSignalPool]);

  const activeSignalNode = useMemo(() => {
    if (!activeSignalId) return null;
    return (state?.nodes || []).find((node) => node.node_id === activeSignalId) || null;
  }, [activeSignalId, state]);

  const focusCard = useMemo(() => {
    if (!activeSignalNode) return null;
    const activityWatchNext = '';
    const watchNext = !looksLikeInternalWatchText(activityWatchNext)
      ? activityWatchNext
      : focusFallbackWatchNext(activeSignalNode.scene, activeSignalNode.geo.label || activeSignalNode.geo.region);
    return {
      label: sceneDisplayLabel(activeSignalNode.scene),
      title: cleanPresentationText(activeSignalNode.display_title || activeSignalNode.title),
      summary: cleanNarrativeText(activeSignalNode.display_summary || activeSignalNode.summary),
      updatedAt: activeSignalNode.updated_at || activeSignalNode.published_at,
      watchNext,
    };
  }, [activeSignalNode]);

  const livebenchArena = useMemo(() => state?.livebench_arena || null, [state]);
  const arenaDisplaySource = useMemo(() => {
    if (!livebenchArena) return [];
    if (arenaFeedTab === 'resolved') return livebenchArena.resolved_questions;
    return [...(livebenchArena.active_questions || []), ...(livebenchArena.watchlist_questions || [])];
  }, [arenaFeedTab, livebenchArena]);
  const arenaList = useMemo(() => arenaDisplaySource, [arenaDisplaySource]);

  useEffect(() => {
    if (!livebenchArena) return;
    if (arenaFeedTab === 'pending' && (arenaDisplaySource || []).length === 0 && (livebenchArena.resolved_questions || []).length > 0) {
      setArenaFeedTab('resolved');
    }
  }, [arenaDisplaySource, arenaFeedTab, livebenchArena]);

  useEffect(() => {
    if (!arenaDisplaySource.length) {
      setSelectedArenaQuestionId(null);
      return;
    }
    if (!selectedArenaQuestionId || !arenaDisplaySource.some((item) => item.question.question_id === selectedArenaQuestionId)) {
      setSelectedArenaQuestionId(arenaDisplaySource[0].question.question_id);
    }
  }, [arenaDisplaySource, selectedArenaQuestionId]);

  useEffect(() => {
    if (markers.length <= 1) return;

    const timer = window.setInterval(() => {
      if (Date.now() < globeAutoPauseUntil) {
        return;
      }
      setActiveSignalId((current) => {
        const currentIndex = markers.findIndex((marker) => marker.id === current);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % markers.length : 0;
        return markers[nextIndex]?.id || current || null;
      });
    }, 12000);

    return () => window.clearInterval(timer);
  }, [globeAutoPauseUntil, markers]);

  const activeSubworld = subworlds.find((world) => world.key === scene) || null;
  const skillEntry = state?.skill_entry || null;
  const sourceRefresh = state?.source_refresh_summary || null;
  const livebenchSummary = state?.livebench_summary || null;
  const evaluationSummary = state?.evaluation_summary || null;
  const severitySummary = useMemo(() => {
    const nodes = (state?.nodes || []).filter((node) => node.node_type === 'hotspot');
    return {
      severe: nodes.filter((node) => node.severity >= 4).length,
      elevated: nodes.filter((node) => node.severity >= 3 && node.severity < 4).length,
      ordinary: nodes.filter((node) => node.severity < 3).length,
    };
  }, [state]);
  const accuracyTrail = useMemo(
    () => buildAccuracyTrail(livebenchArena?.resolved_questions || []),
    [livebenchArena],
  );
  const questionTicker = useMemo(
    () => [...(livebenchArena?.active_questions || []), ...(livebenchArena?.watchlist_questions || [])].slice(0, 12),
    [livebenchArena],
  );
  const accuracyDelta =
    accuracyTrail.length >= 2
      ? Math.round((accuracyTrail[accuracyTrail.length - 1] - accuracyTrail[0]) * 100)
      : 0;
  const resolvedEvaluationCount = evaluationSummary?.resolved_question_count || 0;
  const scoredEvaluationCount = evaluationSummary?.scored_question_count || 0;
  const formalScoredCount = evaluationSummary?.formal_scored_question_count || 0;
  const sourceFormalScoredCount = evaluationSummary?.source_formal_scored_question_count || 0;
  const formalVoteCount = evaluationSummary?.formal_vote_count || 0;
  const sourceFormalVoteCount = evaluationSummary?.source_formal_vote_count || 0;
  const formalParticipantCount = evaluationSummary?.formal_participant_count || 0;
  const hasSourceFormalEvaluation = sourceFormalScoredCount > 0;
  const hasFormalEvaluation = formalScoredCount > 0;
  const hasFormalVotes = formalVoteCount > 0 || sourceFormalVoteCount > 0;
  const hasBaselineEvaluation = scoredEvaluationCount > 0;
  const displayedHitRateLabel = hasSourceFormalEvaluation
    ? formatPercent(evaluationSummary?.source_formal_hit_rate || 0)
    : hasFormalEvaluation
    ? formatPercent(evaluationSummary?.formal_hit_rate || 0)
    : hasBaselineEvaluation
      ? formatPercent(evaluationSummary?.hit_rate || 0)
      : '--';
  const displayedErrorLabel = hasSourceFormalEvaluation
    ? formatMetric(evaluationSummary?.source_formal_avg_brier, 3)
    : hasFormalEvaluation
    ? formatMetric(evaluationSummary?.formal_avg_brier, 3)
    : hasBaselineEvaluation
      ? formatMetric(evaluationSummary?.avg_brier, 3)
      : '--';
  const evaluationCoverageLabel = hasSourceFormalEvaluation
    ? `${sourceFormalScoredCount} / ${resolvedEvaluationCount}`
    : hasFormalEvaluation
    ? `${formalScoredCount} / ${resolvedEvaluationCount}`
    : hasBaselineEvaluation
      ? `${scoredEvaluationCount} / ${resolvedEvaluationCount}`
      : `0 / ${resolvedEvaluationCount}`;
  const evaluationHeadline = hasSourceFormalEvaluation
    ? `接入信源后的正式预测命中率 ${displayedHitRateLabel}${accuracyDelta !== 0 ? `，最近变化 ${accuracyDelta > 0 ? '+' : ''}${accuracyDelta} 个百分点` : '，最近保持稳定'}。`
    : hasFormalEvaluation
    ? `过去正式预测命中率 ${displayedHitRateLabel}${accuracyDelta !== 0 ? `，最近变化 ${accuracyDelta > 0 ? '+' : ''}${accuracyDelta} 个百分点` : '，最近保持稳定'}。`
    : hasFormalVotes
      ? `Hermes 等正式接入虾已经提交 ${sourceFormalVoteCount || formalVoteCount} 票，等待对应题目结算。`
    : hasBaselineEvaluation
      ? `历史基线预测命中率 ${displayedHitRateLabel}，正式接入票等待对应题目结算。`
      : `已有 ${resolvedEvaluationCount} 题公布结果，外部虾的正式计分还在等待对应题目结算。`;
  const evaluationSupport = hasSourceFormalEvaluation
    ? `平均误差 ${displayedErrorLabel}，计分覆盖 ${formatPercent(evaluationSummary?.source_formal_scoring_coverage_rate || 0)}。`
    : hasFormalEvaluation
      ? `平均误差 ${displayedErrorLabel}，计分覆盖 ${formatPercent(evaluationSummary?.formal_scoring_coverage_rate || 0)}。`
    : hasFormalVotes
      ? `${formalParticipantCount} 只正式虾已接入；历史基线平均误差 ${displayedErrorLabel}，正式成绩会在结算后出现。`
    : hasBaselineEvaluation
      ? `历史基线平均误差 ${displayedErrorLabel}；正式成绩只统计真实接入虾在结算前形成的票。`
      : `当前展示的是真实接入进度：已投票会保留，只有题目公布结果后才进入正式成绩。`;
  const handleCopySkillEntry = async () => {
    if (!skillEntry?.url) return;
    const copied = await copyTextWithFallback(skillEntry.url);
    if (!copied) return;
    setSkillEntryCopied(true);
    window.setTimeout(() => setSkillEntryCopied(false), 1600);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] text-slate-900">
      <div className="relative mx-auto flex w-full max-w-none flex-col gap-5 px-4 py-5 sm:px-6 2xl:px-8">
        <section className={`${shellCardClass()} animate-fade-in-soft px-5 py-5`}>
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_88%_16%,rgba(191,219,254,0.5)_0%,rgba(255,255,255,0)_24%),linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] p-4 shadow-[0_18px_38px_rgba(15,23,42,0.06)]">
            <div
              className="pointer-events-none absolute right-[-2rem] top-[-2rem] h-48 w-48 rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0) 72%)' }}
            />
            <div className="pointer-events-none absolute right-10 top-6 hidden opacity-[0.14] md:block">
              <div className="scale-[5.2] text-slate-900">{markIcon()}</div>
            </div>
            <div className="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] xl:items-stretch">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  <Link2 className="h-3.5 w-3.5" />
                  信源 SKILL
                </div>
                <h1 className="max-w-[28rem] font-serif text-[2.05rem] font-semibold leading-none tracking-[-0.04em] text-slate-950 sm:text-[2.4rem]">
                  世界脉络
                </h1>
                <p className="mt-3 max-w-[40rem] text-sm leading-7 text-slate-600">
                  给虾接入这条信源入口。它先查近 30 天信源，再把同一套判断方法带入 LiveBench 回看和积累。
                </p>
                {skillEntry ? (
                  <div className="mt-4 max-w-[58rem] rounded-[22px] border border-slate-200 bg-white/95 px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-medium tracking-[0.08em] text-slate-500">接入地址</p>
                        </div>
                        <code className="mt-2 block break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] font-medium leading-7 text-slate-800">
                          {skillEntry.url}
                        </code>
                        <p className="mt-2 text-[12px] leading-6 text-slate-600">
                          {skillEntry.copy_hint || '把这个地址给用户即可，不需要先解释页面结构。'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-start lg:self-center">
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
                  </div>
                ) : (
                  <p className="mt-4 text-[13px] leading-7 text-slate-500">当前还没有可公开展示的接入链接。</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-xs text-slate-600">
                    30 天信源
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-xs text-slate-600">
                    持续校准
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-xs text-slate-600">
                    外部虾接入
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200/90 bg-white/92 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.12em] text-slate-400">信源监测</p>
                    <p className="mt-1 text-[13px] leading-6 text-slate-600">
                      入口库、仓库发现和运行采样的简报。
                    </p>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">
                    {formatSourceTime(sourceRefresh?.generated_at)}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-200/90 bg-slate-50/75 px-3 py-3">
                    <div className="text-[11px] tracking-[0.08em] text-slate-400">SkillHub 上次查询</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatSourceTime(sourceRefresh?.skillhub_snapshot.last_refreshed_at)}</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      入口 {formatMetric(sourceRefresh?.source_skill_snapshot.active_hub_count)} 个，沉淀 {formatMetric(sourceRefresh?.source_skill_snapshot.yielded_skill_count)} 条。
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200/90 bg-slate-50/75 px-3 py-3">
                    <div className="text-[11px] tracking-[0.08em] text-slate-400">GitHub 上次查询</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatSourceTime(sourceRefresh?.repo_discovery_snapshot.last_refreshed_at)}</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      本地 {formatMetric(sourceRefresh?.repo_discovery_snapshot.local_repo_count)} 个，候选 {formatMetric(sourceRefresh?.repo_discovery_snapshot.github_candidate_count)} 条。
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200/90 bg-slate-50/75 px-3 py-3">
                    <div className="text-[11px] tracking-[0.08em] text-slate-400">稳定更新</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {formatMetric(state?.source_health?.stable_source_count || state?.source_knowledge?.source_health?.stable_source_count)} 条
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      观察 {formatMetric(state?.source_health?.watchlist_source_count || state?.source_knowledge?.source_health?.watchlist_source_count)} 条，待确认 {formatMetric(state?.source_health?.blocked_or_unknown_source_count || state?.source_knowledge?.source_health?.blocked_or_unknown_source_count)} 条。
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200/90 bg-slate-50/75 px-3 py-3">
                    <div className="text-[11px] tracking-[0.08em] text-slate-400">最近运行</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatSourceTime(sourceRefresh?.monitor_runtime.latest_poll_finished_at)}</div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      更新 {formatMetric(sourceRefresh?.monitor_runtime.changed_source_count)} 条，待补 {formatMetric(sourceRefresh?.monitor_runtime.next_batch_count)} 条。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/75 px-3 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-xs font-medium tracking-[0.08em] text-slate-500">主世界控制</span>
                  <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs text-slate-500">3D 地球</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-slate-200 bg-white/70 px-3 text-xs"
                    onClick={() => void loadDashboard(scene)}
                    disabled={loading}
                  >
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                  </Button>
                </div>
                {activeSubworld?.recommended_bundles?.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">推荐 feed bundle</span>
                    {activeSubworld.recommended_bundles.map((bundle) => (
                      <span
                        key={`${activeSubworld.key}-${bundle.name}`}
                        className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs text-cyan-700"
                        title={bundle.note}
                      >
                        {bundle.name} · {bundle.source_count}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {subworlds.map((world) => (
                  <button
                    key={world.key}
                    type="button"
                    onClick={() => setScene(world.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      scene === world.key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white/82 text-slate-600'
                    }`}
                    title={world.summary}
                  >
                    {world.title} {world.signal_count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <Card className="rounded-[24px] border-red-200 bg-red-50/90 shadow-[0_14px_30px_rgba(239,68,68,0.08)]">
            <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        <section className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <Card className={`${shellCardClass()} flex h-full flex-col`}>
            <CardHeader className="border-b border-slate-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.84))] py-4">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <AlertTriangle className="h-4 w-4" />
                  实时信息
                  <span className="text-xs font-normal text-slate-400">({alertNodes.length})</span>
                </CardTitle>
                  <p className="text-xs leading-6 text-slate-500">升温和突发信号按时间排列，风险越高越靠前。</p>
              </div>
            </CardHeader>
            <CardContent className="p-2">
              <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                  {alertNodes.length > 0 ? alertNodes.map((node, index) => (
                    <article
                      key={`${node.node_id}-${node.published_at}-${index}`}
                      className={`min-w-0 rounded-[22px] border p-4 transition hover:opacity-95 ${severitySoftTone(node.severity)}`}
                    >
                      <div className="mb-2 flex min-w-0 items-start gap-2">
                        <Badge className={`shrink-0 rounded-full border ${severityTone(node.severity)}`}>
                          {severityLabel(node.severity)}
                        </Badge>
                        <p className="min-w-0 flex-1 break-words text-sm font-medium leading-6 text-slate-900">
                          {cleanPresentationText(node.display_title || node.title)}
                        </p>
                      </div>
                      <p className="break-words text-xs leading-6 text-slate-600">{cleanPresentationText(node.display_summary || node.summary)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        {hasOpenableSourceUrl(node.source_url) ? (
                          <a
                            href={signalOpenHref(node.node_id, node.source_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition hover:text-slate-900"
                          >
                            <Link2 className="h-3 w-3" />
                            信源
                          </a>
                        ) : (
                          <a
                            href={signalDetailHref(node.node_id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500 transition hover:text-slate-900"
                          >
                            <Link2 className="h-3 w-3" />
                            详情
                          </a>
                        )}
                      </div>
                      <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{node.geo.label || node.geo.region}</span>
                          <span className="shrink-0 text-slate-400">{formatTime(node.updated_at || node.published_at)}</span>
                        </div>
                      </article>
                  )) : (
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-500">
                      当前没有明显升温信号，普通监测继续留在地图和实时看板里。
                    </div>
                  )}
                </div>
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-5 xl:order-2">
            <Card id="world-map-panel" className={shellCardClass()}>
              <CardContent className="p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                  <div>
                    <h2 className="font-serif text-xl font-semibold tracking-[-0.02em] text-slate-950">
                      世界视图
                    </h2>
                    <p className="text-xs text-slate-500">
                      近 30 天信源落点和热度分布，鼠标停留可查看上下文。
                    </p>
                    {focusCard ? (
                      <div className="mt-3 w-full max-w-5xl rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(240,253,250,0.9))] px-4 py-3 shadow-[0_10px_24px_rgba(16,185,129,0.08)]">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                {focusCard.label || '当前焦点'}
                              </span>
                              {focusCard.updatedAt ? (
                                <span className="text-[11px] text-emerald-600">{formatTime(focusCard.updatedAt)}</span>
                              ) : null}
                            </div>
                            <p className="text-[13px] leading-7 text-emerald-900">{focusCard.summary}</p>
                          </div>
                          {focusCard.watchNext ? (
                            <div className="w-full rounded-[18px] border border-emerald-200/80 bg-white/75 px-3 py-2 lg:w-[18rem]">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-emerald-600">仍待确认</p>
                              <p className="mt-1 text-[12px] leading-6 text-emerald-900">{focusCard.watchNext}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-500">
                    最近更新 {state ? formatTime(state.generated_at) : '--'}
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: 'today', label: '只看今天' },
                      { key: 'memory30', label: '近 30 天渐淡' },
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
                  <span className="text-xs text-slate-400">红色为严重，蓝色为升温，绿色为持续监测。</span>
                </div>

                <div className="h-[540px] overflow-hidden rounded-[24px] border border-slate-200/80">
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
                <div className="mt-3 flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50/75 px-3 py-2 text-xs text-slate-600">
                  <span>地图用于看近况和地理分布。点中某个信源后，会短暂停留，方便对照上下文。</span>
                  <span className="text-slate-500">{Date.now() < globeAutoPauseUntil ? '手动停留中' : '自动巡航'}</span>
                </div>
              </CardContent>
            </Card>

            <Card id="arena-panel" className={shellCardClass()}>
              <CardHeader className="border-b border-slate-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.82))] py-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Radio className="h-4 w-4" />
                    问题与判断
                  </CardTitle>
                  <p className="text-xs text-slate-500">主持人整理背景，讨论区保留原帖与跟帖，参考依据用于核对判断。</p>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-3">
                  {loading && !state ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-500">
                      正在同步题池和信源知识库，通常几秒后会补齐。
                    </div>
                  ) : null}
                  <Tabs value={arenaFeedTab} onValueChange={(value) => setArenaFeedTab(value as 'pending' | 'resolved')}>
                    <TabsList className="grid h-auto w-full grid-cols-2 rounded-full border border-slate-200 bg-white/85 p-1">
                      <TabsTrigger value="pending" className="rounded-full px-3 py-1.5 text-xs">
                        待结算 {((livebenchArena?.active_questions?.length || 0) + (livebenchArena?.watchlist_questions?.length || 0)) > 0 ? `(${(livebenchArena?.active_questions?.length || 0) + (livebenchArena?.watchlist_questions?.length || 0)})` : ''}
                      </TabsTrigger>
                      <TabsTrigger value="resolved" className="rounded-full px-3 py-1.5 text-xs">
                        已结算 {(livebenchArena?.resolved_questions?.length || 0) > 0 ? `(${livebenchArena?.resolved_questions?.length || 0})` : ''}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 px-4 py-3 text-[12px] leading-6 text-slate-600">
                    {arenaFeedHint(arenaFeedTab, livebenchArena)}
                  </div>

                  {arenaList.length > 0 ? (
                    arenaList.map((snapshot) => {
                      const isExpanded = selectedArenaQuestionId === snapshot.question.question_id;
                      const allReferences = arenaReferenceList(snapshot);
                      const referenceOrder = new Map(allReferences.map((reference, index) => [reference.ref_id, index + 1]));
                      const zvecReferences = arenaCoreReferenceList(snapshot, 'zvec-core');
                      const ruleReferences = arenaRuleReferenceList(snapshot);
                      const discussionBriefs = arenaDiscussionBriefs(snapshot);
                      const discussionVotes = arenaDiscussionVotes(snapshot);
                      return (
                      <article
                        key={snapshot.question.question_id}
                        data-question-id={snapshot.question.question_id}
                        onClick={() => setSelectedArenaQuestionId(snapshot.question.question_id)}
                        className={`min-w-0 rounded-[22px] border bg-white/90 p-4 transition ${
                          isExpanded
                            ? 'border-sky-300 shadow-[0_14px_32px_rgba(56,189,248,0.16)]'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                                {arenaTopicLabel(snapshot.question.topic_bucket)}
                              </span>
                              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700">
                                {arenaRegionLabel(snapshot)}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] ${
                                  snapshot.question.status === 'resolved'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : snapshot.question.status === 'watchlist'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {snapshot.question.status === 'resolved'
                                  ? '已结算'
                                  : snapshot.question.status === 'watchlist'
                                    ? '观察中'
                                    : '待结算'}
                              </span>
                              {!isExpanded ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500">
                                  点击展开
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2">
                              <p className="mt-1 block break-words text-sm font-semibold leading-7 text-slate-900">{arenaQuestionPrompt(snapshot)}</p>
                              {isExpanded ? (
                                <p className="mt-2 text-[12px] leading-6 text-slate-600">{arenaQuestionContextSummary(snapshot)}</p>
                              ) : (
                                <p className="mt-2 line-clamp-2 text-[12px] leading-6 text-slate-600">{arenaPlatformContext(snapshot)}</p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                {arenaQuestionHref(snapshot) ? (
                                  <a
                                    href={arenaQuestionHref(snapshot) || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition hover:text-slate-900 ${!isExpanded ? 'hidden' : ''}`}
                                  >
                                    <Link2 className="h-3 w-3" />
                                    打开原题
                                  </a>
                                ) : null}
                                {arenaRuleReference(snapshot) ? (
                                  <a
                                    href={arenaRuleReference(snapshot)?.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 transition hover:text-slate-900 ${!isExpanded ? 'hidden' : ''}`}
                                  >
                                    <Link2 className="h-3 w-3" />
                                    打开规则原文
                                  </a>
                                ) : null}
                              </div>
                            </div>
                            {isExpanded ? (
                              <div className="mt-3 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3 py-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                  {arenaContextItems(snapshot).map((item) => (
                                    <div key={item.label} className="rounded-xl bg-white px-3 py-2">
                                      <p className="text-[11px] tracking-[0.08em] text-slate-400">{item.label}</p>
                                      <p className="mt-1 text-[12px] font-medium text-slate-700">{item.value}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 rounded-xl bg-white px-3 py-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">主持人汇报</p>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                      {arenaDisplayMode(snapshot) === 'market-structure' ? '结构摘要' : '主持人整理'}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-[12px] leading-6 text-slate-700">{arenaPlatformContext(snapshot)}</p>
                                  <p className="mt-2 text-[11px] leading-6 text-slate-500">{arenaSignalsSummary(snapshot)}</p>
                                  {arenaDisplayMode(snapshot) === 'consensus' ? (
                                    <div className="mt-3 space-y-2">
                                      {arenaPlatformCommentary(snapshot).map((item) => (
                                        <div
                                          key={`${snapshot.question.question_id}-commentary-${item}`}
                                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                                        >
                                          <p className="text-[11px] font-medium text-slate-500">主持人整理</p>
                                          <p className="mt-1 text-[11px] leading-5 text-slate-600">{item}</p>
                                        </div>
                                      ))}
                                      {arenaPlatformCommentary(snapshot).length === 0 ? (
                                        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                                          当前还没有稳定可展示的主持人整理摘要。
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {arenaPlatformMarketStructure(snapshot).map((item) => (
                                        <span
                                          key={`${snapshot.question.question_id}-structure-${item}`}
                                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600"
                                        >
                                          {item}
                                        </span>
                                      ))}
                                      {arenaPlatformMarketStructure(snapshot).length === 0 ? (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                                          当前还没有稳定可展示的市场结构字段。
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-3 rounded-xl bg-white px-3 py-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">讨论区</p>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                      {arenaDiscussionCount(snapshot)} 条
                                    </span>
                                  </div>
                                  <div className="mt-2 space-y-3">
                                    {discussionBriefs.map((item, index) => (
                                      <div
                                        key={`${snapshot.question.question_id}-brief-${item}-${index}`}
                                        className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[12px] font-medium text-slate-800">讨论区简报</span>
                                        </div>
                                        <p className="mt-2 text-[12px] leading-6 text-slate-600">{item}</p>
                                      </div>
                                    ))}
                                    {discussionVotes.map((vote) => (
                                      <div key={vote.vote_id} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[12px] font-medium text-slate-800">{arenaDiscussionAuthorLabel(vote)}</span>
                                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500">
                                            {arenaDiscussionEntryLabel(vote)}
                                          </span>
                                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${arenaVoteSideTone(vote)}`}>
                                            {arenaVoteSideLabel(vote)}
                                          </span>
                                          <span className="text-[11px] text-slate-400">{formatTime(vote.created_at)}</span>
                                        </div>
                                        <p className="mt-2 text-[12px] font-medium leading-6 text-slate-800">
                                          {cleanNarrativeText(vote.human_readable_prediction)}
                                        </p>
                                        <p className="mt-1 text-[12px] leading-6 text-slate-600">
                                          {cleanNarrativeText(vote.human_readable_why)}
                                        </p>
                                      </div>
                                    ))}
                                    {arenaDiscussionCount(snapshot) === 0 ? (
                                      <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                                        当前还没有稳定可展示的讨论内容，主持人汇报和参考依据已保留。
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 rounded-xl bg-white px-3 py-3">
                                  <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">规则与结果</p>
                                  <p className="mt-2 text-[12px] leading-6 text-slate-700">{arenaResolutionSummary(snapshot)}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                      {arenaOfficialResult(snapshot) || '官方结果待回写'}
                                    </span>
                                  </div>
                                  {arenaSourceNote(snapshot) ? (
                                    <p className="mt-3 text-[11px] leading-6 text-slate-500">{arenaSourceNote(snapshot)}</p>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                  当前倾向 {questionAggregateSide(snapshot) === 'yes' ? '偏向是' : questionAggregateSide(snapshot) === 'no' ? '偏向否' : '待观察'}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                  参考依据 {arenaReferenceList(snapshot).length} 条
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                  讨论区 {arenaDiscussionCount(snapshot)} 条
                                </span>
                                {arenaOfficialResult(snapshot) ? (
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
                                    {arenaOfficialResult(snapshot)}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{arenaResolveTime(snapshot)}</span>
                        </div>
                        {isExpanded ? (
                        <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 px-4 py-4">
                          <div className="rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-slate-400">参考依据</p>
                              <span className="text-[11px] text-slate-400">{allReferences.length} 条</span>
                            </div>
                            <div className="space-y-3">
                              {allReferences.length > 0 ? (
                                [
                                  {
                                    role: 'zvec-core' as const,
                                    title: '核心证据',
                                    references: zvecReferences,
                                  },
                                  {
                                    role: 'question-rule' as const,
                                    title: '规则说明',
                                    references: ruleReferences,
                                  },
                                ]
                                  .filter((section) => section.references.length > 0)
                                  .map((section) => (
                                    <div key={`${snapshot.question.question_id}-${section.role}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                      <div className="mb-2 flex items-center justify-between gap-2">
                                        <div>
                                          <p className="text-[12px] font-medium text-slate-700">{section.title}</p>
                                          <p className="text-[11px] leading-5 text-slate-500">
                                            {arenaReferenceSectionDescription(section.role)}
                                          </p>
                                        </div>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                                          {section.references.length} 条
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {renderArenaReferenceRows(snapshot, section.references, referenceOrder)}
                                      </div>
                                    </div>
                                  ))
                              ) : (
                                <p className="text-[12px] text-slate-400">这道题当前还没有足够稳定的可引用条目。</p>
                              )}
                            </div>
                          </div>
                        </div>
                        ) : (
                          <div className="mt-3">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              当前倾向 {questionAggregateSide(snapshot) === 'yes' ? '偏向是' : questionAggregateSide(snapshot) === 'no' ? '偏向否' : '待观察'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              参考依据 {arenaReferenceList(snapshot).length} 条
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              讨论区 {arenaDiscussionCount(snapshot)} 条
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              规则 {ruleReferences.length} 条
                            </span>
                            <span className="text-slate-400">点一下展开当前题。</span>
                            </div>
                          </div>
                        )}
                      </article>
                    )})
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
                      {arenaFeedTab === 'pending' && (livebenchArena?.watchlist_questions?.length || 0) > 0
                        ? '当前没有更强把握的题，页面先保留这批待结算题继续跟。'
                        : '这轮场景下还没有可展示的外部预测问题。'}
                    </div>
                  )}
                </div>

              <div className="border-t border-slate-100 bg-white/70 px-4 py-3 text-xs text-slate-500">
                待结算列表会统一保留还没出官方结果的问题；当前窗口约为 {livebenchArena?.active_window_days || WEEKLY_PREDICTION_WINDOW_DAYS} 天主判断期，加上 {livebenchArena?.watchlist_window_days || REPORT_MEMORY_DAYS} 天补充跟踪期。
              </div>
            </CardContent>
          </Card>
          </div>

          <Card className={`${shellCardClass()} xl:order-3`}>
            <CardHeader className="border-b border-slate-100 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.82))] py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">实时看板</CardTitle>
                  <p className="mt-1 text-xs leading-6 text-slate-500">风险信号、预测表现和题池动态集中展示。</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                  {state ? formatTime(state.generated_at) : '--'}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              <section className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium tracking-[0.1em] text-slate-400">信号温度</p>
                  <span className="text-[11px] text-slate-400">{state?.nodes?.length || 0} 个落点</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-3">
                    <p className="text-[11px] text-red-500">严重</p>
                    <p className="mt-1 text-lg font-semibold text-red-800">{severitySummary.severe}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                    <p className="text-[11px] text-amber-600">升温</p>
                    <p className="mt-1 text-lg font-semibold text-amber-800">{severitySummary.elevated}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] text-slate-500">普通</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{severitySummary.ordinary}</p>
                  </div>
                </div>
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {worldMarkList.slice(0, 8).map((signal, index) => (
                    <article
                      key={`${signal.id}-${signal.published_at}-${index}`}
                      className={`rounded-[18px] border px-3 py-3 transition ${
                        activeSignalId === signal.id ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 bg-slate-50/70'
                      }`}
                      onMouseEnter={() => setActiveSignalId(signal.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`rounded-full ${severityTone(signal.severity)}`}>
                          {severityLabel(signal.severity)}
                        </Badge>
                        <span className="text-[11px] text-slate-400">{formatTime(signal.published_at)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-6 text-slate-900">
                        {cleanPresentationText(signal.display_title || signal.title)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                        {cleanNarrativeText(signal.display_summary)}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium tracking-[0.1em] text-slate-400">模型表现</p>
                  <span className="text-[11px] text-slate-400">计分 {evaluationCoverageLabel}</span>
                </div>
                <p className="text-sm font-semibold leading-7 text-slate-900">
                  {evaluationHeadline}
                </p>
                <p className="mt-1 text-[12px] leading-6 text-slate-600">
                  {evaluationSupport}
                </p>
                <div className="mt-4 flex h-14 items-end gap-1.5 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  {((hasFormalEvaluation || hasBaselineEvaluation) && accuracyTrail.length ? accuracyTrail : [0.18, 0.22, 0.2, 0.24, 0.21, 0.26]).map((value, index) => (
                    <div
                      key={`accuracy-${index}-${value}`}
                      className={`min-w-0 flex-1 rounded-t-full ${hasFormalEvaluation || hasBaselineEvaluation ? 'bg-[linear-gradient(180deg,#0f172a,#38bdf8)]' : 'bg-slate-200'}`}
                      style={{ height: `${Math.max(8, Math.round(value * 100))}%`, opacity: hasFormalEvaluation || hasBaselineEvaluation ? 0.42 + index / Math.max(accuracyTrail.length || 1, 1) * 0.45 : 0.55 }}
                      title={hasFormalEvaluation || hasBaselineEvaluation ? `命中率 ${formatPercent(value)}` : '等待正式计分'}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium tracking-[0.1em] text-slate-400">题池滚动</p>
                  <span className="text-[11px] text-slate-400">
                    待结算 {livebenchSummary?.current_question_count || questionTicker.length} 题
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 px-2 py-2">
                    <p className="text-[11px] text-slate-400">跟踪</p>
                    <p className="text-sm font-semibold text-slate-900">{livebenchSummary?.current_question_count || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-2 py-2">
                    <p className="text-[11px] text-slate-400">已结算</p>
                    <p className="text-sm font-semibold text-slate-900">{livebenchSummary?.resolved_question_count || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-2 py-2">
                    <p className="text-[11px] text-slate-400">待核票</p>
                    <p className="text-sm font-semibold text-slate-900">{livebenchSummary?.settlement_pending_count || 0}</p>
                  </div>
                </div>
                <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
                  {questionTicker.length > 0 ? questionTicker.map((snapshot) => (
                    <article key={`ticker-${snapshot.question.question_id}`} className="rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-500">
                          {arenaTopicLabel(snapshot.question.topic_bucket)}
                        </span>
                        <span className="text-[11px] text-slate-400">{arenaResolveTime(snapshot)}</span>
                      </div>
                      <p className="line-clamp-2 text-[12px] font-medium leading-6 text-slate-900">
                        {arenaQuestionPrompt(snapshot)}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        {snapshot.xia_votes.length} 个虾已参与，讨论 {arenaDiscussionCount(snapshot)} 条。
                      </p>
                    </article>
                  )) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-4 text-[12px] leading-6 text-slate-500">
                      当前没有待滚动的问题。
                    </div>
                  )}
                </div>
              </section>
            </CardContent>
          </Card>
        </section>

      </div>
    </main>
  );
}
