import fs from 'node:fs/promises';
import path from 'node:path';

import { readWorldApiSnapshot } from '@/lib/world/api-snapshot';
import type { LiveBenchEvaluation, LiveBenchQuestionPreview, WorldSignal } from '@/lib/world/types';

import XiaForecastDemoClient, { type XiaForecastDemoData } from './xia-forecast-demo-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CACHE_TIMEOUT_MS = 9000;
const SNAPSHOT_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const WORLD_SIGNAL_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-signal-cache.json');
const LATEST_WORLD_STATE_FILE = path.join(process.cwd(), '.cache', 'latest-world-state.json');

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), CACHE_TIMEOUT_MS);
    }),
  ]);
}

function cleanText(value?: string | null, maxLength = 180) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/我现在偏向赞成/gu, '当前偏向赞成')
    .replace(/我现在偏向不赞成/gu, '当前偏向不赞成')
    .replace(/我现在更看重的是/gu, '当前更需要核对')
    .replace(/会发生吗？$/u, '')
    .replace(/会发生吗\?$/u, '')
    .replace(/^Will\s+/iu, '')
    .replace(/\s+会发生吗[？?]?$/u, '')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function sceneLabel(scene?: string | null) {
  if (scene === 'tech-ai' || scene === 'technology') return 'AI';
  if (scene === 'war') return '地缘';
  if (scene === 'finance') return '市场';
  if (scene === 'health') return '公共卫生';
  return '世界';
}

function signalCategory(signal: { source_name?: string | null; scene?: string | null; tags?: string[] | null }) {
  const haystack = [signal.source_name, signal.scene, ...(signal.tags || [])].join(' ').toLowerCase();
  if (/aihot|ai hot|openai|anthropic|claude|gemini|model|agent|ai/.test(haystack)) return 'AI 前沿 / AI';
  if (/world monitor|guardian|npr|war|conflict|shunyanet/.test(haystack)) return 'World Monitor';
  if (/wechat|rss|feed/.test(haystack)) return 'RSS / 公众号';
  return '已接入信源';
}

type DashboardSignal = Record<string, unknown>;

type DemoSourceStatus = {
  signal_count?: number;
  indexed_signal_count?: number;
  source_health?: {
    stable_source_count?: number;
    watchlist_source_count?: number;
    blocked_or_unknown_source_count?: number;
  };
};

type DemoDashboardState = {
  metrics?: { active_signal_count?: number };
  source_health?: {
    stable_source_count?: number;
    watchlist_source_count?: number;
    blocked_or_unknown_source_count?: number;
  };
  top_signals?: DashboardSignal[];
  knowledge_signals?: DashboardSignal[];
};

type SignalCachePayload = {
  signals?: WorldSignal[];
};

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function normalizeSignal(input: DashboardSignal | WorldSignal, index: number): XiaForecastDemoData['signals'][number] {
  const signal = input as DashboardSignal;
  const displayTitle = String(signal.display_title || signal.displayTitle || signal.title || '');
  const displaySummary = String(signal.display_summary || signal.displaySummary || signal.summary || signal.urgency_reason || signal.urgencyReason || '');
  const sourceName = String(signal.source_name || signal.sourceName || '已接入信源');
  const publishedAt = String(signal.published_at || signal.publishedAt || '');
  const relevance = Number(signal.relevance_score || signal.relevanceScore || signal.hotspot_score || signal.hotspotScore || 0.55) || 0.55;
  return {
    id: String(signal.id || `signal-${index}`),
    title: cleanText(displayTitle, 88),
    summary: cleanText(displaySummary, 160),
    source: cleanText(sourceName, 42),
    category: signalCategory({
      source_name: sourceName,
      scene: typeof signal.scene === 'string' ? signal.scene : null,
      tags: Array.isArray(signal.tags) ? signal.tags.map(String) : [],
    }),
    scene: sceneLabel(typeof signal.scene === 'string' ? signal.scene : null),
    time: publishedAt,
    strength: Math.max(36, Math.min(98, Math.round(relevance * 100))),
  };
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildSignals(techState: DemoDashboardState | null, geoState: DemoDashboardState | null, signalCache: SignalCachePayload | null) {
  const raw = [
    ...(signalCache?.signals || [])
      .filter((signal) => signal.title && signal.summary)
      .sort(
        (left, right) =>
          (right.relevanceScore || right.hotspotScore || 0) - (left.relevanceScore || left.hotspotScore || 0) ||
          new Date(right.publishedAt || 0).getTime() - new Date(left.publishedAt || 0).getTime(),
      )
      .slice(0, 16),
    ...(techState?.top_signals || []).slice(0, 9),
    ...(techState?.knowledge_signals || []).slice(0, 4),
    ...(geoState?.top_signals || []).slice(0, 8),
    ...(geoState?.knowledge_signals || []).slice(0, 3),
  ];
  return dedupeById(raw.map(normalizeSignal)).slice(0, 18);
}

function buildSourceStats(
  techState: DemoDashboardState | null,
  geoState: DemoDashboardState | null,
  signalCache: SignalCachePayload | null,
  sourceStatus: DemoSourceStatus | null,
) {
  const sourceHealth = sourceStatus?.source_health || techState?.source_health || geoState?.source_health || null;
  const signals = [...(techState?.top_signals || []), ...(geoState?.top_signals || [])];
  const cacheSignals = (signalCache?.signals || []).map((signal) => ({
    source_name: signal.sourceName,
    scene: signal.scene,
    tags: signal.tags,
  }));
  const categories = new Map<string, number>();
  for (const signal of [...cacheSignals, ...signals]) {
    const category = signalCategory(signal);
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  return {
    stable: sourceHealth?.stable_source_count || 0,
    watchlist: sourceHealth?.watchlist_source_count || 0,
    blocked: sourceHealth?.blocked_or_unknown_source_count || 0,
    activeSignals:
      sourceStatus?.signal_count ||
      techState?.metrics?.active_signal_count ||
      geoState?.metrics?.active_signal_count ||
      signalCache?.signals?.length ||
      signals.length,
    categoryMix: Array.from(categories.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  };
}

function buildQuestions(previews: LiveBenchQuestionPreview[] | null) {
  return (previews || []).slice(0, 9).map((question, index) => ({
    id: question.question_id || `question-${index}`,
    title: cleanText(question.title, 96),
    topic: cleanText(question.topic_label || question.region_label || 'LiveBench', 28),
    status: question.status || 'active',
    resolveAt: question.resolve_at || '',
    evidenceCount: Number(question.evidence_count || 0),
    discussionCount: Number(question.discussion_count || 0),
    xiaCount: Number(question.xia_count || 0),
    moderatorLine: cleanText(question.moderator_line || question.background, 180),
  }));
}

function buildEvaluation(evaluation: LiveBenchEvaluation | null) {
  const platform = evaluation?.platform_model || null;
  const firstScorecard = evaluation?.participant_scorecards?.[0] || null;
  const compactHistory = (evaluation?.history_series || []).slice(-12);
  const dateLabels = compactHistory.map((point) =>
    point.resolved_at ? new Date(point.resolved_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '',
  );
  const hasDuplicateDate = new Set(dateLabels.filter(Boolean)).size < dateLabels.filter(Boolean).length;
  const history = compactHistory
    .map((point, index) => ({
      label: hasDuplicateDate
        ? `R${index + 1}`
        : point.resolved_at
          ? new Date(point.resolved_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
          : `${index + 1}`,
      brier: Number(point.avg_brier || 0),
      hit: Number(point.hit_rate || 0),
    }));
  return {
    currentQuestionCount: platform?.current_question_count || platform?.open_question_count || 0,
    resolvedQuestionCount: platform?.resolved_question_count || 0,
    avgBrier: platform?.avg_brier ?? null,
    hitRate: platform?.hit_rate ?? null,
    formalAvgBrier: platform?.formal_avg_brier ?? firstScorecard?.avg_brier_score ?? null,
    formalHitRate: platform?.formal_hit_rate ?? firstScorecard?.hit_rate ?? null,
    scorecardLabel: firstScorecard?.label || 'Hermes / MiniMax',
    scorecardVotes: firstScorecard?.vote_count || 0,
    history,
  };
}

export default async function XiaForecastDemoPage() {
  const [latestState, signalCache, sourceStatus, questions, evaluation] = await Promise.all([
    withTimeout(readJsonFile<DemoDashboardState>(LATEST_WORLD_STATE_FILE), null),
    withTimeout(readJsonFile<SignalCachePayload>(WORLD_SIGNAL_CACHE_FILE), null),
    withTimeout(readWorldApiSnapshot<DemoSourceStatus>('global', 'source_status', SNAPSHOT_MAX_AGE_MS), null),
    withTimeout(readWorldApiSnapshot<LiveBenchQuestionPreview[]>('global', 'livebench_questions', SNAPSHOT_MAX_AGE_MS), []),
    withTimeout(readWorldApiSnapshot<LiveBenchEvaluation>('global', 'livebench_evaluation', SNAPSHOT_MAX_AGE_MS), null),
  ]);
  const techState = latestState;
  const geoState = latestState;

  const data: XiaForecastDemoData = {
    generatedAt: new Date().toISOString(),
    signals: buildSignals(techState, geoState, signalCache),
    sourceStats: buildSourceStats(techState, geoState, signalCache, sourceStatus),
    questions: buildQuestions(questions),
    evaluation: buildEvaluation(evaluation),
  };

  return <XiaForecastDemoClient data={data} />;
}
