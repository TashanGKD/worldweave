import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

import { resolvePublicSkillUrl } from '@/lib/request-origin';

import { readWorldApiSnapshot } from './api-snapshot';
import type {
  LiveBenchEvaluation,
  LiveBenchPlatformModelSummary,
  LiveQuestionPlatform,
  LiveBenchQuestionDetail as _LiveBenchQuestionDetail,
  LiveBenchQuestionPreview,
  LiveBenchArenaState,
  MissionMode,
  WorldBriefing,
  WorldDashboardAction,
  WorldDashboardLiveBenchSummary,
  WorldDashboardSourceRefreshSummary,
  WorldDisplayLevel,
  WorldEvidenceSignal,
  WorldKnowledgeSignal,
  WorldMarketLeaderboardEntry,
  WorldMarketMover,
  WorldMarketSnapshot,
  WorldMarketStock,
  WorldNodeActivity,
  WorldProjection,
  WorldProjectionLink,
  WorldReport,
  WorldScene,
  WorldSignal,
  WorldSourceCatalog,
  WorldSourceKnowledgeState,
  WorldSourceIntakeStats,
  WorldSourceReliability,
  WorldThreadRelation,
  WorldValidationMemoryItem,
  WorldValidationStatus,
  WorldValidationSummary,
  WorldStateMetrics,
  WorldStateNode,
  WorldTrailEdge,
  WorldTrail,
} from './types';
import {
  buildLiveBenchEvaluationFromArena,
  buildLiveBenchQuestionPreviewFromSnapshot,
  buildLiveBenchArenaState,
  getCachedLiveBenchQuestionDetail,
  getCachedLiveBenchQuestionPreviews,
  getLiveBenchParticipantRoster,
  getLiveBenchEvaluation,
  getLiveBenchEvaluationFromStore,
  getLiveBenchQuestionDetail,
  getLiveBenchQuestionDetailFromStore,
  listLiveBenchQuestionPreviewsFromStore,
  listLiveBenchQuestionPreviews,
  syncLiveBenchQuestions,
  toPublicLiveBenchArenaState,
  withLiveBenchRemoteModelRefresh,
} from './livebench';
import { persistWorldSourceMonitorSnapshot } from './source-monitor-db';
import { getWorldSourceKnowledgeState, syncWorldSourceKnowledgeState } from './source-knowledge';
import { clearSourceCatalogCache, loadRuntimeCatalogSources, loadSourceCatalog } from './source-catalog';
import { buildSignalNormalizationPromptPrefix, sanitizeSignalNormalization, type SignalNormalization } from './signal-normalization';
import { filterLowInformationSourceRows, isSourceSnapshotLikeSignal } from './signal-quality';
import { isAseanSignal } from './asean-topic';
import type { RuntimeCatalogSource } from './source-catalog';

type SignalRow = {
  id: string;
  title: string | null;
  description: string | null;
  source_name: string | null;
  source_url: string | null;
  event_time: string | null;
  created_at: string | null;
  location: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  severity: number | null;
  relevance_score: number | null;
  tags: string[] | null;
  alignment_tags?: string[] | null;
  intensity?: number | null;
  mention_count?: number | null;
  urgency_reason?: string | null;
  last_seen_at: string | null;
  external_id?: string | null;
  source_type?: string | null;
  source_feed_name?: string | null;
  content_md?: string | null;
};

type EventClusterResult = {
  rows: SignalRow[];
  clusterCount: number;
  collapsedCount: number;
};

type RawWorldMonitorItem = Record<string, unknown>;

type SignalAlignment = SignalNormalization;

type ExternalFetchHealth = {
  failCount: number;
  cooldownUntil: number;
  lastError: string;
  lastFailedAt: number;
  lastSucceededAt?: number;
};

type SignalCachePayload = {
  version: number;
  expiresAt: number;
  signals: WorldSignal[];
  sourceIntakeStats?: WorldSourceIntakeStats | null;
};

type WorldDashboardSubworldSummary = {
  key: WorldScene;
  title: string;
  summary: string;
  signal_count: number;
  matched_tags: string[];
  recommended_bundles: Array<{
    name: string;
    note: string;
    source_count: number;
  }>;
};

type WorldDashboardStatePayload = {
  generated_at: string;
  scene: WorldScene;
  dashboard_kind: 'world-dashboard';
  metrics: WorldStateMetrics;
  source_health: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    note: string;
  };
  nodes: WorldStateNode[];
  graph_signals: WorldEvidenceSignal[];
  top_signals: WorldEvidenceSignal[];
  knowledge_signals: WorldKnowledgeSignal[];
  skill_entry: ReturnType<typeof buildOpenClawSkillEntry> | null;
  world_view_summary: {
    title: string;
    summary: string;
    updated_at: string;
  } | null;
  pending_question_previews: LiveBenchQuestionPreview[];
  resolved_question_previews: LiveBenchQuestionPreview[];
  evaluation_summary: LiveBenchPlatformModelSummary | null;
  source_refresh_summary: WorldDashboardSourceRefreshSummary | null;
  livebench_summary: WorldDashboardLiveBenchSummary | null;
  what_to_do_next: string[];
  quick_links: WorldDashboardAction[];
};

type WorldDashboardSnapshotPayload = {
  version: number;
  saved_at: string;
  subworlds: WorldDashboardSubworldSummary[];
  states: Partial<Record<WorldScene, WorldDashboardStatePayload>>;
};

const LIVEBENCH_PAGE_TIMEOUT_MS = 20000;
let dashboardSnapshotWriteQueue: Promise<void> = Promise.resolve();

type RuntimeHistoryPayload = {
  reports: WorldReport[];
  missions: Array<{ missionId: string; briefing: WorldBriefing; createdAt: number }>;
  xiaTrails: Array<{
    xiaId: string;
    signalId: string;
    region: string;
    lat: number | null;
    lng: number | null;
    updatedAt: number;
  }>;
  regionHistory: Array<[string, number]>;
  topicHistory: Array<[string, number]>;
  lastCoverageAt: Array<[string, number]>;
};

export type ReportDraftInput = Partial<
  Pick<
    WorldReport,
    | 'past_report'
    | 'current_analysis'
    | 'future_projection'
    | 'summary'
    | 'inference'
    | 'report_kind'
    | 'report_kind_note'
    | 'why_now'
    | 'watch_next'
    | 'signal_stage'
    | 'brake_line'
    | 'question_now'
    | 'what_changes_my_mind'
    | 'handoff_to_next_agent'
    | 'for_your_human'
    | 'thread_parent_report_id'
    | 'thread_relation'
    | 'validation_target_report_ids'
    | 'projection_links'
  >
> & {
    facts?: string[];
    projection?: WorldProjection[];
    confidence?: number;
    invalidators?: string[];
  };

export type ValidationUpdateInput = {
  report_id: string;
  status: 'pending' | 'confirmed' | 'falsified';
  note?: string;
};

function compactStringList(values: Array<string | null | undefined>, limit = 6): string[] {
  return values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .slice(0, limit);
}

function extractCodeFenceBodies(content: string): string[] {
  const bodies: string[] = [];
  const pattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(content)) !== null) {
    const body = normalizeText(match[1]);
    if (body) {
      bodies.push(body);
    }
  }
  return bodies;
}

function extractFirstBalancedJsonValue(content: string): string | null {
  for (let start = 0; start < content.length; start += 1) {
    const opener = content[start];
    if (opener !== '{' && opener !== '[') {
      continue;
    }

    const stack: string[] = [opener];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < content.length; index += 1) {
      const char = content[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }

      if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) {
          break;
        }
        stack.pop();
        if (stack.length === 0) {
          return content.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function buildMiniMaxJsonCandidates(content: string): string[] {
  const candidates = new Set<string>();
  const trimmed = normalizeText(content);
  if (trimmed) {
    candidates.add(trimmed);
  }

  for (const body of extractCodeFenceBodies(content)) {
    candidates.add(body);
  }

  const current = [...candidates];
  for (const candidate of current) {
    const balanced = extractFirstBalancedJsonValue(candidate);
    if (balanced) {
      candidates.add(normalizeText(balanced));
    }
  }

  return [...candidates].filter(Boolean);
}

function parseMiniMaxJsonPayload<T>(content: string): T {
  let lastError: Error | null = null;
  for (const candidate of buildMiniMaxJsonCandidates(content)) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('No JSON payload found in MiniMax response');
}

function parseMiniMaxJsonLines<T extends object>(content: string): T[] {
  const parsed: T[] = [];
  for (const rawLine of content.split(/\n+/)) {
    const line = rawLine.trim().replace(/^```(?:json)?|```$/g, '');
    if (!line || !line.startsWith('{') || !line.endsWith('}')) {
      continue;
    }
    parsed.push(JSON.parse(line) as T);
  }
  return parsed;
}

function firstArrayField<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as T[];
    }
  }
  const fallback = Object.values(record).find((item) => Array.isArray(item));
  return Array.isArray(fallback) ? (fallback as T[]) : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MiniMaxChatRequest = {
  system: string;
  prompt?: string;
  promptPrefix?: string;
  promptData?: string;
  temperature: number;
  timeoutMs?: number;
  retryLimit?: number;
  backoffMs?: number;
  requestLabel: string;
};

export type WorldDailyCurationCandidate = {
  id: string;
  rank: number;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  score: number;
  tags: string[];
};

export type WorldDailyCurationItem = {
  id: string;
  displayTitle: string;
  displaySummary: string;
};

type WorldDailyCurationInput = {
  kind: 'geo' | 'ai';
  generatedAt?: string | null;
  limit?: number;
  candidates: WorldDailyCurationCandidate[];
};

type WorldDailyCurationCache = {
  key: string;
  generated_at: string;
  selected_items: WorldDailyCurationItem[];
};

function resolveMiniMaxApiKey(): string {
  return (process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
}

function resolveMiniMaxApiStyle(): 'anthropic' | 'openai-completions' {
  const raw = (process.env.MINIMAX_API_STYLE || process.env.MINIMAX_API || 'openai-completions').trim().toLowerCase();
  if (raw === 'openai-completions' || raw === 'openai' || raw === 'chat-completions') {
    return 'openai-completions';
  }
  return 'anthropic';
}

function resolveMiniMaxBaseUrl(): string {
  return (
    process.env.MINIMAX_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.scnet.cn/api/llm/v1'
  ).replace(/\/$/, '');
}

type MiniMaxMessageContentBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

let miniMaxClient: Anthropic | null = null;
const MINIMAX_API_STYLE = resolveMiniMaxApiStyle();

function getMiniMaxClient(): Anthropic | null {
  const apiKey = resolveMiniMaxApiKey();
  if (!apiKey || MINIMAX_API_STYLE !== 'anthropic') {
    return null;
  }

  if (!miniMaxClient) {
    miniMaxClient = new Anthropic({
      apiKey,
      baseURL: MINIMAX_BASE_URL,
      defaultHeaders: {
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
    });
  }

  return miniMaxClient;
}

type OpenAICompatibleChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      reasoning?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

async function requestOpenAICompatibleChatCompletion({
  system,
  prompt,
  promptPrefix,
  promptData,
  temperature,
  timeoutMs,
}: MiniMaxChatRequest): Promise<string> {
  const apiKey = resolveMiniMaxApiKey();
  const userText = [promptPrefix?.trim(), promptData?.trim(), prompt?.trim()].filter(Boolean).join('\n\n').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 4096,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(body || `HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const payload = (await response.json()) as OpenAICompatibleChatResponse;
    const message = payload.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }
    if (Array.isArray(content)) {
      const text = content
        .map((block) => (typeof block?.text === 'string' ? block.text : ''))
        .filter(Boolean)
        .join('\n');
      if (text.trim()) {
        return text;
      }
    }
    if (typeof message?.reasoning_content === 'string') {
      return message.reasoning_content;
    }
    if (typeof message?.reasoning === 'string') {
      return message.reasoning;
    }
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function requestMiniMaxChatCompletion({
  system,
  prompt,
  promptPrefix,
  promptData,
  temperature,
  timeoutMs = MINIMAX_DEFAULT_TIMEOUT_MS,
  retryLimit = MINIMAX_DEFAULT_RETRY_LIMIT,
  backoffMs = MINIMAX_DEFAULT_BACKOFF_MS,
  requestLabel,
}: MiniMaxChatRequest): Promise<string | null> {
  if (!isBatchModelRefreshAllowed()) {
    return null;
  }
  const client = getMiniMaxClient();
  if (MINIMAX_API_STYLE !== 'openai-completions' && !client) {
    return null;
  }

  const userContent: MiniMaxMessageContentBlock[] = [];
  if (promptPrefix?.trim()) {
    userContent.push({
      type: 'text',
      text: promptPrefix.trim(),
      cache_control: { type: 'ephemeral' },
    });
  }
  if (promptData?.trim()) {
    userContent.push({
      type: 'text',
      text: promptData.trim(),
    });
  }
  if (prompt?.trim() && userContent.length === 0) {
    userContent.push({
      type: 'text',
      text: prompt.trim(),
    });
  }
  if (userContent.length === 0) {
    return null;
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      if (MINIMAX_API_STYLE === 'openai-completions') {
        return await requestOpenAICompatibleChatCompletion({
          system,
          prompt,
          promptPrefix,
          promptData,
          temperature,
          timeoutMs,
          retryLimit,
          backoffMs,
          requestLabel,
        });
      }

      const payload = await client!.messages.create(
        {
          model: MINIMAX_MODEL,
          max_tokens: 4096,
          temperature,
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: userContent }],
        },
        {
          timeout: timeoutMs,
        },
      );

      const usage = payload.usage as
        | {
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          }
        | undefined;
      if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
        console.log(
          `[MiniMax] ${requestLabel} cache write=${usage.cache_creation_input_tokens || 0} read=${usage.cache_read_input_tokens || 0}`,
        );
      }
      const textBlock = payload.content.find((block) => block.type === 'text');
      return textBlock?.text || '';
    } catch (error) {
      const maybeStatus =
        typeof error === 'object' && error && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
          ? ((error as { status: number }).status)
          : null;
      lastError = error instanceof Error ? error.message : String(error);
      if (maybeStatus !== null) {
        lastError = `status ${maybeStatus}: ${lastError}`;
      }
      if (attempt < retryLimit && maybeStatus !== null && MINIMAX_RETRYABLE_STATUS.has(maybeStatus)) {
          const delayMs = backoffMs * (attempt + 1) + Math.round(Math.random() * 400);
          console.warn(`[MiniMax] ${requestLabel} failed (${maybeStatus}), retrying in ${delayMs}ms`);
          await sleep(delayMs);
          continue;
      }
      if (attempt < retryLimit) {
        const delayMs = backoffMs * (attempt + 1) + Math.round(Math.random() * 400);
        console.warn(`[MiniMax] ${requestLabel} error (${lastError}), retrying in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }
      if (maybeStatus !== null) {
        console.warn(`[MiniMax] ${requestLabel} failed:`, maybeStatus);
        return null;
      }
    }
  }

  if (lastError) {
    console.warn(`[MiniMax] ${requestLabel} failed after retries:`, lastError);
  }
  return null;
}

function worldDailyCurationCachePath(kind: 'geo' | 'ai') {
  return path.join(process.cwd(), '.cache', `world-daily-curation-${kind}.json`);
}

function worldDailyCurationKey(input: WorldDailyCurationInput) {
  const hash = crypto.createHash('sha256');
  hash.update(input.kind);
  hash.update(input.generatedAt || '');
  hash.update(String(input.limit || 10));
  for (const item of input.candidates) {
    hash.update(JSON.stringify({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      publishedAt: item.publishedAt,
    }));
  }
  return hash.digest('hex');
}

function cleanWorldDailyCurationText(value: unknown, fallback: string, maxLength: number): string {
  const cleaned = cleanDisplayText(normalizeText(typeof value === 'string' ? value : ''))
    .replace(/^(标题|摘要|summary|title)[:：]\s*/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const selected = cleaned || cleanDisplayText(fallback);
  const chars = Array.from(selected);
  if (chars.length <= maxLength) return selected;
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join('').replace(/[，。；、,.!?！？;:：-]+$/u, '').trim()}…`;
}

function parseWorldDailyCurationItems(
  content: string,
  candidatesById: Map<string, WorldDailyCurationCandidate>,
  limit: number,
): WorldDailyCurationItem[] {
  const parsed = parseMiniMaxJsonPayload<{
    selected_ids?: unknown;
    ids?: unknown;
    items?: Array<string | {
      id?: unknown;
      signal_id?: unknown;
      display_title?: unknown;
      title?: unknown;
      display_summary?: unknown;
      summary?: unknown;
    }>;
  }>(content);
  const rawItems = Array.isArray(parsed.selected_ids)
    ? parsed.selected_ids
    : Array.isArray(parsed.ids)
      ? parsed.ids
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
  const items: WorldDailyCurationItem[] = [];
  for (const item of rawItems) {
    const id = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && typeof item.id === 'string'
        ? item.id
        : item && typeof item === 'object' && typeof item.signal_id === 'string'
          ? item.signal_id
          : '';
    const candidate = candidatesById.get(id);
    if (!id || !candidate || items.some((selected) => selected.id === id)) continue;
    const displayTitle = typeof item === 'object' && item
      ? cleanWorldDailyCurationText(
          (item as { display_title?: unknown; title?: unknown }).display_title ?? (item as { title?: unknown }).title,
          candidate.title,
          58,
        )
      : cleanWorldDailyCurationText('', candidate.title, 58);
    const displaySummary = typeof item === 'object' && item
      ? cleanWorldDailyCurationText(
          (item as { display_summary?: unknown; summary?: unknown }).display_summary ?? (item as { summary?: unknown }).summary,
          candidate.summary,
          96,
        )
      : cleanWorldDailyCurationText('', candidate.summary, 96);
    items.push({ id, displayTitle, displaySummary });
    if (items.length >= limit) break;
  }
  return items;
}

export async function curateWorldDailySignals(input: WorldDailyCurationInput): Promise<WorldDailyCurationItem[]> {
  const limit = Math.min(Math.max(Math.floor(input.limit || 10), 1), 10);
  const candidates = input.candidates.filter((item) => item.id && item.title).slice(0, 30);
  if (candidates.length === 0 || !resolveMiniMaxApiKey()) return [];

  const key = worldDailyCurationKey({ ...input, limit, candidates });
  const cachePath = worldDailyCurationCachePath(input.kind);
  const cached = await readRuntimeJson<WorldDailyCurationCache>(cachePath);
  if (cached?.key === key && Array.isArray(cached.selected_items)) {
    const candidateIds = new Set(candidates.map((item) => item.id));
    return cached.selected_items.filter((item) => candidateIds.has(item.id)).slice(0, limit);
  }

  const candidatesById = new Map(candidates.map((item) => [item.id, item]));
  const content = await withWorldBatchModelRefresh(() =>
    requestMiniMaxChatCompletion({
      system: [
        '你是 WorldWeave 的日报编辑。',
        `你会收到已经按分数排好的一批候选，请整体看一遍，合并重复、近似重复或同一事件的条目，最后选出不超过 ${limit} 条用于日报图片和页面。`,
        '只返回 JSON，不要解释。格式：{"items":[{"id":"id1","display_title":"整理后的标题","display_summary":"整理后的摘要"}]}。',
        'items 里的 id 必须全部来自候选 id，不能编造。重复或同一事件只保留最具体、来源更清楚、摘要信息量更高的一条。',
        '同时修正明显的格式和内容问题：去掉模板腔、编号残留、重复前缀、截断符、机翻痕迹和不通顺句子；不要新增候选里没有的事实。',
        'display_title 要短、具体、可放进日报图片；display_summary 用一句中文说明这条为什么值得看。',
        input.kind === 'ai'
          ? 'AI 日报要兼顾模型、产品、Agent、开源、论文、算力与产业变化；同一公司同一动作不要重复上榜。'
          : '主世界日报要兼顾冲突、外交、公共安全和区域风险；同一地点同一事件不要重复上榜。',
      ].join('\n'),
      promptData: JSON.stringify({
        kind: input.kind,
        limit,
        candidates: candidates.map((item) => ({
          id: item.id,
          rank: item.rank,
          title: item.title,
          summary: item.summary,
          source: item.source,
          published_at: item.publishedAt,
          score: Number(item.score.toFixed(4)),
          tags: item.tags.slice(0, 8),
        })),
      }),
      temperature: 0.1,
      timeoutMs: WORLD_DAILY_CURATION_TIMEOUT_MS,
      retryLimit: 0,
      requestLabel: `daily-curation-${input.kind}`,
    }),
  );
  if (!content) return [];

  try {
    const selectedItems = parseWorldDailyCurationItems(content, candidatesById, limit);
    if (selectedItems.length > 0) {
      await writeRuntimeJson(cachePath, {
        key,
        generated_at: new Date().toISOString(),
        selected_items: selectedItems,
      } satisfies WorldDailyCurationCache);
    }
    return selectedItems;
  } catch (error) {
    console.warn('[daily] model curation parse failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function buildDraftProjection(
  draft: ReportDraftInput,
  fallback: WorldProjection[],
  currentAnalysis: string,
  futureProjection: string,
): WorldProjection[] {
  if (Array.isArray(draft.projection) && draft.projection.length > 0) {
    return draft.projection
      .map((item) => ({
        title: normalizeText(item.title) || '后面要看什么',
        summary: normalizeText(item.summary) || futureProjection,
        confidence: clamp(typeof item.confidence === 'number' ? item.confidence : 0.45, 0.05, 0.98),
        assumptions: compactStringList(item.assumptions || [], 4),
        invalidators: compactStringList(item.invalidators || draft.invalidators || [], 4),
      }))
      .filter((item) => item.summary);
  }

  if (futureProjection) {
    return [
      {
        title: fallback[0]?.title || '后面要看什么',
        summary: futureProjection,
        confidence: clamp(typeof draft.confidence === 'number' ? draft.confidence : fallback[0]?.confidence || 0.45, 0.05, 0.98),
        assumptions: compactStringList(fallback[0]?.assumptions || [currentAnalysis], 4),
        invalidators: compactStringList(draft.invalidators || fallback[0]?.invalidators || [], 4),
      },
    ];
  }

  return fallback;
}

function mergeReportDraft(baseReport: WorldReport, draft?: ReportDraftInput): WorldReport {
  if (!draft) {
    return baseReport;
  }

  const pastReport = normalizeText(draft.past_report) || baseReport.past_report;
  const currentAnalysis = normalizeText(draft.current_analysis) || baseReport.current_analysis;
  const futureProjection = normalizeText(draft.future_projection) || baseReport.future_projection;
  const facts = compactStringList(draft.facts || baseReport.facts, 8);
  const projection = buildDraftProjection(draft, baseReport.projection, currentAnalysis, futureProjection);
  const invalidators = compactStringList(
    draft.invalidators || projection.flatMap((item) => item.invalidators) || baseReport.invalidators,
    6,
  );
  const confidence =
    typeof draft.confidence === 'number'
      ? clamp(draft.confidence, 0.05, 0.98)
      : projection.length > 0
        ? Number(
            clamp(
              projection.reduce((sum, item) => sum + item.confidence, 0) / projection.length,
              0.05,
              0.98,
            ).toFixed(2),
          )
        : baseReport.confidence;

  return rewriteLegacyReportVoice({
    ...baseReport,
    question_now: normalizeText(draft.question_now) || baseReport.question_now,
    what_changes_my_mind: normalizeText(draft.what_changes_my_mind) || invalidators[0] || baseReport.what_changes_my_mind,
    handoff_to_next_agent: normalizeText(draft.handoff_to_next_agent) || baseReport.handoff_to_next_agent,
    for_your_human: normalizeText(draft.for_your_human) || baseReport.for_your_human,
    thread_parent_report_id: draft.thread_parent_report_id ?? baseReport.thread_parent_report_id ?? null,
    thread_relation: draft.thread_relation ?? baseReport.thread_relation ?? null,
    validation_target_report_ids: draft.validation_target_report_ids ?? baseReport.validation_target_report_ids ?? null,
    projection_links: draft.projection_links ?? baseReport.projection_links ?? inferProjectionLinks(baseReport),
    past_report: pastReport,
    current_analysis: currentAnalysis,
    future_projection: futureProjection,
    summary: normalizeText(draft.summary) || currentAnalysis || baseReport.summary,
    inference: normalizeText(draft.inference) || currentAnalysis || baseReport.inference,
    report_kind: normalizeText(draft.report_kind) || baseReport.report_kind,
    report_kind_note: normalizeText(draft.report_kind_note) || baseReport.report_kind_note,
    why_now: normalizeText(draft.why_now) || currentAnalysis || baseReport.why_now,
    watch_next: normalizeText(draft.watch_next) || futureProjection || baseReport.watch_next,
    signal_stage: normalizeText(draft.signal_stage) || baseReport.signal_stage,
    brake_line: normalizeText(draft.brake_line) || invalidators[0] || baseReport.brake_line,
    facts: facts.length > 0 ? facts : baseReport.facts,
    projection,
    invalidators: invalidators.length > 0 ? invalidators : baseReport.invalidators,
    confidence,
  });
}

const FALLBACK_SIGNAL_ROWS: SignalRow[] = [
  {
    id: 'fallback-iran-hormuz',
    title: 'Shipping insurers raise alerts around Hormuz corridor',
    description: 'Regional shipping signals and conflict coverage point to renewed pressure on transport and energy risk in the Gulf.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/hormuz',
    event_time: new Date(Date.now() - 2 * 36e5).toISOString(),
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    location: 'Strait of Hormuz',
    country: 'Iran',
    latitude: 26.5667,
    longitude: 56.25,
    severity: 4,
    relevance_score: 0.92,
    tags: ['shipping', 'energy', 'geopolitics'],
    last_seen_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'fallback-ukraine-grid',
    title: 'Grid stability concerns intensify after overnight strikes in Ukraine',
    description: 'Fresh reports indicate infrastructure pressure and possible spillover to regional energy pricing and logistics.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/ukraine-grid',
    event_time: new Date(Date.now() - 5 * 36e5).toISOString(),
    created_at: new Date(Date.now() - 4 * 36e5).toISOString(),
    location: 'Kyiv',
    country: 'Ukraine',
    latitude: 50.45,
    longitude: 30.5236,
    severity: 4,
    relevance_score: 0.88,
    tags: ['infrastructure', 'war', 'energy'],
    last_seen_at: new Date(Date.now() - 2 * 36e5).toISOString(),
  },
  {
    id: 'fallback-gulf-oil',
    title: 'Oil traders watch Gulf routes for secondary supply shocks',
    description: 'Energy desks are pricing in the possibility that regional security alerts will affect crude and LNG expectations.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/gulf-oil',
    event_time: new Date(Date.now() - 3 * 36e5).toISOString(),
    created_at: new Date(Date.now() - 2 * 36e5).toISOString(),
    location: 'Doha',
    country: 'Qatar',
    latitude: 25.2854,
    longitude: 51.531,
    severity: 3,
    relevance_score: 0.84,
    tags: ['oil', 'lng', 'markets'],
    last_seen_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
  },
  {
    id: 'fallback-argentina-lithium',
    title: 'Lithium export logistics in Argentina draw less attention but remain strategically relevant',
    description: 'A low-heat signal with long-tail importance for battery supply chains and future commodity sensitivity.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/argentina-lithium',
    event_time: new Date(Date.now() - 9 * 36e5).toISOString(),
    created_at: new Date(Date.now() - 8 * 36e5).toISOString(),
    location: 'Salta',
    country: 'Argentina',
    latitude: -24.7821,
    longitude: -65.4232,
    severity: 2,
    relevance_score: 0.61,
    tags: ['supply-chain', 'battery', 'commodities'],
    last_seen_at: new Date(Date.now() - 7 * 36e5).toISOString(),
  },
  {
    id: 'fallback-singapore-rates',
    title: 'Regional desks in Singapore flag cautious positioning across Asia risk assets',
    description: 'A lower-severity financial signal suggesting broader market sensitivity rather than immediate crisis.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/singapore-rates',
    event_time: new Date(Date.now() - 7 * 36e5).toISOString(),
    created_at: new Date(Date.now() - 6 * 36e5).toISOString(),
    location: 'Singapore',
    country: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    severity: 2,
    relevance_score: 0.67,
    tags: ['finance', 'risk-assets', 'asia'],
    last_seen_at: new Date(Date.now() - 5 * 36e5).toISOString(),
  },
  {
    id: 'fallback-shenzhen-ai',
    title: 'Shenzhen suppliers accelerate AI server and accelerator board output',
    description: 'Production cadence and supplier chatter suggest near-term changes in hardware availability across the AI stack.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/shenzhen-ai',
    event_time: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    location: 'Shenzhen',
    country: 'China',
    latitude: 22.5431,
    longitude: 114.0579,
    severity: 3,
    relevance_score: 0.83,
    tags: ['ai', 'chips', 'servers', 'technology'],
    last_seen_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    id: 'fallback-vietnam-capacity',
    title: 'Assembly capacity in northern Vietnam expands for export electronics',
    description: 'Factory planning and supplier movement indicate a broader capacity shift that could matter for global production forecasts.',
    source_name: '世界脉络补位源',
    source_url: 'https://example.local/vietnam-capacity',
    event_time: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    location: 'Bac Ninh',
    country: 'Vietnam',
    latitude: 21.1861,
    longitude: 106.0763,
    severity: 3,
    relevance_score: 0.79,
    tags: ['manufacturing', 'capacity', 'electronics', 'supply-chain'],
    last_seen_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  },
];

type RuntimeStore = {
  reports: WorldReport[];
  regionHistory: Map<string, number>;
  topicHistory: Map<string, number>;
  lastCoverageAt: Map<string, number>;
  missions: Map<string, { briefing: WorldBriefing; createdAt: number }>;
  xiaTrails: Map<string, { signalId: string; region: string; lat: number | null; lng: number | null; updatedAt: number }>;
  localizedSignals: Map<string, { displayTitle: string; displaySummary: string; displayLocation: string; topicLabel: string }>;
  translatedSignals: Map<string, { displayTitle: string; displaySummary: string; displayLocation: string }>;
  signalAlignments: Map<string, SignalAlignment>;
  selectedSourceHealth: Map<string, ExternalFetchHealth>;
  publicAnchorHealth: Map<string, ExternalFetchHealth>;
  icArticleDetailCache: Map<string, { expiresAt: number; row: Partial<SignalRow> }>;
  translationsLoaded: boolean;
  translationsInFlight: boolean;
  alignmentsLoaded: boolean;
  alignmentsInFlight: boolean;
  graphMetadataBackfillLoaded: boolean;
  graphMetadataBackfillInFlight: boolean;
  historyLoaded: boolean;
  signalsCache: { expiresAt: number; signals: WorldSignal[] } | null;
  signalsRefreshInFlight: Promise<WorldSignal[]> | null;
  marketSnapshotCache: { expiresAt: number; snapshot: WorldMarketSnapshot } | null;
  marketSnapshotInFlight: Promise<WorldMarketSnapshot> | null;
  sourceIntakeStats: WorldSourceIntakeStats | null;
};

const HOTSPOT_RATIO = 0.7;
const EXPLORATION_RATIO = 0.3;
const DASHBOARD_TIMEZONE = 'Asia/Shanghai';
const REPORT_MEMORY_WINDOW_HOURS = 30 * 24;
const MISSION_TTL_HOURS = 24;
const MAX_STORED_MISSIONS = 240;
const MAX_STORED_REPORTS = 500;
const DEFAULT_WORLDLINE_ID = 'worldline-primary';
const DEFAULT_INFORMATION_COLLECTION_BASE_URL = '';
const MINIMAX_BASE_URL = resolveMiniMaxBaseUrl();
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'DeepSeek-V4-Flash';
const TRANSLATION_BATCH_SIZE = resolveRuntimeInteger('WORLD_TRANSLATION_BATCH_SIZE', 1, 1, 8);
const DASHBOARD_TRANSLATION_SYNC_LIMIT = resolveRuntimeInteger('WORLD_DASHBOARD_TRANSLATION_SYNC_LIMIT', 6, 1, 12);
const VISIBLE_TRANSLATION_BATCH_SIZE = resolveRuntimeInteger('WORLD_VISIBLE_TRANSLATION_BATCH_SIZE', 12, 1, 48);
const TRANSLATION_PRIME_LIMIT = resolveRuntimeInteger('WORLD_TRANSLATION_PRIME_LIMIT', 16, 0, 48);
const ALIGNMENT_BATCH_SIZE = resolveRuntimeInteger('WORLD_ALIGNMENT_BATCH_SIZE', 4, 1, 8);
const ALIGNMENT_PRIME_LIMIT = resolveRuntimeInteger('WORLD_ALIGNMENT_PRIME_LIMIT', 24, 0, 48);
const MINIMAX_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const MINIMAX_DEFAULT_TIMEOUT_MS = 35000;
const WORLD_DAILY_CURATION_TIMEOUT_MS = resolveRuntimeInteger('WORLD_DAILY_CURATION_TIMEOUT_MS', 30000, 5000, 120000);
const MINIMAX_DEFAULT_RETRY_LIMIT = 3;
const MINIMAX_DEFAULT_BACKOFF_MS = 1800;
const WORLD_VIEW_LIMIT = 120;
const GEO_POLITICS_VIEW_LIMIT = 120;
const GEO_POLITICS_FEED_LIMIT = 96;
const SIGNAL_CACHE_VERSION = 9;
const TRANSLATION_CACHE_VERSION = 2;
const DASHBOARD_SNAPSHOT_VERSION = 2;
const IC_ARTICLE_DETAIL_LIMIT = 8;
const IC_ARTICLE_DETAIL_CACHE_TTL_MS = 15 * 60 * 1000;
const PUBLIC_ANCHOR_TIMEOUT_MS = 20000;
const PUBLIC_ANCHOR_COOLDOWN_MS = 20 * 60 * 1000;
const PUBLIC_ANCHOR_COOLDOWN_THRESHOLD = 2;
const SELECTED_SOURCE_COOLDOWN_MS = 20 * 60 * 1000;
const SELECTED_SOURCE_COOLDOWN_THRESHOLD = 2;
const SOURCE_FEED_SOURCE_LIMIT = 3;
const AI_NEWS_RADAR_MAX_ITEMS = resolveRuntimeInteger('WORLD_AI_NEWS_RADAR_MAX_ITEMS', 36, 1, 100);
const AI_NEWS_RADAR_PER_SITE_LIMIT = resolveRuntimeInteger('WORLD_AI_NEWS_RADAR_PER_SITE_LIMIT', 6, 1, 20);
const CATALOG_SOURCE_FETCH_CONCURRENCY = resolveRuntimeInteger('WORLD_CATALOG_SOURCE_FETCH_CONCURRENCY', 2, 1, 64);
const CATALOG_SOURCE_REFRESH_BATCH_SIZE = resolveRuntimeInteger('WORLD_CATALOG_SOURCE_REFRESH_BATCH_SIZE', 48, 1, 1000);
const CATALOG_SOURCE_MAX_RESPONSE_BYTES = resolveRuntimeInteger('WORLD_CATALOG_SOURCE_MAX_RESPONSE_BYTES', 384 * 1024, 64 * 1024, 8 * 1024 * 1024);
const SIGNALS_CACHE_TTL_MS = 5 * 60 * 1000;
const MARKET_SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000;
const WEEKLY_PREDICTION_WINDOW_DAYS = 7;
const TRANSLATION_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-translation-cache.json');
const ALIGNMENT_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-alignment-cache.json');
const SIGNAL_CACHE_FILE = path.join(
  process.cwd(),
  '.cache',
  resolveRuntimeCacheFileName(process.env.WORLD_SIGNAL_CACHE_FILE, 'world-signal-cache.json'),
);
const CATALOG_SOURCE_CURSOR_FILE = path.join(process.cwd(), '.cache', 'world-catalog-source-cursor.json');
const DASHBOARD_SNAPSHOT_FILE = path.join(process.cwd(), '.cache', 'world-dashboard-snapshot.json');
const LATEST_WORLD_STATE_FILE = path.join(process.cwd(), '.cache', 'latest-world-state.json');
const SOURCE_REFRESH_STATUS_FILE = path.join(process.cwd(), '.cache', 'world-source-refresh-status.json');
const _DASHBOARD_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const API_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SOURCE_KNOWLEDGE_SYNC_DASHBOARD_TIMEOUT_MS = 15000;
const RUNTIME_HISTORY_FILE = path.join(process.cwd(), '.cache', 'world-runtime-history.json');
const batchModelRefreshContext = new AsyncLocalStorage<boolean>();
const RESEARCH_ROOT = path.join(process.cwd(), 'research');

function resolveRuntimeInteger(envKey: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[envKey]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), min), max);
}

function resolveRuntimeCacheFileName(raw: string | undefined, fallback: string): string {
  const candidate = raw?.trim();
  if (!candidate) return fallback;
  return path.basename(candidate);
}

async function readRuntimeJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function writeRuntimeJson(filePath: string, payload: unknown): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  } catch (error) {
    console.warn('[runtime] failed to persist runtime json:', error instanceof Error ? error.message : String(error));
  }
}

export function isWorldRuntimeHeavyRefreshEnabled(): boolean {
  return process.env.WORLD_WEB_ENABLE_HEAVY_REFRESH === '1' || process.env.WORLD_ENABLE_HEAVY_REFRESH === '1';
}

function isSampleSignalFallbackEnabled(): boolean {
  return process.env.WORLD_ALLOW_SAMPLE_SIGNALS === '1';
}

function isBatchModelRefreshAllowed(options?: { allowModelRefresh?: boolean }) {
  return (
    options?.allowModelRefresh === true ||
    batchModelRefreshContext.getStore() === true ||
    process.env.WORLD_ALLOW_BATCH_MODEL_REFRESH === '1'
  );
}

export function withWorldBatchModelRefresh<T>(fn: () => Promise<T>): Promise<T> {
  return batchModelRefreshContext.run(true, fn);
}
const SOURCE_SKILL_VALIDATION_DIR = path.join(RESEARCH_ROOT, 'source-skill-validation');
const MONITOR_SUMMARY_FILE = path.join(SOURCE_SKILL_VALIDATION_DIR, 'monitor-source-updates', 'latest-summary.json');
const SKILL_AGGREGATOR_INDEX_FILE = path.join(RESEARCH_ROOT, 'skill-aggregator-index.md');
const SOURCE_SKILL_CANDIDATES_FILE = path.join(RESEARCH_ROOT, 'source-skill-candidates.md');
const EXTERNAL_REPOS_DIR = path.join(RESEARCH_ROOT, 'external-repos');
const MONITOR_STATE_FILE = path.join(SOURCE_SKILL_VALIDATION_DIR, 'monitor-source-updates', 'state.json');

function getInitialReports(): WorldReport[] {
  return [];
}

function isWithinDaysWindow(value: string | null | undefined, days: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function getRuntimeStore(): RuntimeStore {
  const globalStore = globalThis as typeof globalThis & {
    __xiaReportRuntime?: RuntimeStore;
  };

  if (!globalStore.__xiaReportRuntime) {
    globalStore.__xiaReportRuntime = {
      reports: getInitialReports(),
      regionHistory: new Map<string, number>(),
      topicHistory: new Map<string, number>(),
      lastCoverageAt: new Map<string, number>(),
      missions: new Map<string, { briefing: WorldBriefing; createdAt: number }>(),
      xiaTrails: new Map(),
      localizedSignals: new Map(),
      translatedSignals: new Map(),
      signalAlignments: new Map(),
      selectedSourceHealth: new Map(),
      publicAnchorHealth: new Map(),
      icArticleDetailCache: new Map(),
      translationsLoaded: false,
      translationsInFlight: false,
      alignmentsLoaded: false,
      alignmentsInFlight: false,
      graphMetadataBackfillLoaded: false,
      graphMetadataBackfillInFlight: false,
      historyLoaded: false,
      signalsCache: null,
      signalsRefreshInFlight: null,
      marketSnapshotCache: null,
      marketSnapshotInFlight: null,
      sourceIntakeStats: null,
    };
  }

  if (!globalStore.__xiaReportRuntime.missions) {
    globalStore.__xiaReportRuntime.missions = new Map<string, { briefing: WorldBriefing; createdAt: number }>();
  }

  if (!globalStore.__xiaReportRuntime.xiaTrails) {
    globalStore.__xiaReportRuntime.xiaTrails = new Map<string, { signalId: string; region: string; lat: number | null; lng: number | null; updatedAt: number }>();
  }

  if (!globalStore.__xiaReportRuntime.localizedSignals) {
    globalStore.__xiaReportRuntime.localizedSignals = new Map<string, { displayTitle: string; displaySummary: string; displayLocation: string; topicLabel: string }>();
  }

  if (!globalStore.__xiaReportRuntime.translatedSignals) {
    globalStore.__xiaReportRuntime.translatedSignals = new Map<string, { displayTitle: string; displaySummary: string; displayLocation: string }>();
  }

  if (globalStore.__xiaReportRuntime.marketSnapshotInFlight === undefined) {
    globalStore.__xiaReportRuntime.marketSnapshotInFlight = null;
  }

  if (!globalStore.__xiaReportRuntime.signalAlignments) {
    globalStore.__xiaReportRuntime.signalAlignments = new Map<string, SignalAlignment>();
  }

  if (!globalStore.__xiaReportRuntime.selectedSourceHealth) {
    globalStore.__xiaReportRuntime.selectedSourceHealth = new Map<string, ExternalFetchHealth>();
  }

  if (!globalStore.__xiaReportRuntime.publicAnchorHealth) {
    globalStore.__xiaReportRuntime.publicAnchorHealth = new Map<string, ExternalFetchHealth>();
  }

  if (!globalStore.__xiaReportRuntime.icArticleDetailCache) {
    globalStore.__xiaReportRuntime.icArticleDetailCache = new Map<string, { expiresAt: number; row: Partial<SignalRow> }>();
  }

  if (typeof globalStore.__xiaReportRuntime.translationsLoaded !== 'boolean') {
    globalStore.__xiaReportRuntime.translationsLoaded = false;
  }

  if (typeof globalStore.__xiaReportRuntime.translationsInFlight !== 'boolean') {
    globalStore.__xiaReportRuntime.translationsInFlight = false;
  }

  if (typeof globalStore.__xiaReportRuntime.alignmentsLoaded !== 'boolean') {
    globalStore.__xiaReportRuntime.alignmentsLoaded = false;
  }

  if (typeof globalStore.__xiaReportRuntime.alignmentsInFlight !== 'boolean') {
    globalStore.__xiaReportRuntime.alignmentsInFlight = false;
  }

  if (typeof globalStore.__xiaReportRuntime.graphMetadataBackfillLoaded !== 'boolean') {
    globalStore.__xiaReportRuntime.graphMetadataBackfillLoaded = false;
  }

  if (typeof globalStore.__xiaReportRuntime.graphMetadataBackfillInFlight !== 'boolean') {
    globalStore.__xiaReportRuntime.graphMetadataBackfillInFlight = false;
  }

  if (typeof globalStore.__xiaReportRuntime.historyLoaded !== 'boolean') {
    globalStore.__xiaReportRuntime.historyLoaded = false;
  }

  if (globalStore.__xiaReportRuntime.signalsCache === undefined) {
    globalStore.__xiaReportRuntime.signalsCache = null;
  }

  if (globalStore.__xiaReportRuntime.signalsRefreshInFlight === undefined) {
    globalStore.__xiaReportRuntime.signalsRefreshInFlight = null;
  }

  if (globalStore.__xiaReportRuntime.marketSnapshotCache === undefined) {
    globalStore.__xiaReportRuntime.marketSnapshotCache = null;
  }

  if (globalStore.__xiaReportRuntime.sourceIntakeStats === undefined) {
    globalStore.__xiaReportRuntime.sourceIntakeStats = null;
  }

  return globalStore.__xiaReportRuntime;
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim();
}

function normalizeTag(tag: string | null | undefined): string {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function extractTaggedString(tags: string[] | null | undefined, prefix: string): string | null {
  const normalizedPrefix = normalizeTag(prefix);
  const tag = (tags || []).map(normalizeTag).find((item) => item.startsWith(normalizedPrefix));
  return tag ? tag.slice(normalizedPrefix.length) || null : null;
}

function extractTaggedNumber(tags: string[] | null | undefined, prefix: string): number | null {
  const value = extractTaggedString(tags, prefix);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicAlignmentTags(tags: string[] | null | undefined): string[] {
  return (tags || []).filter((tag) => !normalizeTag(tag).startsWith('upstream:score:'));
}

const QUICK_PLACE_TRANSLATIONS: Record<string, string> = {
  japan: '日本',
  spain: '西班牙',
  charlotte: '夏洛特',
  yemen: '也门',
  'washington, d.c.': '华盛顿',
  'district of columbia': '哥伦比亚特区',
  washington: '华盛顿',
  lar: '拉尔',
  tehran: '德黑兰',
  gaza: '加沙',
  jerusalem: '耶路撒冷',
  moscow: '莫斯科',
  'moscow sheremetyevo': '莫斯科谢列梅捷沃',
  moskva: '莫斯科',
  lagos: '拉各斯',
  'buni yadi': '布尼亚迪',
  'new york': '纽约',
  texas: '得克萨斯',
  canada: '加拿大',
  nigeria: '尼日利亚',
  mexico: '墨西哥',
  ireland: '爱尔兰',
  italy: '意大利',
  india: '印度',
  pakistan: '巴基斯坦',
  'south africa': '南非',
  'new south wales': '新南威尔士州',
  'eastern cape': '东开普省',
  'free state': '自由邦省',
  louisiana: '路易斯安那州',
  kuwait: '科威特',
  'tel aviv': '特拉维夫',
  'ben gurion': '本-古里安',
  hamerkaz: '中央区',
  'borno state': '博尔诺州',
  isfahan: '伊斯法罕',
  'south of isfahan': '伊斯法罕以南',
  'karaj river': '卡拉季河',
  'b1 bridge, karaj river': '卡拉季河 B1 桥',
  'lavan island': '拉万岛',
  'lavan island oil refinery': '拉万岛炼油厂',
  'saudi arabia': '沙特阿拉伯',
  'saudi arabia (east-west oil pipeline)': '沙特阿拉伯（东西向输油管道）',
  california: '加利福尼亚',
  odesa: '敖德萨',
  odessa: '敖德萨',
  islamabad: '伊斯兰堡',
  tianjin: '天津',
  lithuania: '立陶宛',
  ukraine: '乌克兰',
  'ukraine (general frontline)': '乌克兰前线总体方向',
  'southern ukraine': '乌克兰南部',
  'donetsk region': '顿涅茨克地区',
  'bekaa valley': '贝卡谷地',
  'south china sea': '南海',
  'east china sea': '东海',
  'sea of japan': '日本海',
  'east sea': '东海',
  'arabian sea': '阿拉伯海',
  'gulf of oman': '阿曼湾',
  'persian gulf': '波斯湾',
  'persian gulf / iranian waters': '波斯湾/伊朗水域',
  'shuwaikh area': '舒韦赫地区',
  'kuwait city': '科威特城',
  'nato europe (general)': '北约欧洲方向',
  'united kingdom (waters north of)': '英国北部海域',
  'north korea (sea of japan/east sea launch area)': '朝鲜（日本海/东海发射区域）',
  'north korea': '朝鲜',
  'west bank': '约旦河西岸',
  'jordan valley': '约旦河谷',
  'strait of hormuz (iranian coastline)': '霍尔木兹海峡（伊朗沿岸）',
  'southern lebanon (naqoura, qabrikha, kfar, touline)': '黎巴嫩南部（纳库拉、卡布里哈、克法尔、图林）',
};

const QUICK_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bUnited States\b/gi, '美国'],
  [/\bU\.S\.\b/gi, '美国'],
  [/\bSaudi Arabia\b/gi, '沙特阿拉伯'],
  [/\bYemen\b/gi, '也门'],
  [/\bIran\b/gi, '伊朗'],
  [/\bIsrael\b/gi, '以色列'],
  [/\bLebanon\b/gi, '黎巴嫩'],
  [/\bUkraine\b/gi, '乌克兰'],
  [/\bRussia\b/gi, '俄罗斯'],
  [/\bNigeria\b/gi, '尼日利亚'],
  [/\bMexico\b/gi, '墨西哥'],
  [/\bIreland\b/gi, '爱尔兰'],
  [/\bItaly\b/gi, '意大利'],
  [/\bIndia\b/gi, '印度'],
  [/\bJapan\b/gi, '日本'],
  [/\bNorth Korea\b/gi, '朝鲜'],
  [/\bSouth Africa\b/gi, '南非'],
  [/\bWest Bank\b/gi, '约旦河西岸'],
  [/\bNew South Wales\b/gi, '新南威尔士州'],
  [/\bEastern Cape\b/gi, '东开普省'],
  [/\bFree State\b/gi, '自由邦省'],
  [/\bLouisiana\b/gi, '路易斯安那州'],
  [/\bWashington,?\s*D\.?C\.?\b/gi, '华盛顿'],
  [/\bDistrict of Columbia\b/gi, '哥伦比亚特区'],
  [/\bCharlotte\b/gi, '夏洛特'],
  [/\bLar\b/gi, '拉尔'],
  [/\bTehran\b/gi, '德黑兰'],
  [/\bGaza\b/gi, '加沙'],
  [/\bJerusalem\b/gi, '耶路撒冷'],
  [/\bMoscow\b/gi, '莫斯科'],
  [/\bMoskva\b/gi, '莫斯科'],
  [/\bNew York\b/gi, '纽约'],
  [/\bTexas\b/gi, '得克萨斯'],
  [/\bCanada\b/gi, '加拿大'],
  [/\bKuwait\b/gi, '科威特'],
  [/\bKuwait City\b/gi, '科威特城'],
  [/\bTel Aviv\b/gi, '特拉维夫'],
  [/\bBen Gurion\b/gi, '本-古里安'],
  [/\bHaMerkaz\b/gi, '中央区'],
  [/\bBorno State\b/gi, '博尔诺州'],
  [/\bOdessa\b/gi, '敖德萨'],
  [/\bPorterville\b/gi, '波特维尔'],
  [/\bCalifornia\b/gi, '加利福尼亚'],
  [/\bIslamabad\b/gi, '伊斯兰堡'],
  [/\bPakistan\b/gi, '巴基斯坦'],
  [/\bSyria\b/gi, '叙利亚'],
  [/\bBeijing\b/gi, '北京'],
  [/\bPersian Gulf\b/gi, '波斯湾'],
  [/\bArabian Sea\b/gi, '阿拉伯海'],
  [/\bGulf of Oman\b/gi, '阿曼湾'],
  [/\bSea of Japan\b/gi, '日本海'],
  [/\bEast Sea\b/gi, '东海'],
  [/\bShuwaikh area\b/gi, '舒韦赫地区'],
  [/\bKaraj River\b/gi, '卡拉季河'],
  [/\bIsfahan\b/gi, '伊斯法罕'],
  [/\bLavan Island\b/gi, '拉万岛'],
  [/\bBridge\b/gi, '桥'],
  [/\bRiver\b/gi, '河'],
  [/\bIsland\b/gi, '岛'],
  [/\bOil Refinery\b/gi, '炼油厂'],
  [/\bOil Pipeline\b/gi, '输油管道'],
  [/\blaunch area\b/gi, '发射区域'],
  [/\boperational area\b/gi, '行动区域'],
  [/\bborder towns\b/gi, '边境城镇'],
  [/\bgovernmental centers?\b/gi, '政府中心'],
  [/\bmilitary escalation\b/gi, '军事升级'],
  [/\bstrategic strait\b/gi, '战略海峡'],
  [/\bactive war reporting\b/gi, '战争报道活跃'],
  [/\bactive war attacks\b/gi, '战时攻击活跃'],
  [/\bUpdate on Ukraine war,\s*day\s*\d+,\s*is active conflict\b/gi, '乌克兰战况更新，交火仍在持续'],
  [/\bFrontline situation in Ukraine war,\s*active combat\b/gi, '乌克兰前线交火持续'],
  [/\bWar-related treason sentencing in Ukraine\b/gi, '乌克兰涉战案件有新进展'],
  [/\bMilitary warning\/anniversary,\s*high tension\b/gi, '军方警示与周年节点叠加，局势紧张'],
  [/\bRenewed violence in Manipur,\s*India\b/gi, '印度曼尼普尔再次发生暴力冲突'],
  [/\bTerrorist attack on military base,\s*soldiers killed\b/gi, '军事基地遭袭，已有士兵伤亡'],
  [/\bRussian attack on Ukrainian city,\s*war event\b/gi, '乌克兰城市遭袭，战事仍在延续'],
  [/\bDrone attack on Russian logistics\b/gi, '俄罗斯后勤设施遭无人机袭击'],
  [/\bactive conflict\b/gi, '交火仍在持续'],
  [/\bactive combat\b/gi, '前线交火'],
  [/\bcritical\b/gi, '高风险'],
  [/\bhigh tension\b/gi, '局势紧张'],
  [/\bcritical significance\b/gi, '高度重要'],
  [/\bsignificant security event\b/gi, '重大安全事件'],
  [/\blocal crime\b/gi, '地方治安案件'],
  [/\bpolice response\b/gi, '警方应对'],
  [/\bdrone attacks?\b/gi, '无人机袭击'],
  [/\bmissile strike\b/gi, '导弹袭击'],
  [/\bairstrike\b/gi, '空袭'],
  [/\bceasefire violations?\b/gi, '停火违规'],
  [/\bcartel violence\b/gi, '贩毒集团暴力'],
  [/\bcivil unrest\b/gi, '民间骚乱'],
  [/\bEast-West\b/gi, '东西向'],
  [/\bsouth of\b/gi, '以南'],
  [/\bnorth of\b/gi, '以北'],
  [/\beast of\b/gi, '以东'],
  [/\bwest of\b/gi, '以西'],
  [/\bregion\b/gi, '地区'],
  [/\bvalley\b/gi, '谷地'],
  [/\bsea\b/gi, '海'],
  [/\bstrait\b/gi, '海峡'],
  [/\bgeneral\b/gi, '总体'],
  [/\bfrontline\b/gi, '前线'],
  [/\bsouthern\b/gi, '南部'],
  [/\beastern\b/gi, '东部'],
  [/\bwestern\b/gi, '西部'],
  [/\bnorthern\b/gi, '北部'],
];

function applyQuickTextTranslations(value: string): string {
  let translated = cleanDisplayText(value);
  for (const [pattern, replacement] of QUICK_TEXT_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }

  return translated
    .replace(/\s+\(\s*/g, '（')
    .replace(/\s*\)/g, '）')
    .replace(/,\s*/g, '，')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function quickTranslatePlacePart(value: string): string {
  const trimmed = cleanDisplayText(value);
  if (!trimmed || containsCjk(trimmed)) {
    return trimmed;
  }

  const exact = QUICK_PLACE_TRANSLATIONS[trimmed.toLowerCase()];
  if (exact) {
    return exact;
  }

  return applyQuickTextTranslations(trimmed);
}

function quickTranslatePlaceLabel(value: string): string {
  const trimmed = cleanDisplayText(value);
  if (!trimmed || containsCjk(trimmed)) {
    return trimmed;
  }

  const exact = quickTranslatePlacePart(trimmed);
  if (containsCjk(exact)) {
    return exact;
  }

  const segments = trimmed
    .split(/\s*,\s*/)
    .map((segment) => quickTranslatePlacePart(segment))
    .filter(Boolean);

  if (segments.length > 1 && segments.some((segment) => containsCjk(segment))) {
    return segments.join('，');
  }

  return applyQuickTextTranslations(trimmed);
}

type DisplaySignalInput = Pick<WorldSignal, 'title' | 'summary' | 'tags' | 'scene' | 'locationName' | 'region'> &
  Partial<Pick<WorldSignal, 'country'>>;

function buildDisplayLocation(signal: DisplaySignalInput): string {
  const candidates = [
    signal.locationName,
    signal.country,
    signal.region,
    sceneLabel(signal.scene),
  ];

  for (const candidate of candidates) {
    const translated = quickTranslatePlaceLabel(candidate || '');
    if (translated && !shouldRewriteDisplayText(translated)) {
      return translated;
    }
  }

  return sceneLabel(signal.scene);
}

type SignalThread = {
  label: string;
  titleBeat: string;
  summaryBeat: string;
  watchHint: string;
};

type SignalStageDescriptor = {
  label: string;
  note: string;
};

type ReportKindDescriptor = {
  label: string;
  note: string;
};

const SCENE_LABELS: Record<string, string> = {
  war: '冲突',
  technology: '科技',
  capacity: '产能与供应链',
  finance: '市场',
  health: '公共卫生',
  'weak-signal': '弱信号',
  'tech-ai': 'AI',
  'geo-politics-daily': '地缘',
  'technology-daily': 'AI',
  'ai-daily': 'AI',
  global: '地缘',
};

const TOPIC_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(shipping|ship|port|route|strait|freight|vessel|insurer|marine)/, label: '航运' },
  { pattern: /(oil|lng|gas|refiner|pipeline|crude|energy|power|grid|electric)/, label: '能源' },
  { pattern: /(missile|strike|attack|military|troop|war|conflict|border|drone|sanction)/, label: '冲突' },
  { pattern: /(chip|gpu|semiconductor|server|ai|model|robot|cloud|accelerator)/, label: '算力与芯片' },
  { pattern: /(factory|manufactur|assembly|capacity|export|electronics|logistics|supply)/, label: '产能与供应链' },
  { pattern: /(bond|yield|equity|stock|market|trader|bank|finance|fx)/, label: '市场' },
  { pattern: /(virus|outbreak|disease|health|epidemic|hospital)/, label: '公共卫生' },
  { pattern: /(tariff|policy|regulat|election|parliament|minister|customs)/, label: '政策' },
];

const SIGNAL_THREADS: Array<{ pattern: RegExp } & SignalThread> = [
  {
    pattern: /(shipping|ship|port|route|strait|freight|vessel|insurer|marine)/,
    label: '航运',
    titleBeat: '航运风险上升',
    summaryBeat: '绕航、保险和港口声明会直接影响后面的运价。',
    watchHint: '保险、运价、绕航和港口声明',
  },
  {
    pattern: /(oil|lng|gas|refiner|pipeline|crude|energy|power|grid|electric)/,
    label: '能源',
    titleBeat: '能源市场有新动向',
    summaryBeat: '价格、装运和政策回应会决定影响能否继续放大。',
    watchHint: '现货价格、装运节奏和政策反应',
  },
  {
    pattern: /(missile|strike|attack|military|troop|war|conflict|border|drone|sanction)/,
    label: '冲突',
    titleBeat: '冲突强度上升',
    summaryBeat: '外溢范围、更多报道和政策回应会决定事件分量。',
    watchHint: '二次信源、外溢范围和供应链反应',
  },
  {
    pattern: /(chip|gpu|semiconductor|server|ai|model|robot|cloud|accelerator)/,
    label: '算力与芯片',
    titleBeat: '算力与芯片有新动向',
    summaryBeat: '上游零部件、报价和出货节奏会影响后续供应。',
    watchHint: '上游零部件、报价和出货节奏',
  },
  {
    pattern: /(factory|manufactur|assembly|capacity|export|electronics|logistics|supply)/,
    label: '产能与供应链',
    titleBeat: '供应链有新变化',
    summaryBeat: '订单、扩产动作和物流节点会影响交付节奏。',
    watchHint: '订单、扩产动作和物流节点',
  },
  {
    pattern: /(bond|yield|equity|stock|market|trader|bank|finance|fx)/,
    label: '市场',
    titleBeat: '市场出现新变化',
    summaryBeat: '价格、收益率和监管口风会影响短期预期。',
    watchHint: '价格、收益率和监管口风',
  },
  {
    pattern: /(virus|outbreak|disease|health|epidemic|hospital)/,
    label: '公共卫生',
    titleBeat: '公共卫生有新情况',
    summaryBeat: '病例、口岸和卫生通报会影响防控压力。',
    watchHint: '病例、口岸和卫生通报',
  },
  {
    pattern: /(tariff|policy|regulat|election|parliament|minister|customs)/,
    label: '政策',
    titleBeat: '政策出现新变化',
    summaryBeat: '正式文件、执行细则和市场反应会决定实际影响。',
    watchHint: '正式文件、执行细则和市场回响',
  },
];

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function hasLongEnglishFragment(value: string): boolean {
  const trimmed = cleanDisplayText(value);
  if (!trimmed) {
    return false;
  }

  if (/[（(][^）)]*[A-Za-z][^）)]*[）)]/.test(trimmed)) {
    return true;
  }

  if (/[A-Za-z]{4,}(?:[\s/-]+[A-Za-z]{2,}){1,}/.test(trimmed)) {
    return true;
  }

  const asciiLetters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const visibleChars = trimmed.replace(/\s+/g, '').length || 1;
  return asciiLetters / visibleChars >= 0.28;
}

function shouldRewriteDisplayText(value: string): boolean {
  const trimmed = cleanDisplayText(value);
  if (!trimmed) {
    return true;
  }

  if (!containsCjk(trimmed)) {
    return true;
  }

  return hasLongEnglishFragment(trimmed);
}

function cleanDisplayText(value: string): string {
  return value
    .replace(/\bStrait of Hormuz\b/gi, '霍尔木兹海峡')
    .replace(/\bGaza Strip\b/gi, '加沙地带')
    .replace(/\bMiddle East\b/gi, '中东')
    .replace(/\bNorth America\b/gi, '北美')
    .replace(/\bSouth America\b/gi, '南美')
    .replace(/\bEurope\b/gi, '欧洲')
    .replace(/\bLouisiana\b/gi, '路易斯安那州')
    .replace(/\bIranian regime governmental centers?\b/gi, '伊朗政府中心')
    .replace(/\bNearby Iranian positions?\b/gi, '周边伊朗据点')
    .replace(/\bfrontline clashes\b/gi, '前线交火')
    .replace(/\bactive war zone\b/gi, '交战区域')
    .replace(/\bunspecified locations?\b/gi, '未指明地点')
    .replace(/\bimplied operational area\b/gi, '相关行动区域')
    .replace(/\bmass shooting\b/gi, '大规模枪击')
    .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '$1有相关报道。')
    .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '可能影响$1。')
    .replace(/这一笔声量起得不低，适合先压住。?/gu, '相关报道较集中。')
    .replace(/先轻轻记下，不急着加重语气。?/gu, '暂按一般报道处理。')
    .replace(/它未必最显眼，但这条线现在值得先补一笔。?/gu, '可作为补充材料。')
    .replace(/Signal Arena 是量化交易竞赛游戏平台，其行情快照为.{2}游戏数据，排行榜参与者仅一万余人，非专业金融数据源，仅作为背景参考。?/gu, '行情快照仅作背景参考。')
    .replace(/续写/gu, '更新')
    .replace(/\s+/g, ' ')
    .trim();
}

function sceneLabel(scene: WorldScene): string {
  return SCENE_LABELS[normalizeTag(scene)] || scene || '地缘';
}

function buildTopicLabel(signal: Pick<WorldSignal, 'title' | 'summary' | 'tags' | 'scene'>): string {
  const haystack = normalizeTag([signal.title, signal.summary, signal.tags.join(' '), signal.scene].join(' '));
  for (const thread of SIGNAL_THREADS) {
    if (thread.pattern.test(haystack)) {
      return thread.label;
    }
  }

  const candidates = [...signal.tags, signal.title, signal.summary, signal.scene];
  for (const value of candidates) {
    const text = value.trim();
    if (!text) continue;
    const normalized = normalizeTag(text);
    const exact = SCENE_LABELS[normalized];
    if (exact) {
      return exact;
    }

    for (const entry of TOPIC_LABELS) {
      if (entry.pattern.test(normalized)) {
        return entry.label;
      }
    }

    if (containsCjk(text) && text.length <= 10) {
      return text;
    }
  }

  return sceneLabel(signal.scene);
}

function getSignalThread(signal: Pick<WorldSignal, 'title' | 'summary' | 'tags' | 'scene'>): SignalThread {
  const haystack = normalizeTag([signal.title, signal.summary, signal.tags.join(' '), signal.scene].join(' '));
  for (const thread of SIGNAL_THREADS) {
    if (thread.pattern.test(haystack)) {
      return {
        label: thread.label,
        titleBeat: thread.titleBeat,
        summaryBeat: thread.summaryBeat,
        watchHint: thread.watchHint,
      };
    }
  }

  const fallbackLabel = buildTopicLabel(signal);
  return {
    label: fallbackLabel,
    titleBeat: `${fallbackLabel}有新消息`,
    summaryBeat: `${fallbackLabel}出现新变化，影响还需要结合更多报道判断。`,
    watchHint: '更多报道、相邻地点和相关回应',
  };
}

function buildDisplayTitle(signal: DisplaySignalInput): string {
  if (containsCjk(signal.title) && signal.title.length <= 34) {
    return cleanDisplayText(signal.title);
  }

  const thread = getSignalThread(signal);
  const location = buildDisplayLocation(signal);
  return `${location} · ${thread.titleBeat}`;
}

function isGenericGeneratedDisplayText(value?: string | null): boolean {
  const text = cleanDisplayText(value || '');
  if (!text) return false;
  return /出现新的.+信号|主世界出现新信号|冲突强度上升|航运风险上升|后续重点看|按普通监测处理|值得补充观察|目前热度较高，需继续跟踪|.+ · .+信号更新|.+信号更新$/.test(text);
}

function concreteDisplayText(value?: string | null, max = 220): string {
  const text = cleanDisplayText(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildDisplaySummary(
  signal: DisplaySignalInput & Pick<WorldSignal, 'coverageGap' | 'hotspotScore'>,
): string {
  const concreteSummary = concreteDisplayText(applyQuickTextTranslations(signal.summary || ''), 180);
  if (concreteSummary && !isGenericGeneratedDisplayText(concreteSummary)) {
    return concreteSummary;
  }

  const thread = getSignalThread(signal);
  const location = buildDisplayLocation(signal);
  const emphasis =
    signal.hotspotScore >= 0.74
      ? '相关报道较集中。'
      : signal.coverageGap >= 0.72
        ? '同类报道还不多。'
        : '暂按一般报道处理。';
  const translatedFact = applyQuickTextTranslations(signal.summary || signal.title).slice(0, 120);
  const fact = hasLongEnglishFragment(translatedFact) ? '' : translatedFact;

  return `${location}有${thread.label}相关报道。${fact ? `${fact}。` : ''}${emphasis}`;
}

function describeSignalStage(signal: WorldSignal, relatedCount: number): SignalStageDescriptor {
  if (relatedCount >= 3) {
    return {
      label: '线头变粗',
      note: `近 30 天已经有 ${relatedCount} 条相关痕迹，这次更像在原有判断上继续加压。`,
    };
  }

  if (relatedCount >= 1) {
    return {
      label: '开始成线',
      note: '它已经不是一枚完全孤立的点，前后几笔正在往一起靠。',
    };
  }

  if (signal.hotspotScore >= 0.74) {
    return {
      label: '刚冒头就发热',
      note: '第一声就不轻，值得先把位置和语气稳稳记住。',
    };
  }

  if (signal.coverageGap >= 0.72) {
    return {
      label: '空白里冒头',
      note: '它不算最吵，但这块地方太久没人补，先落一笔比装作没看见更值。',
    };
  }

  return {
    label: '一枚新钉子',
    note: '先把点钉住，等后续信号来决定它会不会长成一段线。',
  };
}

function buildWhyNow(briefing: WorldBriefing, signal: WorldSignal, relatedCount: number, stage: SignalStageDescriptor): string {
  if (relatedCount >= 3) {
    return `这条线前面已经留下了几段判断，这次不是另起一页，而是接着往下写。${stage.note}`;
  }

  if (briefing.mode === 'exploration' && signal.coverageGap >= 0.72) {
    return `这块地方一直空着，先补一笔再说。${stage.note}`;
  }

  if (signal.hotspotScore >= 0.74 || signal.severity >= 4) {
    return `因为它现在真的在响，而且离现在很近，不记下来有点可惜。${stage.note}`;
  }

  return `因为这个位置不算边角，先留个脚印更稳。${stage.note}`;
}

function buildWatchNext(signal: WorldSignal): string {
  const thread = getSignalThread(signal);
  const location = cleanDisplayText(signal.locationName || signal.region || sceneLabel(signal.scene));
  return `接下来我先盯 ${thread.watchHint}，看看 ${location} 这边会不会再冒出第二个来源，或者把旁边几块地方一起带响。`;
}

function describeReportKind(
  signal: WorldSignal,
  topicLabel: string,
  recentPeerReports: WorldReport[],
): ReportKindDescriptor {
  if (recentPeerReports.length === 0) {
    return {
      label: '起笔',
      note: '这是第一笔，先把地方和感觉记住，后面再看它会不会越写越长。',
    };
  }

  const latestPeer = [...recentPeerReports].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  )[0];
  const latestTopicLabel = latestPeer?.topic_label || latestPeer?.topic || '';

  if (latestTopicLabel && latestTopicLabel !== topicLabel) {
    return {
      label: '改写',
      note: `前一笔更像在盯“${latestTopicLabel}”，这次这条线明显往“${topicLabel}”那边偏了。`,
    };
  }

  const sameSignalMentions = recentPeerReports.filter((report) => report.signal_id === signal.id).length;
  if (sameSignalMentions >= 1 && signal.hotspotScore < 0.66 && signal.relevanceScore < 0.76) {
    return {
      label: '回声',
      note: '更像同一个地方又响了一声，先别把话说重。',
    };
  }

  return {
    label: '补证',
    note: recentPeerReports.length >= 3
      ? '前面已经有底稿了，这次像是在旧判断边上多压一块石头。'
      : '这次不是重写，是给前一笔添点更扎实的东西。',
  };
}

function getInformationCollectionBaseUrl(): string {
  return (process.env.INFORMATION_COLLECTION_BASE_URL || DEFAULT_INFORMATION_COLLECTION_BASE_URL).replace(/\/$/, '');
}

function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'from', 'feature'].forEach((key) =>
      url.searchParams.delete(key),
    );
    return url.toString();
  } catch {
    return trimmed;
  }
}

function isWorldMonitorMachineOnlyText(value: string): boolean {
  const text = normalizeText(value);
  if (!text) return true;
  return /Location in headline|Source country match|Local news source|High Goldstein intensity|Goldstein|^\d+\s+events? at location$/iu.test(text);
}

function readableTitleFromSourceUrl(sourceUrl: string): string {
  const normalizedUrl = normalizeSourceUrl(sourceUrl);
  if (!normalizedUrl) return '';

  try {
    const url = new URL(normalizedUrl);
    const segments = url.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .reverse();
    const slug = segments.find((segment) => /[a-z]{3,}/iu.test(segment) && segment.length >= 12);
    if (!slug) return '';
    const withoutExtension = slug.replace(/\.(?:html?|php|aspx?)$/iu, '');
    const withoutIds = withoutExtension
      .replace(/\b[0-9a-f]{8,}\b/giu, '')
      .replace(/\b\d{5,}\b/gu, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanDisplayText(decodeURIComponent(withoutIds)).slice(0, 140);
  } catch {
    return '';
  }
}

function chooseWorldMonitorReadableText(input: {
  title: string;
  headline: string;
  notes: string;
  sourceUrl: string;
  fallbackTitle: string;
}): { title: string; description: string } {
  const urlTitle = readableTitleFromSourceUrl(input.sourceUrl);
  const rawDescription = normalizeText(input.notes) || normalizeText(input.headline);
  const description = isWorldMonitorMachineOnlyText(rawDescription)
    ? normalizeText(input.headline) || urlTitle || rawDescription
    : rawDescription;
  const titleCandidates = [input.headline, input.title, urlTitle, input.fallbackTitle]
    .map((candidate) => normalizeText(candidate))
    .filter(Boolean);
  const title =
    titleCandidates.find(
      (candidate) =>
        !isWorldMonitorMachineOnlyText(candidate) &&
        !isLowInformationSignalTitle(candidate, description),
    ) ||
    urlTitle ||
    normalizeText(input.title) ||
    normalizeText(input.fallbackTitle) ||
    'World Monitor signal';

  return {
    title,
    description: description || title,
  };
}

function normalizeSignatureText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSignalSignature(row: SignalRow): string {
  const sourceUrl = normalizeSourceUrl(normalizeText(row.source_url));
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  const title = normalizeSignatureText(normalizeText(row.title));
  const location = normalizeSignatureText(normalizeText(row.location));
  const country = normalizeSignatureText(normalizeText(row.country));
  const day = (row.event_time || row.created_at || '').slice(0, 10);
  return `title:${title}|loc:${location}|country:${country}|day:${day}`;
}

function mergeSignalRows(rows: SignalRow[]): SignalRow[] {
  const bySignature = new Map<string, SignalRow>();

  for (const row of rows) {
    const signature = buildSignalSignature(row);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, { ...row, tags: [...(row.tags || [])] });
      continue;
    }

    const mergedTags = [...new Set([...(existing.tags || []), ...(row.tags || [])].filter(Boolean))];
    const mergedAlignmentTags = uniqueAlignmentTags([...(existing.alignment_tags || []), ...(row.alignment_tags || [])]);
    bySignature.set(signature, {
      ...existing,
      id: existing.id,
      title: normalizeText(existing.title).length >= normalizeText(row.title).length ? existing.title : row.title,
      description:
        normalizeText(existing.description).length >= normalizeText(row.description).length
          ? existing.description
          : row.description,
      source_name: existing.source_name || row.source_name,
      source_url: existing.source_url || row.source_url,
      event_time: [existing.event_time, row.event_time].filter(Boolean).sort()[0] || existing.event_time || row.event_time,
      created_at: [existing.created_at, row.created_at].filter(Boolean).sort().reverse()[0] || existing.created_at || row.created_at,
      location: existing.location || row.location,
      country: existing.country || row.country,
      latitude: existing.latitude ?? row.latitude,
      longitude: existing.longitude ?? row.longitude,
      severity: Math.max(Number(existing.severity || 0), Number(row.severity || 0)) || existing.severity || row.severity,
      relevance_score:
        Math.max(Number(existing.relevance_score || 0), Number(row.relevance_score || 0)) ||
        existing.relevance_score ||
        row.relevance_score,
      tags: mergedTags,
      alignment_tags: mergedAlignmentTags,
      intensity: Math.max(Number(existing.intensity || 0), Number(row.intensity || 0)) || existing.intensity || row.intensity,
      mention_count:
        Math.max(Number(existing.mention_count || 0), Number(row.mention_count || 0)) ||
        existing.mention_count ||
        row.mention_count,
      urgency_reason: existing.urgency_reason || row.urgency_reason,
      external_id: existing.external_id || row.external_id,
      source_type: existing.source_type || row.source_type,
      source_feed_name: existing.source_feed_name || row.source_feed_name,
      content_md:
        normalizeText(existing.content_md).length >= normalizeText(row.content_md).length
          ? existing.content_md
          : row.content_md,
      last_seen_at:
        [existing.last_seen_at, row.last_seen_at].filter(Boolean).sort().reverse()[0] ||
        existing.last_seen_at ||
        row.last_seen_at,
    });
  }

  return [...bySignature.values()];
}

const EVENT_CLUSTER_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'amid',
  'from',
  'into',
  'more',
  'news',
  'over',
  'report',
  'reports',
  'said',
  'says',
  'than',
  'that',
  'their',
  'this',
  'update',
  'with',
  'without',
  '当前',
  '更新',
  '消息',
  '报道',
  '相关',
  '最新',
]);

const TECH_AI_ENTITY_TERMS: Array<[string, RegExp]> = [
  ['openai', /openai|chatgpt|gpt[-\s]?\d|奥特曼|sam\s+altman/i],
  ['anthropic', /anthropic|claude|opus|sonnet|haiku/i],
  ['google', /google|gemini|deepmind|谷歌/i],
  ['meta', /meta\s+ai|llama|facebook/i],
  ['mistral', /mistral/i],
  ['nvidia', /nvidia|英伟达|gpu|cuda/i],
  ['xai', /\bxai\b|grok|马斯克/i],
  ['qwen', /qwen|通义千问|千问|阿里云|阿里/i],
  ['deepseek', /deepseek|深度求索/i],
  ['kimi', /kimi|moonshot|月之暗面/i],
  ['minimax', /minimax|abab|海螺/i],
  ['huggingface', /hugging\s?face|huggingface/i],
  ['github', /github|copilot/i],
  ['cursor', /cursor/i],
  ['kling', /kling|可灵/i],
  ['runway', /runway/i],
];

const TECH_AI_TOPIC_TERMS: Array<[string, RegExp]> = [
  ['model', /model|llm|gpt|claude|gemini|qwen|kimi|grok|大模型|模型|推理模型|基础模型/i],
  ['agent', /agent|agentic|智能体|工作流|workflow/i],
  ['coding', /code|coding|codex|cursor|copilot|claude\s+code|编程|代码|生码/i],
  ['search', /search|搜索/i],
  ['multimodal', /multimodal|vision|video|audio|image|多模态|视频|图像|语音/i],
  ['infra', /gpu|chip|inference|datacenter|data\s+center|算力|芯片|推理|数据中心/i],
  ['benchmark', /benchmark|eval|sota|leaderboard|基准|评测|榜单|得分/i],
  ['opensource', /open[-\s]?source|github|开源/i],
  ['safety', /safety|security|risk|alignment|安全|对齐|风险/i],
  ['business', /funding|revenue|arr|融资|投资|收入|估值|财报|收购/i],
  ['product', /release|launch|announce|available|api|sdk|cli|发布|上线|推出|接入|集成|产品/i],
  ['research', /paper|arxiv|research|论文|研究/i],
];

function extractTermTokens(text: string, terms: Array<[string, RegExp]>): Set<string> {
  const tokens = new Set<string>();
  for (const [token, pattern] of terms) {
    if (pattern.test(text)) tokens.add(token);
  }
  return tokens;
}

function eventClusterTokens(row: SignalRow): Set<string> {
  const rawText = [
    row.title,
    row.description,
    row.location,
    row.country,
    ...(row.tags || []),
  ].filter(Boolean).join(' ');
  const text = normalizeSignatureText(rawText);
  const tokens = text
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !EVENT_CLUSTER_STOPWORDS.has(token));
  return new Set([
    ...tokens.slice(0, 80),
    ...extractTermTokens(rawText, TECH_AI_ENTITY_TERMS),
    ...extractTermTokens(rawText, TECH_AI_TOPIC_TERMS),
  ]);
}

function eventTitleTokens(row: SignalRow): Set<string> {
  const rawTitle = normalizeText(row.title);
  const title = normalizeSignatureText(rawTitle);
  return new Set(
    [
      ...title
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !EVENT_CLUSTER_STOPWORDS.has(token))
      .slice(0, 40),
      ...extractTermTokens(rawTitle, TECH_AI_ENTITY_TERMS),
      ...extractTermTokens(rawTitle, TECH_AI_TOPIC_TERMS),
    ],
  );
}

function rowLooksLikeTechAi(row: SignalRow): boolean {
  const haystack = rowTextHaystack(row);
  return /(\bai\b|aihot|ai-news-radar|source:ai-news-radar|llm|openai|anthropic|claude|chatgpt|gemini|deepmind|模型|大模型|智能体|agent|github|code|代码|开源|论文|benchmark|sota)/.test(haystack);
}

function techEntityOverlap(left: Set<string>, right: Set<string>): number {
  const entities = new Set([
    'openai',
    'anthropic',
    'claude',
    'chatgpt',
    'gemini',
    'deepmind',
    'google',
    'meta',
    'mistral',
    'nvidia',
    'github',
    'bun',
    'cursor',
    'windsurf',
    'deepseek',
    'qwen',
    'kimi',
    'minimax',
    'huggingface',
    'openrouter',
    'alibaba',
    'xai',
    'qwen',
    'kling',
    'runway',
  ]);
  let count = 0;
  for (const token of left) {
    if (entities.has(token) && right.has(token)) count += 1;
  }
  return count;
}

function techTopicOverlap(left: Set<string>, right: Set<string>): number {
  const topics = new Set([
    'release',
    'launch',
    'announce',
    'available',
    'open',
    'source',
    'benchmark',
    'funding',
    'acquisition',
    'lawsuit',
    'agent',
    'code',
    'codex',
    'shortcut',
    'shortcuts',
    'keyboard',
    'feedback',
    'memory',
    'leak',
    'rewrite',
    '发布',
    '上线',
    '开源',
    '融资',
    '收购',
    '诉讼',
    '代码',
    'model',
    'agent',
    'coding',
    'search',
    'multimodal',
    'infra',
    'benchmark',
    'opensource',
    'safety',
    'business',
    'product',
    'research',
  ]);
  let count = 0;
  for (const token of left) {
    if (topics.has(token) && right.has(token)) count += 1;
  }
  return count;
}

function eventRowDay(row: SignalRow): number | null {
  const value = Date.parse(row.event_time || row.last_seen_at || row.created_at || '');
  if (!Number.isFinite(value)) return null;
  return Math.floor(value / 86_400_000);
}

function eventRowsCloseInTime(left: SignalRow, right: SignalRow): boolean {
  const leftDay = eventRowDay(left);
  const rightDay = eventRowDay(right);
  if (leftDay === null || rightDay === null) return true;
  return Math.abs(leftDay - rightDay) <= 3;
}

function eventRowsSharePlace(left: SignalRow, right: SignalRow): boolean {
  const leftCountry = normalizeSignatureText(normalizeText(left.country));
  const rightCountry = normalizeSignatureText(normalizeText(right.country));
  const leftLocation = normalizeSignatureText(normalizeText(left.location));
  const rightLocation = normalizeSignatureText(normalizeText(right.location));

  if (leftLocation && rightLocation && leftLocation === rightLocation) return true;
  if (leftCountry && rightCountry && leftCountry === rightCountry) return true;

  const latA = typeof left.latitude === 'number' ? left.latitude : null;
  const lngA = typeof left.longitude === 'number' ? left.longitude : null;
  const latB = typeof right.latitude === 'number' ? right.latitude : null;
  const lngB = typeof right.longitude === 'number' ? right.longitude : null;
  if (latA === null || lngA === null || latB === null || lngB === null) return false;
  return Math.abs(latA - latB) <= 1.2 && Math.abs(lngA - lngB) <= 1.2;
}

function eventRowsShareSourceUrl(left: SignalRow, right: SignalRow): boolean {
  const leftUrl = normalizeSourceUrl(normalizeText(left.source_url));
  const rightUrl = normalizeSourceUrl(normalizeText(right.source_url));
  return Boolean(leftUrl && rightUrl && leftUrl === rightUrl);
}

function tokenOverlapScore(left: Set<string>, right: Set<string>): { overlap: number; jaccard: number } {
  if (!left.size || !right.size) return { overlap: 0, jaccard: 0 };
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return {
    overlap,
    jaccard: overlap / Math.max(1, left.size + right.size - overlap),
  };
}

function signalRowsLookLikeSameEvent(left: SignalRow, right: SignalRow): boolean {
  if (eventRowsShareSourceUrl(left, right)) return true;
  if (!eventRowsCloseInTime(left, right)) return false;

  const leftTokens = eventClusterTokens(left);
  const rightTokens = eventClusterTokens(right);
  const leftTitleTokens = eventTitleTokens(left);
  const rightTitleTokens = eventTitleTokens(right);
  const titleOverlap = tokenOverlapScore(leftTitleTokens, rightTitleTokens);

  if (rowLooksLikeTechAi(left) || rowLooksLikeTechAi(right)) {
    const entityOverlap = techEntityOverlap(leftTokens, rightTokens);
    const topicOverlap = techTopicOverlap(leftTokens, rightTokens);
    return (
      (titleOverlap.jaccard >= 0.55 && titleOverlap.overlap >= 4) ||
      (entityOverlap >= 1 && topicOverlap >= 1 && titleOverlap.jaccard >= 0.32 && titleOverlap.overlap >= 3) ||
      (entityOverlap >= 1 && topicOverlap >= 2 && tokenOverlapScore(leftTokens, rightTokens).jaccard >= 0.18) ||
      (entityOverlap >= 1 && topicOverlap >= 1 && titleOverlap.overlap >= 2 && tokenOverlapScore(leftTokens, rightTokens).overlap >= 4)
    );
  }

  const overlap = tokenOverlapScore(leftTokens, rightTokens);
  if (overlap.jaccard >= 0.42 && overlap.overlap >= 3) return true;

  const samePlace = eventRowsSharePlace(left, right);
  if (samePlace && overlap.overlap >= 3 && overlap.jaccard >= 0.22) return true;
  if (samePlace && overlap.overlap >= 2 && (leftTokens.has('outbreak') || rightTokens.has('outbreak'))) return true;
  if (samePlace && overlap.overlap >= 2 && (leftTokens.has('strike') || rightTokens.has('strike') || leftTokens.has('strikes') || rightTokens.has('strikes'))) return true;

  return false;
}

function sourceAuthorityScore(row: SignalRow): number {
  const category = classifySignalRowSourceCategory(row);
  const tier = classifyUnifiedSourceTier(row, category);
  const haystack = rowTextHaystack(row);
  const intake = (extractTaggedNumber(row.alignment_tags, 'intake:score:') || Math.round(Number(row.relevance_score || 0) * 100)) / 100;
  const tierScore = tier === 't1' ? 0.18 : tier === 't1.5' ? 0.13 : tier === 't2' ? 0.08 : 0.03;
  const sourceScore =
    category === 'world-monitor'
      ? 0.24
      : haystack.includes('source:aihot') || haystack.includes('source:ai-news-radar')
        ? 0.23
        : category === 'public-anchor'
          ? 0.18
          : category === 'source-feed'
            ? 0.1
            : 0.08;
  const officialBoost = /(official|官网|官方|newsroom|engineering-blog|developers-blog|github-releases|source:world-monitor|source:aihot|source:ai-news-radar)/.test(haystack)
    ? 0.06
    : 0;
  const contentScore = clamp(normalizeText(row.description).length / 800, 0, 0.08);
  return sourceScore + tierScore + officialBoost + intake * 0.36 + Number(row.severity || 0) * 0.015 + contentScore;
}

function mergeEventClusterRows(rows: SignalRow[]): SignalRow {
  const primary = [...rows].sort(
    (left, right) =>
      sourceAuthorityScore(right) - sourceAuthorityScore(left) ||
      Number(right.relevance_score || 0) - Number(left.relevance_score || 0) ||
      new Date(right.event_time || right.created_at || 0).getTime() - new Date(left.event_time || left.created_at || 0).getTime(),
  )[0];
  const related = rows.filter((row) => row !== primary);
  const sourceNames = [...new Set(rows.map((row) => normalizeText(row.source_name)).filter(Boolean))].slice(0, 8);
  const relatedReports = related
    .map((row) => {
      const source = normalizeText(row.source_name) || 'unknown source';
      const title = normalizeText(row.title) || normalizeText(row.description);
      return title ? `${source}: ${title}` : source;
    })
    .filter(Boolean)
    .slice(0, 8);
  const mergedTags = [...new Set(rows.flatMap((row) => row.tags || []).filter(Boolean))];
  const mergedAlignmentTags = uniqueAlignmentTags([
    rows.length > 1 ? 'event:clustered' : null,
    rows.length > 1 ? `event:related-count:${rows.length - 1}` : null,
    rows.length > 1 ? `event:source-count:${sourceNames.length}` : null,
    rows.length > 1 ? `event:primary-source:${normalizeTag(primary.source_name || 'unknown')}` : null,
    ...(primary.alignment_tags || []),
    ...related.flatMap((row) => row.alignment_tags || []),
  ]);
  return {
    ...primary,
    title: primary.title,
    description:
      normalizeText(primary.description).length >= 24
        ? primary.description
        : rows
            .map((row) => row.description)
            .filter(Boolean)
            .sort((left, right) => normalizeText(right).length - normalizeText(left).length)[0] || primary.description,
    event_time: rows.map((row) => row.event_time).filter(Boolean).sort()[0] || primary.event_time,
    created_at: rows.map((row) => row.created_at).filter(Boolean).sort().reverse()[0] || primary.created_at,
    severity: Math.max(...rows.map((row) => Number(row.severity || 0))) || primary.severity,
    relevance_score: Math.max(...rows.map((row) => Number(row.relevance_score || 0))) || primary.relevance_score,
    tags: mergedTags,
    alignment_tags: mergedAlignmentTags,
    intensity: Math.max(...rows.map((row) => Number(row.intensity || 0))) || primary.intensity,
    mention_count: Math.max(...rows.map((row) => Number(row.mention_count || 0))) || primary.mention_count,
    urgency_reason:
      rows.length > 1
        ? `${normalizeText(primary.urgency_reason) || '同一事件多来源聚合'}；合并 ${rows.length} 条报道，主条来自 ${normalizeText(primary.source_name) || '当前最高权威来源'}。`
        : primary.urgency_reason,
    content_md:
      rows.length > 1
        ? [
            normalizeText(primary.content_md),
            `相关来源：${sourceNames.join('、')}`,
            relatedReports.length ? `补充报道：${relatedReports.join('；')}` : '',
          ].filter(Boolean).join('\n\n')
        : primary.content_md,
    last_seen_at: rows.map((row) => row.last_seen_at).filter(Boolean).sort().reverse()[0] || primary.last_seen_at,
  };
}

function clusterRelatedSignalRows(rows: SignalRow[]): EventClusterResult {
  const clusters: SignalRow[][] = [];
  for (const row of rows) {
    let matchedCluster: SignalRow[] | null = null;
    for (const cluster of clusters) {
      if (cluster.some((candidate) => signalRowsLookLikeSameEvent(row, candidate))) {
        matchedCluster = cluster;
        break;
      }
    }
    if (matchedCluster) {
      matchedCluster.push(row);
    } else {
      clusters.push([row]);
    }
  }

  const mergedRows = clusters.map(mergeEventClusterRows);
  const collapsedCount = rows.length - mergedRows.length;
  return {
    rows: mergedRows,
    clusterCount: clusters.filter((cluster) => cluster.length > 1).length,
    collapsedCount,
  };
}

async function fetchIcArticleDetailRow(articleId: string): Promise<Partial<SignalRow> | null> {
  const runtime = getRuntimeStore();
  const now = Date.now();
  const cached = runtime.icArticleDetailCache.get(articleId);
  if (cached && cached.expiresAt > now) {
    return cached.row;
  }

  try {
    const response = await fetch(`${getInformationCollectionBaseUrl()}/api/v1/articles/${articleId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: RawWorldMonitorItem };
    const detail = payload.data;
    if (!detail || typeof detail !== 'object') {
      return null;
    }

    const title = asText(detail.title) || 'Untitled IC article';
    const description = summarizeIcArticleDetail(
      title,
      asText(detail.description),
      asText(detail.content_md),
    );
    const sourceFeedName = asText(detail.source_feed_name) || 'IC Source Feed';
    const sourceType = asText(detail.source_type) || 'source-feed';
    const detailRow: Partial<SignalRow> = {
      title,
      description,
      source_name: sourceFeedName,
      source_url: asText(detail.url),
      event_time: asText(detail.publish_time) || asText(detail.created_at) || null,
      created_at: asText(detail.created_at) || null,
      tags: [
        'source-feed',
        sourceType,
        sourceFeedName,
        `feed:${sourceFeedName}`,
        `type:${sourceType}`,
        ...(Array.isArray(detail.tags) ? detail.tags.filter((tag): tag is string => typeof tag === 'string') : []),
      ].filter(Boolean),
      source_type: sourceType,
      source_feed_name: sourceFeedName,
      content_md: asText(detail.content_md),
    };

    runtime.icArticleDetailCache.set(articleId, {
      expiresAt: now + IC_ARTICLE_DETAIL_CACHE_TTL_MS,
      row: detailRow,
    });
    return detailRow;
  } catch {
    return null;
  }
}

async function enrichIcArticleRows(rows: SignalRow[]): Promise<SignalRow[]> {
  const candidates = rows
    .filter((row) => row.external_id)
    .slice(0, IC_ARTICLE_DETAIL_LIMIT);

  if (candidates.length === 0) {
    return rows;
  }

  const detailEntries = await Promise.all(
    candidates.map(async (row) => [row.external_id!, await fetchIcArticleDetailRow(row.external_id!)] as const),
  );
  const detailMap = new Map<string, Partial<SignalRow>>();
  for (const [articleId, detail] of detailEntries) {
    if (detail) {
      detailMap.set(articleId, detail);
    }
  }

  return rows.map((row) => {
    const articleId = row.external_id;
    if (!articleId) {
      return row;
    }

    const detail = detailMap.get(articleId);
    if (!detail) {
      return row;
    }

    return {
      ...row,
      title: normalizeText(detail.title).length >= normalizeText(row.title).length ? detail.title ?? row.title : row.title,
      description:
        normalizeText(detail.description).length >= normalizeText(row.description).length
          ? detail.description ?? row.description
          : row.description,
      source_name: detail.source_name || row.source_name,
      source_url: detail.source_url || row.source_url,
      event_time: row.event_time || detail.event_time || null,
      created_at: row.created_at || detail.created_at || null,
      tags: [...new Set([...(row.tags || []), ...(detail.tags || [])].filter(Boolean))],
      source_type: detail.source_type || row.source_type,
      source_feed_name: detail.source_feed_name || row.source_feed_name,
      content_md:
        normalizeText(detail.content_md).length >= normalizeText(row.content_md).length
          ? detail.content_md ?? row.content_md
          : row.content_md,
    };
  });
}

type MiniMaxTranslationItem = {
  id: string;
  title: string;
  summary: string;
  location: string;
};

type TranslationCacheEntry = {
  displayTitle?: string;
  displaySummary?: string;
  displayLocation?: string;
};

type TranslationCachePayload =
  | Record<string, TranslationCacheEntry>
  | {
      version?: number;
      updated_at?: string;
      entries?: Record<string, TranslationCacheEntry>;
    };

async function translateSignalsWithMiniMax(items: MiniMaxTranslationItem[]): Promise<Map<string, { displayTitle: string; displaySummary: string; displayLocation: string }>> {
  const result = new Map<string, { displayTitle: string; displaySummary: string; displayLocation: string }>();

  if (items.length === 0) {
    return result;
  }

  for (let start = 0; start < items.length; start += TRANSLATION_BATCH_SIZE) {
    const batch = items.slice(start, start + TRANSLATION_BATCH_SIZE);
    const promptBatch = batch.map((item, index) => ({
      id: String(index),
      title: item.title,
      summary: item.summary,
      location: item.location,
    }));
    const promptPrefix = [
      '把下面这些信号标题、摘要和地点翻成自然、简洁的中文。',
      '要求：',
      '1. 只做忠实翻译，不要改写成评论口吻。',
      '2. 专有名词优先使用常见中文译名；没有常见译名就保留原文。',
      '3. 返回 JSON 数组，每项包含 id、title、summary、location 四个字段；id 是短序号，必须原样返回。',
      '4. 前台默认是中文阅读，不要保留整段英文短语、英文括号注释、抓取痕迹或模板化线索词。',
      '5. 地名、国家、地区、事件类型要尽量译成中文；不要输出 Dogon Dawa, Kaduna, Nigeria 这种半翻译地名串。',
      '6. title 控制在 18 到 32 个中文字符左右，直接说具体事实；不要把多个来源标题串成一长句。',
      '7. summary 控制在 24 到 46 个中文字符左右，只写一句自然中文；说明发生了什么和影响，不要复述来源清单。',
      '8. 不要使用“后续重点”“值得继续看”“补充线索”“信号”“线索”“核实”“确认”“升级”等流程化说法。',
      '9. location 尽量控制在 2 到 12 个中文字符，用常见地名或地区名。',
      '10. 如果必须保留英文名，只保留必要专有名词，句子主体仍然必须是自然中文。',
      '11. 不要输出思考过程、不要输出 <think>，也不要输出 JSON 之外的任何内容。',
    ].join('\n');
    const promptData = JSON.stringify(promptBatch);

    try {
      const content =
        (await requestMiniMaxChatCompletion({
          system: '你是专业翻译助手，擅长把科技、时事和研究标题翻成自然中文。',
          promptPrefix,
          promptData,
          temperature: 0.2,
          timeoutMs: 60000,
          retryLimit: 0,
          requestLabel: 'translation request',
        })) || '';
      if (!content) {
        console.warn('[translate] MiniMax returned empty translation content');
        continue;
      }
      const parsed = parseMiniMaxJsonPayload<
        { items?: Array<{ id?: string; title?: string; summary?: string; location?: string }> } | Array<{ id?: string; title?: string; summary?: string; location?: string }>
      >(content);
      const list = firstArrayField<{
        id?: string;
        title?: string;
        summary?: string;
        location?: string;
        displayTitle?: string;
        displaySummary?: string;
        displayLocation?: string;
        displayTitleZh?: string;
        displaySummaryZh?: string;
        displayLocationZh?: string;
      }>(parsed, ['items', 'signals', 'results', 'data', 'translations']);
      if (list.length === 0) {
        const parsedKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed as Record<string, unknown>) : [];
        console.warn(`[translate] MiniMax JSON parsed but no translation array found; keys=${parsedKeys.slice(0, 8).join(',') || 'none'}`);
      }
      let acceptedInBatch = 0;
      for (const [index, item] of list.entries()) {
        const source = batch[Number(item?.id)] || batch[index];
        if (!source) continue;
        const displayTitle = cleanDisplayText(item.displayTitleZh || item.displayTitle || item.title || '');
        const displaySummary = cleanDisplayText(item.displaySummaryZh || item.displaySummary || item.summary || '');
        const displayLocation = cleanDisplayText(item.displayLocationZh || item.displayLocation || item.location || '');
        const translatedSummary = shouldRewriteDisplayText(displaySummary) ? '' : displaySummary;
        const translatedTitle = shouldRewriteDisplayText(displayTitle)
          ? translatedSummary
            ? signalSummaryHeadline(translatedSummary)
            : ''
          : displayTitle;
        const translatedLocation = shouldRewriteDisplayText(displayLocation) ? quickTranslatePlaceLabel(source.location) : displayLocation;
        if (translatedTitle || translatedSummary || translatedLocation) {
          acceptedInBatch += 1;
        }
        result.set(source.id, {
          displayTitle: translatedTitle,
          displaySummary: translatedSummary,
          displayLocation: translatedLocation,
        });
      }
      if (list.length > 0 && acceptedInBatch === 0) {
        const first = list[0] || {};
        console.warn(
          `[translate] MiniMax returned ${list.length} items but none passed readability checks; first=${cleanDisplayText(`${first.title || first.displayTitle || first.displayTitleZh || ''} ${first.summary || first.displaySummary || first.displaySummaryZh || ''}`).slice(0, 180)}`,
        );
      }
    } catch (error) {
      console.warn('[MiniMax] Translation parse failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

async function ensureTranslatedSignalsLoaded(): Promise<void> {
  const runtime = getRuntimeStore();
  if (runtime.translationsLoaded) {
    return;
  }

  runtime.translationsLoaded = true;
  try {
    const raw = await fs.readFile(TRANSLATION_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as TranslationCachePayload;
    const isVersionedPayload =
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      'entries' in parsed;
    const entries = isVersionedPayload
      ? ((parsed as { entries?: Record<string, TranslationCacheEntry> }).entries || {})
      : (parsed as Record<string, TranslationCacheEntry>);
    const cacheVersion = isVersionedPayload ? ((parsed as { version?: number }).version ?? 1) : 1;

    for (const [signalId, entry] of Object.entries(entries)) {
      const displayTitle = cleanDisplayText(entry.displayTitle || '');
      const displaySummary = cleanDisplayText(entry.displaySummary || '');
      const displayLocation = cleanDisplayText(entry.displayLocation || '');
      if (!displayTitle && !displaySummary && !displayLocation) continue;
      if (cacheVersion < TRANSLATION_CACHE_VERSION && shouldRewriteDisplayText(`${displayTitle} ${displaySummary} ${displayLocation}`)) {
        continue;
      }
      runtime.translatedSignals.set(signalId, {
        displayTitle,
        displaySummary,
        displayLocation,
      });
    }
  } catch {
    // ignore cold-start cache miss
  }
}

async function reloadTranslatedSignals(): Promise<void> {
  const runtime = getRuntimeStore();
  runtime.translationsLoaded = false;
  runtime.translatedSignals.clear();
  await ensureTranslatedSignalsLoaded();
}

async function persistTranslatedSignals(): Promise<void> {
  const runtime = getRuntimeStore();
  try {
    await fs.mkdir(path.dirname(TRANSLATION_CACHE_FILE), { recursive: true });
    const payload = {
      version: TRANSLATION_CACHE_VERSION,
      updated_at: new Date().toISOString(),
      entries: Object.fromEntries(runtime.translatedSignals.entries()),
    };
    await fs.writeFile(TRANSLATION_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[translate] failed to persist cache:', error instanceof Error ? error.message : String(error));
  }
}

function normalizeAlignmentTag(value: string): string {
  return normalizeTag(value)
    .replace(/[^a-z0-9\u3400-\u9fff:-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function uniqueAlignmentTags(tags: Array<string | null | undefined>): string[] {
  return [...new Set(tags.map((tag) => normalizeAlignmentTag(tag || '')).filter(Boolean))].slice(0, 16);
}

function buildAlignmentCacheKey(row: SignalRow): string {
  const sourceUrl = normalizeSourceUrl(normalizeText(row.source_url));
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  return buildSignalSignature(row);
}

function shouldAlignRowWithModel(row: SignalRow): boolean {
  const tags = (row.tags || []).map(normalizeTag);
  const sourceName = normalizeTag(row.source_name || '');
  return Boolean(
    row.source_type ||
      tags.includes('source-feed') ||
      tags.includes('literature') ||
      tags.includes('research') ||
      sourceName.includes('ic-') ||
      sourceName.includes('ic-source') ||
      sourceName.includes('ic-literature'),
  );
}

function applySignalAlignment(row: SignalRow, alignment?: SignalAlignment): SignalRow {
  if (!alignment) {
    return row;
  }

  const aiBinaryTag =
    typeof alignment.isAiRelated === 'boolean'
      ? alignment.isAiRelated
        ? 'model:ai-related'
        : 'model:not-ai-related'
      : null;
  const lowInformationTag = alignment.lowInformation ? 'model:low-information' : null;
  const reviewTag = alignment.needsReview ? 'model:needs-review' : null;
  const eventTypeTag = alignment.eventType ? `event:${alignment.eventType}` : null;
  const bucketTag = alignment.dailyBucket ? `daily:${alignment.dailyBucket}` : null;
  const sceneTag = alignment.scene && alignment.scene !== 'ignore' ? `scene:${alignment.scene}` : null;
  const modelTags = (alignment.tagsZh || []).map((tag) => `model-tag:${tag}`);
  const nextAlignmentTags = uniqueAlignmentTags([
    ...(row.alignment_tags || []),
    aiBinaryTag,
    lowInformationTag,
    reviewTag,
    eventTypeTag,
    bucketTag,
    sceneTag,
    ...modelTags,
  ]);
  const displayTitle = cleanDisplayText(alignment.displayTitleZh || '');
  const displaySummary = cleanDisplayText(alignment.displaySummaryZh || '');
  return {
    ...row,
    title: displayTitle && !alignment.lowInformation ? displayTitle : row.title,
    description: displaySummary && !alignment.lowInformation ? displaySummary : row.description,
    alignment_tags: nextAlignmentTags,
  };
}

async function ensureSignalAlignmentsLoaded(): Promise<void> {
  const runtime = getRuntimeStore();
  if (runtime.alignmentsLoaded) {
    return;
  }

  runtime.alignmentsLoaded = true;
  try {
    const raw = await fs.readFile(ALIGNMENT_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SignalAlignment>;
    for (const [cacheKey, entry] of Object.entries(parsed)) {
      const normalized = sanitizeSignalNormalization(entry as Record<string, unknown>);
      if (normalized) {
        runtime.signalAlignments.set(cacheKey, normalized);
      }
    }
  } catch {
    // ignore cold-start cache miss
  }
}

async function persistSignalAlignments(): Promise<void> {
  const runtime = getRuntimeStore();
  try {
    await fs.mkdir(path.dirname(ALIGNMENT_CACHE_FILE), { recursive: true });
    const payload = Object.fromEntries(runtime.signalAlignments.entries());
    await fs.writeFile(ALIGNMENT_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[alignment] failed to persist cache:', error instanceof Error ? error.message : String(error));
  }
}

async function classifySignalRowsWithMiniMax(
  rows: Array<{ cacheKey: string; row: SignalRow }>,
): Promise<Map<string, SignalAlignment>> {
  const result = new Map<string, SignalAlignment>();

  if (rows.length === 0) {
    return result;
  }

  for (let start = 0; start < rows.length; start += ALIGNMENT_BATCH_SIZE) {
    const batch = rows.slice(start, start + ALIGNMENT_BATCH_SIZE).map(({ cacheKey, row }) => ({
      id: cacheKey,
      title: normalizeText(row.title),
      summary: normalizeText(row.description).slice(0, 360),
      sourceName: normalizeText(row.source_name),
      sourceType: normalizeText(row.source_type),
      feedName: normalizeText(row.source_feed_name),
      tags: row.tags || [],
    }));
    const promptPrefix = buildSignalNormalizationPromptPrefix();
    const promptData = JSON.stringify(batch);

    try {
      const content =
        (await requestMiniMaxChatCompletion({
          system: '你是信源分流和风险标注助手，只返回可解析 JSON。',
          promptPrefix,
          promptData,
          temperature: 0.1,
          requestLabel: 'ai binary label request',
        })) || '';
      if (!content) {
        continue;
      }
      let parsed:
        | Array<Record<string, unknown> & { id?: string }>
        | { items?: Array<Record<string, unknown> & { id?: string }> };
      try {
        parsed = parseMiniMaxJsonPayload<
          | Array<Record<string, unknown> & { id?: string }>
          | { items?: Array<Record<string, unknown> & { id?: string }> }
        >(content);
      } catch {
        parsed = parseMiniMaxJsonLines<Record<string, unknown> & { id?: string }>(
          content,
        );
      }
      const list = firstArrayField<Record<string, unknown> & { id?: string }>(parsed, [
        'items',
        'signals',
        'results',
        'data',
        'translations',
      ]);

      for (const item of list) {
        if (!item?.id) continue;
        const normalized = sanitizeSignalNormalization(item);
        if (!normalized) continue;
        result.set(item.id, normalized);
      }
    } catch (error) {
      console.warn('[MiniMax] AI binary label parse failed:', error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

async function ensureSignalRowAlignments(
  rows: SignalRow[],
  options: { allowModelRefresh?: boolean } = {},
): Promise<SignalRow[]> {
  const runtime = getRuntimeStore();
  await ensureSignalAlignmentsLoaded();
  const allowModelRefresh = isBatchModelRefreshAllowed(options);

  const candidates: Array<{ cacheKey: string; row: SignalRow }> = [];
  for (const row of rows) {
    if (!shouldAlignRowWithModel(row)) {
      continue;
    }

    const cacheKey = buildAlignmentCacheKey(row);
    if (!runtime.signalAlignments.has(cacheKey)) {
      candidates.push({ cacheKey, row });
    }
  }

  const limitedCandidates = candidates.slice(0, ALIGNMENT_PRIME_LIMIT);
  if (limitedCandidates.length > 0 && allowModelRefresh && !runtime.alignmentsInFlight) {
    runtime.alignmentsInFlight = true;
    console.log(`[alignment] priming ${limitedCandidates.length} new-source signals with ${MINIMAX_MODEL} for display normalization`);
    try {
      const aligned = await withWorldBatchModelRefresh(() => classifySignalRowsWithMiniMax(limitedCandidates));
      for (const [cacheKey, alignment] of aligned.entries()) {
        runtime.signalAlignments.set(cacheKey, alignment);
      }
      if (aligned.size > 0) {
        await persistSignalAlignments();
      }
      console.log(`[alignment] primed ${aligned.size}/${limitedCandidates.length} signals`);
    } finally {
      runtime.alignmentsInFlight = false;
    }
  }

  return rows.map((row) => applySignalAlignment(row, runtime.signalAlignments.get(buildAlignmentCacheKey(row))));
}

function normalizeCachedSignal(signal: WorldSignal): WorldSignal {
  return {
    ...signal,
    alignmentTags: Array.isArray(signal.alignmentTags)
      ? signal.alignmentTags.filter((tag) => normalizeTag(tag) !== 'model:aligned')
      : [],
    intensity: typeof signal.intensity === 'number' ? signal.intensity : null,
    mentionCount: typeof signal.mentionCount === 'number' ? signal.mentionCount : null,
    urgencyReason: normalizeText(signal.urgencyReason),
  };
}

function normalizeSignalCachePayload(payload: Partial<SignalCachePayload> | null | undefined): SignalCachePayload | null {
  if (!payload || payload.version !== SIGNAL_CACHE_VERSION || !Array.isArray(payload.signals) || typeof payload.expiresAt !== 'number') {
    return null;
  }
  return {
    version: payload.version,
    expiresAt: payload.expiresAt,
    signals: payload.signals.map((signal) => normalizeCachedSignal(signal as WorldSignal)),
    sourceIntakeStats: payload.sourceIntakeStats ?? null,
  };
}

function isDangerouslyShrunkenSignalSet(nextSignals: WorldSignal[], previousSignals: WorldSignal[]) {
  if (previousSignals.length < 160) return false;
  const shrinkFloor = Math.max(160, Math.floor(previousSignals.length * 0.45));
  return nextSignals.length < shrinkFloor;
}

function buildWorldSignalCacheKey(signal: WorldSignal): string {
  const sourceUrl = normalizeSourceUrl(normalizeText(signal.sourceUrl));
  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  const title = normalizeSignatureText(normalizeText(signal.title || signal.displayTitle));
  const sourceName = normalizeSignatureText(normalizeText(signal.sourceName));
  const day = (signal.publishedAt || signal.observedAt || '').slice(0, 10);
  return `title:${title}|source:${sourceName}|day:${day}|id:${signal.id}`;
}

function mergeRefreshedSignalsWithPrevious(nextSignals: WorldSignal[], previousSignals: WorldSignal[]): WorldSignal[] {
  const byKey = new Map<string, WorldSignal>();
  for (const signal of previousSignals) {
    byKey.set(buildWorldSignalCacheKey(signal), signal);
  }
  for (const signal of nextSignals) {
    byKey.set(buildWorldSignalCacheKey(signal), signal);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      new Date(right.publishedAt || right.observedAt).getTime() -
        new Date(left.publishedAt || left.observedAt).getTime() ||
      right.relevanceScore - left.relevanceScore ||
      right.severity - left.severity,
  );
}

async function readSignalDiskCachePayload(allowExpired = false): Promise<SignalCachePayload | null> {
  const runtime = getRuntimeStore();
  try {
    const raw = await fs.readFile(SIGNAL_CACHE_FILE, 'utf-8');
    const parsed = normalizeSignalCachePayload(JSON.parse(raw) as Partial<SignalCachePayload>);
    if (!parsed) {
      runtime.sourceIntakeStats = null;
      return null;
    }

    if (!allowExpired && parsed.expiresAt <= Date.now()) {
      runtime.sourceIntakeStats = null;
      return null;
    }

    runtime.sourceIntakeStats = parsed.sourceIntakeStats ?? null;
    return parsed;
  } catch {
    runtime.sourceIntakeStats = null;
    return null;
  }
}

async function readSignalDiskCache(allowExpired = false): Promise<WorldSignal[] | null> {
  const payload = await readSignalDiskCachePayload(allowExpired);
  return payload?.signals || null;
}

async function persistSignalDiskCache(
  signals: WorldSignal[],
  sourceIntakeStats: WorldSourceIntakeStats | null,
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SIGNAL_CACHE_FILE), { recursive: true });
    const existingPayload = await readSignalDiskCachePayload(true);
    if (existingPayload && isDangerouslyShrunkenSignalSet(signals, existingPayload.signals)) {
      console.warn(
        `[signals] skip cache overwrite because refreshed set shrank too much (${signals.length} < ${existingPayload.signals.length})`,
      );
      return;
    }
    const payload: SignalCachePayload = {
      version: SIGNAL_CACHE_VERSION,
      expiresAt: Date.now() + SIGNALS_CACHE_TTL_MS,
      signals,
      sourceIntakeStats,
    };
    await fs.writeFile(SIGNAL_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[signals] failed to persist cache:', error instanceof Error ? error.message : String(error));
  }
}

async function ensureRuntimeHistoryLoaded(): Promise<void> {
  const runtime = getRuntimeStore();
  if (runtime.historyLoaded) {
    return;
  }

  runtime.historyLoaded = true;
  try {
    const raw = await fs.readFile(RUNTIME_HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RuntimeHistoryPayload>;

    runtime.reports = Array.isArray(parsed.reports)
      ? enrichReportsWithGraphMetadata(parsed.reports.map(rewriteLegacyReportVoice).map(normalizeValidationState))
      : [];
    runtime.missions = new Map(
      Array.isArray(parsed.missions)
        ? parsed.missions
            .filter((entry): entry is { missionId: string; briefing: WorldBriefing; createdAt: number } =>
              Boolean(entry && typeof entry.missionId === 'string' && entry.briefing && typeof entry.createdAt === 'number'),
            )
            .map((entry) => [entry.missionId, { briefing: entry.briefing, createdAt: entry.createdAt }] as const)
        : [],
    );
    runtime.xiaTrails = new Map(
      Array.isArray(parsed.xiaTrails)
        ? parsed.xiaTrails
            .filter((entry): entry is RuntimeHistoryPayload['xiaTrails'][number] =>
              Boolean(entry && typeof entry.xiaId === 'string' && typeof entry.signalId === 'string'),
            )
            .map((entry) => [
              entry.xiaId,
              {
                signalId: entry.signalId,
                region: entry.region,
                lat: entry.lat,
                lng: entry.lng,
                updatedAt: entry.updatedAt,
              },
            ] as const)
        : [],
    );
    runtime.regionHistory = new Map(Array.isArray(parsed.regionHistory) ? parsed.regionHistory : []);
    runtime.topicHistory = new Map(Array.isArray(parsed.topicHistory) ? parsed.topicHistory : []);
    runtime.lastCoverageAt = new Map(Array.isArray(parsed.lastCoverageAt) ? parsed.lastCoverageAt : []);

    pruneStoredReports(runtime);
    pruneStoredMissions(runtime);
    pruneXiaTrails(runtime);
    await ensureReportsGraphMetadataBackfilled(runtime);
  } catch {
    // ignore cold-start cache miss
  }
}

async function persistRuntimeHistory(runtime: RuntimeStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(RUNTIME_HISTORY_FILE), { recursive: true });
    const payload: RuntimeHistoryPayload = {
      reports: runtime.reports.slice(0, MAX_STORED_REPORTS),
      missions: [...runtime.missions.entries()].map(([missionId, value]) => ({
        missionId,
        briefing: value.briefing,
        createdAt: value.createdAt,
      })),
      xiaTrails: [...runtime.xiaTrails.entries()].map(([xiaId, value]) => ({
        xiaId,
        signalId: value.signalId,
        region: value.region,
        lat: value.lat,
        lng: value.lng,
        updatedAt: value.updatedAt,
      })),
      regionHistory: [...runtime.regionHistory.entries()],
      topicHistory: [...runtime.topicHistory.entries()],
      lastCoverageAt: [...runtime.lastCoverageAt.entries()],
    };
    await fs.writeFile(RUNTIME_HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[history] failed to persist runtime state:', error instanceof Error ? error.message : String(error));
  }
}

function getDefaultDisplaySignal(
  signal: DisplaySignalInput & Pick<WorldSignal, 'coverageGap' | 'hotspotScore'>,
) {
  const lowInformationTitle = isLowInformationSignalTitle(signal.title, signal.summary);
  return {
    displayTitle:
      lowInformationTitle
        ? signalSummaryHeadline(signal.summary)
        : !shouldRewriteDisplayText(signal.title) && cleanDisplayText(signal.title).length <= 34
        ? cleanDisplayText(signal.title)
        : buildDisplayTitle(signal),
    displaySummary: !shouldRewriteDisplayText(signal.summary) ? cleanDisplayText(signal.summary) : buildDisplaySummary(signal),
  };
}

function needsBetterTranslation(
  signal: Pick<WorldSignal, 'title' | 'summary' | 'locationName' | 'country' | 'region' | 'scene'>,
  translated?: { displayTitle: string; displaySummary: string; displayLocation: string },
): boolean {
  if (!translated) {
    return true;
  }

  const titleNeedsWork = shouldRewriteDisplayText(translated.displayTitle);
  const summaryNeedsWork = shouldRewriteDisplayText(translated.displaySummary);
  const translatedLocation = cleanDisplayText(translated.displayLocation);
  const locationNeedsWork = shouldRewriteDisplayText(translatedLocation);
  return titleNeedsWork || summaryNeedsWork || locationNeedsWork;
}

function localizeSignalForCoverage(signal: WorldSignal) {
  const runtime = getRuntimeStore();
  const localized = {
    displayTitle: buildDisplayTitle(signal),
    displaySummary: buildDisplaySummary(signal),
    displayLocation: buildDisplayLocation(signal),
    topicLabel: buildTopicLabel(signal),
  };

  runtime.localizedSignals.set(signal.id, localized);
  return localized;
}

async function primeSignalTranslations(signals: WorldSignal[]): Promise<void> {
  const runtime = getRuntimeStore();
  await ensureTranslatedSignalsLoaded();
  const candidates = signals
    .filter((signal) => !runtime.localizedSignals.has(signal.id))
    .filter((signal) => needsBetterTranslation(signal, runtime.translatedSignals.get(signal.id)))
    .filter((signal) => !containsCjk(signal.title) || !containsCjk(signal.summary) || !containsCjk(signal.locationName || signal.country || signal.region))
    .slice(0, TRANSLATION_PRIME_LIMIT)
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      summary: signal.summary,
      location: [signal.locationName, signal.country].filter(Boolean).join(', ') || signal.region || sceneLabel(signal.scene),
    }));

  if (candidates.length === 0) {
    return;
  }

  console.log(`[translate] priming ${candidates.length} signals with ${MINIMAX_MODEL}`);

  const translated = await translateSignalsWithMiniMax(candidates);
  console.log(`[translate] translated ${translated.size}/${candidates.length} signals`);
  for (const [signalId, entry] of translated.entries()) {
    runtime.translatedSignals.set(signalId, entry);
  }
  if (translated.size > 0) {
    void persistTranslatedSignals();
  }
}

async function primeDashboardSignalTranslations(scene: WorldScene, signals: WorldSignal[], allowModelRefresh: boolean): Promise<void> {
  if (!allowModelRefresh || signals.length === 0) {
    return;
  }

  const sceneSignals = scene === 'global' ? signals : signals.filter((signal) => signalMatchesScene(signal, scene));
  const scopedSignals = sceneSignals.length || scene !== 'global' ? sceneSignals : signals;
  const timelineSignals = selectTimelineEventSignals(scopedSignals);
  const topSignals = buildTopSignalFeed(timelineSignals.length ? timelineSignals : scopedSignals).slice(0, DASHBOARD_TRANSLATION_SYNC_LIMIT);
  const visibleSignals = Array.from(
    new Map(
      [
        ...topSignals,
        ...timelineSignals.slice(0, DASHBOARD_TRANSLATION_SYNC_LIMIT),
        ...scopedSignals.slice(0, DASHBOARD_TRANSLATION_SYNC_LIMIT),
      ].map((signal) => [signal.id, signal]),
    ).values(),
  );

  await withWorldBatchModelRefresh(() => primeSignalTranslations(visibleSignals));
}

async function _ensureSignalTranslations(signals: WorldSignal[]): Promise<void> {
  const runtime = getRuntimeStore();
  await ensureTranslatedSignalsLoaded();
  const candidates = signals
    .filter((signal) => !runtime.localizedSignals.has(signal.id))
    .filter((signal) => needsBetterTranslation(signal, runtime.translatedSignals.get(signal.id)))
    .filter((signal) => !containsCjk(signal.title) || !containsCjk(signal.summary) || !containsCjk(signal.locationName || signal.country || signal.region))
    .slice(0, VISIBLE_TRANSLATION_BATCH_SIZE)
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      summary: signal.summary,
      location: [signal.locationName, signal.country].filter(Boolean).join(', ') || signal.region || sceneLabel(signal.scene),
    }));

  if (candidates.length === 0) {
    return;
  }

  if (runtime.translationsInFlight) {
    return;
  }

  runtime.translationsInFlight = true;
  console.log(`[translate] priming ${candidates.length} visible signals with ${MINIMAX_MODEL}`);
  void (async () => {
    try {
      const translated = await translateSignalsWithMiniMax(candidates);
      for (const [signalId, entry] of translated.entries()) {
        runtime.translatedSignals.set(signalId, entry);
      }
      if (translated.size > 0) {
        await persistTranslatedSignals();
      }
      console.log(`[translate] primed ${translated.size}/${candidates.length} visible signals`);
    } finally {
      runtime.translationsInFlight = false;
    }
  })();
}

async function materializeLocalizedSignals(signals: WorldSignal[]): Promise<WorldSignal[]> {
  await ensureTranslatedSignalsLoaded();
  return signals.map((signal) => {
    const localized = getLocalizedSignal(signal);
    return {
      ...signal,
      displayTitle: localized.displayTitle,
      displaySummary: localized.displaySummary,
      locationName: localized.displayLocation || signal.locationName,
    };
  });
}

function getLocalizedSignal(signal: WorldSignal) {
  const runtime = getRuntimeStore();
  const localized = runtime.localizedSignals.get(signal.id);
  if (localized) {
    if (isLowInformationSignalTitle(signal.title, signal.summary)) {
      return {
        ...localized,
        displayTitle: signalSummaryHeadline(signal.summary),
        displayLocation: localized.displayLocation || buildDisplayLocation(signal),
      };
    }
    return localized;
  }

  const translated = runtime.translatedSignals.get(signal.id);
  if (translated) {
    const fallback = getDefaultDisplaySignal(signal);
    const translatedTitle = shouldRewriteDisplayText(translated.displayTitle) ? '' : cleanDisplayText(translated.displayTitle);
    const translatedSummary = shouldRewriteDisplayText(translated.displaySummary) ? '' : cleanDisplayText(translated.displaySummary);
    const translatedSummaryTitle =
      translatedSummary && !shouldRewriteDisplayText(translatedSummary)
        ? signalSummaryHeadline(translatedSummary)
        : '';
    if (isLowInformationSignalTitle(signal.title, signal.summary)) {
      return {
        displayTitle: translatedTitle || translatedSummaryTitle || fallback.displayTitle,
        displaySummary: translatedSummary || fallback.displaySummary,
        displayLocation: shouldRewriteDisplayText(translated.displayLocation) ? buildDisplayLocation(signal) : translated.displayLocation,
        topicLabel: buildTopicLabel(signal),
      };
    }
    return {
      displayTitle: translatedTitle || translatedSummaryTitle || fallback.displayTitle,
      displaySummary: translatedSummary || fallback.displaySummary,
      displayLocation: shouldRewriteDisplayText(translated.displayLocation) ? buildDisplayLocation(signal) : translated.displayLocation,
      topicLabel: buildTopicLabel(signal),
    };
  }

  return {
    ...getDefaultDisplaySignal(signal),
    displayLocation: buildDisplayLocation(signal),
    topicLabel: buildTopicLabel(signal),
  };
}

function inferScene(title: string, summary: string, tags: string[], sourceName = '', sourceType = ''): WorldScene {
  const normalizedTags = tags.map(normalizeTag).filter(Boolean);
  const explicitScene = normalizedTags
    .filter((tag) => tag.startsWith('scene:'))
    .map((tag) => tag.replace(/^scene:/, ''))
    .find((tag) => ['war', 'technology', 'capacity', 'finance', 'health', 'global'].includes(tag));
  if (explicitScene) {
    return explicitScene;
  }

  const haystack = normalizeTag(`${title} ${summary} ${sourceName} ${sourceType}`);
  const financeHaystack = normalizeTag(`${summary} ${sourceName} ${sourceType}`);
  const tagHaystack = normalizeTag(tags.join(' '));
  const normalizedTitle = normalizeTag(title);
  const normalizedSourceName = normalizeTag(sourceName);
  const normalizedSourceType = normalizeTag(sourceType);
  const scores: Record<WorldScene, number> = {
    global: 0,
    war: 0,
    technology: 0,
    capacity: 0,
    finance: 0,
    health: 0,
  };

  const addScore = (scene: WorldScene, score: number) => {
    scores[scene] += score;
  };

  const hasTag = (...values: string[]) => normalizedTags.some((tag) => values.includes(tag));
  const hasPattern = (pattern: RegExp) => pattern.test(haystack);
  const hasTagPattern = (pattern: RegExp) => pattern.test(tagHaystack);
  const hasFinancePattern = (pattern: RegExp) => pattern.test(financeHaystack);

  for (const tag of normalizedTags) {
    if (['war', 'conflict', 'security', 'military', 'missile', 'ceasefire', 'sanction'].includes(tag)) addScore('war', 3);
    if (['technology', 'ai', 'llm', 'research', 'chip', 'chips', 'semiconductor', 'model'].includes(tag)) addScore('technology', 3);
    if (['capacity', 'shipping', 'energy', 'supply-chain', 'logistics', 'manufacturing', 'commodities'].includes(tag)) addScore('capacity', 3);
    if (['finance', 'market', 'macro', 'policy', 'monitor-snapshot', 'bank', 'bond', 'equity', 'anchor'].includes(tag)) addScore('finance', 3);
    if (['health', 'outbreak', 'biosecurity', 'clinical', 'vaccine', 'disease', 'virus', 'who'].includes(tag)) addScore('health', 3);
  }

  const warPattern = /(iran|israel|ukraine|russia|tehran|gaza|hormuz|missile|sanction|military|border|diplom|war|conflict|ceasefire|idf|hamas|drone strike|airstrike|shelling|troops|front line|west bank)/;
  const technologyPattern =
    /((^|[^a-z])(ai|llm|gpu|chip|chips|semiconductor|server|datacenter|cloud|technology|robot|robotics|claude|openai|chatgpt|gemini)([^a-z]|$))|(人工智能|大模型|模型|芯片|半导体|算力|服务器|机器人|科技|智能体)/;
  const capacityPattern =
    /((^|[^a-z])(oil|lng|gas|opec|energy|refinery|crude|shipping|pipeline|factory|manufacturing|capacity|electronics|logistics|supply chain|commodit)([^a-z]|$))|(供应链|物流|产能|能源|航运|炼厂|工厂|产线)/;
  const financePattern =
    /((^|[^a-z])(stock|market|bond|equity|finance|trader|yield|index|earnings|crypto|btc|treasury|alphavantage|binance|coingecko|coinbase|eastmoney|nse|banking|macro|gdp|cpi)([^a-z]|$))|(宏观|市场|金融|股市|债券|收益率|通胀|加密|比特币|银行)/;
  const healthPattern =
    /((^|[^a-z])(outbreak|virus|disease|health|who|cdc|clinical|medic|hospital|vaccine|biosecurity|epidemic|influenza|rabies|marburg|nipah)([^a-z]|$))|(疫情|病毒|疾病|医疗|医院|疫苗|公共卫生|生物安全)/;
  const crimeIncidentPattern =
    /((^|[^a-z])(arrest|detain|charged|charge|court|custody|convict|killer|killing|suicide|shooting|murder|rape|rapist|police|foil|crash|freeway|domestic violence|fugitive|hospitalized|student suicide)([^a-z]|$))|(逮捕|拘留|起诉|法院|枪击|谋杀|强奸|警方|车祸|袭击|自杀)/;

  if (hasPattern(warPattern)) addScore('war', 2);
  if (hasPattern(technologyPattern)) addScore('technology', 2);
  if (hasPattern(capacityPattern)) addScore('capacity', 2);
  if (hasFinancePattern(financePattern)) addScore('finance', 2);
  if (hasPattern(healthPattern)) addScore('health', 2);

  const financeSource =
    /openfda|alphavantage|binance|coingecko|coinbase|eastmoney/.test(normalizedSourceName) ||
    /(^|[^a-z])nse([^a-z]|$)/.test(normalizedSourceName);
  const techSource =
    /(新智元|机器之心|量子位|极客公园|deeptech|ai科技评论|深度学习与nlp|arxiv|openalex|semantic-scholar|semanticscholar)/.test(
      normalizedSourceName,
    );
  const healthSource = normalizedSourceName.includes('who');
  const warSignal = hasTag('war', 'conflict', 'security', 'military', 'missile', 'ceasefire', 'sanction') || hasPattern(warPattern);
  const healthSignal = hasTag('health', 'outbreak', 'biosecurity', 'clinical', 'vaccine', 'disease', 'virus', 'who') || hasPattern(healthPattern);
  const capacitySignal = hasTag('capacity', 'shipping', 'energy', 'supply-chain', 'logistics', 'manufacturing', 'commodities') || hasPattern(capacityPattern);
  const _technologySignal =
    hasTag('technology', 'ai', 'llm', 'research', 'chip', 'chips', 'semiconductor', 'model') ||
    hasPattern(technologyPattern) ||
    techSource;
  const _financeSignal =
    hasTag('finance', 'market', 'macro', 'policy', 'monitor-snapshot', 'bank', 'bond', 'equity', 'anchor') ||
    hasFinancePattern(financePattern) ||
    financeSource;

  const contentTechnologySignal =
    hasTag('technology', 'ai', 'llm', 'research', 'chip', 'chips', 'semiconductor', 'model') || hasPattern(technologyPattern);
  const contentFinanceSignal = hasFinancePattern(financePattern);
  const sourceFeedLike = /(source-feed|we-mp-rss|rss)/.test(normalizedSourceType) || hasTag('source-feed', 'we-mp-rss');

  if (healthSource) addScore('health', 3);
  if (financeSource) addScore('finance', 3);
  if (techSource) addScore('technology', contentTechnologySignal ? 2 : 1);
  if (/(source-feed|literature|we-mp-rss)/.test(normalizedSourceType) && /(paper|research|model|llm|ai|claude|openai|chatgpt|gemini|人工智能|大模型)/.test(haystack)) {
    addScore('technology', 2);
  }

  if (sourceFeedLike && contentTechnologySignal && !financeSource) {
    addScore('technology', 2);
    if (hasTag('market')) addScore('finance', -2);
    if (hasTag('finance') && !contentFinanceSignal) addScore('finance', -3);
    if ((hasTag('finance') || hasTag('market') || hasTagPattern(/(^|[^a-z])(finance|market)([^a-z]|$)/)) && !contentFinanceSignal) {
      addScore('finance', -4);
    }
  }

  if (hasTag('incident') || hasPattern(crimeIncidentPattern)) {
    if (!financeSource && !contentFinanceSignal) addScore('finance', -4);
    if (!contentTechnologySignal) addScore('technology', -4);
    if (!capacitySignal) addScore('capacity', -3);
    if (!warSignal && !healthSignal) addScore('global', 2);
  }

  if ((hasTag('incident') || hasPattern(crimeIncidentPattern)) && /^market[-,]/.test(normalizedTitle) && !financeSource) {
    addScore('finance', -6);
    addScore('global', 1);
  }

  if (/gas-station/.test(haystack)) {
    addScore('capacity', -6);
    addScore('global', 1);
  }

  const ranked = (['war', 'technology', 'capacity', 'finance', 'health'] as WorldScene[])
    .map((scene) => [scene, scores[scene]] as const)
    .sort((a, b) => b[1] - a[1]);
  const [bestScene, bestScore] = ranked[0];
  const secondScore = ranked[1]?.[1] || 0;

  if (bestScore < 2 || bestScore === secondScore) {
    return 'global';
  }

  return bestScene;
}

function isWeakSignalSignal(signal: Pick<WorldSignal, 'title' | 'summary' | 'tags' | 'sourceName' | 'sourceUrl'>): boolean {
  const haystack = normalizeTag([signal.title, signal.summary, signal.tags.join(' '), signal.sourceName, signal.sourceUrl].join(' '));
  return /(reddit|xcom|twitter|bluesky|polymarket|truthsocial|hackernews|youtube|tiktok|instagram|social|forum|community)/.test(
    haystack,
  );
}

function techAiSceneScore(signal: Pick<WorldSignal, 'scene' | 'alignmentTags' | 'sourceName' | 'sourceUrl' | 'title' | 'summary' | 'tags'>): number {
  const haystack = normalizeTag([
    signal.title,
    signal.summary,
    signal.tags.join(' '),
    signal.sourceName,
    signal.sourceUrl,
    signal.scene,
    signal.alignmentTags.join(' '),
  ].join(' '));
  const sourceHaystack = normalizeTag([signal.sourceName, signal.sourceUrl, signal.alignmentTags.join(' ')].join(' '));
  const contentHaystack = normalizeTag([signal.title, signal.summary].join(' '));
  const rawContentHaystack = [signal.title, signal.summary].join(' ');
  let score = 0;

  if (/(source:aihot|source:ai-news-radar|aihot|ai-hot|ai-news-radar)/.test(sourceHaystack)) {
    score += 4.5;
  } else if (/model:ai-related/.test(sourceHaystack)) {
    score += 3;
  } else if (/model:not-ai-related/.test(sourceHaystack)) {
    score -= 4;
  } else if (/(ai\s*&\s*ml|ai-news|机器之心|量子位|新智元|智猩猩|ai科技评论|深度学习与nlp|ai工程化|aigc|ai信息gap|玄姐聊agi|袋鼠帝ai)/.test(sourceHaystack)) {
    score += 1.5;
  }
  if (/(openai|anthropic|claude|hugging\s*face|berkeley\s*rdi|deepmind|google\s*ai|meta\s*ai|mistral|xai|qwen|deepseek)/.test(haystack)) {
    score += 3;
  }
  if (/(\bllm\b|chatgpt|gemini|codex|aigc|transformer|diffusion|multimodal|neural\s*network|人工智能|大模型|智能体|多模态|生成式|推理模型|基础模型|模型训练|模型推理)/.test(contentHaystack)) {
    score += 3;
  }
  if (/(^|[^A-Za-z])AI([^A-Za-z]|$)/.test(rawContentHaystack)) {
    score += 2.5;
  }
  if (/(machine\s*learning|deep\s*learning|ai\s*agent|agentic|ai-agent|aiagent|inference|fine-tuning|embedding|prompt|eval|benchmark|机器学习|深度学习|模型|推理|训练|提示词|评测|基准)/.test(contentHaystack)) {
    score += 2;
  }
  if (/(gpu|nvidia|chip|semiconductor|datacenter|data\s*center|算力|芯片|数据中心|开源|arxiv|github|mcp|workflow|tool|skill)/.test(contentHaystack)) {
    score += 1;
  }
  if (
    !/(source:aihot|source:ai-news-radar|aihot|ai-hot|ai-news-radar)/.test(sourceHaystack) &&
    /(we-mp-rss|source:wechat|feed:)/.test(sourceHaystack) &&
    !/(\bai\b|\bllm\b|openai|anthropic|claude|chatgpt|gemini|codex|agent|agentic|model|inference|benchmark|aigc|人工智能|大模型|智能体|模型|推理|训练|评测|算力|芯片|开源)/.test(contentHaystack)
  ) {
    score -= 3;
  }
  if (/(world-monitor|world monitor|rssallnews|shunyanet|guardian world|npr news|signal arena|livebench)/.test(haystack)) {
    score -= 2;
  }
  if (/(war|conflict|incident|military|missile|ceasefire|sanction|arrest|court|crime|shipping|oil|gas|fda|drug|device|medical|health|quantum computing|冲突|军事|逮捕|法院|制裁|航运|原油|天然气|药品|医疗|公共卫生|量子计算)/.test(haystack)) {
    score -= 1.5;
  }

  return score;
}

function isLowInformationSignalTitle(title: string, summary: string): boolean {
  const normalized = normalizeText(title);
  if (!normalized || normalized.length < 8) return Boolean(normalizeText(summary));
  if (!summary) return false;
  const normalizedSummary = normalizeText(summary);
  const titleWords = normalized.split(/\s+/).filter(Boolean);
  const hasConcreteSummaryEvent = /\b(kill|killed|seize|seized|launch|launched|strike|strikes|attack|attacks|warn|warns|approve|approves|report|reports|say|says|face|faces|rise|falls?|arrest|arrests|abduct|abduction|convict|convictions|lawsuit|case|announces?|eliminated|crisis|fire|injur|death|deaths|outbreak)\b/iu.test(normalizedSummary);
  const locationParts = normalized.split(/[，,]/).map((part) => part.trim()).filter(Boolean);
  if (
    locationParts.length >= 2 &&
    locationParts.length <= 4 &&
    normalized.length <= 96 &&
    !/\b(kill|killed|seize|seized|launch|launched|strike|strikes|attack|attacks|warn|warns|approve|approves|report|reports|say|says|face|faces|rise|falls?)\b/iu.test(normalized)
  ) {
    return true;
  }
  if (
    titleWords.length <= 3 &&
    normalized.length <= 36 &&
    hasConcreteSummaryEvent &&
    !/\b(virus|disease|cholera|measles|ebola|hantavirus|nipah|marburg|model|agent|codex|openai|anthropic|claude|gemini|deepseek|kimi)\b/iu.test(normalized)
  ) {
    return true;
  }
  return /^(san francisco|new york|washington|london|beijing|shanghai|tokyo|paris|berlin|singapore|hong kong|美国|中国|英国|日本|德国|法国|新加坡)$/i.test(
    normalized,
  );
}

function signalSummaryHeadline(summary: string): string {
  const sentence = normalizeText(summary)
    .split(/(?<=[。！？!?])\s+|[。！？!?]\s*/)
    .find((part) => part.trim().length >= 16);
  return concreteDisplayText(sentence ? sentence.trim() : normalizeText(summary), 96);
}

function isAiHotSourceSignal(signal: Pick<WorldSignal, 'alignmentTags' | 'sourceName' | 'sourceUrl' | 'tags'>): boolean {
  const haystack = normalizeTag([
    signal.sourceName,
    signal.sourceUrl,
    signal.tags.join(' '),
    signal.alignmentTags.join(' '),
  ].join(' '));
  return haystack.includes('aihot') || haystack.includes('aihotskill') || haystack.includes('ai-news-radar');
}

function signalMatchesScene(signal: Pick<WorldSignal, 'scene' | 'alignmentTags' | 'sourceName' | 'sourceUrl' | 'title' | 'summary' | 'tags'>, scene: WorldScene): boolean {
  if (scene === 'global') {
    return true;
  }

  const normalizedScene = normalizeTag(scene);
  const signalScene = normalizeTag(signal.scene);
  const alignmentTags = signal.alignmentTags.map(normalizeTag);
  const haystack = normalizeTag([
    signal.title,
    signal.summary,
    signal.tags.join(' '),
    signal.sourceName,
    signal.sourceUrl,
    signal.scene,
    signal.alignmentTags.join(' '),
  ].join(' '));

  if (normalizedScene === 'weaksignal') {
    return isWeakSignalSignal(signal);
  }

  if (normalizedScene === 'geo-politics-daily' || normalizedScene === 'geopoliticsdaily' || normalizedScene === 'international-politics-daily' || normalizedScene === 'internationalpoliticsdaily') {
    if (isAiHotSourceSignal(signal)) return false;
    if (['war', 'finance', 'health', 'capacity'].includes(signalScene)) return true;
    return /(conflict|war|military|diplomacy|sanction|election|policy|minister|parliament|tariff|macro|market|publichealth|health|outbreak|shipping|energy|geopolitic|地缘|外交|冲突|制裁|选举|政策|公共卫生|航运|能源)/.test(haystack);
  }

  if (normalizedScene === 'tech-ai' || normalizedScene === 'techai' || normalizedScene === 'technology-ai' || normalizedScene === 'technologyai') {
    return techAiSceneScore(signal) >= 3;
  }

  if (normalizedScene === 'asean' || normalizedScene === 'southeast-asia' || normalizedScene === 'southeastasia') {
    return isAseanSignal(signal);
  }

  if (normalizedScene === 'technology-daily' || normalizedScene === 'technologydaily') {
    if (signalScene === 'technology' || signalScene === 'capacity') return true;
    return /(technology|research|paper|chip|semiconductor|model|robot|space|science|engineering|open-source|opensource|科技|论文|芯片|开源|工程)/.test(haystack);
  }

  if (normalizedScene === 'ai-daily' || normalizedScene === 'aidaily') {
    return /(\bai\b|\bllm\b|openai|anthropic|chatgpt|gemini|claude|\bmodel\b|\bagent\b|aihot|ai-hot|人工智能|大模型|智能体|模型)/.test(haystack);
  }

  return (
    signalScene === normalizedScene ||
    alignmentTags.includes(`scene:${normalizedScene}`)
  );
}

function inferRegion(country: string, locationName: string): string {
  const haystack = `${country} ${locationName}`.toLowerCase();

  if (/(iran|iraq|israel|saudi|uae|qatar|gaza|tehran|middle east)/.test(haystack)) return 'Middle East';
  if (/(ukraine|russia|europe|germany|france|uk|britain|poland|moscow|kyiv)/.test(haystack)) return 'Europe';
  if (/(china|japan|korea|india|pakistan|asia|beijing|taiwan)/.test(haystack)) return 'Asia';
  if (/(united states|usa|america|canada|mexico|north america)/.test(haystack)) return 'North America';
  if (/(brazil|argentina|bolivia|peru|south america)/.test(haystack)) return 'South America';
  if (/(africa|ghana|uganda|egypt|nigeria|sudan)/.test(haystack)) return 'Africa';
  if (/(australia|oceania|new zealand|pacific)/.test(haystack)) return 'Oceania';

  return country || locationName || 'Global';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDayKey(value: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function isTodayKey(value: string): boolean {
  return getDayKey(value) === getDayKey(Date.now());
}

function isWithinRecentWindow(value: string, hours = REPORT_MEMORY_WINDOW_HOURS): boolean {
  const ageHours = (Date.now() - new Date(value).getTime()) / 36e5;
  return ageHours <= hours;
}

function inferProjectionLinks(report: WorldReport): WorldProjectionLink[] | null {
  if (Array.isArray(report.projection_links) && report.projection_links.length > 0) {
    return report.projection_links;
  }

  if (!Array.isArray(report.projection) || report.projection.length === 0) {
    return null;
  }

  const factsCount = Array.isArray(report.facts) ? report.facts.length : 0;
  return report.projection.map((projection, projectionIndex) => {
    const fact_indices =
      factsCount === 0
        ? []
        : projectionIndex === 0
          ? Array.from({ length: Math.min(2, factsCount) }, (_, index) => index)
          : [Math.min(projectionIndex, factsCount - 1)];
    const invalidator_indices =
      Array.isArray(projection.invalidators) && projection.invalidators.length > 0
        ? Array.from({ length: Math.min(2, projection.invalidators.length) }, (_, index) => index)
        : [];

    return {
      projection_index: projectionIndex,
      fact_indices,
      invalidator_indices,
    };
  });
}

function inferThreadRelation(
  report: WorldReport,
  parent: WorldReport | null,
): WorldThreadRelation | null {
  if (!parent) return null;
  if (report.thread_relation) return report.thread_relation;
  if (report.signal_id && parent.signal_id && report.signal_id === parent.signal_id) {
    return 'continue';
  }
  if (normalizeTag(report.region) === normalizeTag(parent.region) && normalizeTag(report.topic) === normalizeTag(parent.topic)) {
    return 'continue';
  }
  if (normalizeTag(report.region) === normalizeTag(parent.region)) {
    return 'branch';
  }
  if (normalizeTag(report.topic) === normalizeTag(parent.topic)) {
    return 'echo';
  }
  return 'branch';
}

function inferParentReport(report: WorldReport, priorReports: WorldReport[]): WorldReport | null {
  if (report.thread_parent_report_id) {
    const explicitParent = priorReports.find((item) => item.report_id === report.thread_parent_report_id);
    if (explicitParent) {
      return explicitParent;
    }
  }

  const candidates = priorReports
    .filter((item) => item.report_id !== report.report_id)
    .filter((item) => new Date(item.created_at).getTime() <= new Date(report.created_at).getTime())
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const sameSignal = candidates.find((item) => item.signal_id === report.signal_id);
  if (sameSignal) return sameSignal;

  const sameRegionTopic = candidates.find(
    (item) =>
      normalizeTag(item.region) === normalizeTag(report.region) &&
      normalizeTag(item.topic) === normalizeTag(report.topic),
  );
  if (sameRegionTopic) return sameRegionTopic;

  const sameRegion = candidates.find((item) => normalizeTag(item.region) === normalizeTag(report.region));
  if (sameRegion) return sameRegion;

  const sameTopic = candidates.find((item) => normalizeTag(item.topic) === normalizeTag(report.topic));
  return sameTopic || null;
}

function withInferredGraphMetadata(report: WorldReport, priorReports: WorldReport[]): WorldReport {
  const parent = inferParentReport(report, priorReports);
  const validationTargetIds =
    Array.isArray(report.validation_target_report_ids) && report.validation_target_report_ids.length > 0
      ? report.validation_target_report_ids
      : [];

  return {
    ...report,
    thread_parent_report_id: report.thread_parent_report_id ?? parent?.report_id ?? null,
    thread_relation: inferThreadRelation(report, parent),
    validation_target_report_ids: validationTargetIds.length > 0 ? validationTargetIds : null,
    projection_links: inferProjectionLinks(report),
  };
}

function enrichReportsWithGraphMetadata(reports: WorldReport[]): WorldReport[] {
  const sorted = [...reports].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const enriched: WorldReport[] = [];
  for (const report of sorted) {
    enriched.push(withInferredGraphMetadata(report, enriched));
  }
  return enriched.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function selectGraphBackfillCandidates(report: WorldReport, priorReports: WorldReport[]): WorldReport[] {
  const preferred = priorReports
    .filter((item) => item.report_id !== report.report_id)
    .filter((item) => new Date(item.created_at).getTime() <= new Date(report.created_at).getTime())
    .filter(
      (item) =>
        item.signal_id === report.signal_id ||
        normalizeTag(item.region) === normalizeTag(report.region) ||
        normalizeTag(item.topic) === normalizeTag(report.topic) ||
        normalizeTag(item.scene) === normalizeTag(report.scene),
    )
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return preferred.slice(0, 6);
}

function reportNeedsGraphMetadataInference(report: WorldReport, priorReports: WorldReport[] = []): boolean {
  const hasParentCandidate =
    Boolean(report.thread_parent_report_id) || selectGraphBackfillCandidates(report, priorReports).length > 0;
  return Boolean(
    ((hasParentCandidate && !report.thread_parent_report_id) || (hasParentCandidate && !report.thread_relation)) ||
      !Array.isArray(report.projection_links) ||
      report.projection_links.length === 0 ||
      ((report.validation_status === 'confirmed' || report.validation_status === 'falsified') &&
        (!Array.isArray(report.validation_target_report_ids) || report.validation_target_report_ids.length === 0)),
  );
}

async function ensureReportsGraphMetadataBackfilled(runtime: RuntimeStore): Promise<void> {
  if (runtime.graphMetadataBackfillLoaded || runtime.graphMetadataBackfillInFlight) {
    return;
  }

  runtime.graphMetadataBackfillInFlight = true;
  try {
    const sorted = [...runtime.reports].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
    const missingBefore = sorted
      .filter((report, index) => index > 0 && reportNeedsGraphMetadataInference(report, sorted.slice(0, index)))
      .length;
    if (missingBefore > 0) {
      const enriched = enrichReportsWithGraphMetadata(sorted);
      runtime.reports = enriched.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
      await persistRuntimeHistory(runtime);
      console.log(`[graph-backfill] inferred graph metadata for ${missingBefore} reports with deterministic rules`);
    }
  } catch (error) {
    console.warn('[graph-backfill] failed:', error instanceof Error ? error.message : String(error));
  } finally {
    runtime.graphMetadataBackfillLoaded = true;
    runtime.graphMetadataBackfillInFlight = false;
  }
}

function pruneStoredReports(runtime: RuntimeStore): void {
  runtime.reports = runtime.reports
    .filter((report) => isWithinRecentWindow(report.created_at))
    .map(rewriteLegacyReportVoice)
    .filter(Boolean)
    .slice(0, MAX_STORED_REPORTS);
  runtime.reports = enrichReportsWithGraphMetadata(runtime.reports);
}

function pruneStoredMissions(runtime: RuntimeStore): void {
  const cutoff = Date.now() - MISSION_TTL_HOURS * 36e5;
  const entries = [...runtime.missions.entries()]
    .filter(([, value]) => value.createdAt >= cutoff)
    .sort((left, right) => right[1].createdAt - left[1].createdAt)
    .slice(0, MAX_STORED_MISSIONS);

  runtime.missions = new Map(entries);
}

function pruneXiaTrails(runtime: RuntimeStore): void {
  const cutoff = Date.now() - REPORT_MEMORY_WINDOW_HOURS * 36e5;
  const entries = [...runtime.xiaTrails.entries()].filter(([, value]) => value.updatedAt >= cutoff);
  runtime.xiaTrails = new Map(entries);
}

function haversineKm(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(rightLat - leftLat);
  const dLng = toRad(rightLng - leftLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(leftLat)) * Math.cos(toRad(rightLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getProximityBonus(signal: WorldSignal, xiaId?: string): number {
  if (!xiaId) return 0;

  const runtime = getRuntimeStore();
  const trail = runtime.xiaTrails.get(xiaId);
  if (!trail) return 0;

  if (signal.latitude === null || signal.longitude === null || trail.lat === null || trail.lng === null) {
    return signal.region === trail.region ? 0.04 : 0;
  }

  const distanceKm = haversineKm(trail.lat, trail.lng, signal.latitude, signal.longitude);
  if (distanceKm <= 400) return 0.08;
  if (distanceKm <= 900) return 0.05;
  if (distanceKm <= 1800) return 0.02;
  return 0;
}

function buildThreadKeys(signal: Pick<WorldSignal, 'scene' | 'tags' | 'title' | 'summary' | 'region'>): string[] {
  return [...new Set([
    normalizeTag(signal.scene),
    normalizeTag(signal.region),
    ...signal.tags.map(normalizeTag),
    normalizeTag(buildTopic(signal as WorldSignal)),
    normalizeTag(buildTopicLabel(signal)),
  ].filter(Boolean))];
}

function getSharedThreadKeys(left: Pick<WorldSignal, 'scene' | 'tags' | 'title' | 'summary' | 'region'>, right: Pick<WorldSignal, 'scene' | 'tags' | 'title' | 'summary' | 'region'>): string[] {
  const leftKeys = new Set(buildThreadKeys(left));
  return buildThreadKeys(right).filter((key) => leftKeys.has(key));
}

function humanizeThreadKey(key: string): string {
  if (!key) return '关联线索';
  const cleaned = key.replace(/^(scene|region):/i, '').replace(/[-_]+/g, ' ').trim();
  return cleaned || '关联线索';
}

function buildHopDescriptor(previousSignal: WorldSignal | null, signal: WorldSignal, mode: MissionMode): {
  reason: string;
  label: string;
  confidence: number;
} {
  if (!previousSignal) {
    return {
      reason:
        mode === 'hotspot'
          ? `这次先从 ${buildTopicLabel(signal)} 的高热位置起笔，作为世界线当前最值得压住的入口。`
          : `这次先补 ${buildTopicLabel(signal)} 这块空白，把世界图谱缺的一角先钉住。`,
      label: '起笔',
      confidence: 0.62,
    };
  }

  const sharedKeys = getSharedThreadKeys(previousSignal, signal).filter((key) => key !== normalizeTag(signal.region));
  const sameScene = normalizeTag(previousSignal.scene) === normalizeTag(signal.scene);
  const crossRegion = previousSignal.region !== signal.region;
  const distanceKm =
    previousSignal.latitude !== null &&
    previousSignal.longitude !== null &&
    signal.latitude !== null &&
    signal.longitude !== null
      ? haversineKm(previousSignal.latitude, previousSignal.longitude, signal.latitude, signal.longitude)
      : null;

  if (sharedKeys.length >= 2 && crossRegion) {
    const pivot = humanizeThreadKey(sharedKeys[0]);
    return {
      reason: `从 ${previousSignal.region} 跳到 ${signal.region}，因为同一条 ${pivot} 线索已经开始跨区域外溢，这一步是在追它的扩散。`,
      label: '跨区外溢',
      confidence: 0.86,
    };
  }

  if (sharedKeys.length >= 1) {
    const pivot = humanizeThreadKey(sharedKeys[0]);
    return {
      reason: `这一步继续顺着 ${pivot} 这条线往下走，新点不是孤立冒出来的，而是在接上一站留下的问题。`,
      label: '顺线续写',
      confidence: crossRegion ? 0.8 : 0.78,
    };
  }

  if (sameScene && crossRegion) {
    return {
      reason: `虽然换了地区，但还是同一类 ${sceneLabel(signal.scene)} 事件在起共振，这一步是在补它的外围回响。`,
      label: '同类共振',
      confidence: 0.72,
    };
  }

  if (!crossRegion) {
    return {
      reason: `这一步没有换区，重点是把 ${signal.region} 这条线上还没补实的判断继续压紧。`,
      label: '区域补证',
      confidence: 0.74,
    };
  }

  if (distanceKm !== null && distanceKm >= 1800) {
    return {
      reason: `这一步是一次主动跳跃，先去补和上一站距离很远但可能相关的点，看它会不会长成新的支线。`,
      label: '主动跳跃',
      confidence: 0.64,
    };
  }

  return {
    reason: `这一步主要是把新的关联点纳入同一张世界图谱里，先建联系，再看它会不会继续长线。`,
    label: '建立连接',
    confidence: 0.66,
  };
}

function getRelatedSignalBonus(signal: WorldSignal, xiaId?: string): number {
  if (!xiaId) return 0;

  const runtime = getRuntimeStore();
  const trail = runtime.xiaTrails.get(xiaId);
  if (!trail) return 0;

  const previousSignal = runtime.signalsCache?.signals.find((entry) => entry.id === trail.signalId);
  if (!previousSignal) {
    if (signal.region === trail.region) return 0.08;
    if (signal.tags.map(normalizeTag).includes(normalizeTag(trail.region))) return 0.05;
    return 0;
  }

  const currentKeys = new Set(buildThreadKeys(signal));
  const previousKeys = new Set(buildThreadKeys(previousSignal));
  const overlap = [...currentKeys].filter((key) => previousKeys.has(key));
  const sharedCount = overlap.filter((key) => key !== normalizeTag(signal.region)).length;
  const sameScene = normalizeTag(signal.scene) === normalizeTag(previousSignal.scene);
  const crossRegion = signal.region !== previousSignal.region;
  let bonus = 0;

  if (sameScene) bonus += 0.1;
  if (sharedCount >= 3) bonus += 0.3;
  else if (sharedCount >= 2) bonus += 0.22;
  else if (sharedCount >= 1) bonus += 0.14;

  if (crossRegion && (sameScene || sharedCount >= 1)) {
    bonus += 0.18;
  } else if (!crossRegion && sharedCount === 0) {
    bonus -= 0.08;
  }

  return clamp(bonus, -0.08, 0.48);
}

function getConnectedLeapBonus(mode: MissionMode, signal: WorldSignal, xiaId?: string): number {
  if (!xiaId) return 0;

  const runtime = getRuntimeStore();
  const trail = runtime.xiaTrails.get(xiaId);
  const previousSignal = trail ? runtime.signalsCache?.signals.find((entry) => entry.id === trail.signalId) : null;
  if (!trail || !previousSignal || signal.latitude === null || signal.longitude === null || trail.lat === null || trail.lng === null) {
    return 0;
  }

  const sharedThreads = buildThreadKeys(signal).filter((key) => buildThreadKeys(previousSignal).includes(key));
  if (sharedThreads.length === 0 || signal.region === previousSignal.region) {
    return 0;
  }

  const distanceKm = haversineKm(trail.lat, trail.lng, signal.latitude, signal.longitude);
  if (distanceKm < 700) return mode === 'exploration' ? 0.02 : 0;
  if (distanceKm <= 2200) return mode === 'exploration' ? 0.1 : 0.08;
  if (distanceKm <= 5200) return mode === 'exploration' ? 0.18 : 0.14;
  return mode === 'exploration' ? 0.14 : 0.1;
}

function getRepeatVisitPenalty(signal: WorldSignal, xiaId?: string): number {
  if (!xiaId) return 0;

  const runtime = getRuntimeStore();
  const recentOwnReports = runtime.reports
    .filter((report) => report.xia_id === xiaId)
    .filter((report) => isWithinRecentWindow(report.created_at))
    .slice(0, 6);

  const sameSignalVisits = recentOwnReports.filter((report) => report.signal_id === signal.id).length;
  if (sameSignalVisits > 0) {
    return Math.min(0.34, sameSignalVisits * 0.16);
  }

  const sameRegionVisits = recentOwnReports.filter((report) => report.region === signal.region).length;
  if (sameRegionVisits > 1) {
    return Math.min(0.16, sameRegionVisits * 0.04);
  }

  return 0;
}

function severityBand(severity: number): string {
  if (severity >= 4) return 'severe';
  if (severity >= 3) return 'elevated';
  if (severity >= 2) return 'normal';
  return 'background';
}

function hasSignalChangeMarkers(tags: string[]): boolean {
  return tags.some((tag) => {
    const normalized = normalizeTag(tag);
    return (
      /^wm:.*changed$/.test(normalized) ||
      /(^|:)(briefing|summary|analysis)[_-]?changed$/.test(normalized) ||
      normalized === 'last_changed_at'
    );
  });
}

function hasLiveSignalMarkers(row: Pick<SignalRow, 'alignment_tags' | 'intensity' | 'mention_count'>): boolean {
  const tags = row.alignment_tags || [];
  return hasSignalChangeMarkers(tags) || typeof row.intensity === 'number' || typeof row.mention_count === 'number';
}

function computeDisplayLevel(params: {
  severity: number;
  relevanceScore: number;
  intensity: number | null;
  mentionCount: number | null;
  hotspotScore: number;
  publishedAt: string;
  alignmentTags: string[];
}): WorldDisplayLevel {
  const severity = clamp(params.severity, 1, 5);
  const relevanceScore = clamp(params.relevanceScore, 0, 1);
  const intensity = typeof params.intensity === 'number' ? clamp(params.intensity, 0, 5) : null;
  const mentionCount = typeof params.mentionCount === 'number' ? Math.max(0, params.mentionCount) : null;
  const hotspotScore = clamp(params.hotspotScore, 0, 1);
  const ageHours = Math.max(1, (Date.now() - new Date(params.publishedAt).getTime()) / 36e5);
  const freshness = clamp(1 - ageHours / 72, 0.1, 1);
  const hasLiveMarkers = hasLiveSignalMarkers({
    alignment_tags: params.alignmentTags,
    intensity,
    mention_count: mentionCount,
  });
  const hasSignalChange = hasSignalChangeMarkers(params.alignmentTags);
  const hasStrongLiveChange =
    (intensity !== null && intensity >= 4) ||
    (mentionCount ?? 0) >= 4 ||
    (hasSignalChange && freshness >= 0.62);
  const hasElevatedLiveChange =
    (intensity !== null && intensity >= 3) ||
    (mentionCount ?? 0) >= 2 ||
    (hasSignalChange && freshness >= 0.4);

  if (
    severity >= 5 ||
    (severity >= 4 && hotspotScore >= 0.74) ||
    (severity >= 4 && relevanceScore >= 0.84 && freshness >= 0.6) ||
    (severity >= 4 && hasStrongLiveChange)
  ) {
    return 'high';
  }

  if (
    severity >= 4 &&
    relevanceScore >= 0.78 &&
    freshness >= 0.55 &&
    hotspotScore >= 0.66
  ) {
    return 'high';
  }

  if (
    severity >= 3 ||
    hotspotScore >= 0.62 ||
    (relevanceScore >= 0.68 && freshness >= 0.7) ||
    (hasLiveMarkers && hasElevatedLiveChange && (severity >= 2 || hotspotScore >= 0.44))
  ) {
    return 'elevated';
  }

  return 'monitoring';
}

function getKnowledgeAnchor(
  country: string,
  locationName: string,
  sourceName: string,
  tags: string[] = [],
): { latitude: number; longitude: number } | null {
  const haystack = `${country} ${locationName} ${sourceName} ${tags.join(' ')}`.toLowerCase();

  if (/(china|beijing|shanghai|shenzhen|guangzhou|hong kong|新智元|机器之心|量子位|极客公园|deeptech|ai科技评论)/.test(haystack)) {
    return { latitude: 39.9042, longitude: 116.4074 };
  }
  if (/(research feed|literature|arxiv|paper|preprint|quant-ph|cond-mat|physics|cs|lg|ma|cv|nlp|security)/.test(haystack)) {
    return { latitude: 1.3521, longitude: 103.8198 };
  }
  if (/(asia|singapore|japan|korea|taiwan|india)/.test(haystack)) {
    return { latitude: 1.3521, longitude: 103.8198 };
  }
  if (/(europe|uk|germany|france|london|paris|berlin)/.test(haystack)) {
    return { latitude: 51.5072, longitude: -0.1276 };
  }
  if (/(us|usa|united states|california|silicon valley|new york|seattle)/.test(haystack)) {
    return { latitude: 37.3875, longitude: -122.0575 };
  }

  return null;
}

function buildSignalAlignmentTags(row: SignalRow, scene: WorldScene, region: string, severity: number): string[] {
  const sourceName = normalizeTag(row.source_name || '');
  const sourceType = normalizeTag(row.source_type || '');
  const sourceUrl = normalizeSourceUrl(normalizeText(row.source_url));
  const hasIcFeedName = normalizeTag(row.source_feed_name || '').length > 0;
  const isIcSource =
    sourceName.includes('ic') ||
    sourceType === 'source-feed' ||
    sourceType === 'literature' ||
    sourceType === 'we-mp-rss' ||
    hasIcFeedName;
  const isWechatSource =
    sourceType === 'we-mp-rss' ||
    /mp\.weixin\.qq\.com/i.test(sourceUrl) ||
    (row.tags || []).some((tag) => normalizeTag(tag) === 'we-mp-rss') ||
    (row.alignment_tags || []).some((tag) => normalizeTag(tag) === 'we-mp-rss');
  return uniqueAlignmentTags([
    ...(row.alignment_tags || []),
    ...(row.tags || []),
    `scene:${scene}`,
    `region:${region}`,
    `severity:${severityBand(severity)}`,
    row.latitude !== null && row.longitude !== null ? 'geo:mapped' : 'geo:unmapped',
    row.source_type ? `type:${row.source_type}` : null,
    row.source_feed_name ? `feed:${row.source_feed_name}` : null,
    sourceName.includes('world-monitor') || sourceName.includes('who') ? 'source:world-monitor' : null,
    isIcSource ? 'source:ic' : null,
    isWechatSource ? 'source:wechat' : null,
  ]);
}

function scoreSignals(rows: SignalRow[]): WorldSignal[] {
  const runtime = getRuntimeStore();
  const now = Date.now();
  const regionCounts = new Map<string, number>();

  const prelim = rows.map((row) => {
    const title = normalizeText(row.title) || `Signal ${row.id}`;
    const summary = normalizeText(row.description) || title;
    const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
    const scene = inferScene(title, summary, tags, normalizeText(row.source_name), normalizeText(row.source_type));
    const region = inferRegion(normalizeText(row.country), normalizeText(row.location));
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);

    return {
      raw: row,
      title,
      summary,
      tags,
      scene,
      region,
    };
  });

  return prelim.map(({ raw, title, summary, tags, scene, region }) => {
    const severity = clamp(Number(raw.severity || 1), 1, 5);
    const relevanceScore = clamp(Number(raw.relevance_score || severity / 5), 0, 1);
    const intensity = typeof raw.intensity === 'number' ? clamp(raw.intensity, 0, 5) : null;
    const mentionCount = typeof raw.mention_count === 'number' ? Math.max(0, raw.mention_count) : null;
    const publishedAt = clampFutureIso(raw.event_time || raw.last_seen_at || raw.created_at || new Date(now).toISOString(), now);
    const ageHours = Math.max(1, (now - new Date(publishedAt).getTime()) / 36e5);
    const freshness = clamp(1 - ageHours / 72, 0.1, 1);
    const intensityHeat = intensity !== null ? clamp(intensity / 5, 0, 1) : severity / 5;
    const mentionHeat = mentionCount !== null ? clamp(Math.log1p(mentionCount) / 6, 0, 1) : 0;
    const changeHeat = tags.some((tag) => /changed|updated/.test(normalizeTag(tag))) ? 0.06 : 0;
    const duplicatePenalty = Math.max(0, ((runtime.regionHistory.get(region) || 0) - 1) * 0.08);
    const topicKey = `${scene}:${tags[0] || title.slice(0, 24)}`;
    const topicPenalty = Math.max(0, (runtime.topicHistory.get(topicKey) || 0) * 0.05);
    const coverageAgeHours = Math.max(
      0,
      (now - (runtime.lastCoverageAt.get(region) || 0)) / 36e5,
    );
    const coverageGap = clamp(
      0.35 + coverageAgeHours / 48 + 1 / Math.max(1, regionCounts.get(region) || 1),
      0,
      1,
    );
    const hotspotScore = clamp(
      (severity / 5) * 0.24 +
        relevanceScore * 0.26 +
        freshness * 0.2 +
        intensityHeat * 0.2 +
        mentionHeat * 0.1 +
        changeHeat -
        duplicatePenalty -
        topicPenalty,
      0,
      1,
    );
    const explorationScore = clamp(
      coverageGap * 0.42 + freshness * 0.18 + (1 - hotspotScore) * 0.12 + 1 / Math.max(2, regionCounts.get(region) || 2),
      0,
      1,
    );
    const alignmentTags = buildSignalAlignmentTags(raw, scene, region, severity);
    const sourceName = normalizeText(raw.source_name) || 'Unknown';
    const displayLevel = computeDisplayLevel({
      severity,
      relevanceScore,
      intensity,
      mentionCount,
      hotspotScore,
      publishedAt,
      alignmentTags,
    });

    const displayTitleText = isLowInformationSignalTitle(title, summary) ? signalSummaryHeadline(summary) : title;

    return {
      id: raw.id,
      title,
      summary,
      displayTitle: containsCjk(displayTitleText) ? cleanDisplayText(displayTitleText) : displayTitleText,
      displaySummary: containsCjk(summary) ? cleanDisplayText(summary) : summary,
      sourceName,
      sourceUrl: normalizeText(raw.source_url),
      publishedAt,
      observedAt: raw.last_seen_at || raw.created_at || publishedAt,
      locationName: normalizeText(raw.location),
      country: normalizeText(raw.country),
      latitude: raw.latitude,
      longitude: raw.longitude,
      severity,
      displayLevel,
      relevanceScore,
      tags,
      alignmentTags,
      intensity,
      mentionCount,
      urgencyReason: normalizeText(raw.urgency_reason),
      scene,
      region,
      hotspotScore,
      explorationScore,
      coverageGap,
      clusterNotes: normalizeText(raw.content_md).slice(0, 1200) || undefined,
    };
  });
}

function toEvidenceSignal(signal: WorldSignal): WorldEvidenceSignal {
  const localized = getLocalizedSignal(signal);
  const alignmentTags = signal.alignmentTags || [];
  const exposedAlignmentTags = publicAlignmentTags(alignmentTags);
  const concreteTitle = concreteDisplayText(applyQuickTextTranslations(signal.title), 120);
  const concreteSummary = concreteDisplayText(applyQuickTextTranslations(signal.summary), 240);
  const titleNeedsFallback =
    isGenericGeneratedDisplayText(concreteTitle) ||
    isLowInformationSignalTitle(concreteTitle, concreteSummary);
  const fallbackTitle = !titleNeedsFallback
    ? concreteTitle
    : signalSummaryHeadline(concreteSummary || signal.summary);
  const displayTitle =
    (isGenericGeneratedDisplayText(localized.displayTitle) || isLowInformationSignalTitle(localized.displayTitle, concreteSummary)) && fallbackTitle
      ? fallbackTitle
      : localized.displayTitle;
  const displaySummary =
    isGenericGeneratedDisplayText(localized.displaySummary) && concreteSummary
      ? concreteSummary
      : localized.displaySummary;
  return {
    id: signal.id,
    title: signal.title,
    summary: signal.summary,
    display_title: displayTitle,
    display_summary: displaySummary,
    source_name: signal.sourceName,
    source_url: resolveSignalSourceUrlForUi(signal),
    published_at: signal.publishedAt,
    location_name: localized.displayLocation || signal.locationName,
    country: signal.country,
    latitude: signal.latitude,
    longitude: signal.longitude,
    tags: signal.tags,
    alignment_tags: exposedAlignmentTags,
    intensity: signal.intensity,
    mention_count: signal.mentionCount,
    urgency_reason: signal.urgencyReason,
    scene: signal.scene,
    region: signal.region,
    severity: signal.severity,
    display_level: signal.displayLevel,
    relevance_score: signal.relevanceScore,
    hotspot_score: signal.hotspotScore,
    exploration_score: signal.explorationScore,
    coverage_gap: signal.coverageGap,
    intake_score: extractTaggedNumber(alignmentTags, 'intake:score:') ?? null,
    intake_decision: extractTaggedString(alignmentTags, 'intake:decision:'),
    intake_tier: extractTaggedString(alignmentTags, 'intake:tier:'),
  };
}

function resolveSignalSourceUrlForUi(signal: Pick<WorldSignal, 'id' | 'sourceName' | 'sourceUrl'>): string {
  const sourceUrl = normalizeText(signal.sourceUrl);
  if (sourceUrl) {
    return sourceUrl;
  }

  const sourceName = normalizeTag(signal.sourceName || '');
  if (sourceName.includes('world-monitor') || sourceName.includes('who')) {
    return `/signals/${encodeURIComponent(signal.id)}`;
  }

  return '';
}

function buildSourceHealth(sourceCatalog: WorldSourceCatalog | null) {
  return {
    stable_source_count: sourceCatalog?.intake_summary.stable_source_count || 0,
    watchlist_source_count: sourceCatalog?.intake_summary.watchlist_source_count || 0,
    blocked_or_unknown_source_count: sourceCatalog?.connectivity_counts.blocked_or_unknown || 0,
    note: sourceCatalog
      ? 'stable 表示当前已纳入较稳信源池；watchlist 表示仍在观察；blocked_or_unknown 表示当前环境下连通性或可靠度较弱。'
      : 'source catalog 当前不可用，信源稳定性只能按运行时观测粗略理解。',
  };
}

function resolveSourceReliability(
  signal: Pick<WorldSignal, 'sourceName' | 'sourceUrl'>,
  sourceCatalog: WorldSourceCatalog | null,
): WorldSourceReliability {
  const sourceName = typeof signal.sourceName === 'string' ? signal.sourceName : 'Unknown';
  const sourceUrl = typeof signal.sourceUrl === 'string' ? signal.sourceUrl : '';
  const normalizedUrl = sourceUrl.trim().toLowerCase();
  const normalizedName = sourceName.trim().toLowerCase();

  if (normalizedName === 'ai hot' || normalizedName.includes('aihot') || normalizedUrl.includes('aihot.virxact.com')) {
    return {
      tier: 'stable',
      label: 'stable-source',
      reason: 'AI 前沿来源通过公开页面、RSS 和匿名 REST API 暴露精选 AI 动态；当前按整体 AI 信源接入，并保留原文链接供核对。',
      source_name: sourceName || 'AI 前沿',
      source_url: sourceUrl || 'https://aihot.virxact.com/',
      connectivity: 'direct',
      matched_skill_name: 'aihot',
      matched_admission_tier: 'context',
    };
  }

  if (!sourceCatalog) {
    return {
      tier: 'watchlist',
      label: 'catalog-unavailable',
      reason: '当前 source catalog 不可用，只能按运行时继续观察这条信源。',
      source_name: sourceName,
      source_url: sourceUrl,
    };
  }

  for (const hub of sourceCatalog.hubs) {
    for (const skill of hub.source_skills) {
      for (const source of skill.sources) {
        const catalogUrl = typeof source.url === 'string' ? source.url : '';
        const catalogSourceName = typeof source.source_name === 'string' ? source.source_name : '';
        const sourceMatch =
          (normalizedUrl && catalogUrl.trim().toLowerCase() === normalizedUrl) ||
          (normalizedName && catalogSourceName.trim().toLowerCase() === normalizedName);

        if (!sourceMatch) {
          continue;
        }

        const connectivity = source.connectivity || '';
        const direct = connectivity === 'direct';
        const blocked = connectivity === 'blocked_or_unknown';
        const stable = direct && (skill.admission_tier === 'anchor' || skill.admission_tier === 'context');
        const tier = stable ? 'stable' : blocked ? 'blocked_or_unknown' : 'watchlist';
        const label = stable ? 'stable-source' : blocked ? 'blocked-or-unknown' : 'watchlist';
        const reason = stable
          ? `这条信源已映射到 ${skill.name}，连通性为 ${connectivity}，且属于 ${skill.admission_tier} 层，当前可按较稳证据理解。`
          : blocked
            ? `这条信源已登记，但当前连通性为 ${connectivity}，不适合当成强证据。`
            : `这条信源已登记到 ${skill.name}，但当前连通性为 ${connectivity || 'unknown'}，应按观察中信源处理。`;

        return {
          tier,
          label,
          reason,
          source_name: catalogSourceName || sourceName,
          source_url: catalogUrl || sourceUrl,
          connectivity,
          matched_skill_name: skill.name,
          matched_admission_tier: skill.admission_tier,
        };
      }
    }
  }

  return {
    tier: 'watchlist',
    label: 'unmapped-source',
    reason: '当前这条信源还没有和 source catalog 中的稳定映射完全对上，先按观察中信源处理。',
    source_name: sourceName,
    source_url: sourceUrl,
  };
}

function toEvidenceSignalWithReliability(signal: WorldSignal, sourceCatalog: WorldSourceCatalog | null): WorldEvidenceSignal {
  return {
    ...toEvidenceSignal(signal),
    source_reliability: resolveSourceReliability(signal, sourceCatalog),
  };
}

function materializeSignalFromEvidence(briefing: WorldBriefing): WorldSignal | null {
  const evidence = briefing.evidence_signals[0];
  if (!evidence) {
    return null;
  }

  const tags = [briefing.topic].filter(Boolean);
  const scene = evidence.scene || 'global';
  const region = evidence.region || briefing.region;
  const title = evidence.title || `${region} signal`;
  const summary = evidence.summary || evidence.display_summary || title;
  const locationName = evidence.location_name || region;

  return {
    id: evidence.id,
    title,
    summary,
    displayTitle:
      evidence.display_title ||
      buildDisplayTitle({
        title,
        summary,
        tags,
        scene,
        locationName,
        region,
      }),
    displaySummary:
      evidence.display_summary ||
      buildDisplaySummary({
        title,
        summary,
        tags,
        scene,
        locationName,
        region,
        coverageGap: evidence.coverage_gap,
        hotspotScore: evidence.hotspot_score,
      }),
    sourceName: evidence.source_name,
    sourceUrl: evidence.source_url,
    publishedAt: evidence.published_at,
    observedAt: evidence.published_at,
    locationName,
    country: evidence.country,
    latitude: null,
    longitude: null,
    severity: evidence.severity,
    displayLevel: evidence.display_level || 'monitoring',
    relevanceScore: evidence.relevance_score,
    tags,
    alignmentTags: evidence.alignment_tags || [],
    intensity: evidence.intensity,
    mentionCount: evidence.mention_count,
    urgencyReason: evidence.urgency_reason,
    scene,
    region,
    hotspotScore: evidence.hotspot_score,
    explorationScore: evidence.exploration_score,
    coverageGap: evidence.coverage_gap,
  };
}

function withLocalizedDisplay(signal: WorldSignal): WorldSignal {
  const localized = getLocalizedSignal(signal);
  return {
    ...signal,
    displayTitle: localized.displayTitle,
    displaySummary: localized.displaySummary,
  };
}

function buildTopic(signal: WorldSignal): string {
  return signal.tags[0] || signal.title.split(/\s+/).slice(0, 4).join(' ');
}

function buildDispatchReason(signal: WorldSignal, mode: MissionMode, xiaId?: string): string {
  const proximityBonus = getProximityBonus(signal, xiaId);
  const relatedBonus = getRelatedSignalBonus(signal, xiaId);
  const topicLabel = buildTopicLabel(signal);
  const runtime = getRuntimeStore();
  const previousSignalId = xiaId ? runtime.xiaTrails.get(xiaId)?.signalId : null;
  const previousSignal = previousSignalId ? runtime.signalsCache?.signals.find((entry) => entry.id === previousSignalId) || null : null;
  const hop = buildHopDescriptor(previousSignal, signal, mode);
  if (mode === 'hotspot') {
    if (relatedBonus > 0.12) {
      return `这枚 ${topicLabel} 点本身就热，而且和上一站仍在同一条脉络里，顺着往下推进最合适。${hop.reason}`;
    }

    if (proximityBonus > 0.12) {
      return `这枚 ${topicLabel} 点热度已经抬起来了，而且就在最近的观察带附近，先继续压实这条线更稳。${hop.reason}`;
    }

    return `这枚 ${topicLabel} 点热度已经抬到 ${signal.hotspotScore.toFixed(2)}，现在先落笔，比等它凉下来再回看更值。${hop.reason}`;
  }

  if (relatedBonus > 0.12 && signal.coverageGap >= 0.6) {
    return `这条线还有明显空白，但它和上一站是连着的，适合跨地区把同一条脉络补完整。${hop.reason}`;
  }

  if (proximityBonus > 0.08) {
    return `这条线还有待补信息，而且贴着最近的活动带，适合顺势补齐。${hop.reason}`;
  }

  return `这条线还有待补信息，补上后能让整张图更完整。它未必最显眼，但值得先钉住位置。${hop.reason}`;
}

function isKnowledgeSignal(signal: WorldSignal): boolean {
  return signal.tags.some((tag) => {
    const normalized = normalizeTag(tag);
    return normalized === 'source-feed' || normalized === 'literature' || normalized === 'research';
  });
}

function isCatalogSourceSnapshotSignal(signal: Pick<WorldSignal, 'id' | 'title' | 'summary' | 'sourceName' | 'tags' | 'alignmentTags' | 'urgencyReason'>): boolean {
  return isSourceSnapshotLikeSignal({
    id: signal.id,
    title: signal.title,
    summary: signal.summary,
    source_name: signal.sourceName,
    urgency_reason: signal.urgencyReason,
    tags: signal.tags,
    alignment_tags: signal.alignmentTags,
  });
}

function isMachineOnlySignalText(value: string): boolean {
  const text = normalizeText(value);
  if (!text) return true;
  return (
    text.length < 18 ||
    /^Assault and arrest$/iu.test(text) ||
    /Location in headline|Source country match|Local news source|High Goldstein intensity|Goldstein|^\d+\s+events? at location$/iu.test(text) ||
    /^(elevated|high|medium|low|severe|monitoring)\s+[\w\s/-]+(?:incident|event|risk|signal)\.?$/iu.test(text) ||
    /^(conflict|crime|security|market|public health|technology|ai|capacity|supply-chain)\s*(?:risk|incident|event|signal|update)?\.?$/iu.test(text) ||
    /^(冲突|治安|安全|市场|公共卫生|科技|AI|产能|供应链)\s*(风险|事件|信号|更新)?$/u.test(text)
  );
}

function hasConcreteHumanReadableSignalContent(signal: Pick<WorldSignal, 'title' | 'summary' | 'displayTitle' | 'displaySummary' | 'sourceUrl'>): boolean {
  const title = cleanDisplayText(signal.displayTitle || signal.title);
  const summary = cleanDisplayText(signal.displaySummary || signal.summary);
  const rawTitle = cleanDisplayText(signal.title);
  const rawSummary = cleanDisplayText(signal.summary);
  const hasSourceUrl = /^https?:\/\//iu.test(normalizeText(signal.sourceUrl));
  const hasArticleLikeTitle =
    !isGenericGeneratedDisplayText(title) &&
    !isLowInformationSignalTitle(title, summary) &&
    !isMachineOnlySignalText(title) &&
    title.length >= 12;
  const hasArticleLikeSummary =
    !isGenericGeneratedDisplayText(summary) &&
    !isMachineOnlySignalText(summary) &&
    summary.length >= 24;
  const hasRawEventText =
    (!isGenericGeneratedDisplayText(rawTitle) && !isLowInformationSignalTitle(rawTitle, rawSummary) && !isMachineOnlySignalText(rawTitle) && rawTitle.length >= 16) ||
    (!isMachineOnlySignalText(rawSummary) && rawSummary.length >= 24);

  return hasSourceUrl && (hasArticleLikeTitle || hasArticleLikeSummary || hasRawEventText);
}

function isTimelineEventSignal(signal: WorldSignal): boolean {
  if (isCatalogSourceSnapshotSignal(signal)) {
    return false;
  }
  return hasConcreteHumanReadableSignalContent(signal);
}

function selectTimelineEventSignals(signals: WorldSignal[]): WorldSignal[] {
  const events = signals.filter(isTimelineEventSignal);
  return events.length > 0 ? events : signals.filter((signal) => !isCatalogSourceSnapshotSignal(signal));
}

function isPublicAnchorSignal(signal: WorldSignal): boolean {
  return signal.alignmentTags.some((tag) => normalizeTag(tag) === 'source:public-anchor');
}

function timelineEventPriority(signal: WorldSignal): number {
  const tags = normalizeTag([signal.scene, signal.tags.join(' '), signal.alignmentTags.join(' ')].join(' '));
  const topicBoost =
    /(war|conflict|diplomacy|sanction|military|health|outbreak|ai|technology|chip|semiconductor|market|macro|shipping|energy|冲突|外交|制裁|军事|公共卫生|科技|芯片|市场|航运|能源)/u.test(tags)
      ? 0.2
      : 0;
  const localCrimePenalty = /(gangster|rape|assault|prison|local-news|crime)/iu.test(
    `${signal.title} ${signal.summary} ${signal.tags.join(' ')}`,
  )
    ? 0.28
    : 0;
  return (
    signal.severity * 0.18 +
    signal.relevanceScore * 0.34 +
    signal.hotspotScore * 0.24 +
    signal.explorationScore * 0.12 +
    topicBoost -
    localCrimePenalty
  );
}

function buildTopSignalFeed(signals: WorldSignal[]): WorldSignal[] {
  const eventSignals = selectTimelineEventSignals(signals);
  const sorted = [...eventSignals].sort(
    (left, right) =>
      timelineEventPriority(right) - timelineEventPriority(left) ||
      right.severity - left.severity ||
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
  const knowledge = sorted
    .filter(isKnowledgeSignal)
    .sort(
      (left, right) =>
        Number(isPublicAnchorSignal(right)) - Number(isPublicAnchorSignal(left)) ||
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime() ||
        right.relevanceScore - left.relevanceScore,
    )
    .slice(0, Math.min(24, WORLD_VIEW_LIMIT));
  const regular = sorted.filter((signal) => !isKnowledgeSignal(signal));
  const result: WorldSignal[] = [];
  const seen = new Set<string>();
  let regularIndex = 0;
  let knowledgeIndex = 0;

  while (result.length < WORLD_VIEW_LIMIT && (regularIndex < regular.length || knowledgeIndex < knowledge.length)) {
    for (let count = 0; count < 3 && result.length < WORLD_VIEW_LIMIT && regularIndex < regular.length; count += 1) {
      const candidate = regular[regularIndex++];
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
    }

    if (result.length < WORLD_VIEW_LIMIT && knowledgeIndex < knowledge.length) {
      const candidate = knowledge[knowledgeIndex++];
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        result.push(candidate);
      }
    }
  }

  return result;
}

function buildKnowledgeSignalFeed(signals: WorldSignal[]): WorldKnowledgeSignal[] {
  const result: WorldKnowledgeSignal[] = [];
  const seen = new Set<string>();
  const sourceCounts = new Map<string, number>();

  const candidates = [...signals]
    .filter((signal) => isKnowledgeSignal(signal) && isTimelineEventSignal(signal))
    .sort(
      (left, right) =>
        Number(isPublicAnchorSignal(right)) - Number(isPublicAnchorSignal(left)) ||
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime() ||
        Number(right.latitude !== null && right.longitude !== null) - Number(left.latitude !== null && left.longitude !== null) ||
        right.relevanceScore - left.relevanceScore,
    );

  for (const signal of candidates) {
    if (result.length >= 12) {
      break;
    }

    if (seen.has(signal.id)) {
      continue;
    }

    const sourceName = signal.sourceName || 'Unknown';
    const count = sourceCounts.get(sourceName) || 0;
    if (count >= 2) {
      continue;
    }

    sourceCounts.set(sourceName, count + 1);
    seen.add(signal.id);
    result.push(toEvidenceSignal(signal));
  }

  return result;
}

function buildProjection(signal: WorldSignal, relatedCount: number): WorldProjection[] {
  const thread = getSignalThread(signal);
  const topicLabel = buildTopicLabel(signal);
  const baseConfidence = clamp(
    signal.hotspotScore * 0.5 + signal.relevanceScore * 0.22 + Math.min(0.1, relatedCount * 0.03),
    0.25,
    0.84,
  );

  if (signal.hotspotScore < 0.25) {
    return [];
  }

  return [
    {
      title: `${signal.region} 这条${topicLabel}线接下来怎么走`,
      summary: `如果未来 24-72 小时内，${signal.region} 周边继续出现围绕 ${topicLabel} 的第二来源或官方回应，这条线就不再只是单点事件，而会开始带出区域层面的连锁压力。`,
      confidence: Number(baseConfidence.toFixed(2)),
      assumptions: ['未来 2 周内持续出现同区域新增信号', '当前信源未被后续澄清或证伪'],
      invalidators: ['后续 72 小时内信号密度明显下降', '关键上游来源撤回或修正当前报道'],
    },
    {
      title: `${thread.label} 会不会向外扩散`,
      summary: `${thread.watchHint} 是接下来最该留意的变化。如果相邻地点、供应链反应或政策回应同时抬头，影响面可能已经开始外溢；如果这些侧面始终没有动静，判断就该回到局部事件。`,
      confidence: Number(clamp(baseConfidence - 0.1, 0.2, 0.72).toFixed(2)),
      assumptions: ['相关市场或政策主体开始响应', '同类信号在相邻地区出现'],
      invalidators: ['缺乏新的相邻市场或政策信号', '后续报道证明影响局限于局部事件'],
    },
  ];
}

function buildConcreteReportQuestion(
  signal: WorldSignal,
  topicLabel: string,
  locationLabel: string,
  relatedCount: number,
): string {
  const title = cleanDisplayText(signal.displayTitle || signal.title);
  if (relatedCount > 0) {
    return `我这次真正想判断的是，${locationLabel} 这条${topicLabel}线到底还只是旧风险往上顶了一格，还是已经出现了足够新的证据，需要把整条线的级别重写。`;
  }

  return `我这次盯住「${title}」，是想看它会不会把 ${locationLabel} 这条${topicLabel}线从一个孤点，推成接下来几轮都得连续跟的事件。`;
}

function naturalMetricHint(signal: WorldSignal): string {
  if (signal.severity >= 4 || (signal.intensity ?? 0) >= 4) {
    return '这次信号不轻，已经够得上继续往下压着看。';
  }
  if ((signal.mentionCount ?? 0) >= 12) {
    return '它的回响不算小，说明还会有后续补口。';
  }
  return '这次还不到定局，但也不是可以随手略过的小响动。';
}

function smoothNarrativeText(value: string): string {
  return cleanDisplayText(value)
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
    .replace(/这块空白很久没人补/gu, '这条线这会儿值得先补一笔')
    .replace(/它不一定最吵/gu, '它未必最显眼')
    .replace(/旧脉络还在继续往前推/gu, '这条线还在继续发展')
    .replace(/过去这条线已经在\s*([^。]+?)\s*一带抬过头/gu, '过去这条线已经在 $1 出现过一次抬头')
    .replace(/这轮又补上了「([^」]+)」这一层变化/gu, '这次又出现了「$1」这个新变化')
    .replace(/\bmention_?count\s*=\s*\d+/giu, '')
    .replace(/\bintensity\s*=\s*\d+/giu, '')
    .replace(/\bcoverage_?gap\s*=\s*\d+/giu, '')
    .replace(/\bdisplay_?title\b/giu, '')
    .replace(/\bunmapped-?信源\b/giu, '旁证不足')
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

function buildConcreteJudgment(
  signal: WorldSignal,
  locationLabel: string,
  relatedCount: number,
): string {
  const title = cleanDisplayText(signal.displayTitle || signal.title);
  const summary = cleanDisplayText(signal.displaySummary || signal.summary).replace(/\s+/g, ' ').slice(0, 140);
  const metricHint = naturalMetricHint(signal);

  if (relatedCount > 0) {
    return `过去 ${locationLabel} 这条线已经出现过一次抬头，但当时还不足以下结论。现在又出现了新的变化，说明它还在继续发酵。${summary ? ` 这次最值得记住的是「${summary}」。` : ''} ${metricHint}`;
  }

  return `这条线此前还没有形成连续脉络，现在 ${title} 把一个新变化摆到了台面上。${summary ? ` 这次最值得注意的是「${summary}」。` : ''} ${metricHint} 眼下还不能把话说满，但已经值得继续盯下一步会不会有更硬的跟进。`;
}

function buildConcreteOutlook(
  signal: WorldSignal,
  locationLabel: string,
  projection: WorldProjection[],
): string {
  const thread = getSignalThread(signal);
  const invalidator = projection[0]?.invalidators[0] || '后续没有第二来源跟进';
  return `因此我更倾向于认为，未来一周内 ${thread.watchHint} 里还会再冒出新的跟进，或者 ${locationLabel} 周边会出现同步抬头。要是这两边都不跟，尤其是${invalidator}，那这次就更像一次短暂扰动。`;
}

function buildHandoffToNextAgent(signal: WorldSignal, watchNext: string): string {
  const locationLabel = signal.locationName
    ? `${signal.locationName}${signal.country ? `, ${signal.country}` : ''}`
    : signal.region;
  return `下一位如果继续接这条线，先从 ${locationLabel} 出发，优先核对 ${watchNext}，再决定这是升级、续压还是回落。`;
}

function buildForYourHuman(report: Pick<WorldReport, 'region' | 'topic_label' | 'current_analysis' | 'watch_next' | 'confidence'>): string {
  const confidenceLabel = report.confidence >= 0.75 ? '高' : report.confidence >= 0.5 ? '中' : '低';
  const judgment = smoothNarrativeText(report.current_analysis);
  const forecast = smoothNarrativeText(report.watch_next);
  return [
    `这次我看的是 ${report.region} 的 ${report.topic_label} 线索。`,
    `为什么值得看：${judgment}`,
    `接下来最可能发生的事：${forecast}`,
    `稳健度：${confidenceLabel}（confidence ${report.confidence.toFixed(2)}）`,
  ].join('\n');
}

function getRecentRelatedReports(signal: WorldSignal, reports: WorldReport[]): WorldReport[] {
  const signalTags = signal.tags.map(normalizeTag);

  return reports.filter((report) => {
    if (!isWithinRecentWindow(report.created_at)) {
      return false;
    }

    if (report.region === signal.region) {
      return true;
    }

    const reportTopic = normalizeTag(report.topic);
    return signalTags.includes(reportTopic) || reportTopic === normalizeTag(signal.scene);
  });
}

function toValidationMemoryItem(report: WorldReport): WorldValidationMemoryItem {
  return {
    report_id: report.report_id,
    signal_id: report.signal_id,
    region: report.region,
    scene: report.scene,
    topic: report.topic,
    topic_label: report.topic_label || report.topic,
    claim: cleanDisplayText(report.current_analysis || report.summary).slice(0, 140),
    reason: cleanDisplayText(report.watch_next || report.future_projection || report.brake_line).slice(0, 140),
    forecast: cleanDisplayText(report.future_projection || report.projection[0]?.summary || report.watch_next).slice(0, 180),
    prediction_time: report.created_at,
    confidence: typeof report.confidence === 'number' ? report.confidence : 0,
    review_count: Math.max(0, report.validation_review_count || 0),
    pending_judgments: Math.max(0, report.validation_pending_count || 0),
    confirmed_judgments: Math.max(0, report.validation_confirmed_count || 0),
    falsified_judgments: Math.max(0, report.validation_falsified_count || 0),
    validation_status: report.validation_status || 'pending',
    validated_at: report.validated_at || null,
    validation_note: report.validation_note || null,
    validated_by_xia_id: report.validated_by_xia_id || null,
    validation_signal_id: report.validation_signal_id || null,
  };
}

function sampleWeightedReports<T extends { confidence: number; created_at: string }>(items: T[], limit: number): T[] {
  const pool = [...items];
  const picked: T[] = [];

  while (pool.length > 0 && picked.length < limit) {
    const weights = pool.map((item) => {
      const freshnessBoost = isWithinDaysWindow(item.created_at, 2) ? 0.12 : isWithinDaysWindow(item.created_at, 4) ? 0.06 : 0;
      return Math.max(0.01, item.confidence * item.confidence + freshnessBoost);
    });
    const total = weights.reduce((sum, value) => sum + value, 0);
    let threshold = Math.random() * total;
    let index = 0;

    for (; index < pool.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        break;
      }
    }

    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }

  return picked;
}

function buildPendingReferenceReports(
  briefing: Pick<WorldBriefing, 'scene' | 'region' | 'topic' | 'mission_id' | 'xia_id'>,
  signal: WorldSignal,
  reports: WorldReport[],
): WorldValidationMemoryItem[] {
  const scoped = reports
    .filter((report) => isWithinDaysWindow(report.created_at, WEEKLY_PREDICTION_WINDOW_DAYS))
    .filter((report) => (report.validation_status || 'pending') === 'pending')
    .filter((report) => report.signal_id !== signal.id)
    .filter(
      (report) =>
        report.region === briefing.region ||
        normalizeTag(report.topic) === normalizeTag(briefing.topic) ||
        normalizeTag(report.scene) === normalizeTag(briefing.scene),
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence || new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

  const unique = new Map<string, WorldReport>();
  for (const report of scoped) {
    const key = `${report.region}:${normalizeTag(report.topic)}`;
    if (!unique.has(key)) {
      unique.set(key, report);
    }
  }

  return sampleWeightedReports([...unique.values()], 3)
    .sort((left, right) => right.confidence - left.confidence || new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((report) => toValidationMemoryItem(report));
}

function applyValidationUpdates(
  reports: WorldReport[],
  updates: ValidationUpdateInput[] | undefined,
  currentSignal: WorldSignal,
  xiaId?: string,
): void {
  if (!Array.isArray(updates) || updates.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const normalizedXiaId = resolveObserverId(xiaId);

  for (const update of updates) {
    if (!update?.report_id) continue;
    const match = reports.find((report) => report.report_id === update.report_id);
    if (!match) continue;

    match.validation_status = update.status;
    match.validation_note = cleanDisplayText(update.note || '') || match.validation_note || null;
    match.validation_updated_at = now;
    match.validation_review_count = (match.validation_review_count || 0) + 1;
    match.validation_pending_count = (match.validation_pending_count || 0) + (update.status === 'pending' ? 1 : 0);
    match.validation_confirmed_count = (match.validation_confirmed_count || 0) + (update.status === 'confirmed' ? 1 : 0);
    match.validation_falsified_count = (match.validation_falsified_count || 0) + (update.status === 'falsified' ? 1 : 0);

    if (update.status === 'confirmed' || update.status === 'falsified') {
      match.validated_at = now;
      match.validated_by_xia_id = normalizedXiaId;
      match.validation_signal_id = currentSignal.id;
    } else {
      match.validated_at = null;
      match.validated_by_xia_id = null;
      match.validation_signal_id = null;
    }
  }
}

function inferValidationUpdates(
  report: WorldReport,
  briefing: WorldBriefing,
  explicitUpdates?: ValidationUpdateInput[],
): ValidationUpdateInput[] | undefined {
  if (Array.isArray(explicitUpdates) && explicitUpdates.length > 0) {
    return explicitUpdates;
  }

  const fallbackTargets = [
    ...(report.validation_target_report_ids || []),
    ...(briefing.pending_reference_reports || []).map((item) => item.report_id),
    report.thread_parent_report_id || '',
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const targetIds = [...new Set(fallbackTargets)].slice(0, 2);
  if (targetIds.length === 0) {
    return undefined;
  }

  const text = [
    report.current_analysis,
    report.future_projection,
    report.validation_note,
    report.for_your_human,
  ]
    .map((item) => normalizeText(item))
    .join(' ');

  const status = inferValidationStatusFromNarrative(text);
  const note =
    status === 'confirmed'
      ? '本轮文字已经明确给出确认语气，系统先按已验证回写。'
      : status === 'falsified'
        ? '本轮文字已经明确给出证伪语气，系统先按已证伪回写。'
        : '本轮已经复查过旧判断，但证据还不够，先继续留在待确认池。';

  return targetIds.map((reportId) => ({
    report_id: reportId,
    status,
    note,
  }));
}

function inferValidationStatusFromNarrative(text: string): WorldValidationStatus {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 'pending';
  }

  const pendingPattern =
    /不能确认|还不能确认|下结论还太早|证据还不够|证据不足|还缺|还没有形成多信源共振|待验证|先按局部(?:扰动|事件)收住|先继续观察|继续观察|暂时只能按|如果.+我就把判断往上提|若.+我就把判断往上提/u;
  const strongFalsifiedPattern =
    /明确证伪|已经证伪|被证伪|判断不成立|这条线不成立|需要撤回|应当撤回|被推翻|已经推翻|误报|假消息|与此前判断相反|排除这一判断|不是这条线|并非这条线/u;
  const strongConfirmedPattern =
    /明确证实|已经证实|被证实|已经确认|可以确认|判断成立|证据补上了|第二来源已经出现|官方已经回应|多信源已经跟上|形成多信源共振|官方已确认|第二来源已确认/u;

  if (pendingPattern.test(normalized)) {
    return 'pending';
  }

  if (strongFalsifiedPattern.test(normalized)) {
    return 'falsified';
  }

  if (strongConfirmedPattern.test(normalized)) {
    return 'confirmed';
  }

  return 'pending';
}

function isAutoValidationInferenceNote(note?: string | null): boolean {
  const normalized = normalizeText(note);
  return (
    normalized === '本轮文字已经明确给出确认语气，系统先按已验证回写。' ||
    normalized === '本轮文字已经明确给出证伪语气，系统先按已证伪回写。'
  );
}

function normalizeValidationState(report: WorldReport): WorldReport {
  const currentStatus = report.validation_status || 'pending';
  if (!['confirmed', 'falsified'].includes(currentStatus)) {
    return report;
  }

  if (!isAutoValidationInferenceNote(report.validation_note)) {
    return report;
  }

  const inferred = inferValidationStatusFromNarrative(
    [report.current_analysis, report.future_projection, report.for_your_human].join(' '),
  );

  if (inferred === currentStatus) {
    return report;
  }

  return {
    ...report,
    validation_status: inferred,
    validation_note:
      inferred === 'pending'
        ? '启动校正：这条旧演绎原先被自动判得太重，现已改回待确认。'
        : inferred === 'confirmed'
          ? '启动校正：根据正文确认语气，保留为已验证。'
          : '启动校正：根据正文证伪语气，保留为已证伪。',
    validated_at: inferred === 'pending' ? null : report.validated_at,
    validated_by_xia_id: inferred === 'pending' ? null : report.validated_by_xia_id,
    validation_signal_id: inferred === 'pending' ? null : report.validation_signal_id,
  };
}

function _buildValidationSummary(reports: WorldReport[], scene: WorldScene): WorldValidationSummary {
  const scoped = reports
    .filter((report) => isWithinDaysWindow(report.created_at, WEEKLY_PREDICTION_WINDOW_DAYS))
    .filter(
      (report) =>
        scene === 'global' ||
        normalizeTag(report.scene) === normalizeTag(scene) ||
        normalizeTag(report.topic) === normalizeTag(scene),
    );

  const confirmed = scoped
    .filter((report) => report.validation_status === 'confirmed')
    .sort(
      (left, right) =>
        (right.validation_confirmed_count || 0) - (left.validation_confirmed_count || 0) ||
        right.confidence - left.confidence ||
        new Date(right.validated_at || right.created_at).getTime() - new Date(left.validated_at || left.created_at).getTime(),
    )
    .slice(0, 6)
    .map((report) => toValidationMemoryItem(report));
  const falsified = scoped
    .filter((report) => report.validation_status === 'falsified')
    .sort(
      (left, right) =>
        (right.validation_falsified_count || 0) - (left.validation_falsified_count || 0) ||
        right.confidence - left.confidence ||
        new Date(right.validated_at || right.created_at).getTime() - new Date(left.validated_at || left.created_at).getTime(),
    )
    .slice(0, 6)
    .map((report) => toValidationMemoryItem(report));
  const pending = scoped
    .filter((report) => (report.validation_status || 'pending') === 'pending')
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        (right.validation_review_count || 0) - (left.validation_review_count || 0) ||
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, 6)
    .map((report) => toValidationMemoryItem(report));

  return {
    window_days: WEEKLY_PREDICTION_WINDOW_DAYS,
    generated_at: new Date().toISOString(),
    confirmed_count: scoped.filter((report) => report.validation_status === 'confirmed').length,
    falsified_count: scoped.filter((report) => report.validation_status === 'falsified').length,
    pending_count: scoped.filter((report) => (report.validation_status || 'pending') === 'pending').length,
    confirmed_reports: confirmed,
    falsified_reports: falsified,
    pending_reports: pending,
    top_future_event: pending[0] || null,
  };
}

function rewriteLegacyReportVoice(report: WorldReport): WorldReport {
  const replace = (value: string): string => smoothNarrativeText(value);
  const appearsTemplated = (value: string): boolean =>
    /前面几只虾已经|前面几段判断已经|这次不是重开一页|我现在更在意的不是它又响了一次|接下来先盯新的地面回传|刚翻开的现场笔记|先把地方和感觉记住|先别把话说重|不是平地起一页|我这次不想重讲|沿着.+写过几轮|旧判断往前推了一格/.test(value);
  const topicLabel = report.topic_label || report.topic || '这条线';
  const region = report.region || '该区域';
  const defaultQuestion = `这次要判断的是，${region} 这条${topicLabel}线究竟还只是旧风险续压，还是已经出现了需要改判的新证据。`;
  const defaultJudgment = `这条线值得继续压着看，但现在还缺能把判断彻底推上去的第二来源或官方回应。`;
  const defaultOutlook = `接下来只看会不会再落第二来源、官方表态或相邻地区同步抬头；再落一项我就上调，没有的话先按局部事件收住。`;

  const projectionSummary = report.projection[0]?.summary || report.watch_next || '';

  return {
    ...report,
    report_id:
      normalizeText(report.report_id) ||
      generateStableId('report', `${report.mission_id}:${report.signal_id}:${report.created_at}`),
    past_report: replace(
      appearsTemplated(report.past_report || '')
        ? defaultQuestion
        : (report.past_report ||
            (report.facts[0]
              ? `${report.facts[0]}${report.facts[1] ? ` ${report.facts[1]}` : ''}`
              : report.report_kind_note || report.summary)),
    ),
    current_analysis: replace(
      appearsTemplated(report.current_analysis || '')
        ? defaultJudgment
        : (report.current_analysis || report.inference || report.why_now || report.summary),
    ),
    future_projection: replace(
      appearsTemplated(report.future_projection || '')
        ? defaultOutlook
        : (report.future_projection || projectionSummary || report.watch_next || report.brake_line),
    ),
    report_kind_note: replace(report.report_kind_note),
    summary: replace(appearsTemplated(report.summary || '') ? defaultJudgment : report.summary),
    facts: report.facts.map(replace),
    inference: replace(appearsTemplated(report.inference || '') ? defaultJudgment : report.inference),
    projection: report.projection.map((item) => ({
      ...item,
      summary: replace(appearsTemplated(item.summary || '') ? defaultOutlook : item.summary),
    })),
    thread_parent_report_id: report.thread_parent_report_id || null,
    thread_relation: report.thread_relation || null,
    validation_target_report_ids: Array.isArray(report.validation_target_report_ids) ? report.validation_target_report_ids : null,
    projection_links: Array.isArray(report.projection_links) ? report.projection_links : null,
    why_now: replace(appearsTemplated(report.why_now || '') ? defaultJudgment : report.why_now),
    watch_next: replace(appearsTemplated(report.watch_next || '') ? defaultOutlook : report.watch_next),
    validation_status: report.validation_status || 'pending',
    validated_at: report.validated_at || null,
    validation_note: report.validation_note || null,
    validated_by_xia_id: report.validated_by_xia_id || null,
    validation_signal_id: report.validation_signal_id || null,
    validation_updated_at: report.validation_updated_at || null,
  };
}

function isConcreteDashboardReport(report: WorldReport): boolean {
  const text = [report.past_report, report.current_analysis, report.future_projection, report.summary]
    .map((value) => normalizeText(value))
    .join(' ');
  return !/前面几只虾已经|前面几段判断已经|这次不是重开一页|我现在更在意的不是它又响了一次|我先看后面几条信源还会不会继续围着|一页刚翻开的现场笔记|我会先看后面几条信源是不是还围着|不是平地起一页|我这次不想重讲|沿着.+写过几轮|旧判断往前推了一格|新的地面回传/.test(text);
}

function buildReport(briefing: WorldBriefing, signal: WorldSignal, priorReports: WorldReport[]): WorldReport {
  const localizedSignal = withLocalizedDisplay(signal);
  const recentPeerReports = getRecentRelatedReports(localizedSignal, priorReports);
  const topicLabel = briefing.topic_label || localizeSignalForCoverage(localizedSignal).topicLabel;
  const stage = describeSignalStage(signal, recentPeerReports.length);
  const reportKind = describeReportKind(localizedSignal, topicLabel, recentPeerReports);
  const whyNow = buildWhyNow(briefing, localizedSignal, recentPeerReports.length, stage);
  const watchNext = buildWatchNext(localizedSignal);
  const locationLabel = localizedSignal.locationName
    ? `${localizedSignal.locationName}${localizedSignal.country ? `, ${localizedSignal.country}` : ''}`
    : localizedSignal.region;
  const facts = [
    `这次先落笔在 ${locationLabel}。`,
    '原始链接还在，可以顺着继续回看。',
    `严重度 ${localizedSignal.severity}，时间也还新，够得上继续往下跟。`,
    localizedSignal.locationName
      ? `地图上能落到 ${locationLabel}，先别写飘。`
      : `眼下先把它放在 ${localizedSignal.region}，具体落点等后续信源来补。`,
  ];
  if (recentPeerReports.length > 0) {
    facts.push(`近 30 天里已经有 ${recentPeerReports.length} 条同区域相关续写，这次可以直接接着旧判断往下看。`);
  }

  const inference =
    recentPeerReports.length > 0
      ? `前面已经写过几笔了，所以这次我更在意它是补东西、改方向，还是只是又回响了一遍。`
      : `我先不急着下结论，先把它当成一枚刚亮起来的点记住。`;
  const projection = buildProjection(localizedSignal, recentPeerReports.length);
  const peerBoost = recentPeerReports.length ? Math.min(0.08, recentPeerReports.length * 0.02) : 0;
  const confidence = projection.length
    ? Number(clamp((projection.reduce((sum, item) => sum + item.confidence, 0) / projection.length) + peerBoost, 0.2, 0.9).toFixed(2))
    : Number(clamp(signal.hotspotScore * 0.45 + signal.explorationScore * 0.2 + peerBoost, 0.2, 0.68).toFixed(2));
  const invalidators = (() => {
    const items = projection.flatMap((item) => item.invalidators).slice(0, 4);
    return items.length > 0 ? items : ['后续证据不足，无法继续支撑推演'];
  })();
  const brakeLine = invalidators[0];
  const analysisQuestion = buildConcreteReportQuestion(localizedSignal, topicLabel, locationLabel, recentPeerReports.length);
  const currentAnalysis = buildConcreteJudgment(localizedSignal, locationLabel, recentPeerReports.length);
  const futureProjection = buildConcreteOutlook(localizedSignal, locationLabel, projection);
  const handoffToNextAgent = buildHandoffToNextAgent(localizedSignal, watchNext);
  const whatChangesMyMind = invalidators[0] || futureProjection;

  const report = rewriteLegacyReportVoice({
    report_id: `report_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    mission_id: briefing.mission_id,
    signal_id: signal.id,
    xia_id: briefing.xia_id,
    question_now: analysisQuestion,
    why_here: briefing.why_here || briefing.dispatch_reason,
    what_changes_my_mind: whatChangesMyMind,
    handoff_to_next_agent: briefing.handoff_to_next_agent || handoffToNextAgent,
    past_report: analysisQuestion,
    current_analysis: currentAnalysis,
    future_projection: futureProjection,
    report_kind: reportKind.label,
    report_kind_note: reportKind.note,
    summary: currentAnalysis,
    facts,
    inference,
    projection,
    confidence,
    invalidators,
    brake_line: brakeLine,
    scene: briefing.scene,
    mode: briefing.mode,
    region: briefing.region,
    topic: briefing.topic,
    topic_label: topicLabel,
    thread_parent_report_id: recentPeerReports[0]?.report_id || null,
    thread_relation: recentPeerReports[0] ? 'continue' : null,
    validation_target_report_ids: null,
    projection_links: null,
    why_now: whyNow,
    watch_next: watchNext,
    signal_stage: stage.label,
    validation_status: 'pending',
    validated_at: null,
    validation_note: null,
    validated_by_xia_id: null,
    validation_signal_id: null,
    validation_updated_at: null,
    validation_review_count: 0,
    validation_pending_count: 0,
    validation_confirmed_count: 0,
    validation_falsified_count: 0,
    created_at: new Date().toISOString(),
  });

  report.for_your_human = buildForYourHuman(report);
  return report;
}

// Helper to generate stable IDs based on content hash
function generateStableId(prefix: string, uniqueKey: string): string {
  const hash = crypto.createHash('md5').update(uniqueKey).digest('hex').slice(0, 16);
  return `${prefix}-${hash}`;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function asScalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function stripMarkdownToPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeMarkdownLine(value: string): string {
  return cleanDisplayText(
    value
      .replace(/^\[图\]$/g, '')
      .replace(/^图源[:：].*/g, '')
      .replace(/^图片[:：].*/g, '')
      .replace(/^原标题[:：]/g, '')
      .replace(/^原标题\s*/g, ''),
  );
}

function summarizeIcArticleDetail(title: string, description: string, contentMd: string): string {
  const plain = stripMarkdownToPlainText(contentMd);
  const lineCandidates = plain
    .split(/\n+/)
    .map((item) => normalizeMarkdownLine(item))
    .filter(Boolean)
    .filter((item) => item !== title)
    .filter((item) => !/^作者[:：]/.test(item))
    .filter((item) => !/^时间[:：]/.test(item))
    .filter((item) => !/^简介[:：]?$/.test(item))
    .filter((item) => !/^主题[:：]?$/.test(item))
    .filter((item) => !/^URL[:：]/.test(item))
    .filter((item) => !/^Hacker News[:：]/.test(item))
    .filter((item) => !/^引用链接/.test(item))
    .filter((item) => !/^人气[:：]/.test(item))
    .filter((item) => !/^产品核心功能/.test(item))
    .filter((item) => !/^产品使用案例/.test(item))
    .filter((item) => item.length >= 18);

  const sentenceCandidates = lineCandidates.flatMap((item) =>
    item
      .split(/(?<=[。！？.!?])\s+/)
      .map((segment) => cleanDisplayText(segment))
      .filter((segment) => segment.length >= 18),
  );
  const picked = sentenceCandidates.slice(0, 2).join(' ');
  return cleanDisplayText(picked || description || title).slice(0, 420);
}

function fallbackSeverityForSignal(
  title: string,
  description: string,
  relevanceScore?: number | null,
): number {
  const haystack = `${title} ${description}`.toLowerCase();
  const elevatedPattern = /(missile|strike|drone|attack|war|conflict|outbreak|explosion|air base|pipeline|refinery|ceasefire)/;
  const severePattern = /(mass casualty|fatalities|major outbreak|ballistic|invasion|evacuation|chemical)/;

  if (severePattern.test(haystack)) {
    return 4;
  }

  if ((relevanceScore || 0) >= 88 || elevatedPattern.test(haystack)) {
    return 3;
  }

  return 2;
}

function severityFromWorldMonitorIntensity(intensity?: number | null): number | null {
  if (typeof intensity !== 'number' || !Number.isFinite(intensity)) {
    return null;
  }

  return clamp(Math.round(intensity), 1, 5);
}

function relevanceFromWorldMonitorSignals(
  severity: number,
  intensity?: number | null,
  mentionCount?: number | null,
): number {
  const intensityHeat = typeof intensity === 'number' ? clamp(intensity / 5, 0, 1) : severity / 5;
  const mentionHeat = typeof mentionCount === 'number' ? clamp(Math.log1p(mentionCount) / 6, 0, 1) : 0;
  return clamp(0.36 + intensityHeat * 0.34 + mentionHeat * 0.2, 0.35, 0.96);
}

function mentionBucket(mentionCount?: number | null): string | null {
  if (typeof mentionCount !== 'number') {
    return null;
  }

  if (mentionCount >= 100) return 'wm:mentions:100-plus';
  if (mentionCount >= 25) return 'wm:mentions:25-plus';
  if (mentionCount >= 5) return 'wm:mentions:5-plus';
  return 'wm:mentions:single';
}

function getPayloadArray(data: unknown, keys: string[]): RawWorldMonitorItem[] | null {
  if (Array.isArray(data)) {
    return data.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object');
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object');
    }
  }

  return null;
}

function positionAt(item: RawWorldMonitorItem, index: number): number | null {
  const position = item.position;
  return Array.isArray(position) ? asNumber(position[index]) : null;
}

function parseNumericText(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseIsoDay(value: string): string {
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function clampFutureIso(value: string, now = Date.now()): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return new Date(now).toISOString();
  return parsed > now + 5 * 60 * 1000 ? new Date(now).toISOString() : new Date(parsed).toISOString();
}

function formatTrillionAmount(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return `${(value / 1e12).toFixed(2)} 万亿`;
}

function extractDrugProducts(item: RawWorldMonitorItem): string[] {
  const patient = item.patient && typeof item.patient === 'object' ? (item.patient as RawWorldMonitorItem) : null;
  const drugs = Array.isArray(patient?.drug) ? patient.drug : [];
  return drugs
    .map((drug) => (drug && typeof drug === 'object' ? asText((drug as RawWorldMonitorItem).medicinalproduct) : ''))
    .filter(Boolean)
    .slice(0, 2);
}

function extractDrugReactions(item: RawWorldMonitorItem): string[] {
  const patient = item.patient && typeof item.patient === 'object' ? (item.patient as RawWorldMonitorItem) : null;
  const reactions = Array.isArray(patient?.reaction) ? patient.reaction : [];
  return reactions
    .map((reaction) => (reaction && typeof reaction === 'object' ? asText((reaction as RawWorldMonitorItem).reactionmeddrapt) : ''))
    .filter(Boolean)
    .slice(0, 3);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseArxivEntries(xml: string): Array<{ id: string; title: string; updated: string; summary: string }> {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
    .map((match) => match[1] || '')
    .map((entry) => ({
      id: decodeXmlEntities((entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '').trim()),
      title: cleanDisplayText(decodeXmlEntities((entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim())),
      updated: decodeXmlEntities((entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] || '').trim()),
      summary: cleanDisplayText(decodeXmlEntities((entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').trim())),
    }))
    .filter((entry) => entry.id && entry.title);
}

function parseRssItems(xml: string): Array<{ title: string; link: string; publishedAt: string; summary: string }> {
  const itemMatches = Array.from(xml.matchAll(/<(item|entry)\b[\s\S]*?>([\s\S]*?)<\/(item|entry)>/gi));
  return itemMatches
    .map((match) => match[2] || '')
    .map((item) => {
      const title =
        decodeXmlEntities((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()) || 'Untitled';
      const link =
        decodeXmlEntities((item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim()) ||
        decodeXmlEntities((item.match(/<link[^>]*href=['"]([^'"]+)['"]/i)?.[1] || '').trim());
      const publishedAt =
        decodeXmlEntities((item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim()) ||
        decodeXmlEntities((item.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] || '').trim()) ||
        decodeXmlEntities((item.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] || '').trim());
      const summary =
        decodeXmlEntities((item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').trim()) ||
        decodeXmlEntities((item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '').trim());
      return {
        title: cleanDisplayText(title.replace(/<!\[CDATA\[|\]\]>/g, '')),
        link: cleanDisplayText(link),
        publishedAt: parseIsoDay(publishedAt || new Date().toISOString()),
        summary: cleanDisplayText(summary.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')),
      };
    })
    .filter((item) => item.title);
}

function normalizeArxivRecent(xml: string): SignalRow[] {
  const entries = parseArxivEntries(xml).slice(0, 2);
  if (entries.length === 0) {
    return [];
  }

  const anchor = getKnowledgeAnchor('', 'Research Feed', 'arXiv', ['literature', 'research', 'arxiv', 'ai']);
  const latest = entries[0];
  const titles = entries.map((entry) => `《${entry.title}》`).join('、');
  const summary = cleanDisplayText(latest.summary).slice(0, 180);

  return [
    {
      id: generateStableId('public-anchor', `arxiv-${latest.id}`),
      title: 'arXiv AI 预印本更新',
      description: `最近的 AI 预印本包括 ${titles}。首条摘要提到：${summary}`,
      source_name: 'arXiv',
      source_url:
        'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&start=0&max_results=2&sortBy=submittedDate&sortOrder=descending',
      event_time: latest.updated || new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: 'Research Feed',
      country: '',
      latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null,
      severity: 2,
      relevance_score: 0.74,
      tags: ['technology', 'literature', 'research', 'arxiv', 'ai', 'public-anchor'],
      alignment_tags: ['source:public-anchor', 'source:arxiv'],
      urgency_reason: 'public-anchor arxiv recent preprints snapshot',
      last_seen_at: new Date().toISOString(),
      source_type: 'literature',
    },
  ];
}

function normalizeEastMoneySnapshot(listData: unknown, klineData: unknown): SignalRow[] {
  const listItems = getPayloadArray(listData, ['data', 'diff']) || [];
  const listTop = listItems.slice(0, 5);
  const leaderNames = listTop
    .map((item) => asText(item.f14) || asText(item.name))
    .filter(Boolean)
    .slice(0, 3);
  const leaderMoves = listTop
    .map((item) => {
      const name = asText(item.f14) || asText(item.name);
      const move = asNumber(item.f3);
      return name && typeof move === 'number' ? `${name}${move >= 0 ? '+' : ''}${move.toFixed(2)}%` : '';
    })
    .filter(Boolean)
    .slice(0, 3);

  const klineRecord = (() => {
    const payload = klineData && typeof klineData === 'object' ? (klineData as Record<string, unknown>) : null;
    const data = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
    const klines = Array.isArray(data?.klines) ? data.klines : [];
    const latest = typeof klines[klines.length - 1] === 'string' ? (klines[klines.length - 1] as string) : '';
    return latest.split(',');
  })();
  const latestDay = klineRecord[0] || new Date().toISOString();
  const close = parseNumericText(klineRecord[2]);
  const dailyMove = parseNumericText(klineRecord[8]);

  return [
    {
      id: generateStableId('selected-source', `eastmoney-market-${latestDay}`),
      title: 'A股盘面快照',
      description: `上证指数最新收在 ${close !== null ? close.toFixed(2) : '--'}，日内变化 ${dailyMove !== null ? `${dailyMove >= 0 ? '+' : ''}${dailyMove.toFixed(2)}%` : '--'}。${leaderMoves.length > 0 ? `盘面活跃股包括 ${leaderMoves.join('、')}。` : leaderNames.length > 0 ? `当前活跃股包括 ${leaderNames.join('、')}。` : ''}`,
      source_name: 'EastMoney',
      source_url: 'https://push2.eastmoney.com/api/qt/clist/get',
      event_time: parseIsoDay(latestDay),
      created_at: new Date().toISOString(),
      location: 'Shanghai',
      country: 'China',
      latitude: 31.2304,
      longitude: 121.4737,
      severity: 3,
      relevance_score: 0.82,
      tags: ['finance', 'china-market', 'equity', 'eastmoney', 'a-share'],
      alignment_tags: ['source:selected-source', 'source:eastmoney'],
      urgency_reason: 'eastmoney market board snapshot',
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
    },
  ];
}

function normalizeNseSnapshot(
  quoteData: unknown,
  announcementsData: unknown,
  eventCalendarData: unknown,
  pitData: unknown,
): SignalRow[] {
  const quote = quoteData && typeof quoteData === 'object' ? (quoteData as Record<string, unknown>) : null;
  const priceInfo = quote?.priceInfo && typeof quote.priceInfo === 'object' ? (quote.priceInfo as Record<string, unknown>) : null;
  const lastPrice = asNumber(priceInfo?.lastPrice);
  const change = asNumber(priceInfo?.pChange);
  const companyName = asText(quote?.info && typeof quote.info === 'object' ? (quote.info as Record<string, unknown>).companyName : 'Reliance Industries');

  const announcements = Array.isArray(announcementsData) ? announcementsData : getPayloadArray(announcementsData, ['data']) || [];
  const calendar = Array.isArray(eventCalendarData) ? eventCalendarData : getPayloadArray(eventCalendarData, ['data']) || [];
  const pit = Array.isArray(pitData) ? pitData : getPayloadArray(pitData, ['data']) || [];

  return [
    {
      id: generateStableId('selected-source', `nse-quote-${new Date().toISOString().slice(0, 13)}`),
      title: 'NSE 市场快照',
      description: `${companyName || 'NSE 样本股票'} 最新报价 ${lastPrice !== null ? lastPrice.toFixed(2) : '--'}，涨跌 ${change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--'}。同轮抓到公告 ${announcements.length} 条、事件日历 ${calendar.length} 条、PIT 披露 ${pit.length} 条。`,
      source_name: 'NSE India',
      source_url: 'https://www.nseindia.com/api/quote-equity?symbol=RELIANCE',
      event_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: 'Mumbai',
      country: 'India',
      latitude: 19.076,
      longitude: 72.8777,
      severity: 3,
      relevance_score: 0.83,
      tags: ['finance', 'india-market', 'equity', 'nse', 'announcements'],
      alignment_tags: ['source:selected-source', 'source:nse'],
      urgency_reason: 'nse quote and disclosure snapshot',
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
    },
  ];
}

function normalizeCryptoMarketSnapshot(binanceData: unknown, coinGeckoData: unknown, coinbaseData: unknown): SignalRow[] {
  const binance = Array.isArray(binanceData) ? binanceData : [];
  const latestCandle = Array.isArray(binance) && Array.isArray(binance[binance.length - 1]) ? binance[binance.length - 1] : [];
  const binanceClose = asNumber(latestCandle[4]);
  const binanceOpen = asNumber(latestCandle[1]);
  const geckoPrice = asNumber(
    coinGeckoData && typeof coinGeckoData === 'object'
      ? ((coinGeckoData as Record<string, unknown>).bitcoin as Record<string, unknown> | undefined)?.usd
      : null,
  );
  const coinbasePrice = asNumber(
    coinbaseData && typeof coinbaseData === 'object'
      ? ((coinbaseData as Record<string, unknown>).data as Record<string, unknown> | undefined)?.amount
      : null,
  );
  const basePrice = coinbasePrice ?? geckoPrice ?? binanceClose;
  const change =
    typeof binanceClose === 'number' && typeof binanceOpen === 'number' && binanceOpen !== 0
      ? ((binanceClose - binanceOpen) / binanceOpen) * 100
      : null;

  return [
    {
      id: generateStableId('selected-source', `crypto-stack-${new Date().toISOString().slice(0, 13)}`),
      title: '加密市场价格快照',
      description: `BTC 当前价格约 ${basePrice !== null ? `$${basePrice.toFixed(2)}` : '--'}，Binance 日线变动 ${change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--'}。同轮交叉比对了 Binance、CoinGecko 和 Coinbase 三个公开源。`,
      source_name: 'Crypto Market Stack',
      source_url: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=5',
      event_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: 'Global Digital Market',
      country: '',
      latitude: null,
      longitude: null,
      severity: 3,
      relevance_score: 0.86,
      tags: ['finance', 'crypto', 'bitcoin', 'market', 'cross-checked'],
      alignment_tags: ['source:selected-source', 'source:crypto-stack'],
      urgency_reason: 'cross-source crypto price snapshot',
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
    },
  ];
}

function normalizeAlphaVantageSnapshot(gdpData: unknown, cpiData: unknown, yieldData: unknown, newsData: unknown): SignalRow[] {
  const gdpItem = Array.isArray((gdpData as Record<string, unknown> | null)?.data)
    ? ((gdpData as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]
    : null;
  const cpiItem = Array.isArray((cpiData as Record<string, unknown> | null)?.data)
    ? ((cpiData as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]
    : null;
  const yieldItem = Array.isArray((yieldData as Record<string, unknown> | null)?.data)
    ? ((yieldData as Record<string, unknown>).data as Array<Record<string, unknown>>)[0]
    : null;
  const feed = Array.isArray((newsData as Record<string, unknown> | null)?.feed)
    ? ((newsData as Record<string, unknown>).feed as Array<Record<string, unknown>>)
    : [];

  const gdpValue = asNumber(gdpItem?.value);
  const cpiValue = asNumber(cpiItem?.value);
  const yieldValue = asNumber(yieldItem?.value);
  const headline = asText(feed[0]?.title);

  return [
    {
      id: generateStableId('selected-source', `alpha-vantage-macro-${new Date().toISOString().slice(0, 13)}`),
      title: '美国宏观读数快照',
      description: `Alpha Vantage 当前样本里，Real GDP ${gdpValue !== null ? gdpValue.toFixed(2) : '--'}，CPI ${cpiValue !== null ? cpiValue.toFixed(2) : '--'}，10Y Treasury Yield ${yieldValue !== null ? `${yieldValue.toFixed(2)}%` : '--'}。${headline ? `新闻情绪样本首条为《${headline}》。` : ''}`,
      source_name: 'Alpha Vantage',
      source_url: 'https://www.alphavantage.co/query?function=REAL_GDP&interval=quarterly&apikey=demo',
      event_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: 'Washington',
      country: 'United States',
      latitude: 38.9072,
      longitude: -77.0369,
      severity: 2,
      relevance_score: 0.79,
      tags: ['finance', 'macro', 'alpha-vantage', 'gdp', 'cpi', 'treasury-yield'],
      alignment_tags: ['source:selected-source', 'source:alpha-vantage'],
      urgency_reason: 'macro snapshot from alpha vantage demo endpoints',
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
    },
  ];
}

function normalizeNewsFeedSnapshot(
  xml: string,
  config: { sourceName: string; sourceUrl: string; location: string; country: string; latitude: number; longitude: number },
): SignalRow[] {
  const items = parseRssItems(xml).slice(0, 4);
  if (items.length === 0) {
    return [];
  }

  return items.map((item, index) => {
    const sourceUrl = item.link || config.sourceUrl;
    const description = normalizeText(item.summary)
      ? item.summary
      : `${config.sourceName} 报道：${item.title}`;
    return {
      id: generateStableId('selected-source', `${normalizeTag(config.sourceName)}-${sourceUrl || item.title}-${item.publishedAt}-${index}`),
      title: item.title,
      description,
      source_name: config.sourceName,
      source_url: sourceUrl,
      event_time: item.publishedAt || new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: config.location,
      country: config.country,
      latitude: config.latitude,
      longitude: config.longitude,
      severity: 2,
      relevance_score: 0.7,
      tags: ['global', 'news', 'rss', normalizeTag(config.sourceName), 'rss-item'],
      alignment_tags: ['source:selected-source', 'source:news-feed', 'type:rss-item'],
      urgency_reason: `${config.sourceName} rss article`,
      last_seen_at: new Date().toISOString(),
      source_type: 'rss',
    };
  });
}

function collectAiHotItems(data: unknown): RawWorldMonitorItem[] {
  const directItems = getPayloadArray(data, ['items']) || [];
  if (!data || typeof data !== 'object') {
    return directItems;
  }

  const record = data as Record<string, unknown>;
  const sections = Array.isArray(record.sections)
    ? record.sections.filter((section): section is RawWorldMonitorItem => section !== null && typeof section === 'object')
    : [];
  const sectionItems = sections.flatMap((section) => {
    const label = asText(section.label);
    const items = Array.isArray(section.items)
      ? section.items.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object')
      : [];
    return items.map((item) => ({
      ...item,
      category: asText(item.category) || label,
      publishedAt: asText(item.publishedAt) || asText(item.published_at) || asText(record.windowEnd) || asText(record.generatedAt) || asText(record.date),
    }));
  });

  return [...directItems, ...sectionItems];
}

type AiHotSourceTier = 't1' | 't1.5' | 't2';

function classifyAiHotSourceTier(sourceName: string, url: string): AiHotSourceTier {
  const sourceText = `${sourceName} ${url}`;
  const normalized = normalizeTag(sourceText);
  if (
    /官网|官方|blog|newsroom|github-releases|developers-blog|hugging-face-blog|openai|anthropic|claude|google-developers|deepmind|meta-ai|mistral|perplexity|runway|notion|krea|minimax|moonshot|kimi|baidu|sensetime|openrouter/.test(
      normalized,
    ) &&
    !/^x[:：-]/i.test(sourceName.trim())
  ) {
    return 't1';
  }
  if (
    /^x[:：-]/i.test(sourceName.trim()) &&
    /openai|anthropic|claude|google|deepmind|meta|xai|grok|mistral|perplexity|runway|notion|krea|minimax|moonshot|kimi|baidu|sensetime|kling|openrouter|nvidia|huggingface|hugging-face/.test(
      normalized,
    )
  ) {
    return 't1.5';
  }
  return 't2';
}

function aiHotCategoryWeight(category: string) {
  switch (category) {
    case 'ai-models':
      return 0.11;
    case 'ai-products':
      return 0.09;
    case 'industry':
      return 0.07;
    case 'paper':
      return 0.06;
    case 'tip':
      return 0.02;
    default:
      return 0.04;
  }
}

function aiHotSourceTierWeight(tier: AiHotSourceTier) {
  if (tier === 't1') return 0.18;
  if (tier === 't1.5') return 0.12;
  return 0.06;
}

function aiHotEntityWeight(haystack: string) {
  if (/(openai|anthropic|claude|google|deepmind|meta|xai|grok|nvidia|英伟达|奥特曼|sam-altman|sama)/.test(haystack)) {
    return 0.08;
  }
  if (/(huggingface|hugging-face|mistral|perplexity|moonshot|kimi|minimax|runway|krea|notion|baidu|sensetime|kling|openrouter|langchain|cursor|windsurf|github)/.test(haystack)) {
    return 0.05;
  }
  return 0;
}

function aiHotHardSignalWeight(haystack: string, category: string) {
  let score = 0;
  if (/(发布|上线|推出|release|launch|ships?|announces?|available|open-source|开源|github|api|sdk|cli|benchmark|sota|leaderboard|agent|智能体|模型|大模型|融资|收购|合作|监管|lawsuit|诉讼)/.test(haystack)) {
    score += 0.06;
  }
  if (category === 'paper' && /(数据集|dataset|benchmark|sota|code|github|开源|机器人|推理|reasoning|agent|智能体)/.test(haystack)) {
    score += 0.04;
  }
  if (category === 'tip' && !/(官方|openai|anthropic|claude|google|github|agent|智能体|workflow|工作流|code|代码|实践)/.test(haystack)) {
    score -= 0.04;
  }
  if (/(podcast|播客|观点|opinion|鸡汤|感想|转发)/.test(haystack)) {
    score -= 0.03;
  }
  return score;
}

function scoreAiHotSelectedItem(input: {
  title: string;
  titleEn: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  category: string;
  index: number;
  total: number;
}) {
  const sourceTier = classifyAiHotSourceTier(input.sourceName, input.sourceUrl);
  const haystack = normalizeTag([input.title, input.titleEn, input.summary, input.sourceName, input.sourceUrl].join(' '));
  const orderBoost = input.total > 1 ? 0.06 * (1 - input.index / Math.max(1, input.total - 1)) : 0.06;
  const relevanceScore = clamp(
    0.58 +
      aiHotSourceTierWeight(sourceTier) +
      aiHotCategoryWeight(input.category) +
      aiHotEntityWeight(haystack) +
      aiHotHardSignalWeight(haystack, input.category) +
      orderBoost,
    0.58,
    0.94,
  );
  return {
    sourceTier,
    relevanceScore: Number(relevanceScore.toFixed(3)),
    severity: relevanceScore >= 0.86 ? 4 : relevanceScore >= 0.75 ? 3 : 2,
  };
}

function normalizeAiHotSnapshot(data: unknown): SignalRow[] {
  const seen = new Set<string>();
  const items = collectAiHotItems(data)
    .map((item) => ({
      id: asText(item.id),
      title: asText(item.title) || asText(item.title_en),
      titleEn: asText(item.title_en),
      url: asText(item.url) || asText(item.sourceUrl),
      source: asText(item.source) || asText(item.sourceName),
      publishedAt: asText(item.publishedAt) || asText(item.published_at) || asText(item.created_at),
      summary: asText(item.summary),
      category: asText(item.category),
    }))
    .filter((item) => item.title || item.summary)
    .filter((item) => {
      const key = normalizeTag(item.url || item.title || item.summary);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 18);

  if (items.length === 0) {
    return [];
  }

  const anchor = getKnowledgeAnchor('', 'AI 前沿', 'AI 前沿', ['ai', 'technology']);

  return items.map((item, index) => {
    const category = normalizeTag(item.category);
    const eventTime = parseIsoDay(item.publishedAt || new Date().toISOString());
    const sourceName = cleanDisplayText(item.source || 'AI 前沿');
    const score = scoreAiHotSelectedItem({
      title: item.title,
      titleEn: item.titleEn,
      summary: item.summary,
      sourceName,
      sourceUrl: item.url,
      category,
      index,
      total: items.length,
    });
    return {
      id: generateStableId('selected-source', `aihot-item-${item.id || item.url || item.title}`),
      title: cleanDisplayText(item.title),
      description: concreteDisplayText(item.summary || item.titleEn || item.title, 260),
      source_name: sourceName,
      source_url: item.url || 'https://aihot.virxact.com/',
      event_time: eventTime,
      created_at: new Date().toISOString(),
      location: 'AI 前沿',
      country: '',
      latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null,
      severity: score.severity,
      relevance_score: score.relevanceScore,
      tags: ['technology', 'ai', 'aihot', 'ai-news', 'source-feed', 'daily:ai', category, `aihot-tier:${score.sourceTier}`].filter(Boolean),
      alignment_tags: [
        'source:selected-source',
        'source:aihot',
        'source:news-feed',
        'category:ai-daily',
        'aihot:selected',
        `aihot:tier:${score.sourceTier}`,
        'aihot:scoring:code-formula',
        category ? `aihot:category:${category}` : '',
      ],
      urgency_reason: `AI frontpage selected item; tier=${score.sourceTier}; category=${category || 'unknown'}; relevance=${score.relevanceScore}`,
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
      source_feed_name: 'AI 前沿',
      content_md: [cleanDisplayText(item.title), sourceName, concreteDisplayText(item.summary, 220), item.url].filter(Boolean).join(' — '),
    };
  });
}

function collectAiNewsRadarItems(data: unknown): RawWorldMonitorItem[] {
  const directItems = getPayloadArray(data, ['items']) || [];
  if (!data || typeof data !== 'object') {
    return directItems;
  }

  const record = data as Record<string, unknown>;
  const candidates = [
    ...directItems,
    ...(Array.isArray(record.news) ? record.news : []),
    ...(Array.isArray(record.entries) ? record.entries : []),
  ];
  return candidates.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object');
}

function aiNewsRadarSiteLimit(siteId: string) {
  if (siteId === 'official-ai' || siteId === 'official_ai') return Math.max(AI_NEWS_RADAR_PER_SITE_LIMIT, 10);
  if (siteId === 'aihot' || siteId === 'opmlrss') return Math.max(AI_NEWS_RADAR_PER_SITE_LIMIT, 8);
  if (siteId === 'aibase' || siteId === 'zeli') return Math.max(AI_NEWS_RADAR_PER_SITE_LIMIT, 6);
  return AI_NEWS_RADAR_PER_SITE_LIMIT;
}

function aiNewsRadarTrustedSourceBoost(siteId: string, sourceName: string) {
  const haystack = normalizeTag(`${siteId} ${sourceName}`);
  if (/(official-ai|official_ai|aihot|openai|anthropic|deepmind|google|meta|mistral|nvidia|huggingface|hugging-face|github|infoq|aibase|zeli)/.test(haystack)) {
    return 0.08;
  }
  if (/(buzzing|techurls|tophub|info-flow|newsnow)/.test(haystack)) {
    return -0.04;
  }
  return 0;
}

function aiNewsRadarRequiresHardAiSignal(siteId: string) {
  return /(buzzing|techurls|tech-urls|tophub|info-flow|infoflow|newsnow|zeli)/.test(siteId);
}

function aiNewsRadarHasHardAiSignal(item: {
  title: string;
  titleEn: string;
  sourceName: string;
  signals: string[];
}) {
  const text = [item.title, item.titleEn, item.sourceName, item.signals.join(' ')].join(' ');
  return /(\bai\b|aigc|llm|agent|agentic|openai|anthropic|claude|chatgpt|gemini|deepmind|deepseek|qwen|kimi|grok|xai|mistral|hugging\s?face|cursor|codex|copilot|nvidia|gpu|inference|benchmark|eval|sota|model|transformer|diffusion|multimodal|robot|机器人|人工智能|大模型|模型|智能体|多模态|生成式|推理|训练|算力|芯片|开源|论文|评测)/i.test(text);
}

function normalizeAiNewsRadarEventTime(item: {
  publishedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
}, generatedAt: string) {
  const generated = Date.parse(generatedAt || item.lastSeenAt || item.firstSeenAt || new Date().toISOString());
  const published = Date.parse(item.publishedAt || '');
  if (Number.isFinite(published) && Number.isFinite(generated) && published <= generated + 36 * 60 * 60 * 1000) {
    return parseIsoDay(item.publishedAt);
  }
  return parseIsoDay(item.firstSeenAt || item.lastSeenAt || generatedAt || new Date().toISOString());
}

function aiNewsRadarCategoryLabel(label: string, signals: string[]) {
  const haystack = normalizeTag([label, signals.join(' ')].join(' '));
  if (/(model-release|model|llm|claude|gemini|gpt|qwen|deepseek|kimi)/.test(haystack)) return 'ai-models';
  if (/(agent|workflow|code|coding|developer|devtools|cursor|codex|claude-code)/.test(haystack)) return 'ai-agents';
  if (/(research|paper|benchmark|eval|sota|arxiv)/.test(haystack)) return 'ai-research';
  if (/(chip|gpu|nvidia|inference|datacenter|data-center|算力|芯片)/.test(haystack)) return 'ai-infra';
  return label ? normalizeTag(label) : 'ai-general';
}

function normalizeAiNewsRadarSnapshot(data: unknown): SignalRow[] {
  const generatedAt = data && typeof data === 'object' ? asText((data as Record<string, unknown>).generated_at) : '';
  const seen = new Set<string>();
  const perSiteCount = new Map<string, number>();
  const anchor = getKnowledgeAnchor('', 'AI 前沿', 'AI 前沿', ['ai', 'technology']);
  const items = collectAiNewsRadarItems(data)
    .map((item) => {
      const siteId = normalizeTag(asText(item.site_id));
      const siteName = asText(item.site_name);
      const sourceName = cleanDisplayText(asText(item.source) || siteName || 'AI News Radar');
      const title = cleanDisplayText(asText(item.title_zh) || asText(item.title_bilingual) || asText(item.title) || asText(item.title_original));
      const titleEn = cleanDisplayText(asText(item.title_en));
      const url = asText(item.url);
      const aiScore = Number(item.ai_score);
      const aiIsRelated = item.ai_is_related === true || asText(item.ai_is_related) === 'true';
      const label = normalizeTag(asText(item.ai_label));
      const signals = Array.isArray(item.ai_signals) ? item.ai_signals.map(asText).filter(Boolean) : [];
      const noise = Array.isArray(item.ai_noise) ? item.ai_noise.map(asText).filter(Boolean) : [];
      const publishedAt = asText(item.published_at);
      const firstSeenAt = asText(item.first_seen_at);
      const lastSeenAt = asText(item.last_seen_at);
      const trustedBoost = aiNewsRadarTrustedSourceBoost(siteId, sourceName);
      const effectiveScore = clamp((Number.isFinite(aiScore) ? aiScore : 0) + trustedBoost, 0, 1);
      return {
        id: asText(item.id),
        siteId,
        siteName,
        sourceName,
        title,
        titleEn,
        url,
        aiScore: Number.isFinite(aiScore) ? aiScore : 0,
        aiIsRelated,
        label,
        signals,
        noise,
        publishedAt,
        firstSeenAt,
        lastSeenAt,
        effectiveScore,
      };
    })
    .filter((item) => item.title && item.url)
    .filter((item) => item.aiIsRelated && item.effectiveScore >= 0.72)
    .filter((item) => !aiNewsRadarRequiresHardAiSignal(item.siteId) || (item.aiScore >= 0.82 && aiNewsRadarHasHardAiSignal(item)))
    .filter((item) => aiNewsRadarHasHardAiSignal(item) || /(official-ai|official_ai|aihot|aibase)/.test(item.siteId))
    .filter((item) => !item.noise.some((value) => /jobs?|招聘|活动|报名|coupon|deal|ad|sponsor/i.test(value)))
    .sort((left, right) => {
      const leftTrusted = aiNewsRadarTrustedSourceBoost(left.siteId, left.sourceName);
      const rightTrusted = aiNewsRadarTrustedSourceBoost(right.siteId, right.sourceName);
      return (
        right.effectiveScore - left.effectiveScore ||
        rightTrusted - leftTrusted ||
        Date.parse(right.firstSeenAt || right.publishedAt || '') - Date.parse(left.firstSeenAt || left.publishedAt || '')
      );
    })
    .filter((item) => {
      const key = normalizeTag(item.url || item.title);
      if (!key || seen.has(key)) return false;
      const current = perSiteCount.get(item.siteId) || 0;
      if (current >= aiNewsRadarSiteLimit(item.siteId)) return false;
      seen.add(key);
      perSiteCount.set(item.siteId, current + 1);
      return true;
    })
    .slice(0, AI_NEWS_RADAR_MAX_ITEMS);

  return items.map((item, index) => {
    const category = aiNewsRadarCategoryLabel(item.label, item.signals);
    const eventTime = normalizeAiNewsRadarEventTime(item, generatedAt);
    const relevanceScore = clamp(0.58 + item.aiScore * 0.26 + aiNewsRadarTrustedSourceBoost(item.siteId, item.sourceName) + (1 - index / Math.max(items.length, 1)) * 0.04, 0.6, 0.95);
    const severity = relevanceScore >= 0.86 ? 4 : relevanceScore >= 0.76 ? 3 : 2;
    return {
      id: generateStableId('selected-source', `ai-news-radar-${item.id || item.url || item.title}`),
      title: item.title,
      description: concreteDisplayText(item.titleEn && item.titleEn !== item.title ? item.titleEn : item.title, 260),
      source_name: item.sourceName,
      source_url: item.url,
      event_time: eventTime,
      created_at: generatedAt || new Date().toISOString(),
      location: 'AI 前沿',
      country: '',
      latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null,
      severity,
      relevance_score: Number(relevanceScore.toFixed(3)),
      tags: [
        'technology',
        'ai',
        'ai-news',
        'source-feed',
        'daily:ai',
        'ai-news-radar',
        category,
        item.siteId ? `ai-radar-site:${item.siteId}` : '',
        item.label ? `ai-radar-label:${item.label}` : '',
        ...item.signals.map((signal) => normalizeTag(signal)).filter(Boolean).slice(0, 4),
      ].filter(Boolean),
      alignment_tags: [
        'source:selected-source',
        'source:ai-news-radar',
        'source:news-feed',
        'category:ai-daily',
        'ai-news-radar:selected',
        category ? `ai-radar:category:${category}` : '',
        item.siteId ? `ai-radar:site:${item.siteId}` : '',
        item.label ? `ai-radar:label:${item.label}` : '',
        `ai-radar:score:${item.aiScore.toFixed(2)}`,
      ].filter(Boolean),
      urgency_reason: `AI News Radar selected item; site=${item.siteId || 'unknown'}; label=${item.label || 'unknown'}; score=${item.aiScore.toFixed(2)}; relevance=${relevanceScore.toFixed(3)}`,
      last_seen_at: item.lastSeenAt || generatedAt || new Date().toISOString(),
      external_id: item.id,
      source_type: 'api-json',
      source_feed_name: 'AI News Radar',
      content_md: [item.title, item.sourceName, item.titleEn, item.url].filter(Boolean).join(' — '),
    };
  });
}

function catalogSourceSceneTags(scene: string) {
  if (scene === 'finance') return ['finance', 'market', 'catalog-source'];
  if (scene === 'technology') return ['technology', 'research', 'catalog-source'];
  if (scene === 'war') return ['war', 'conflict', 'catalog-source'];
  if (scene === 'capacity') return ['capacity', 'shipping', 'energy', 'catalog-source'];
  if (scene === 'health') return ['health', 'biosecurity', 'catalog-source'];
  if (scene === 'weak-signal') return ['weak-signal', 'community', 'catalog-source'];
  return ['global', 'catalog-source'];
}

function inferCatalogSourceLocation(sourceName: string, url: string) {
  const haystack = `${sourceName} ${url}`.toLowerCase();
  if (haystack.includes('treasury')) {
    return { location: 'Washington', country: 'United States', latitude: 38.9072, longitude: -77.0369 };
  }
  if (haystack.includes('nseindia') || haystack.includes('nse ')) {
    return { location: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777 };
  }
  if (haystack.includes('eastmoney')) {
    return { location: 'Shanghai', country: 'China', latitude: 31.2304, longitude: 121.4737 };
  }
  if (haystack.includes('coinbase')) {
    return { location: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 };
  }
  if (haystack.includes('binance')) {
    return { location: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 };
  }
  if (haystack.includes('coingecko')) {
    return { location: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198 };
  }
  if (haystack.includes('fda')) {
    return { location: 'Silver Spring', country: 'United States', latitude: 38.9907, longitude: -77.0261 };
  }
  if (haystack.includes('arxiv') || haystack.includes('openalex') || haystack.includes('crossref')) {
    return { location: 'Research Feed', country: '', latitude: null, longitude: null };
  }
  return { location: 'Global Feed', country: '', latitude: null, longitude: null };
}

function summarizeCatalogJsonPayload(data: unknown) {
  const payloadArray =
    getPayloadArray(data, ['data']) ||
    getPayloadArray(data, ['results']) ||
    getPayloadArray(data, ['items']) ||
    getPayloadArray(data, ['feed']) ||
    getPayloadArray(data, ['articles']) ||
    (Array.isArray(data) ? (data as RawWorldMonitorItem[]) : null);

  if (payloadArray && payloadArray.length > 0) {
    const titles = payloadArray
      .slice(0, 4)
      .map((item) =>
        cleanDisplayText(
          asText(item.title) ||
            asText(item.headline) ||
            asText(item.name) ||
            asText(item.symbol) ||
            asText(item.record_date) ||
            asText(item.id),
        ),
      )
      .filter(Boolean);
    const eventTime =
      asText(payloadArray[0]?.published_at) ||
      asText(payloadArray[0]?.pubDate) ||
      asText(payloadArray[0]?.date) ||
      asText(payloadArray[0]?.updated_at) ||
      asText(payloadArray[0]?.record_date) ||
      new Date().toISOString();
    return {
      summary: titles.length > 0 ? `当前样本前几项包括 ${titles.map((value) => `《${value}》`).join('、')}。` : '当前接口返回了结构化样本。',
      eventTime: parseIsoDay(eventTime),
    };
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const pairs = Object.entries(record)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 5)
      .map(([key, value]) => `${key}=${String(value)}`);
    return {
      summary: pairs.length > 0 ? `当前接口样本摘要：${pairs.join('；')}。` : '当前接口返回了结构化对象。',
      eventTime: new Date().toISOString(),
    };
  }

  return null;
}

function normalizeCatalogStructuredSnapshot(
  source: {
    source_name: string;
    url: string;
    source_type: string;
    note: string;
    recommended_scene: WorldScene;
    skill_name: string;
    admission_tier: string;
  },
  payload: unknown,
): SignalRow[] {
  const location = inferCatalogSourceLocation(source.source_name, source.url);
  if (source.source_type === 'rss' || source.source_type === 'atom') {
    if (typeof payload !== 'string' || !payload.trim()) return [];
    return normalizeNewsFeedSnapshot(payload, {
      sourceName: source.source_name,
      sourceUrl: source.url,
      location: location.location,
      country: location.country,
      latitude: location.latitude as number,
      longitude: location.longitude as number,
    }).map((row) => ({
      ...row,
      id: generateStableId(
        'catalog-source',
        `${normalizeTag(source.skill_name)}-${normalizeTag(source.source_name)}-${normalizeTag(row.title || '')}-${row.event_time}`,
      ),
      title: row.title || `${source.source_name} 信源更新`,
      tags: [...new Set([...(row.tags || []), ...catalogSourceSceneTags(source.recommended_scene), normalizeTag(source.skill_name)])],
      alignment_tags: [...new Set([...(row.alignment_tags || []), 'source:catalog-source'])],
      urgency_reason: `catalog-source ${source.skill_name} rss snapshot`,
    }));
  }

  const summary = summarizeCatalogJsonPayload(payload);
  if (!summary) return [];

  return [
    {
      id: generateStableId('catalog-source', `${normalizeTag(source.skill_name)}-${normalizeTag(source.source_name)}-${summary.eventTime.slice(0, 13)}`),
      title: `${source.source_name} 结构化更新`,
      description: `${summary.summary}${source.note ? ` ${cleanDisplayText(source.note)}` : ''}`.trim(),
      source_name: source.source_name,
      source_url: source.url,
      event_time: summary.eventTime,
      created_at: new Date().toISOString(),
      location: location.location,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      severity: source.admission_tier === 'anchor' ? 3 : 2,
      relevance_score: source.admission_tier === 'anchor' ? 0.78 : 0.64,
      tags: [...new Set([...catalogSourceSceneTags(source.recommended_scene), normalizeTag(source.skill_name), source.source_type])],
      alignment_tags: ['source:catalog-source', `source-skill:${normalizeTag(source.skill_name)}`],
      urgency_reason: `catalog-source ${source.skill_name} structured snapshot`,
      last_seen_at: new Date().toISOString(),
      source_type: source.source_type,
    },
  ];
}

type InkwellArticle = {
  id?: string;
  title?: string;
  link?: string;
  pub_date?: string;
  content_snippet?: string;
  source?: string;
  source_url?: string;
  category?: string;
  author?: string | null;
  likes?: number;
  comment_count?: number;
};

type InkwellSource = {
  id?: string;
  name?: string;
  url?: string;
  category?: string;
  html_url?: string;
};

function inkwellCategoryTags(category: string): string[] {
  const normalized = normalizeTag(category);
  if (normalized.includes('finance')) {
    return ['finance', 'markets', 'macro', 'rss', 'source-feed'];
  }
  if (normalized.includes('aiml')) {
    return ['technology', 'ai', 'llm', 'research', 'rss', 'source-feed'];
  }
  if (normalized.includes('security')) {
    return ['technology', 'security', 'cyber', 'rss', 'source-feed'];
  }
  if (normalized.includes('systems') || normalized.includes('programming') || normalized.includes('hardware')) {
    return ['technology', 'engineering', 'rss', 'source-feed'];
  }
  return ['technology', 'ideas', 'rss', 'source-feed'];
}

function normalizeInkwellSnapshot(articlesData: unknown, sourcesData: unknown): SignalRow[] {
  const articles = Array.isArray((articlesData as Record<string, unknown> | null)?.data)
    ? ((articlesData as Record<string, unknown>).data as InkwellArticle[])
    : [];
  const sources = Array.isArray((sourcesData as Record<string, unknown> | null)?.data)
    ? ((sourcesData as Record<string, unknown>).data as InkwellSource[])
    : [];

  if (articles.length === 0) {
    return [];
  }

  const preferredCategories = new Set(['Finance', 'AI & ML', 'Security', 'Systems', 'Programming', 'Tech Culture']);
  const selectedArticles = articles
    .filter((item) => preferredCategories.has(normalizeText(item.category) || ''))
    .slice(0, 16);
  const articlePool = selectedArticles.length > 0 ? selectedArticles : articles.slice(0, 12);

  const sourceCountsByCategory = new Map<string, number>();
  for (const source of sources) {
    const category = normalizeText(source.category) || 'General';
    sourceCountsByCategory.set(category, (sourceCountsByCategory.get(category) || 0) + 1);
  }

  const grouped = new Map<string, InkwellArticle[]>();
  for (const article of articlePool) {
    const category = normalizeText(article.category) || 'General';
    const current = grouped.get(category) || [];
    current.push(article);
    grouped.set(category, current);
  }

  return [...grouped.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], 'zh-CN'))
    .slice(0, 4)
    .map<SignalRow>(([category, categoryArticles]) => {
      const latest = categoryArticles[0];
      const titleList = categoryArticles.slice(0, 3).map((item) => `《${normalizeText(item.title) || '未命名文章'}》`);
      const totalLikes = categoryArticles.reduce((sum, item) => sum + (asNumber(item.likes) || 0), 0);
      const totalComments = categoryArticles.reduce((sum, item) => sum + (asNumber(item.comment_count) || 0), 0);
      const sourceCount = sourceCountsByCategory.get(category) || 0;
      const sourceName = `Inkwell ${category}`;
      const anchor =
        getKnowledgeAnchor('', category, sourceName, [category, 'inkwell']) || getKnowledgeAnchor('', '', 'Inkwell', ['technology']);

      return {
        id: generateStableId('selected-source', `inkwell-${normalizeTag(category)}-${normalizeText(latest.pub_date) || new Date().toISOString().slice(0, 13)}`),
        title: `Inkwell ${category} 精选更新`,
        description: `${sourceCount > 0 ? `该分类收录约 ${sourceCount} 个 RSS 源。` : '该分类来自 Inkwell 聚合 RSS 源。'}最新文章包括 ${titleList.join('、')}。${totalLikes > 0 || totalComments > 0 ? `当前样本累计点赞 ${totalLikes}、评论 ${totalComments}。` : ''}`,
        source_name: sourceName,
        source_url: normalizeText(latest.link) || 'https://inkwell.coze.site/api/v1/articles',
        event_time: normalizeText(latest.pub_date) || new Date().toISOString(),
        created_at: new Date().toISOString(),
        location: category,
        country: '',
        latitude: anchor?.latitude ?? null,
        longitude: anchor?.longitude ?? null,
        severity: category === 'Finance' || category === 'AI & ML' || category === 'Security' ? 2 : 1,
        relevance_score: category === 'Finance' || category === 'AI & ML' ? 0.72 : 0.64,
        tags: [...inkwellCategoryTags(category), `feed:${sourceName}`],
        alignment_tags: ['source:selected-source', 'source:inkwell', 'source:news-feed', `category:${normalizeTag(category)}`],
        urgency_reason: `inkwell ${category.toLowerCase()} rss snapshot`,
        last_seen_at: new Date().toISOString(),
        source_type: 'rss',
        source_feed_name: sourceName,
        content_md: compactStringList(
          categoryArticles.slice(0, 4).map((item) =>
            [normalizeText(item.title), normalizeText(item.author), normalizeText(item.content_snippet)].filter(Boolean).join(' — '),
          ),
          4,
        ).join('\n'),
      };
    });
}

function normalizeSignalArenaSnapshot(stocksData: unknown, moversData: unknown, leaderboardData: unknown): SignalRow[] {
  const stockPayload = (stocksData as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined;
  const topStocks = Array.isArray(stockPayload?.stocks) ? (stockPayload?.stocks as Array<Record<string, unknown>>) : [];
  const moversPayload = (moversData as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined;
  const movers = moversPayload?.movers && typeof moversPayload.movers === 'object' ? (moversPayload.movers as Record<string, unknown>) : {};
  const leaderboardPayload = (leaderboardData as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined;
  const leaderboard = Array.isArray(leaderboardPayload?.leaderboard)
    ? (leaderboardPayload?.leaderboard as Array<Record<string, unknown>>)
    : [];
  const stats = leaderboardPayload?.stats && typeof leaderboardPayload.stats === 'object'
    ? (leaderboardPayload.stats as Record<string, unknown>)
    : {};

  const topUs = topStocks.slice(0, 3).map((item) => {
    const name = normalizeText(asText(item.name)) || normalizeText(asText(item.symbol)) || '未命名标的';
    const changeRate = asNumber(item.change_rate);
    return `${name}${changeRate !== null ? ` ${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(1)}%` : ''}`;
  });

  const moversSummary = (['CN', 'HK', 'US'] as const)
    .map((market) => {
      const items = Array.isArray(movers[market]) ? (movers[market] as Array<Record<string, unknown>>) : [];
      const first = items[0];
      if (!first) return null;
      const name = normalizeText(asText(first.name)) || normalizeText(asText(first.symbol)) || market;
      const rate = asNumber(first.change_rate);
      return `${market} 领涨 ${name}${rate !== null ? ` ${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(1)}%` : ''}`;
    })
    .filter(Boolean) as string[];

  const leader = leaderboard[0];
  const leaderName =
    leader && typeof leader.agent === 'object'
      ? normalizeText(asText((leader.agent as Record<string, unknown>).nickname)) ||
        normalizeText(asText((leader.agent as Record<string, unknown>).username))
      : '';
  const leaderReturn = asNumber(leader?.return_rate);
  const participantCount = asNumber(stats.participants);
  const todayTrades = asNumber(stats.today_trades);
  const latestSettleTime = normalizeText(asText(stats.latest_settle_time)) || new Date().toISOString();

  return [
    {
      id: generateStableId('selected-source', `signal-arena-market-${latestSettleTime.slice(0, 13)}`),
      title: 'Signal Arena 跨市场行情快照',
      description: `跨市场异动方面，${moversSummary.join('；') || '当前暂无显著异动摘要'}。${topUs.length > 0 ? `美股样本包括 ${topUs.join('、')}。` : ''}${
        leaderName && leaderReturn !== null ? `排行榜领先者为 ${leaderName}，收益率约 ${(leaderReturn * 100).toFixed(1)}%。` : ''
      }${participantCount !== null || todayTrades !== null ? `当前约有 ${participantCount ?? '--'} 名参与者，今日成交 ${todayTrades ?? '--'} 笔。` : ''}`,
      source_name: 'Signal Arena',
      source_url: 'https://signal.coze.site/skill.md',
      event_time: latestSettleTime,
      created_at: new Date().toISOString(),
      location: 'Global Market Arena',
      country: '',
      latitude: null,
      longitude: null,
      severity: 2,
      relevance_score: 0.73,
      tags: ['finance', 'market', 'arena', 'cross-market', 'stocks', 'signal-arena'],
      alignment_tags: ['source:selected-source', 'source:signal-arena', 'source:market-snapshot'],
      urgency_reason: 'signal arena cross-market movers snapshot',
      last_seen_at: new Date().toISOString(),
      source_type: 'api-json',
      source_feed_name: 'Signal Arena Market Snapshot',
      content_md: compactStringList(
        [
          ...moversSummary,
          ...topUs,
          leaderName && leaderReturn !== null ? `榜首 ${leaderName} 收益率 ${(leaderReturn * 100).toFixed(1)}%` : '',
        ],
        6,
      ).join('\n'),
    },
  ];
}

function toSignalArenaStock(value: unknown, market: 'CN' | 'HK' | 'US'): WorldMarketStock[] {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const data = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  const stocks = Array.isArray(data?.stocks) ? (data.stocks as Array<Record<string, unknown>>) : [];
  return stocks.map((item) => ({
    symbol: asText(item.symbol),
    name: asText(item.name),
    market,
    price: asNumber(item.price),
    open: asNumber(item.open),
    high: asNumber(item.high),
    low: asNumber(item.low),
    prev_close: asNumber(item.prev_close),
    change: asNumber(item.change),
    change_rate: asNumber(item.change_rate),
    volume: asNumber(item.volume),
    trade_date: asText(item.trade_date) || null,
    updated_at: asText(item.updated_at) || null,
  }));
}

function toSignalArenaMovers(value: unknown, market: 'CN' | 'HK' | 'US'): WorldMarketMover[] {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const data = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  const movers = data?.movers && typeof data.movers === 'object' ? (data.movers as Record<string, unknown>) : null;
  const list = Array.isArray(movers?.[market]) ? (movers?.[market] as Array<Record<string, unknown>>) : [];
  return list.map((item) => ({
    symbol: asText(item.symbol),
    name: asText(item.name),
    market,
    price: asNumber(item.price),
    prev_close: asNumber(item.prev_close),
    change: asNumber(item.change),
    change_rate: asNumber(item.change_rate),
  }));
}

function toSignalArenaLeaderboard(value: unknown): WorldMarketLeaderboardEntry[] {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const data = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  const leaderboard = Array.isArray(data?.leaderboard) ? (data.leaderboard as Array<Record<string, unknown>>) : [];
  return leaderboard.slice(0, 8).map((item) => {
    const agent = item.agent && typeof item.agent === 'object' ? (item.agent as Record<string, unknown>) : {};
    return {
      rank: asNumber(item.rank) || 0,
      nickname: asText(agent.nickname) || asText(agent.username) || '匿名选手',
      username: asText(agent.username),
      return_rate: asNumber(item.return_rate),
      total_value: asNumber(item.total_value),
      holdings_count: asNumber(item.holdings_count),
      markets: Array.isArray(item.markets) ? item.markets.filter((entry): entry is string => typeof entry === 'string') : [],
      joined_at: asText(item.joined_at) || null,
    };
  });
}

async function fetchMarketSnapshotJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function hasMarketSnapshotPayload(snapshot: WorldMarketSnapshot): boolean {
  const stockCount =
    snapshot.markets.CN.stocks.length +
    snapshot.markets.HK.stocks.length +
    snapshot.markets.US.stocks.length;
  const moverCount =
    snapshot.markets.CN.movers.length +
    snapshot.markets.HK.movers.length +
    snapshot.markets.US.movers.length;

  return Boolean(
    snapshot.latest_trade_date ||
      snapshot.latest_settle_time ||
      snapshot.leaderboard.length > 0 ||
      stockCount > 0 ||
      moverCount > 0 ||
      snapshot.stats.participants !== null ||
      snapshot.stats.today_trades !== null ||
      snapshot.stats.total_trades !== null ||
      snapshot.stats.tradeable_symbols !== null,
  );
}

export async function getWorldMarketSnapshot(): Promise<WorldMarketSnapshot> {
  const runtime = getRuntimeStore();
  const now = Date.now();
  if (runtime.marketSnapshotCache && runtime.marketSnapshotCache.expiresAt > now) {
    return runtime.marketSnapshotCache.snapshot;
  }

  if (runtime.marketSnapshotInFlight) {
    return runtime.marketSnapshotInFlight;
  }

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'world-threads/1.0',
  };

  runtime.marketSnapshotInFlight = (async () => {
    const [cnStocks, hkStocks, usStocks, movers, leaderboard] = await Promise.all([
      fetchMarketSnapshotJson('https://signal.coze.site/api/v1/arena/stocks?market=CN&limit=5', headers),
      fetchMarketSnapshotJson('https://signal.coze.site/api/v1/arena/stocks?market=HK&limit=5', headers),
      fetchMarketSnapshotJson('https://signal.coze.site/api/v1/arena/stocks?market=US&limit=5', headers),
      fetchMarketSnapshotJson('https://signal.coze.site/api/v1/arena/top-movers', headers),
      fetchMarketSnapshotJson('https://signal.coze.site/api/v1/arena/leaderboard', headers),
    ]);

    const leaderboardPayload = leaderboard && typeof leaderboard === 'object' ? (leaderboard as Record<string, unknown>) : null;
    const leaderboardData =
      leaderboardPayload?.data && typeof leaderboardPayload.data === 'object'
        ? (leaderboardPayload.data as Record<string, unknown>)
        : null;
    const stats =
      leaderboardData?.stats && typeof leaderboardData.stats === 'object'
        ? (leaderboardData.stats as Record<string, unknown>)
        : null;

    const snapshot: WorldMarketSnapshot = {
      generated_at: new Date().toISOString(),
      source_name: 'Signal Arena',
      source_url: 'https://signal.coze.site/skill.md',
      refresh_interval_seconds: MARKET_SNAPSHOT_CACHE_TTL_MS / 1000,
      latest_trade_date:
        asText(((usStocks as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)?.latest_trade_date) ||
        asText(((hkStocks as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)?.latest_trade_date) ||
        asText(((cnStocks as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)?.latest_trade_date) ||
        null,
      latest_settle_time: asText(stats?.latest_settle_time) || null,
      stats: {
        participants: asNumber(stats?.participants),
        today_trades: asNumber(stats?.today_trades),
        total_trades: asNumber(stats?.total_trades),
        tradeable_symbols: asNumber(stats?.tradeable_symbols),
      },
      markets: {
        CN: { stocks: toSignalArenaStock(cnStocks, 'CN'), movers: toSignalArenaMovers(movers, 'CN') },
        HK: { stocks: toSignalArenaStock(hkStocks, 'HK'), movers: toSignalArenaMovers(movers, 'HK') },
        US: { stocks: toSignalArenaStock(usStocks, 'US'), movers: toSignalArenaMovers(movers, 'US') },
      },
      leaderboard: toSignalArenaLeaderboard(leaderboard),
    };

    if (hasMarketSnapshotPayload(snapshot)) {
      runtime.marketSnapshotCache = {
        expiresAt: now + MARKET_SNAPSHOT_CACHE_TTL_MS,
        snapshot,
      };
      return snapshot;
    }

    if (runtime.marketSnapshotCache?.snapshot) {
      return {
        ...runtime.marketSnapshotCache.snapshot,
        generated_at: runtime.marketSnapshotCache.snapshot.generated_at,
      };
    }

    runtime.marketSnapshotCache = {
      expiresAt: now + Math.min(MARKET_SNAPSHOT_CACHE_TTL_MS, 30 * 1000),
      snapshot,
    };
    return snapshot;
  })();

  try {
    return await runtime.marketSnapshotInFlight;
  } finally {
    runtime.marketSnapshotInFlight = null;
  }
}

function normalizeTreasuryDebtToPenny(data: unknown): SignalRow[] {
  const items = getPayloadArray(data, ['data']);
  if (!items || items.length === 0) {
    console.warn('[normalizeTreasuryDebtToPenny] Expected array, got:', typeof data);
    return [];
  }

  const current = items[0];
  const previous = items[1];
  const recordDate = asText(current.record_date);
  const currentDebt = parseNumericText(current.tot_pub_debt_out_amt);
  const previousDebt = parseNumericText(previous?.tot_pub_debt_out_amt);
  const delta = currentDebt !== null && previousDebt !== null ? currentDebt - previousDebt : null;
  const changeText =
    delta !== null
      ? `，较上一条记录${delta >= 0 ? '增加' : '减少'} ${formatTrillionAmount(Math.abs(delta))}`
      : '';

  return [
    {
      id: generateStableId('public-anchor', `treasury-debt-${recordDate}`),
      title: '美国财政总债务更新',
      description: `截至 ${recordDate}，美国财政公开债务总额约 ${formatTrillionAmount(currentDebt)}${changeText}。`,
      source_name: 'U.S. Treasury Fiscal Data',
      source_url:
        'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=2',
      event_time: parseIsoDay(recordDate),
      created_at: new Date().toISOString(),
      location: 'United States Treasury',
      country: 'United States',
      latitude: null,
      longitude: null,
      severity: 2,
      relevance_score: 0.66,
      tags: ['finance', 'macro', 'treasury', 'debt', 'public-anchor'],
      alignment_tags: ['source:public-anchor', 'source:treasury'],
      urgency_reason: 'public-anchor treasury debt snapshot',
      last_seen_at: new Date().toISOString(),
    },
  ];
}

function normalizeTreasuryInterestRates(data: unknown): SignalRow[] {
  const items = getPayloadArray(data, ['data']);
  if (!items || items.length === 0) {
    console.warn('[normalizeTreasuryInterestRates] Expected array, got:', typeof data);
    return [];
  }

  const current = items[0];
  const recordDate = asText(current.record_date);
  const security = asText(current.security_desc) || asText(current.security_type_desc) || 'Treasury securities';
  const rate = parseNumericText(current.avg_interest_rate_amt);

  return [
    {
      id: generateStableId('public-anchor', `treasury-rates-${recordDate}-${security}`),
      title: '美国国债平均利率更新',
      description: `截至 ${recordDate}，${security} 的平均利率约为 ${rate !== null ? `${rate.toFixed(3)}%` : '--'}。`,
      source_name: 'U.S. Treasury Fiscal Data',
      source_url:
        'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=2',
      event_time: parseIsoDay(recordDate),
      created_at: new Date().toISOString(),
      location: 'United States Treasury',
      country: 'United States',
      latitude: null,
      longitude: null,
      severity: 2,
      relevance_score: 0.64,
      tags: ['finance', 'macro', 'treasury', 'rates', 'public-anchor'],
      alignment_tags: ['source:public-anchor', 'source:treasury'],
      urgency_reason: 'public-anchor treasury rates snapshot',
      last_seen_at: new Date().toISOString(),
    },
  ];
}

function normalizeOpenFdaDrugEvents(data: unknown): SignalRow[] {
  const items = getPayloadArray(data, ['results']);
  if (!items || items.length === 0) {
    console.warn('[normalizeOpenFdaDrugEvents] Expected array, got:', typeof data);
    return [];
  }

  const latest = items[0];
  const recordDate = asText(latest.receivedate);
  const products = items.flatMap(extractDrugProducts).filter(Boolean);
  const reactions = items.flatMap(extractDrugReactions).filter(Boolean);
  const serious = items.some((item) => asText(item.serious) === '1');
  const fatal = items.some((item) => asText(item.seriousnessdeath) === '1');

  return [
    {
      id: generateStableId('public-anchor', `openfda-drug-${recordDate}`),
      title: 'FDA 药品不良事件更新',
      description: `最近一批药品不良事件上报涉及 ${products.slice(0, 3).join('、') || '多款药品'}，反应关键词包括 ${reactions.slice(0, 4).join('、') || '不良反应'}。`,
      source_name: 'openFDA',
      source_url: 'https://api.fda.gov/drug/event.json?search=receivedate:[20250101+TO+20261231]&sort=receivedate:desc&limit=2',
      event_time: parseIsoDay(recordDate),
      created_at: new Date().toISOString(),
      location: 'United States FDA',
      country: 'United States',
      latitude: null,
      longitude: null,
      severity: fatal ? 3 : serious ? 2 : 2,
      relevance_score: fatal ? 0.7 : 0.58,
      tags: ['health', 'fda', 'drug-safety', 'pharmacovigilance', 'public-anchor'],
      alignment_tags: ['source:public-anchor', 'source:openfda'],
      urgency_reason: 'public-anchor openfda drug event snapshot',
      last_seen_at: new Date().toISOString(),
    },
  ];
}

function normalizeOpenFdaDeviceEvents(data: unknown): SignalRow[] {
  const items = getPayloadArray(data, ['results']);
  if (!items || items.length === 0) {
    console.warn('[normalizeOpenFdaDeviceEvents] Expected array, got:', typeof data);
    return [];
  }

  const latest = items[0];
  const recordDate = asText(latest.date_received);
  const eventTypes = items.map((item) => asText(item.event_type)).filter(Boolean);
  const deviceNames = items
    .flatMap((item) => {
      const devices = Array.isArray(item.device) ? item.device : [];
      return devices.map((device) => {
        if (!device || typeof device !== 'object') return '';
        const record = device as RawWorldMonitorItem;
        const openfda = record.openfda && typeof record.openfda === 'object' ? (record.openfda as RawWorldMonitorItem) : null;
        return asText(openfda?.device_name) || asText(record.generic_name) || asText(record.brand_name);
      });
    })
    .filter(Boolean);
  const malfunction = eventTypes.some((value) => /malfunction/i.test(value));

  return [
    {
      id: generateStableId('public-anchor', `openfda-device-${recordDate}`),
      title: 'FDA 医疗器械事件更新',
      description: `最近一批器械事件以 ${eventTypes.slice(0, 2).join('、') || '设备异常'} 为主，涉及 ${deviceNames.slice(0, 3).join('、') || '多类设备'}。`,
      source_name: 'openFDA',
      source_url: 'https://api.fda.gov/device/event.json?search=date_received:[20250101+TO+20261231]&sort=date_received:desc&limit=2',
      event_time: parseIsoDay(recordDate),
      created_at: new Date().toISOString(),
      location: 'United States FDA',
      country: 'United States',
      latitude: null,
      longitude: null,
      severity: malfunction ? 2 : 2,
      relevance_score: 0.56,
      tags: ['health', 'fda', 'device-safety', 'medtech', 'public-anchor'],
      alignment_tags: ['source:public-anchor', 'source:openfda'],
      urgency_reason: 'public-anchor openfda device event snapshot',
      last_seen_at: new Date().toISOString(),
    },
  ];
}

async function loadPublicAnchorRows(): Promise<SignalRow[]> {
  const runtime = getRuntimeStore();
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'world-threads/1.0',
  };
  const requestSpecs = [
    {
      key: 'treasury-debt',
      run: () =>
        fetch(
          'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=2',
          { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
        ).then(async (response) => (response.ok ? normalizeTreasuryDebtToPenny(await response.json()) : [])),
    },
    {
      key: 'treasury-rates',
      run: () =>
        fetch(
          'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=2',
          { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
        ).then(async (response) => (response.ok ? normalizeTreasuryInterestRates(await response.json()) : [])),
    },
    {
      key: 'openfda-drug',
      run: () =>
        fetch(
          'https://api.fda.gov/drug/event.json?search=receivedate:[20250101+TO+20261231]&sort=receivedate:desc&limit=2',
          { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
        ).then(async (response) => (response.ok ? normalizeOpenFdaDrugEvents(await response.json()) : [])),
    },
    {
      key: 'openfda-device',
      run: () =>
        fetch(
          'https://api.fda.gov/device/event.json?search=date_received:[20250101+TO+20261231]&sort=date_received:desc&limit=2',
          { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
        ).then(async (response) => (response.ok ? normalizeOpenFdaDeviceEvents(await response.json()) : [])),
    },
    {
      key: 'arxiv-recent',
      run: () =>
        fetch(
          'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&start=0&max_results=2&sortBy=submittedDate&sortOrder=descending',
          { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
        ).then(async (response) => (response.ok ? normalizeArxivRecent(await response.text()) : [])),
    },
  ];

  const now = Date.now();
  const activeSpecs = requestSpecs.filter((spec) => {
    const health = runtime.publicAnchorHealth.get(spec.key);
    return !health || health.cooldownUntil <= now;
  });

  const settled = await Promise.allSettled(activeSpecs.map((spec) => spec.run()));
  const rows: SignalRow[] = [];
  settled.forEach((item, index) => {
    const spec = activeSpecs[index];
    if (item.status === 'fulfilled') {
      rows.push(...item.value);
      runtime.publicAnchorHealth.set(spec.key, {
        failCount: 0,
        cooldownUntil: 0,
        lastError: '',
        lastFailedAt: 0,
        lastSucceededAt: Date.now(),
      });
    } else {
      const previous = runtime.publicAnchorHealth.get(spec.key);
      const failCount = (previous?.failCount || 0) + 1;
      const cooldownUntil = failCount >= PUBLIC_ANCHOR_COOLDOWN_THRESHOLD ? Date.now() + PUBLIC_ANCHOR_COOLDOWN_MS : 0;
      runtime.publicAnchorHealth.set(spec.key, {
        failCount,
        cooldownUntil,
        lastError: item.reason instanceof Error ? item.reason.message : String(item.reason),
        lastFailedAt: Date.now(),
        lastSucceededAt: previous?.lastSucceededAt,
      });
      console.warn(
        `[loadPublicAnchorRows] Failed to fetch public anchor ${spec.key}${cooldownUntil ? `; cooling down until ${new Date(cooldownUntil).toISOString()}` : ''}:`,
        item.reason,
      );
    }
  });

  return rows;
}

async function loadSelectedHighQualityRows(): Promise<SignalRow[]> {
  const runtime = getRuntimeStore();
  const headers = {
    Accept: 'application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
    'User-Agent': 'world-threads/1.0',
  };
  const aiHotHeaders = {
    ...headers,
    'User-Agent': 'Mozilla/5.0 (compatible; worldweave-aihot/0.1; +https://github.com/TashanGKD/worldweave) aihot-skill/0.2.0',
  };
  const nseHeaders = {
    ...headers,
    Referer: 'https://www.nseindia.com/',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const requestSpecs = [
    {
      key: 'eastmoney',
      run: () =>
        Promise.all([
      fetch(
        'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3',
        { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
      ).then((response) => (response.ok ? response.json() : null)),
      fetch(
        'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&lmt=5',
        { headers, signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS) },
      ).then((response) => (response.ok ? response.json() : null)),
        ]).then(([listData, klineData]) => normalizeEastMoneySnapshot(listData, klineData)),
    },
    {
      key: 'nse',
      run: () =>
        Promise.all([
      fetch('https://www.nseindia.com/api/quote-equity?symbol=RELIANCE', {
        headers: nseHeaders,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
      fetch('https://www.nseindia.com/api/corporate-announcements?index=equities', {
        headers: nseHeaders,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : [])),
      fetch('https://www.nseindia.com/api/event-calendar?index=equities', {
        headers: nseHeaders,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : [])),
      fetch('https://www.nseindia.com/api/corporates-pit?index=equities&symbol=RELIANCE', {
        headers: nseHeaders,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : [])),
        ]).then(([quote, announcements, calendar, pit]) => normalizeNseSnapshot(quote, announcements, calendar, pit)),
    },
    {
      key: 'crypto-stack',
      run: () =>
        Promise.all([
      fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=5', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : [])),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
      fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
        ]).then(([binance, gecko, coinbase]) => normalizeCryptoMarketSnapshot(binance, gecko, coinbase)),
    },
    {
      key: 'alpha-vantage',
      run: () =>
        Promise.all([
      fetch('https://www.alphavantage.co/query?function=REAL_GDP&interval=quarterly&apikey=demo', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
      fetch('https://www.alphavantage.co/query?function=CPI&interval=monthly&apikey=demo', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
      fetch('https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=monthly&maturity=10year&apikey=demo', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
      fetch('https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&apikey=demo', {
        headers,
        signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
      }).then((response) => (response.ok ? response.json() : null)),
        ]).then(([gdp, cpi, yieldData, news]) => normalizeAlphaVantageSnapshot(gdp, cpi, yieldData, news)),
    },
    {
      key: 'bbc-rss',
      run: () =>
        fetch('http://feeds.bbci.co.uk/news/world/rss.xml', {
          headers,
          signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
        }).then(async (response) =>
          response.ok
            ? normalizeNewsFeedSnapshot(await response.text(), {
                sourceName: 'BBC World RSS',
                sourceUrl: 'http://feeds.bbci.co.uk/news/world/rss.xml',
                location: 'London',
                country: 'United Kingdom',
                latitude: 51.5072,
                longitude: -0.1276,
              })
            : [],
        ),
    },
    {
      key: 'guardian-rss',
      run: () =>
        fetch('https://www.theguardian.com/world/rss', {
          headers,
          signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
        }).then(async (response) =>
          response.ok
            ? normalizeNewsFeedSnapshot(await response.text(), {
                sourceName: 'Guardian World RSS',
                sourceUrl: 'https://www.theguardian.com/world/rss',
                location: 'London',
                country: 'United Kingdom',
                latitude: 51.5072,
                longitude: -0.1276,
              })
            : [],
        ),
    },
    {
      key: 'npr-rss',
      run: () =>
        fetch('https://feeds.npr.org/1001/rss.xml', {
          headers,
          signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
        }).then(async (response) =>
          response.ok
            ? normalizeNewsFeedSnapshot(await response.text(), {
                sourceName: 'NPR News RSS',
                sourceUrl: 'https://feeds.npr.org/1001/rss.xml',
                location: 'Washington',
                country: 'United States',
                latitude: 38.9072,
                longitude: -77.0369,
              })
            : [],
        ),
    },
    {
      key: 'aljazeera-rss',
      run: () =>
        fetch('https://www.aljazeera.com/xml/rss/all.xml', {
          headers,
          signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
        }).then(async (response) =>
          response.ok
            ? normalizeNewsFeedSnapshot(await response.text(), {
                sourceName: 'Al Jazeera RSS',
                sourceUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
                location: 'Doha',
                country: 'Qatar',
                latitude: 25.2854,
                longitude: 51.531,
              })
            : [],
        ),
    },
    {
      key: 'inkwell-rss',
      run: () =>
        Promise.all([
          fetch('https://inkwell.coze.site/api/v1/articles?limit=16&sort=date', {
            headers,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
          fetch('https://inkwell.coze.site/api/v1/sources', {
            headers,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
        ]).then(([articles, sources]) => normalizeInkwellSnapshot(articles, sources)),
    },
    {
      key: 'aihot',
      run: () =>
        Promise.all([
          fetch('https://aihot.virxact.com/api/public/items?mode=selected&take=24', {
            headers: aiHotHeaders,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
          fetch('https://aihot.virxact.com/api/public/daily', {
            headers: aiHotHeaders,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
        ]).then(([selected, daily]) => normalizeAiHotSnapshot({ items: [...collectAiHotItems(selected), ...collectAiHotItems(daily)] })),
    },
    {
      key: 'ai-news-radar',
      run: () =>
        fetch('https://raw.githubusercontent.com/LearnPrompt/ai-news-radar/master/data/latest-24h.json', {
          headers,
          signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
        }).then((response) => (response.ok ? response.json() : null)).then(normalizeAiNewsRadarSnapshot),
    },
    {
      key: 'signal-arena',
      run: () =>
        Promise.all([
          fetch('https://signal.coze.site/api/v1/arena/stocks?market=US&limit=8', {
            headers,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
          fetch('https://signal.coze.site/api/v1/arena/top-movers', {
            headers,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
          fetch('https://signal.coze.site/api/v1/arena/leaderboard', {
            headers,
            signal: AbortSignal.timeout(PUBLIC_ANCHOR_TIMEOUT_MS),
          }).then((response) => (response.ok ? response.json() : null)),
        ]).then(([stocks, movers, leaderboard]) => normalizeSignalArenaSnapshot(stocks, movers, leaderboard)),
    },
  ];

  const now = Date.now();
  const activeSpecs = requestSpecs.filter((spec) => {
    const health = runtime.selectedSourceHealth.get(spec.key);
    return !health || health.cooldownUntil <= now;
  });

  const settled = await Promise.allSettled(activeSpecs.map((spec) => spec.run()));
  const rows: SignalRow[] = [];
  settled.forEach((item, index) => {
    const spec = activeSpecs[index];
    if (item.status === 'fulfilled') {
      rows.push(...item.value);
      runtime.selectedSourceHealth.set(spec.key, {
        failCount: 0,
        cooldownUntil: 0,
        lastError: '',
        lastFailedAt: 0,
        lastSucceededAt: Date.now(),
      });
    } else {
      const previous = runtime.selectedSourceHealth.get(spec.key);
      const failCount = (previous?.failCount || 0) + 1;
      const cooldownUntil = failCount >= SELECTED_SOURCE_COOLDOWN_THRESHOLD ? Date.now() + SELECTED_SOURCE_COOLDOWN_MS : 0;
      runtime.selectedSourceHealth.set(spec.key, {
        failCount,
        cooldownUntil,
        lastError: item.reason instanceof Error ? item.reason.message : String(item.reason),
        lastFailedAt: Date.now(),
        lastSucceededAt: previous?.lastSucceededAt,
      });
      console.warn(
        `[loadSelectedHighQualityRows] Failed to fetch selected source ${spec.key}${cooldownUntil ? `; cooling down until ${new Date(cooldownUntil).toISOString()}` : ''}:`,
        item.reason,
      );
    }
  });

  return rows;
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    }),
  );

  return results;
}

async function readResponseTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`response too large (${contentLength} bytes > ${maxBytes} bytes)`);
  }

  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`response too large (${totalBytes} bytes > ${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8').decode(merged);
}

async function selectCatalogSourceRefreshBatch(sources: RuntimeCatalogSource[]): Promise<RuntimeCatalogSource[]> {
  if (sources.length <= CATALOG_SOURCE_REFRESH_BATCH_SIZE) {
    return sources;
  }

  const cursor = await readRuntimeJson<{ nextIndex?: number; sourceCount?: number }>(CATALOG_SOURCE_CURSOR_FILE);
  const startIndex =
    cursor?.sourceCount === sources.length && Number.isFinite(cursor.nextIndex)
      ? Math.min(Math.max(Math.floor(cursor.nextIndex || 0), 0), sources.length - 1)
      : 0;
  const selected: RuntimeCatalogSource[] = [];
  for (let offset = 0; offset < CATALOG_SOURCE_REFRESH_BATCH_SIZE; offset += 1) {
    selected.push(sources[(startIndex + offset) % sources.length]);
  }
  const nextIndex = (startIndex + CATALOG_SOURCE_REFRESH_BATCH_SIZE) % sources.length;
  await writeRuntimeJson(CATALOG_SOURCE_CURSOR_FILE, {
    updated_at: new Date().toISOString(),
    sourceCount: sources.length,
    batchSize: CATALOG_SOURCE_REFRESH_BATCH_SIZE,
    previousIndex: startIndex,
    nextIndex,
  });
  console.log(
    `[loadCatalogSourceRows] refreshing catalog source batch ${startIndex}-${(startIndex + selected.length - 1) % sources.length} of ${sources.length}`,
  );
  return selected;
}

async function loadCatalogSourceRows(): Promise<SignalRow[]> {
  const runtime = getRuntimeStore();
  const headers = {
    Accept: 'application/json, text/xml, application/xml, application/rss+xml, application/atom+xml, text/plain;q=0.8, */*;q=0.5',
    'User-Agent': 'world-threads/1.0',
  };
  const runtimeSources = await loadRuntimeCatalogSources();
  if (runtimeSources.length === 0) return [];

  const now = Date.now();
  const activeSources = runtimeSources.filter((source) => {
    const health = runtime.selectedSourceHealth.get(`catalog:${source.skill_name}:${source.source_name}`);
    return !health || health.cooldownUntil <= now;
  });
  const batchedSources = await selectCatalogSourceRefreshBatch(activeSources);

  const settled = await mapSettledWithConcurrency(
    batchedSources,
    CATALOG_SOURCE_FETCH_CONCURRENCY,
    async (source) => {
      const response = await fetch(source.url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      const rawText = await readResponseTextWithLimit(response, CATALOG_SOURCE_MAX_RESPONSE_BYTES);
      const payload =
        source.source_type === 'rss' ||
        source.source_type === 'atom' ||
        /xml|rss|atom/i.test(contentType)
          ? rawText
          : source.source_type === 'api-text' || /text\//i.test(contentType)
            ? rawText
            : (() => {
                try {
                  return JSON.parse(rawText);
                } catch {
                  return rawText;
                }
              })();
      return normalizeCatalogStructuredSnapshot(source, payload);
    },
  );

  const rows: SignalRow[] = [];
  settled.forEach((item, index) => {
    const source = batchedSources[index];
    const healthKey = `catalog:${source.skill_name}:${source.source_name}`;
    if (item.status === 'fulfilled') {
      rows.push(...item.value);
      runtime.selectedSourceHealth.set(healthKey, {
        failCount: 0,
        cooldownUntil: 0,
        lastError: '',
        lastFailedAt: 0,
        lastSucceededAt: Date.now(),
      });
    } else {
      const previous = runtime.selectedSourceHealth.get(healthKey);
      const failCount = (previous?.failCount || 0) + 1;
      const cooldownUntil = failCount >= 2 ? Date.now() + 30 * 60 * 1000 : 0;
      runtime.selectedSourceHealth.set(healthKey, {
        failCount,
        cooldownUntil,
        lastError: item.reason instanceof Error ? item.reason.message : String(item.reason),
        lastFailedAt: Date.now(),
        lastSucceededAt: previous?.lastSucceededAt,
      });
      console.warn(
        `[loadCatalogSourceRows] Failed to fetch catalog source ${source.skill_name} / ${source.source_name}${cooldownUntil ? `; cooling down until ${new Date(cooldownUntil).toISOString()}` : ''}:`,
        item.reason,
      );
    }
  });

  return rows;
}

function getMonitorSnapshotLocation(sourceName: string, url: string) {
  const haystack = `${sourceName} ${url}`.toLowerCase();
  if (haystack.includes('eastmoney')) {
    return { location: 'Shanghai', country: 'China', latitude: 31.2304, longitude: 121.4737 };
  }
  if (haystack.includes('nseindia') || haystack.includes('nse ')) {
    return { location: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777 };
  }
  if (haystack.includes('yahoo') && haystack.includes('0700.hk')) {
    return { location: 'Hong Kong', country: 'China', latitude: 22.3193, longitude: 114.1694 };
  }
  if (haystack.includes('coinbase')) {
    return { location: 'San Francisco', country: 'United States', latitude: 37.7749, longitude: -122.4194 };
  }
  if (haystack.includes('coingecko')) {
    return { location: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198 };
  }
  if (haystack.includes('binance')) {
    return { location: 'Dubai', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 };
  }
  if (haystack.includes('alpha vantage')) {
    return { location: 'Washington', country: 'United States', latitude: 38.9072, longitude: -77.0369 };
  }
  if (haystack.includes('sec.gov')) {
    return { location: 'Washington', country: 'United States', latitude: 38.9072, longitude: -77.0369 };
  }
  return { location: 'Global Market', country: '', latitude: null, longitude: null };
}

function cleanMonitorSample(sample: string): string {
  return cleanDisplayText(sample)
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/["{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function monitorSnapshotTitle(sourceName: string): string {
  const normalized = sourceName.toLowerCase();
  if (normalized.includes('eastmoney kline')) return 'A股 K 线监测快照';
  if (normalized.includes('eastmoney stock list')) return 'A股活跃股监测快照';
  if (normalized.includes('nse quote')) return 'NSE 报价监测快照';
  if (normalized.includes('nse corporate announcements')) return 'NSE 公告监测快照';
  if (normalized.includes('nse event calendar')) return 'NSE 事件日历快照';
  if (normalized.includes('nse pit')) return 'NSE PIT 披露快照';
  if (normalized.includes('binance klines')) return 'BTC 日线监测快照';
  if (normalized.includes('binance ticker')) return 'BTC 即时报价快照';
  if (normalized.includes('coingecko market chart')) return 'BTC 七日走势快照';
  if (normalized.includes('coingecko simple price')) return 'BTC 价格对照快照';
  if (normalized.includes('coinbase exchange candles')) return 'Coinbase 日线蜡烛快照';
  if (normalized.includes('coinbase spot')) return 'Coinbase 现货价格快照';
  if (normalized.includes('alpha vantage cpi')) return '美国 CPI 监测快照';
  if (normalized.includes('alpha vantage treasury yield')) return '美债收益率监测快照';
  if (normalized.includes('alpha vantage time series')) return '美股日线监测快照';
  if (normalized.includes('alpha vantage news sentiment')) return '美股新闻情绪快照';
  if (normalized.includes('yahoo finance hk chart')) return '港股日线监测快照';
  if (normalized.includes('sec companyfacts')) return 'SEC Companyfacts 快照';
  if (normalized.includes('sec submissions')) return 'SEC 披露快照';
  return `${sourceName} 监测快照`;
}

function monitorSnapshotSeverity(necessityScore: number, qualityScore: number): number {
  if (necessityScore >= 90 && qualityScore >= 95) return 4;
  if (necessityScore >= 78 || qualityScore >= 92) return 3;
  return 2;
}

async function loadMonitorRecommendedRows(): Promise<SignalRow[]> {
  try {
    const [summaryRaw, stateRaw] = await Promise.all([
      fs.readFile(MONITOR_SUMMARY_FILE, 'utf-8'),
      fs.readFile(MONITOR_STATE_FILE, 'utf-8'),
    ]);
    const summaryPayload = JSON.parse(summaryRaw) as {
      sources?: Array<{
        skill?: string;
        source_name?: string;
        url?: string;
        scene?: string;
        admission_tier?: string;
        source_type?: string;
        poll_count?: number;
        success_rate?: number;
        change_count?: number;
        latest_status_code?: number | null;
        latest_item_count?: number;
        quality_score?: number;
        necessity_score?: number;
        recommendation?: string;
        last_checked_at?: string;
        last_changed_at?: string;
      }>;
    };
    const statePayload = JSON.parse(stateRaw) as {
      sources?: Record<
        string,
        {
          history?: Array<{
            sample?: string;
            item_count?: number;
            checked_at?: string;
            status_code?: number | null;
          }>;
        }
      >;
    };

    const rows = (summaryPayload.sources || [])
      .filter((entry) => entry.recommendation === '优先接入')
      .filter((entry) => (entry.latest_status_code || 0) === 200)
      .filter((entry) => (entry.latest_item_count || 0) > 0)
      .filter((entry) => (entry.quality_score || 0) >= 90)
      .filter((entry) => !/\bping\b|jina/i.test(`${entry.source_name || ''} ${entry.url || ''}`))
      .map((entry) => {
        const sourceName = normalizeText(entry.source_name);
        const url = normalizeText(entry.url);
        const stateKey = `${normalizeText(entry.skill)}::${sourceName}::${url}`;
        const history = statePayload.sources?.[stateKey]?.history || [];
        const latestHistory = history[history.length - 1];
        const sample = cleanMonitorSample(normalizeText(latestHistory?.sample));
        const qualityScore = Number(entry.quality_score || 0);
        const necessityScore = Number(entry.necessity_score || 0);
        const scene = normalizeText(entry.scene) || 'finance';
        const severity = monitorSnapshotSeverity(necessityScore, qualityScore);
        const location = getMonitorSnapshotLocation(sourceName, url);
        const title = monitorSnapshotTitle(sourceName);
        const changeCount = Number(entry.change_count || 0);
        const pollCount = Number(entry.poll_count || 0);
        const successRate = Number(entry.success_rate || 0);

        return {
          id: generateStableId('monitor-source', `${sourceName}-${url}-${entry.last_changed_at || entry.last_checked_at || ''}`),
          title,
          description: cleanDisplayText(
            `${sourceName} 最近 ${pollCount} 轮里变动了 ${changeCount} 次，成功率 ${Math.round(successRate * 100)}%。${
              sample ? `最新样本显示：${sample}` : '最新一轮已经抓到可用返回。'
            }`,
          ),
          source_name: sourceName,
          source_url: url,
          event_time: normalizeText(entry.last_changed_at) || normalizeText(entry.last_checked_at) || new Date().toISOString(),
          created_at: new Date().toISOString(),
          location: location.location,
          country: location.country,
          latitude: location.latitude,
          longitude: location.longitude,
          severity,
          relevance_score: Number(clamp((qualityScore + necessityScore) / 200, 0.52, 0.94).toFixed(2)),
          tags: compactStringList([
            scene,
            'monitor-snapshot',
            'high-quality-source',
            normalizeTag(entry.admission_tier || 'context'),
            normalizeTag(sourceName),
          ]),
          alignment_tags: compactStringList([
            'source:selected-source',
            'source:monitor-snapshot',
            `source:${normalizeTag(sourceName).slice(0, 32)}`,
          ]),
          urgency_reason: cleanDisplayText(
            `${sourceName} 被监测系统标为优先接入，质量分 ${qualityScore}，必要性 ${necessityScore}，最近变动 ${changeCount} 次。`,
          ),
          last_seen_at: normalizeText(entry.last_checked_at) || new Date().toISOString(),
          source_type: normalizeText(entry.source_type) || 'monitor-snapshot',
        } satisfies SignalRow;
      });

    return rows;
  } catch (error) {
    console.warn('[loadMonitorRecommendedRows] Failed to load monitor snapshot:', error);
    return [];
  }
}

// Normalize events data
function normalizeEvents(data: unknown): SignalRow[] {
  const markers = getPayloadArray(data, ['markers']);
  if (!markers) {
    console.warn('[normalizeEvents] Expected array, got:', typeof data);
    return [];
  }

  return markers.map((item) => {
    const relevanceScore = asNumber(item.relevanceScore);
    const sourceUrl = asText(item.sourceUrl);
    const text = chooseWorldMonitorReadableText({
      title: asText(item.title),
      headline: asText(item.headline),
      notes: asText(item.notes),
      sourceUrl,
      fallbackTitle: 'Unknown Event',
    });
    const uniqueKey = `${sourceUrl || asText(item.id) || asText(item.headline)}-${asText(item.timestamp)}`;
    const alignmentTags = uniqueAlignmentTags(['source:world-monitor', 'wm:events']);
    return {
      id: generateStableId('event', uniqueKey),
      title: text.title,
      description: text.description,
      source_name: asText(item.source) || 'World Monitor',
      source_url: sourceUrl,
      event_time: asText(item.timestamp) || new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: asText(item.location) || asText(item.title),
      country: asText(item.country),
      latitude: positionAt(item, 0) ?? asNumber(item.lat),
      longitude: positionAt(item, 1) ?? asNumber(item.lng),
      severity: asNumber(item.severity) ?? 3,
      relevance_score: relevanceScore ? relevanceScore / 100 : 0.7,
      tags: [
        asText(item.type),
        asText(item.subEventType),
        asText(item.actor1),
        asText(item.actor2),
        ...alignmentTags,
      ].filter(Boolean),
      alignment_tags: alignmentTags,
      last_seen_at: new Date().toISOString(),
    };
  });
}

// Normalize outbreaks data
function normalizeOutbreaks(data: unknown): SignalRow[] {
  const outbreaks = getPayloadArray(data, ['outbreaks']);
  if (!outbreaks) {
    console.warn('[normalizeOutbreaks] Expected array, got:', typeof data);
    return [];
  }

  return outbreaks.map((item) => {
    const uniqueKey = `${asText(item.don_id) || asText(item.id) || asText(item.disease)}-${asText(item.publication_date)}`;
    const alignmentTags = uniqueAlignmentTags(['source:world-monitor', 'wm:outbreaks']);
    return {
      id: generateStableId('outbreak', uniqueKey),
      title: asText(item.disease) || asText(item.name) || 'Unknown Outbreak',
      description: asText(item.summary) || asText(item.description) || asText(item.notes),
      source_name: 'WHO / World Monitor',
      source_url: asText(item.who_url),
      event_time: asText(item.publication_date) || new Date().toISOString(),
      created_at: new Date().toISOString(),
      location: asText(item.location) || asText(item.country),
      country: asText(item.country),
      latitude: asNumber(item.latitude) ?? asNumber(item.lat),
      longitude: asNumber(item.longitude) ?? asNumber(item.lng),
      severity: asNumber(item.severity) ?? 3,
      relevance_score: 0.8,
      tags: ['outbreak', asText(item.disease), ...alignmentTags].filter(Boolean),
      alignment_tags: alignmentTags,
      last_seen_at: new Date().toISOString(),
    };
  });
}

// Normalize signal-markers data
function normalizeSignalMarkers(data: unknown): SignalRow[] {
  const markers = getPayloadArray(data, ['locations', 'markers']);
  if (!markers) {
    console.warn('[normalizeSignalMarkers] Expected array, got:', typeof data);
    return [];
  }

  return markers.map((item) => {
    const relevanceScore = asNumber(item.relevanceScore);
    const intensity = asNumber(item.intensity);
    const mentionCount = asNumber(item.mention_count);
    const lat = positionAt(item, 0) ?? asNumber(item.lat);
    const lng = positionAt(item, 1) ?? asNumber(item.lng);
    const uniqueKey = `${asText(item.id) || asText(item.location_name) || asText(item.title)}-${lat ?? ''}-${lng ?? ''}`;
    const sourceUrl = asText(item.sourceUrl);
    const text = chooseWorldMonitorReadableText({
      title: asText(item.title) || asText(item.location_name),
      headline: asText(item.headline),
      notes: asText(item.summary) || asText(item.analysis) || asText(item.notes),
      sourceUrl,
      fallbackTitle: 'Unknown Signal',
    });
    const title = text.title;
    const description = text.description;
    const changes = item.last_changes && typeof item.last_changes === 'object'
      ? (item.last_changes as RawWorldMonitorItem)
      : {};
    const severity = asNumber(item.severity) ?? severityFromWorldMonitorIntensity(intensity) ?? fallbackSeverityForSignal(title, description, relevanceScore);
    const alignmentTags = uniqueAlignmentTags([
      intensity ? `wm:intensity:${Math.round(intensity)}` : null,
      mentionBucket(mentionCount),
      asBoolean(changes.briefing_changed) ? 'wm:briefing-changed' : null,
      asBoolean(changes.analysis_changed) ? 'wm:analysis-changed' : null,
      asBoolean(changes.summary_changed) ? 'wm:summary-changed' : null,
      asText(changes.type) ? `wm:${asText(changes.type)}` : null,
      'source:world-monitor',
    ]);
    return {
      id: generateStableId('marker', uniqueKey),
      title,
      description,
      source_name: asText(item.source) || 'World Monitor',
      source_url: sourceUrl,
      event_time: asText(item.first_seen_at) || asText(item.timestamp) || asText(item.last_mentioned_at) || new Date().toISOString(),
      created_at: asText(item.processed_at) || new Date().toISOString(),
      location: asText(item.location_name) || asText(item.location),
      country: asText(item.country),
      latitude: lat,
      longitude: lng,
      severity,
      relevance_score: relevanceScore ? relevanceScore / 100 : relevanceFromWorldMonitorSignals(severity, intensity, mentionCount),
      tags: [
        asText(item.type),
        asText(item.subEventType),
        ...alignmentTags,
      ].filter(Boolean),
      alignment_tags: alignmentTags,
      intensity,
      mention_count: mentionCount,
      urgency_reason: intensity ? `world-monitor intensity=${intensity}${mentionCount ? `, mention_count=${mentionCount}` : ''}` : '',
      last_seen_at: asText(item.last_mentioned_at) || asText(item.processed_at) || new Date().toISOString(),
    };
  });
}

function normalizeIcArticles(data: unknown): SignalRow[] {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const nested = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  const articles = Array.isArray(nested?.list)
    ? nested.list.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object')
    : null;
  if (!articles) {
    console.warn('[normalizeIcArticles] Expected array, got:', typeof data);
    return [];
  }

  return articles.map((item) => {
    const articleRecordId = asScalarText(item.id);
    const articleId = asText(item.source_article_id) || articleRecordId || asText(item.url);
    const sourceFeedName = asText(item.source_feed_name) || 'IC Source Feed';
    const sourceType = asText(item.source_type) || 'source-feed';
    const description = asText(item.description);
    const title = asText(item.title) || 'Untitled IC article';
    const uniqueKey = `${articleId}-${asText(item.url)}-${asText(item.publish_time)}`;
    const anchor = getKnowledgeAnchor('China', sourceFeedName, sourceFeedName, ['source-feed', sourceType]);

    return {
      id: generateStableId('ic-article', uniqueKey),
      title,
      description: description || `${sourceFeedName} 有新文章，可以作为背景资料参考。`,
      source_name: sourceFeedName,
      source_url: asText(item.url),
      event_time: asText(item.publish_time) || asText(item.created_at) || new Date().toISOString(),
      created_at: asText(item.created_at) || new Date().toISOString(),
      location: sourceFeedName,
      country: 'China',
      latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null,
      severity: 2,
      relevance_score: 0.64,
      tags: ['source-feed', sourceType, sourceFeedName, `feed:${sourceFeedName}`, `type:${sourceType}`],
      last_seen_at: new Date().toISOString(),
      external_id: articleRecordId || articleId,
      source_type: sourceType,
      source_feed_name: sourceFeedName,
    };
  });
}

function normalizeIcLiterature(data: unknown): SignalRow[] {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const nested = payload?.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  const papers = Array.isArray(nested?.list)
    ? nested.list.filter((item): item is RawWorldMonitorItem => item !== null && typeof item === 'object')
    : null;
  if (!papers) {
    console.warn('[normalizeIcLiterature] Expected array, got:', typeof data);
    return [];
  }

  return papers.map((item) => {
    const paperId = asText(item.paper_id) || asText(item.id);
    const title = asText(item.title) || 'Untitled paper';
    const compactCategory = asText(item.compact_category) || 'Research';
    const authors = Array.isArray(item.authors) ? item.authors.filter((author): author is string => typeof author === 'string') : [];
    const summary = authors.length
      ? `${compactCategory} 方向的新论文，作者包括 ${authors.slice(0, 3).join('、')}。`
      : `${compactCategory} 方向的新论文，适合补到科技线索里。`;
    const publishedDay = asText(item.published_day);
    const yyyy = publishedDay.length >= 6 ? `20${publishedDay.slice(0, 2)}-${publishedDay.slice(2, 4)}-${publishedDay.slice(4, 6)}` : '';
    const publishedAt = yyyy ? `${yyyy}T00:00:00.000Z` : new Date().toISOString();
    const anchor = getKnowledgeAnchor('', 'Research Feed', `IC Literature ${compactCategory}`, ['literature', 'research', compactCategory]);

    return {
      id: generateStableId('ic-literature', paperId || title),
      title,
      description: summary,
      source_name: `IC Literature · ${compactCategory}`,
      source_url: paperId ? `https://arxiv.org/abs/${paperId.replace(/v\d+$/i, '')}` : '',
      event_time: publishedAt,
      created_at: asText(item.created_at) || publishedAt,
      location: 'Research Feed',
      country: '',
      latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null,
      severity: 2,
      relevance_score: 0.72,
      tags: ['literature', 'research', compactCategory, ...(Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [])],
      last_seen_at: asText(item.updated_at) || new Date().toISOString(),
      source_type: 'literature',
    };
  });
}

type SignalRowSourceCategory = 'world-monitor' | 'literature' | 'source-feed' | 'public-anchor' | 'other';

function isPureLiteratureSource(row: SignalRow): boolean {
  const alignmentTags = Array.isArray(row.alignment_tags) ? row.alignment_tags.map((tag) => normalizeTag(tag)) : [];
  const sourceType = normalizeTag(row.source_type || '');
  const sourceName = normalizeTag(row.source_name || '');
  const sourceUrl = normalizeTag(row.source_url || '');

  if (sourceType === 'literature' || sourceType === 'preprint' || sourceType === 'paper-db') {
    return true;
  }

  if (sourceName.startsWith('ic-literature')) {
    return true;
  }

  if (
    ['arxiv', 'openalex', 'semantic-scholar', 'semanticscholar', 'pubmed', 'crossref', 'ssrn'].some(
      (keyword) => sourceName === keyword || sourceName.includes(keyword),
    )
  ) {
    return true;
  }

  if (
    alignmentTags.some((tag) =>
      ['source:arxiv', 'source:openalex', 'source:semantic-scholar', 'source:pubmed'].includes(tag),
    )
  ) {
    return true;
  }

  return /(arxiv\.org|openalex\.org|semanticscholar\.org|pubmed\.ncbi\.nlm\.nih\.gov|crossref\.org|ssrn\.com)/.test(sourceUrl);
}

function classifySignalRowSourceCategory(row: SignalRow): SignalRowSourceCategory {
  const alignmentTags = Array.isArray(row.alignment_tags) ? row.alignment_tags.map((tag) => normalizeTag(tag)) : [];
  const tags = Array.isArray(row.tags) ? row.tags.map((tag) => normalizeTag(tag)) : [];
  const sourceType = normalizeTag(row.source_type || '');
  const sourceName = normalizeTag(row.source_name || '');

  if (
    alignmentTags.includes('source:world-monitor') ||
    sourceName === 'world-monitor' ||
    sourceName === 'who-world-monitor'
    ) {
      return 'world-monitor';
    }

  if (isPureLiteratureSource(row)) {
    return 'literature';
  }

  if (alignmentTags.includes('source:public-anchor')) {
    return 'public-anchor';
  }

  if (
    tags.includes('source-feed') ||
    sourceType === 'source-feed' ||
    sourceType === 'we-mp-rss' ||
    sourceType === 'rss' ||
    sourceType === 'webpage'
  ) {
    return 'source-feed';
  }

  return 'other';
}

function sourceCategoryPolicyLabel(category: SignalRowSourceCategory): string {
  switch (category) {
    case 'literature':
      return '论文源暂不介入 live runtime';
    case 'source-feed':
      return `信源池每源保留 ${SOURCE_FEED_SOURCE_LIMIT} 条`;
    case 'public-anchor':
      return '公共锚点全量保留';
    case 'world-monitor':
      return '主监测流全量保留';
    default:
      return '默认全量保留';
  }
}

function sourceCategoryLimit(category: SignalRowSourceCategory): number | null {
  switch (category) {
    case 'literature':
      return 0;
    case 'source-feed':
      return SOURCE_FEED_SOURCE_LIMIT;
    default:
      return null;
  }
}

function signalRowSortScore(row: SignalRow): number {
  return new Date(row.event_time || row.created_at || row.last_seen_at || 0).getTime();
}

function compareSignalRowsForRetention(left: SignalRow, right: SignalRow): number {
  return (
    signalRowSortScore(right) - signalRowSortScore(left) ||
    Number(right.relevance_score || 0) - Number(left.relevance_score || 0) ||
    Number(right.severity || 0) - Number(left.severity || 0) ||
    normalizeText(right.title).length - normalizeText(left.title).length
  );
}

function applyIngestionStabilityPolicy(rows: SignalRow[]): { rows: SignalRow[]; stats: WorldSourceIntakeStats } {
  const grouped = new Map<string, { category: SignalRowSourceCategory; sourceName: string; rows: SignalRow[] }>();

  for (const row of rows) {
    const category = classifySignalRowSourceCategory(row);
    const sourceName = normalizeText(row.source_name) || 'Unknown Source';
    const key = `${category}::${normalizeTag(sourceName)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }

    grouped.set(key, {
      category,
      sourceName,
      rows: [row],
    });
  }

  const keptRows: SignalRow[] = [];
  const sourceStats = [];

  for (const group of grouped.values()) {
    const limit = sourceCategoryLimit(group.category);
    const sortedRows = [...group.rows].sort(compareSignalRowsForRetention);
    const kept = limit === null ? sortedRows : sortedRows.slice(0, limit);
    keptRows.push(...kept);
    sourceStats.push({
      source_name: group.sourceName,
      category: group.category,
      policy: sourceCategoryPolicyLabel(group.category),
      emitted_count: group.rows.length,
      kept_count: kept.length,
      collapsed_count: Math.max(group.rows.length - kept.length, 0),
    });
  }

  const totalEmittedCount = rows.length;
  const totalKeptCount = keptRows.length;
  const totalCollapsedCount = Math.max(totalEmittedCount - totalKeptCount, 0);
  const burstySources = sourceStats
    .filter((item) => item.emitted_count > 1 && (item.collapsed_count > 0 || item.emitted_count >= 5))
    .sort(
      (left, right) =>
        right.collapsed_count - left.collapsed_count ||
        right.emitted_count - left.emitted_count ||
        left.source_name.localeCompare(right.source_name, 'zh-CN'),
    )
    .slice(0, 12);

  return {
    rows: keptRows,
    stats: {
      total_emitted_count: totalEmittedCount,
      total_kept_count: totalKeptCount,
      total_collapsed_count: totalCollapsedCount,
      bursty_sources: burstySources,
    },
  };
}

type UnifiedSourceTier = 't1' | 't1.5' | 't2' | 't3';
type UnifiedIntakeDecision = 'main' | 'candidate' | 'archive';

function rowTextHaystack(row: SignalRow) {
  return normalizeTag(
    [
      row.title,
      row.description,
      row.source_name,
      row.source_url,
      row.source_type,
      row.source_feed_name,
      ...(row.tags || []),
      ...(row.alignment_tags || []),
    ].join(' '),
  );
}

function classifyUnifiedSourceTier(row: SignalRow, category: SignalRowSourceCategory): UnifiedSourceTier {
  const haystack = rowTextHaystack(row);
  const sourceName = normalizeText(row.source_name);
  if (category === 'world-monitor' || haystack.includes('source:world-monitor') || /world-monitor/.test(haystack)) return 't1';
  if (haystack.includes('source:aihot') || haystack.includes('source:ai-news-radar') || /aihot|ai-hot|ai-news-radar/.test(haystack)) return 't1';
  if (
    /(官网|官方|official|newsroom|engineering-blog|developers-blog|github-releases|openai|anthropic|claude|deepmind|google|meta-ai|mistral|nvidia|huggingface|hugging-face|who|treasury|fda|arxiv|openalex|semantic-scholar|pubmed)/.test(
      haystack,
    ) &&
    !/^x[:：-]/i.test(sourceName)
  ) {
    return 't1';
  }
  if (/^x[:：-]/i.test(sourceName) && /(openai|anthropic|claude|google|deepmind|meta|xai|mistral|nvidia|runway|krea|notion|kimi|minimax|baidu|sensetime|kling)/.test(haystack)) {
    return 't1.5';
  }
  if (category === 'public-anchor' || category === 'other') return 't2';
  return /weak-signal|reddit|bsky|forum|podcast|newsletter/.test(haystack) ? 't3' : 't2';
}

function unifiedTierWeight(tier: UnifiedSourceTier) {
  if (tier === 't1') return 0.24;
  if (tier === 't1.5') return 0.18;
  if (tier === 't2') return 0.12;
  return 0.06;
}

function unifiedContentRelevance(row: SignalRow, category: SignalRowSourceCategory) {
  const haystack = rowTextHaystack(row);
  if (category === 'world-monitor') return 0.12;
  if (haystack.includes('source:aihot') || haystack.includes('source:ai-news-radar')) return 0.22;
  const aiMatch = /(\bai\b|llm|openai|anthropic|claude|chatgpt|gemini|deepmind|模型|大模型|智能体|agent|benchmark|sota|huggingface|github|paper|论文|开源)/.test(haystack);
  const worldMatch = /(war|conflict|strike|missile|drone|ceasefire|sanction|diplomacy|outbreak|epidemic|energy|supply-chain|shipping|election|regulation|战争|冲突|导弹|停火|制裁|外交|疫情|能源|供应链|监管)/.test(haystack);
  const financeInfraMatch = /(treasury|yield|cpi|gdp|fda|market|shipping|crypto|oil|gas|capacity|logistics)/.test(haystack);
  let score = 0;
  if (aiMatch) score += 0.16;
  if (worldMatch) score += 0.16;
  if (financeInfraMatch) score += 0.08;
  return clamp(score, 0, 0.22);
}

function unifiedEventValue(row: SignalRow, category: SignalRowSourceCategory) {
  const haystack = rowTextHaystack(row);
  const visibleText = normalizeTag([row.title, row.description].join(' '));
  let score = 0;
  if ((row.severity || 0) >= 4) score += 0.09;
  if ((row.relevance_score || 0) >= 0.75) score += 0.05;
  if ((row.intensity || 0) >= 3) score += 0.05;
  if ((row.mention_count || 0) >= 5) score += 0.04;
  if (/(发布|上线|推出|release|launch|announce|available|开源|open-source|api|sdk|cli|benchmark|sota|融资|收购|合作|监管|lawsuit|attack|strike|kills|dead|fatal|outbreak|ceasefire|sanction)/.test(haystack)) {
    score += 0.08;
  }
  if (category === 'source-feed' && /(信源更新|结构化更新|当前样本|标题清单|source-feed|bundle-feed)/.test(haystack)) {
    score -= 0.1;
  }
  if (/(opinion|podcast|播客|观点|鸡汤|转发|retweet|soft|marketing|sponsored)/.test(haystack)) {
    score -= 0.08;
  }
  if (/(反馈|好玩|有趣|感谢|thanks|feedback|fun|community-win|community-victory|day0|day-0)/.test(visibleText)) {
    score -= 0.07;
  }
  return clamp(score, 0, 0.24);
}

function unifiedFreshnessScore(row: SignalRow, now = Date.now()) {
  const timestamp = Date.parse(row.event_time || row.last_seen_at || row.created_at || '');
  if (!Number.isFinite(timestamp)) return 0.04;
  const ageHours = Math.max(0, (now - timestamp) / 36e5);
  if (ageHours <= 6) return 0.1;
  if (ageHours <= 24) return 0.08;
  if (ageHours <= 72) return 0.05;
  return 0.02;
}

function unifiedIntakeThreshold(tier: UnifiedSourceTier, category: SignalRowSourceCategory) {
  if (category === 'world-monitor') return 0.44;
  if (tier === 't1') return 0.5;
  if (tier === 't1.5') return 0.56;
  if (tier === 't2') return 0.62;
  return 0.7;
}

function applyUnifiedIntakeScoring(rows: SignalRow[]): SignalRow[] {
  const now = Date.now();
  const scoredRows = rows.map((row) => {
    const category = classifySignalRowSourceCategory(row);
    const tier = classifyUnifiedSourceTier(row, category);
    const upstream = clamp(Number(row.relevance_score || 0), 0, 1);
    const tierScore = category === 'world-monitor' ? Math.min(unifiedTierWeight(tier), 0.18) : unifiedTierWeight(tier);
    const upstreamWeight = category === 'world-monitor' ? 0.34 : 0.22;
    const score = clamp(
      tierScore +
        unifiedContentRelevance(row, category) +
        unifiedEventValue(row, category) +
        unifiedFreshnessScore(row, now) +
        upstream * upstreamWeight,
      0,
      1,
    );
    const threshold = unifiedIntakeThreshold(tier, category);
    const decision: UnifiedIntakeDecision =
      score >= threshold ? 'main' : score >= Math.max(0.42, threshold - 0.12) ? 'candidate' : 'archive';
    const nextRelevance = decision === 'main' ? Math.max(upstream, score) : Math.max(upstream * 0.85, score * 0.82);
    const nextSeverity =
      decision === 'main' && score >= 0.78
        ? Math.max(Number(row.severity || 1), 4)
        : decision === 'candidate'
          ? Math.min(Number(row.severity || 1), 3)
          : Math.min(Number(row.severity || 1), 2);
    return {
      ...row,
      severity: nextSeverity,
      relevance_score: Number(clamp(nextRelevance, 0, 0.96).toFixed(3)),
      alignment_tags: uniqueAlignmentTags([
        `upstream:score:${Math.round(upstream * 100)}`,
        `intake:tier:${tier}`,
        `intake:decision:${decision}`,
        `intake:score:${Math.round(score * 100)}`,
        'intake:scoring:code-formula',
        ...(row.alignment_tags || []),
      ]),
    };
  });
  return scoredRows.filter((row) => !(row.alignment_tags || []).includes('intake:decision:archive'));
}

type LoadSignalsOptions = {
  allowExpiredDiskCache?: boolean;
  preferCached?: boolean;
  backgroundRefresh?: boolean;
  allowModelRefresh?: boolean;
  forceRefresh?: boolean;
};

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }
  return response.json();
}

async function refreshSignals(runtime: RuntimeStore, options: Pick<LoadSignalsOptions, 'allowModelRefresh'> = {}): Promise<WorldSignal[]> {
  if (runtime.signalsRefreshInFlight) {
    return runtime.signalsRefreshInFlight;
  }

  runtime.signalsRefreshInFlight = (async () => {
    const now = Date.now();
    try {
      const baseUrl = 'https://world-monitor.com';
      const informationCollectionBaseUrl = getInformationCollectionBaseUrl();

      const [
        eventsRes,
        outbreaksRes,
        signalMarkersRes,
        icArticlesRes,
        icLiteratureRes,
        publicAnchorRowsRes,
        selectedHighQualityRowsRes,
        monitorRecommendedRowsRes,
        catalogSourceRowsRes,
      ] = await Promise.allSettled([
        fetchJsonWithTimeout(`${baseUrl}/api/events`, 20000),
        fetchJsonWithTimeout(`${baseUrl}/api/outbreaks`, 20000),
        fetchJsonWithTimeout(`${baseUrl}/api/signal-markers`, 20000),
        fetchJsonWithTimeout(`${informationCollectionBaseUrl}/api/v1/articles?limit=80&offset=0`, 12000),
        fetchJsonWithTimeout(`${informationCollectionBaseUrl}/api/v1/literature/recent?limit=40&offset=0`, 12000),
        loadPublicAnchorRows(),
        loadSelectedHighQualityRows(),
        loadMonitorRecommendedRows(),
        loadCatalogSourceRows(),
      ]);

      const allSignals: SignalRow[] = [];

      if (eventsRes.status === 'fulfilled') {
        allSignals.push(...normalizeEvents(eventsRes.value));
      } else {
        console.warn('[loadSignals] Failed to fetch events:', eventsRes.reason);
      }

      if (outbreaksRes.status === 'fulfilled') {
        allSignals.push(...normalizeOutbreaks(outbreaksRes.value));
      } else {
        console.warn('[loadSignals] Failed to fetch outbreaks:', outbreaksRes.reason);
      }

      if (signalMarkersRes.status === 'fulfilled') {
        allSignals.push(...normalizeSignalMarkers(signalMarkersRes.value));
      } else {
        console.warn('[loadSignals] Failed to fetch signal markers:', signalMarkersRes.reason);
      }

      if (icArticlesRes.status === 'fulfilled') {
        const icArticleRows = await enrichIcArticleRows(normalizeIcArticles(icArticlesRes.value));
        allSignals.push(...icArticleRows);
      } else {
        console.warn('[loadSignals] Failed to fetch IC articles:', icArticlesRes.reason);
      }

      if (icLiteratureRes.status === 'fulfilled') {
        allSignals.push(...normalizeIcLiterature(icLiteratureRes.value));
      } else {
        console.warn('[loadSignals] Failed to fetch IC literature:', icLiteratureRes.reason);
      }

      if (publicAnchorRowsRes.status === 'fulfilled') {
        allSignals.push(...publicAnchorRowsRes.value);
      }

      if (selectedHighQualityRowsRes.status === 'fulfilled') {
        allSignals.push(...selectedHighQualityRowsRes.value);
      }

      if (monitorRecommendedRowsRes.status === 'fulfilled') {
        allSignals.push(...monitorRecommendedRowsRes.value);
      }

      if (catalogSourceRowsRes.status === 'fulfilled') {
        allSignals.push(...catalogSourceRowsRes.value);
      }

      if (allSignals.length === 0) {
        console.warn('[loadSignals] No signals fetched');
        runtime.sourceIntakeStats = null;
        const staleCachedSignals = await readSignalDiskCache(true);
        if (staleCachedSignals) {
          runtime.signalsCache = {
            expiresAt: now + SIGNALS_CACHE_TTL_MS,
            signals: staleCachedSignals,
          };
          return staleCachedSignals;
        }

        if (!isSampleSignalFallbackEnabled()) {
          runtime.signalsCache = {
            expiresAt: now + SIGNALS_CACHE_TTL_MS,
            signals: [],
          };
          return [];
        }

        console.warn('[loadSignals] WORLD_ALLOW_SAMPLE_SIGNALS=1, using sample signals');
        const fallbackSignals = scoreSignals(FALLBACK_SIGNAL_ROWS);
        runtime.signalsCache = {
          expiresAt: now + SIGNALS_CACHE_TTL_MS,
          signals: fallbackSignals,
        };
        return fallbackSignals;
      }

      const stabilizedRows = applyIngestionStabilityPolicy(allSignals);
      runtime.sourceIntakeStats = stabilizedRows.stats;
      const alignedRows = await ensureSignalRowAlignments(stabilizedRows.rows, {
        allowModelRefresh: isBatchModelRefreshAllowed(options),
      });
      const publishableRows = filterLowInformationSourceRows(alignedRows, {
        onDrop: (dropped) => {
          console.warn(`[loadSignals] Dropped ${dropped} low-information source-feed rows before scoring`);
        },
      });
      const intakeScoredRows = applyUnifiedIntakeScoring(publishableRows);
      const exactMergedRows = mergeSignalRows(intakeScoredRows);
      const eventClusteredRows = clusterRelatedSignalRows(exactMergedRows);
      const mergedSignals = eventClusteredRows.rows;
      console.log(
        `[loadSignals] Loaded ${mergedSignals.length} merged signals from world-monitor.com with knowledge supplements (emitted ${stabilizedRows.stats.total_emitted_count}, kept ${intakeScoredRows.length}/${publishableRows.length}, exact_collapsed ${intakeScoredRows.length - exactMergedRows.length}, event_clusters ${eventClusteredRows.clusterCount}, event_collapsed ${eventClusteredRows.collapsedCount}, source_collapsed ${stabilizedRows.stats.total_collapsed_count})`,
      );
      const scoredSignals = scoreSignals(mergedSignals);
      const staleCachedPayload = await readSignalDiskCachePayload(true);
      const isShrunkenRefresh = Boolean(
        staleCachedPayload && isDangerouslyShrunkenSignalSet(scoredSignals, staleCachedPayload.signals),
      );
      const safeSignals =
        staleCachedPayload && isShrunkenRefresh
          ? mergeRefreshedSignalsWithPrevious(scoredSignals, staleCachedPayload.signals)
          : scoredSignals;
      const safeStats = runtime.sourceIntakeStats;
      if (isShrunkenRefresh) {
        console.warn(
          `[loadSignals] Merging shrunken refresh (${scoredSignals.length}) into fuller cached signal set (${staleCachedPayload?.signals.length || 0}).`,
        );
      }
      runtime.signalsCache = {
        expiresAt: now + SIGNALS_CACHE_TTL_MS,
        signals: safeSignals,
      };
      runtime.sourceIntakeStats = safeStats ?? null;
      void persistSignalDiskCache(safeSignals, runtime.sourceIntakeStats);
      return safeSignals;
    } catch (error) {
      console.warn(
        '[世界脉络] Live signal refresh failed:',
        error instanceof Error ? error.message : String(error),
      );
      runtime.sourceIntakeStats = null;
      const staleCachedSignals = await readSignalDiskCache(true);
      if (staleCachedSignals) {
        runtime.signalsCache = {
          expiresAt: now + SIGNALS_CACHE_TTL_MS,
          signals: staleCachedSignals,
        };
        return staleCachedSignals;
      }

      if (!isSampleSignalFallbackEnabled()) {
        runtime.signalsCache = {
          expiresAt: now + SIGNALS_CACHE_TTL_MS,
          signals: [],
        };
        return [];
      }

      console.warn('[世界脉络] WORLD_ALLOW_SAMPLE_SIGNALS=1, using sample signals');
      const fallbackSignals = scoreSignals(FALLBACK_SIGNAL_ROWS);
      runtime.signalsCache = {
        expiresAt: now + SIGNALS_CACHE_TTL_MS,
        signals: fallbackSignals,
      };
      return fallbackSignals;
    } finally {
      runtime.signalsRefreshInFlight = null;
    }
  })();

  return runtime.signalsRefreshInFlight;
}

async function loadSignals(options: LoadSignalsOptions = {}): Promise<WorldSignal[]> {
  const runtime = getRuntimeStore();
  await ensureTranslatedSignalsLoaded();
  const now = Date.now();
  const allowExpiredDiskCache = options.allowExpiredDiskCache ?? false;
  const preferCached = options.preferCached ?? false;
  const backgroundRefresh = options.backgroundRefresh ?? false;
  const effectiveBackgroundRefresh = backgroundRefresh && isWorldRuntimeHeavyRefreshEnabled();
  const allowModelRefresh = isBatchModelRefreshAllowed(options);
  const forceRefresh = options.forceRefresh === true;

  if (forceRefresh) {
    return refreshSignals(runtime, { allowModelRefresh });
  }

  if (runtime.signalsCache && runtime.signalsCache.expiresAt > now) {
    return runtime.signalsCache.signals;
  }

  const diskCachedSignals = await readSignalDiskCache(allowExpiredDiskCache);
  if (diskCachedSignals) {
    runtime.signalsCache = {
      expiresAt: now + SIGNALS_CACHE_TTL_MS,
      signals: diskCachedSignals,
    };
    if (preferCached && effectiveBackgroundRefresh) {
      void refreshSignals(runtime, { allowModelRefresh });
    }
    return diskCachedSignals;
  }

  if (preferCached && runtime.signalsCache?.signals?.length) {
    if (effectiveBackgroundRefresh) {
      void refreshSignals(runtime, { allowModelRefresh });
    }
    return runtime.signalsCache.signals;
  }

  return refreshSignals(runtime, { allowModelRefresh });
}

function scoreCandidate(signal: WorldSignal, mode: MissionMode, xiaId?: string): number {
  const base = mode === 'hotspot' ? signal.hotspotScore : signal.explorationScore;
  return clamp(
    base +
      getProximityBonus(signal, xiaId) +
      getRelatedSignalBonus(signal, xiaId) +
      getConnectedLeapBonus(mode, signal, xiaId) -
      getRepeatVisitPenalty(signal, xiaId),
    0,
    1.3,
  );
}

function chooseCandidate(signals: WorldSignal[], mode: MissionMode, scene: WorldScene, xiaId?: string): WorldSignal | null {
  const filtered = signals.filter((signal) => signalMatchesScene(signal, scene));
  if (!filtered.length) {
    const fallbackPool = signals.filter((signal) => signal.latitude !== null && signal.longitude !== null);
    if (!fallbackPool.length) {
      return null;
    }

    const scoredFallback = [...fallbackPool].sort((a, b) => {
      const left = scoreCandidate(a, mode, xiaId);
      const right = scoreCandidate(b, mode, xiaId);
      return right - left;
    });

    return scoredFallback[0] || null;
  }

  const scored = [...filtered].sort((a, b) => {
    const left = scoreCandidate(a, mode, xiaId);
    const right = scoreCandidate(b, mode, xiaId);
    return right - left;
  });

  return scored[0] || null;
}

function getPreviousSignalForXia(xiaId: string | undefined, signals?: WorldSignal[]): WorldSignal | null {
  if (!xiaId) return null;
  const runtime = getRuntimeStore();
  const trail = runtime.xiaTrails.get(xiaId);
  if (!trail?.signalId) return null;
  const pool = signals || runtime.signalsCache?.signals || [];
  return pool.find((entry) => entry.id === trail.signalId) || null;
}

function updateXiaTrail(xiaId: string | undefined, signal: WorldSignal): void {
  if (!xiaId) return;

  const runtime = getRuntimeStore();
  runtime.xiaTrails.set(xiaId, {
    signalId: signal.id,
    region: signal.region,
    lat: signal.latitude,
    lng: signal.longitude,
    updatedAt: Date.now(),
  });
}

function updateDispatchHistory(signal: WorldSignal): void {
  const runtime = getRuntimeStore();
  const topicKey = `${signal.scene}:${buildTopic(signal)}`;
  runtime.regionHistory.set(signal.region, (runtime.regionHistory.get(signal.region) || 0) + 1);
  runtime.topicHistory.set(topicKey, (runtime.topicHistory.get(topicKey) || 0) + 1);
  runtime.lastCoverageAt.set(signal.region, Date.now());
}

function resolveObserverId(xiaId?: string): string {
  return normalizeText(xiaId) || DEFAULT_WORLDLINE_ID;
}

function _buildNodeActivities(signal: WorldSignal, reports: WorldReport[]): WorldNodeActivity[] {
  return reports
    .filter((report) => report.signal_id === signal.id || report.region === signal.region)
    .filter((report) => isWithinRecentWindow(report.created_at))
    .filter((report) => isTodayKey(report.created_at))
    .filter((report) => isConcreteDashboardReport(report))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 3)
    .map((report) => ({
      mission_id: report.mission_id,
      mode: report.mode,
      topic: report.topic,
      topic_label: report.topic_label,
      past_report: report.past_report,
      current_analysis: report.current_analysis,
      future_projection: report.future_projection,
      report_kind: report.report_kind,
      report_kind_note: report.report_kind_note,
      summary: report.summary,
      inference: report.inference,
      confidence: report.confidence,
      brake_line: report.brake_line,
      why_now: report.why_now,
      watch_next: report.watch_next,
      signal_stage: report.signal_stage,
      created_at: report.created_at,
    }));
}

function getSignalLastReportAt(signal: WorldSignal, reports: WorldReport[]): string | null {
  const match = reports
    .filter((report) => report.signal_id === signal.id)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];

  return match?.created_at || null;
}

function _getNodeUpdatedAt(signal: WorldSignal, reports: WorldReport[]): string {
  const lastReportAt = getSignalLastReportAt(signal, reports);
  if (!lastReportAt) {
    return signal.observedAt;
  }

  return new Date(lastReportAt).getTime() > new Date(signal.observedAt).getTime()
    ? lastReportAt
    : signal.observedAt;
}

function _getNodeDisplayLevel(signal: WorldSignal, reports: WorldReport[]): WorldDisplayLevel {
  const lastReportAt = getSignalLastReportAt(signal, reports);
  if (!lastReportAt) {
    return signal.displayLevel;
  }

  const ageHours = (Date.now() - new Date(lastReportAt).getTime()) / 36e5;
  const hasFreshSignalChange = hasSignalChangeMarkers(signal.alignmentTags);

  if (ageHours <= 24) {
    if (hasFreshSignalChange && signal.displayLevel !== 'monitoring') {
      return 'elevated';
    }
    return 'monitoring';
  }

  if (ageHours <= REPORT_MEMORY_WINDOW_HOURS) {
    if (hasFreshSignalChange && signal.displayLevel !== 'monitoring') {
      return 'elevated';
    }
    return signal.displayLevel === 'high' ? 'elevated' : 'monitoring';
  }

  return signal.displayLevel;
}

function buildStateMetrics(
  scopedSignals: WorldSignal[],
  arena: Pick<LiveBenchArenaState, 'active_questions' | 'resolved_questions' | 'watchlist_questions'> | null,
): WorldStateMetrics {
  const mappedSignals = scopedSignals.filter((signal) => signal.latitude !== null && signal.longitude !== null);
  const regionByHotspot = [...scopedSignals]
    .sort((left, right) => right.hotspotScore - left.hotspotScore)[0]
    ?.region || '暂无';
  const regionByCoverageGap = [...scopedSignals]
    .sort((left, right) => right.coverageGap - left.coverageGap)[0]
    ?.region || '暂无';

  const avgHotspot = scopedSignals.length
    ? scopedSignals.reduce((sum, signal) => sum + signal.hotspotScore, 0) / scopedSignals.length
    : 0;
  const avgCoverageGap = scopedSignals.length
    ? scopedSignals.reduce((sum, signal) => sum + signal.coverageGap, 0) / scopedSignals.length
    : 0;

  return {
    active_signal_count: scopedSignals.length,
    mapped_signal_count: mappedSignals.length,
    active_question_count: arena?.active_questions.length || 0,
    resolved_question_count: arena?.resolved_questions.length || 0,
    watchlist_question_count: arena?.watchlist_questions.length || 0,
    avg_hotspot_score: Number(avgHotspot.toFixed(2)),
    avg_coverage_gap: Number(avgCoverageGap.toFixed(2)),
    hottest_region: regionByHotspot,
    least_covered_region: regionByCoverageGap,
  };
}

function _buildTrails(scopedSignals: WorldSignal[], reports: WorldReport[], scene: WorldScene): WorldTrail[] {
  const signalMap = new Map(scopedSignals.map((signal) => [signal.id, signal]));
  const palette = ['#2563EB', '#0F766E', '#7C3AED', '#EA580C', '#DB2777'];

  const recentReports = reports
    .filter((report) => isTodayKey(report.created_at))
    .filter((report) => isConcreteDashboardReport(report))
    .filter(
      (report) =>
        scene === 'global' ||
        normalizeTag(report.scene) === normalizeTag(scene) ||
        normalizeTag(report.topic) === normalizeTag(scene),
    )
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

  const reportedPath: WorldTrail['points'] = [];
  const reportedEdges: WorldTrailEdge[] = [];
  const usedSignalIds = new Set<string>();
  for (const report of recentReports) {
    const signal = signalMap.get(report.signal_id);
    if (!signal || signal.latitude === null || signal.longitude === null) continue;

    const lastPoint = reportedPath[reportedPath.length - 1];
    if (lastPoint && lastPoint.signal_id === signal.id) {
      continue;
    }

    if (usedSignalIds.has(signal.id)) {
      continue;
    }

    usedSignalIds.add(signal.id);
    reportedPath.push({
      signal_id: signal.id,
      lat: signal.latitude,
      lng: signal.longitude,
      region: signal.region,
      topic: report.topic_label || report.topic,
      created_at: report.created_at,
    });

    if (reportedPath.length >= 2) {
      const previousPoint = reportedPath[reportedPath.length - 2];
      const previousSignal = signalMap.get(previousPoint.signal_id) || null;
      const hop = buildHopDescriptor(previousSignal, signal, report.mode);
      reportedEdges.push({
        from_signal_id: previousPoint.signal_id,
        to_signal_id: signal.id,
        start_lat: previousPoint.lat,
        start_lng: previousPoint.lng,
        end_lat: signal.latitude,
        end_lng: signal.longitude,
        reason: hop.reason,
        label: hop.label,
        confidence: hop.confidence,
        created_at: report.created_at,
      });
    }
  }

  if (reportedPath.length >= 2) {
    return [
      {
        xia_id: '世界线',
        color: palette[0],
        points: reportedPath.slice(-6),
        edges: reportedEdges.slice(-5),
      },
    ];
  }

  const mappedSignals = [...scopedSignals]
    .filter((signal) => signal.latitude !== null && signal.longitude !== null)
    .sort((left, right) => right.hotspotScore - left.hotspotScore || right.explorationScore - left.explorationScore)
    .slice(0, 28);

  if (mappedSignals.length < 2) {
    return [];
  }

  const path: WorldTrail['points'] = [];
  const edges: WorldTrailEdge[] = [];
  const used = new Set<string>();
  let current = mappedSignals[0];

  while (current && path.length < 5) {
    if (used.has(current.id)) {
      break;
    }

    used.add(current.id);
    path.push({
      signal_id: current.id,
      lat: current.latitude!,
      lng: current.longitude!,
      region: current.region,
      topic: buildTopicLabel(current),
      created_at: current.publishedAt,
    });

    const currentKeys = new Set(buildThreadKeys(current));
    const next = mappedSignals
      .filter((signal) => !used.has(signal.id))
      .map((signal) => {
        const nextKeys = new Set(buildThreadKeys(signal));
        const overlap = [...currentKeys].filter((key) => nextKeys.has(key));
        const relationScore =
          overlap.length * 0.18 +
          (signal.region !== current.region && overlap.length > 0 ? 0.08 : 0) +
          (normalizeTag(signal.scene) === normalizeTag(current.scene) ? 0.08 : 0) +
          (signal.explorationScore * 0.1) +
          (signal.hotspotScore * 0.08);
        return { signal, relationScore };
      })
      .sort((left, right) => right.relationScore - left.relationScore)[0];

    if (!next || next.relationScore < 0.18) {
      break;
    }

    const hop = buildHopDescriptor(current, next.signal, 'exploration');
    edges.push({
      from_signal_id: current.id,
      to_signal_id: next.signal.id,
      start_lat: current.latitude!,
      start_lng: current.longitude!,
      end_lat: next.signal.latitude!,
      end_lng: next.signal.longitude!,
      reason: hop.reason,
      label: hop.label,
      confidence: hop.confidence,
      created_at: next.signal.publishedAt,
    });

    current = next.signal;
  }

  return path.length >= 2
    ? [
        {
          xia_id: '世界线',
          color: palette[0],
          points: path,
          edges,
        },
      ]
    : [];
}

function buildCuratedBundleHints(sourceCatalog: WorldSourceCatalog | null | undefined) {
  const curatedBundleHints: Record<
    string,
    Array<{
      name: string;
      note: string;
      source_count: number;
    }>
  > = {};

  for (const pool of sourceCatalog?.overflow_pools || []) {
    if (pool.platform_name !== 'ShunyaNet Sentinel Curated') {
      continue;
    }

    for (const skill of pool.source_skills || []) {
      const entry = {
        name: skill.name,
        note:
          skill.name.includes('Iran Watch')
            ? '适合冲突 / 中东观察'
            : '适合作为主世界与弱信号的 curated RSS 基底',
        source_count: skill.usable_source_count,
      };

      if (skill.name.includes('Iran Watch')) {
        curatedBundleHints.war = [...(curatedBundleHints.war || []), entry];
        curatedBundleHints['weak-signal'] = [...(curatedBundleHints['weak-signal'] || []), entry];
      } else {
        curatedBundleHints.global = [...(curatedBundleHints.global || []), entry];
        curatedBundleHints['weak-signal'] = [...(curatedBundleHints['weak-signal'] || []), entry];
      }
    }
  }

  return curatedBundleHints;
}

function buildRecommendedBundlesForScene(scene: WorldScene, sourceCatalog: WorldSourceCatalog | null | undefined) {
  const curatedBundleHints = buildCuratedBundleHints(sourceCatalog);
  if (scene === 'tech-ai') {
    return [...(curatedBundleHints['technology-daily'] || []), ...(curatedBundleHints['ai-daily'] || [])];
  }
  return curatedBundleHints[scene] || [];
}

function buildWorldSubworldSummaries(
  signals: WorldSignal[],
  sourceCatalog: WorldSourceCatalog | null | undefined,
): WorldDashboardSubworldSummary[] {
  const curatedBundleHints = buildCuratedBundleHints(sourceCatalog);

  const fixedWorlds: Array<{ key: WorldScene; title: string; summary: string; matched_tags: string[] }> = [
    {
      key: 'geo-politics-daily',
      title: '地缘',
      summary: '冲突、外交、制裁、选举、公共安全和区域风险。',
      matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'],
    },
    {
      key: 'tech-ai',
      title: 'AI',
      summary: '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。',
      matched_tags: ['technology', 'ai', 'llm', 'agent', 'chip', 'opensource', 'aihot', 'ai-news-radar'],
    },
    {
      key: 'asean',
      title: '东盟',
      summary: '东盟、东南亚供应链、南海、区域安全、市场和公共卫生。',
      matched_tags: ['asean', 'southeast-asia', 'south-china-sea', 'rcep', 'supply-chain'],
    },
  ];

  return fixedWorlds.map((world) => ({
    ...world,
    signal_count: signals.filter((signal) => signalMatchesScene(signal, world.key)).length,
    recommended_bundles:
      world.key === 'tech-ai'
        ? [...(curatedBundleHints['technology-daily'] || []), ...(curatedBundleHints['ai-daily'] || [])]
        : curatedBundleHints[world.key] || [],
  }));
}

function normalizeDashboardSnapshotPayload(
  payload: Partial<WorldDashboardSnapshotPayload> | null | undefined,
): WorldDashboardSnapshotPayload | null {
  if (!payload || payload.version !== DASHBOARD_SNAPSHOT_VERSION || typeof payload.saved_at !== 'string') {
    return null;
  }
  const savedAtMs = new Date(payload.saved_at).getTime();
  if (!Number.isFinite(savedAtMs)) {
    return null;
  }

  const subworlds = Array.isArray(payload.subworlds) ? payload.subworlds : [];
  const states = payload.states && typeof payload.states === 'object' ? payload.states : {};

  return {
    version: DASHBOARD_SNAPSHOT_VERSION,
    saved_at: payload.saved_at,
    subworlds: subworlds as WorldDashboardSubworldSummary[],
    states: states as Partial<Record<WorldScene, WorldDashboardStatePayload>>,
  };
}

async function readWorldDashboardSnapshot(): Promise<WorldDashboardSnapshotPayload | null> {
  try {
    const raw = await fs.readFile(DASHBOARD_SNAPSHOT_FILE, 'utf-8');
    const parsed = normalizeDashboardSnapshotPayload(JSON.parse(raw) as Partial<WorldDashboardSnapshotPayload>);
    if (parsed) {
      return parsed;
    }
  } catch {
    // ignore and fall back to legacy cache
  }
  return readLegacyWorldDashboardSnapshot();
}

function buildSubworldSummariesFromCachedDashboardState(
  state: Partial<WorldDashboardStatePayload>,
): WorldDashboardSubworldSummary[] {
  const pooledSignals = [
    ...(Array.isArray(state.graph_signals) ? state.graph_signals : []),
    ...(Array.isArray(state.top_signals) ? state.top_signals : []),
    ...(Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []),
  ];
  const sceneCounts = pooledSignals.reduce((summary, signal) => {
    const scene = signal?.scene as WorldScene | undefined;
    const id = signal?.id;
    if (!scene || !id) return summary;
    const bucket = summary.get(scene) || new Set<string>();
    bucket.add(id);
    summary.set(scene, bucket);
    return summary;
  }, new Map<WorldScene, Set<string>>());

  const sourceCatalog = (state as { source_catalog?: WorldSourceCatalog | null }).source_catalog || null;
  const fixedWorlds: Array<{ key: WorldScene; title: string; summary: string; matched_tags: string[] }> = [
    { key: 'geo-politics-daily', title: '地缘', summary: '冲突、外交、制裁、选举、公共安全和区域风险。', matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'] },
    { key: 'tech-ai', title: 'AI', summary: '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。', matched_tags: ['technology', 'ai', 'llm', 'agent', 'chip', 'opensource', 'aihot', 'ai-news-radar'] },
    { key: 'asean', title: '东盟', summary: '东盟、东南亚供应链、南海、区域安全、市场和公共卫生。', matched_tags: ['asean', 'southeast-asia', 'south-china-sea', 'rcep', 'supply-chain'] },
  ];

  return fixedWorlds.map((world) => ({
    ...world,
    signal_count:
      pooledSignals.filter((signal) =>
            signalMatchesScene(
              {
                scene: (signal?.scene as WorldScene | undefined) || 'global',
                alignmentTags: Array.isArray(signal?.alignment_tags) ? signal.alignment_tags : [],
                sourceName: typeof signal?.source_name === 'string' ? signal.source_name : '',
                sourceUrl: typeof signal?.source_url === 'string' ? signal.source_url : '',
                title: typeof signal?.title === 'string' ? signal.title : '',
                summary: typeof signal?.summary === 'string' ? signal.summary : '',
                tags: Array.isArray(signal?.tags) ? signal.tags : [],
              },
              world.key,
            ),
          ).length || sceneCounts.get(world.key)?.size || 0,
    recommended_bundles: buildRecommendedBundlesForScene(world.key, sourceCatalog),
  }));
}

async function readLegacyWorldDashboardSnapshot(): Promise<WorldDashboardSnapshotPayload | null> {
  try {
    const raw = await fs.readFile(LATEST_WORLD_STATE_FILE, 'utf-8');
    const legacyState = JSON.parse(raw) as Partial<WorldDashboardStatePayload> & { scene?: WorldScene };
    if (!legacyState || typeof legacyState.generated_at !== 'string' || !legacyState.scene) {
      return null;
    }
    const subworlds = buildSubworldSummariesFromCachedDashboardState(legacyState);
    return {
      version: DASHBOARD_SNAPSHOT_VERSION,
      saved_at: legacyState.generated_at,
      subworlds,
      states: {
        [legacyState.scene]: legacyState as WorldDashboardStatePayload,
      },
    };
  } catch {
    return null;
  }
}

async function persistWorldDashboardSnapshot(
  scene: WorldScene,
  state: WorldDashboardStatePayload,
  subworlds: WorldDashboardSubworldSummary[],
): Promise<void> {
  dashboardSnapshotWriteQueue = dashboardSnapshotWriteQueue
    .catch(() => undefined)
    .then(() => persistWorldDashboardSnapshotNow(scene, state, subworlds));
  return dashboardSnapshotWriteQueue;
}

async function persistWorldDashboardSnapshotNow(
  scene: WorldScene,
  state: WorldDashboardStatePayload,
  subworlds: WorldDashboardSubworldSummary[],
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(DASHBOARD_SNAPSHOT_FILE), { recursive: true });
    const existing = await readWorldDashboardSnapshot();
    const existingState = existing?.states?.[scene];
    if (existingState && isRenderableDashboardState(existingState) && !isRenderableDashboardState(state)) {
      console.warn('[dashboard] skipped replacing usable snapshot with empty dashboard state');
      return;
    }
    const payload: WorldDashboardSnapshotPayload = {
      version: DASHBOARD_SNAPSHOT_VERSION,
      saved_at: new Date().toISOString(),
      subworlds,
      states: {
        ...(existing?.states || {}),
        [scene]: state,
      },
    };
    await fs.writeFile(DASHBOARD_SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[dashboard] failed to persist snapshot:', error instanceof Error ? error.message : String(error));
  }
}

export function isRenderableDashboardState(state: Pick<WorldDashboardStatePayload, 'metrics' | 'nodes' | 'graph_signals' | 'top_signals'> | null | undefined): boolean {
  if (!state) return false;
  return Boolean(
    (state.metrics?.active_signal_count || 0) > 0 ||
      (state.metrics?.mapped_signal_count || 0) > 0 ||
      state.nodes?.length ||
      state.graph_signals?.length ||
      state.top_signals?.length,
  );
}

function cachedEvidenceSignalMatchesScene(
  signal: Pick<WorldEvidenceSignal, 'scene' | 'tags' | 'alignment_tags' | 'source_name' | 'source_url' | 'title' | 'summary'> | null | undefined,
  scene: WorldScene,
) {
  if (!signal || scene === 'global') return true;
  return signalMatchesScene(
    {
      scene: signal.scene,
      alignmentTags: signal.alignment_tags || [],
      sourceName: signal.source_name || '',
      sourceUrl: signal.source_url || '',
      title: signal.title || '',
      summary: signal.summary || '',
      tags: signal.tags || [],
    },
    scene,
  );
}

function cachedNodeMatchesScene(
  node: WorldDashboardStatePayload['nodes'][number] | null | undefined,
  scene: WorldScene,
) {
  if (!node || scene === 'global') return true;
  return signalMatchesScene(
    {
      scene: node.scene,
      alignmentTags: node.alignment_tags || [],
      sourceName: node.source_name || '',
      sourceUrl: node.source_url || '',
      title: node.title || '',
      summary: node.summary || '',
      tags: node.tags || [],
    },
    scene,
  );
}

function dedupeCachedEvidenceSignals(signals: WorldEvidenceSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.id || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function dashboardTimestamp(state: WorldDashboardStatePayload | null | undefined): number {
  const timestamp = state?.generated_at ? new Date(state.generated_at).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dedupeCachedNodes(nodes: WorldDashboardStatePayload['nodes']) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = String(node.node_id || node.title || node.summary || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deriveCachedGlobalDashboardStateFromScenes(
  snapshot: WorldDashboardSnapshotPayload | null,
): WorldDashboardStatePayload | null {
  const globalState = snapshot?.states?.global || null;
  if (!globalState) return null;
  const sceneStates = [snapshot?.states?.['geo-politics-daily'], snapshot?.states?.['tech-ai']]
    .filter((state): state is WorldDashboardStatePayload => Boolean(state && isRenderableDashboardState(state)));
  if (!sceneStates.length) return globalState;

  const latestSceneTimestamp = Math.max(...sceneStates.map(dashboardTimestamp));
  if (latestSceneTimestamp <= dashboardTimestamp(globalState)) return globalState;

  const generated_at = new Date(latestSceneTimestamp).toISOString();
  const graph_signals = dedupeCachedEvidenceSignals(sceneStates.flatMap((state) => state.graph_signals || [])).slice(0, 32);
  const top_signals = dedupeCachedEvidenceSignals(sceneStates.flatMap((state) => state.top_signals || [])).slice(0, 120);
  const knowledge_signals = dedupeCachedEvidenceSignals(
    sceneStates.flatMap((state) => (state.knowledge_signals || []) as unknown as WorldEvidenceSignal[]),
  ).slice(0, 12) as unknown as WorldKnowledgeSignal[];
  const nodes = dedupeCachedNodes(sceneStates.flatMap((state) => state.nodes || [])).slice(0, 240);
  const evidenceSignals = dedupeCachedEvidenceSignals([...top_signals, ...graph_signals]);
  const mappedSignalCount = evidenceSignals.filter(
    (signal) => signal.latitude !== null && signal.longitude !== null,
  ).length;

  return {
    ...globalState,
    generated_at,
    metrics: {
      ...globalState.metrics,
      active_signal_count: evidenceSignals.length,
      mapped_signal_count: mappedSignalCount,
      hottest_region: evidenceSignals[0]?.region || globalState.metrics.hottest_region,
      least_covered_region: evidenceSignals[evidenceSignals.length - 1]?.region || globalState.metrics.least_covered_region,
    },
    nodes,
    graph_signals,
    top_signals,
    knowledge_signals,
    world_view_summary: buildDashboardWorldViewSummaryFromSignals({
      generated_at,
      top_signals,
      graph_signals,
    }),
  };
}

function deriveCachedDashboardStateForScene(
  globalState: WorldDashboardStatePayload | null,
  scene: WorldScene,
): WorldDashboardStatePayload | null {
  if (!globalState || scene === 'global') return globalState;

  const graph_signals = (globalState.graph_signals || []).filter((signal) =>
    cachedEvidenceSignalMatchesScene(signal, scene),
  );
  const top_signals = (globalState.top_signals || []).filter((signal) =>
    cachedEvidenceSignalMatchesScene(signal, scene),
  );
  const knowledge_signals = (globalState.knowledge_signals || []).filter((signal) =>
    cachedEvidenceSignalMatchesScene(signal as unknown as WorldEvidenceSignal, scene),
  );
  const nodes = (globalState.nodes || []).filter((node) => cachedNodeMatchesScene(node, scene));
  const evidenceSignals = dedupeCachedEvidenceSignals([...top_signals, ...graph_signals]);
  const mappedSignalCount = evidenceSignals.filter(
    (signal) => signal.latitude !== null && signal.longitude !== null,
  ).length;

  return {
    ...globalState,
    scene,
    metrics: {
      ...globalState.metrics,
      active_signal_count: evidenceSignals.length,
      mapped_signal_count: mappedSignalCount,
      hottest_region: evidenceSignals[0]?.region || globalState.metrics.hottest_region,
      least_covered_region: evidenceSignals[evidenceSignals.length - 1]?.region || globalState.metrics.least_covered_region,
    },
    nodes,
    graph_signals,
    top_signals,
    knowledge_signals,
    world_view_summary: buildDashboardWorldViewSummaryFromSignals({
      generated_at: globalState.generated_at,
      top_signals,
      graph_signals,
    }),
  };
}

function normalizeCachedSourceRefreshSummary(
  summary: WorldDashboardSourceRefreshSummary | null | undefined,
): WorldDashboardSourceRefreshSummary | null | undefined {
  if (!summary?.signal_mix) return summary;
  const signalMix = summary.signal_mix;
  return {
    ...summary,
    signal_mix: {
      ...signalMix,
      wechat_labeled_count:
        signalMix.wechat_count > 0
          ? Math.max(signalMix.wechat_labeled_count || 0, signalMix.wechat_count)
          : signalMix.wechat_labeled_count || 0,
    },
  };
}

async function hydrateCachedSourceRefreshSummary(
  summary: WorldDashboardSourceRefreshSummary | null | undefined,
): Promise<WorldDashboardSourceRefreshSummary | null> {
  const normalized = normalizeCachedSourceRefreshSummary(summary) || null;
  if (!normalized) return null;
  const [refreshJob, governance, skillhubSnapshot, sourceSkillSnapshot, repoDiscoverySnapshot] = await Promise.all([
    readSourceRefreshJobStatus(),
    buildSourceGovernanceState().catch(() => null),
    readSkillHubSnapshotSummary(),
    readSourceSkillSnapshotSummary(),
    getWorldRepoDiscoverySnapshotSummary(),
  ]);
  return {
    ...normalized,
    generated_at: latestIso(
      normalized.generated_at,
      governance?.generated_at,
      refreshJob?.finished_at,
      refreshJob?.started_at,
      skillhubSnapshot.last_refreshed_at,
      sourceSkillSnapshot.last_refreshed_at,
      repoDiscoverySnapshot.last_refreshed_at,
    ) || normalized.generated_at,
    skillhub_snapshot: skillhubSnapshot,
    source_skill_snapshot: sourceSkillSnapshot,
    repo_discovery_snapshot: repoDiscoverySnapshot,
    monitor_runtime: governance
      ? {
          ...normalized.monitor_runtime,
          latest_poll_finished_at: governance.latest_poll_finished_at,
          monitor_source_count: governance.monitor_source_count,
          changed_source_count: governance.changed_source_count,
          high_quality_source_count: governance.high_quality_source_count,
          recommended_source_count: governance.recommended_source_count,
          cooling_down_count: governance.cooling_down_count,
          runtime_failure_count: governance.runtime_failure_count,
        }
      : normalized.monitor_runtime,
    refresh_job: refreshJob || normalized.refresh_job,
  };
}

export async function getCachedWorldDashboardState(scene: WorldScene = 'global') {
  const snapshot = await readWorldDashboardSnapshot();
  const state =
    scene === 'global'
      ? deriveCachedGlobalDashboardStateFromScenes(snapshot)
      : snapshot?.states?.[scene] ||
        deriveCachedDashboardStateForScene(snapshot?.states?.global || null, scene);
  if (!state) return null;
  const normalizedScene = normalizeTag(scene);
  if (
    (normalizedScene === 'asean' || normalizedScene === 'southeast-asia' || normalizedScene === 'southeastasia') &&
    !(state.top_signals || []).length &&
    !(state.graph_signals || []).length &&
    !(state.knowledge_signals || []).length
  ) {
    return null;
  }
  const livebenchScene: WorldScene = 'global';
  const normalizedState: WorldDashboardStatePayload = {
    ...state,
    source_refresh_summary: await hydrateCachedSourceRefreshSummary(state.source_refresh_summary),
  };
  if (scene === 'tech-ai' || scene === 'geo-politics-daily') {
    return {
      ...normalizedState,
      scene,
      nodes:
        scene === 'geo-politics-daily'
          ? (normalizedState.nodes || []).slice(0, GEO_POLITICS_VIEW_LIMIT * 2)
          : normalizedState.nodes,
      top_signals:
        scene === 'geo-politics-daily'
          ? (normalizedState.top_signals || []).slice(0, GEO_POLITICS_FEED_LIMIT)
          : normalizedState.top_signals,
      pending_question_previews: [],
      resolved_question_previews: [],
      livebench_summary: null,
      evaluation_summary: null,
      what_to_do_next: [],
      quick_links: [],
    };
  }
  const [evaluation, sourceStatus] = await Promise.all([
    readWorldApiSnapshot<LiveBenchEvaluation>(
      livebenchScene,
      'livebench_evaluation',
      API_SNAPSHOT_MAX_AGE_MS,
    ),
    readWorldApiSnapshot<WorldSourceKnowledgeState>(
      scene,
      'source_status',
      API_SNAPSHOT_MAX_AGE_MS,
    ),
  ]);
  const sourceAlignedState: WorldDashboardStatePayload =
    sourceStatus?.source_status?.embeddings && normalizedState.livebench_summary
      ? {
          ...normalizedState,
          livebench_summary: {
            ...normalizedState.livebench_summary,
            source_status: {
              ...normalizedState.livebench_summary.source_status,
              embeddings: sourceStatus.source_status.embeddings,
            },
          },
        }
      : normalizedState;
  const evaluationAlignedState: WorldDashboardStatePayload = evaluation?.platform_model
    ? {
        ...sourceAlignedState,
        metrics: alignDashboardMetricsWithEvaluation(sourceAlignedState.metrics, evaluation.platform_model),
        evaluation_summary: evaluation.platform_model,
        livebench_summary: alignDashboardLiveBenchSummary(sourceAlignedState.livebench_summary, evaluation.platform_model),
      }
    : sourceAlignedState;
  try {
    const snapshotPreviews = await readWorldApiSnapshot<LiveBenchQuestionPreview[]>(
      livebenchScene,
      'livebench_questions',
      API_SNAPSHOT_MAX_AGE_MS,
    );
    const currentPreviews =
      snapshotPreviews?.filter((preview) => preview.status !== 'resolved') ||
      (await getCachedLiveBenchQuestionPreviews(livebenchScene));
    const resolvedPreviews =
      snapshotPreviews?.filter((preview) => preview.status === 'resolved') ||
      (await getCachedLiveBenchQuestionPreviews(livebenchScene, 'resolved'));
    const pending_question_previews = (currentPreviews || [])
      .filter((preview) => preview.status !== 'resolved')
      .slice(0, 48);
    const resolved_question_previews = (resolvedPreviews || []).slice(0, 12);
    if (pending_question_previews.length || resolved_question_previews.length) {
      return {
        ...evaluationAlignedState,
        pending_question_previews,
        resolved_question_previews,
      };
    }
  } catch {
    // Keep serving the last dashboard snapshot if the livebench cache is unavailable.
  }
  return evaluationAlignedState;
}

export async function getCachedWorldSubworlds() {
  const snapshot = await readWorldDashboardSnapshot();
  return snapshot?.subworlds || [];
}

export async function getCachedWorldLiveBenchQuestionPreviews(
  scene: WorldScene = 'global',
  status?: 'active' | 'watchlist' | 'resolved',
) {
  const storePreviews = await listLiveBenchQuestionPreviewsFromStore(scene, status);
  if (storePreviews?.length) return storePreviews;
  return (await getCachedLiveBenchQuestionPreviews(scene, status)) || [];
}

function buildOpenClawSkillEntry(requestOrigin?: string | null) {
  const publicUrl = resolvePublicSkillUrl({ fallbackOrigin: requestOrigin }) || '/api/v1/openclaw/skill.md';

    return {
      mode: 'anonymous' as const,
      title: '信源 Skill',
      description: '把这个地址交给接入方即可。主口径是过去 30 天信源查询，模型可直接查 AI 日报和信源流回答。',
      copy_hint: 'LiveBench 先作为独立入口保留；常规回答不必先走知识库。',
      url: publicUrl,
    };
}

export async function getWorldSubworlds(options?: { forceCatalogRefresh?: boolean }) {
  const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: false });
  const sourceCatalog = await loadSourceCatalog({ force: options?.forceCatalogRefresh });
  return buildWorldSubworldSummaries(signals, sourceCatalog);
}

export async function getWorldState(
  scene: WorldScene = 'global',
  options?: { forceCatalogRefresh?: boolean; requestOrigin?: string | null; allowModelRefresh?: boolean },
) {
  const allowModelRefresh = isBatchModelRefreshAllowed(options);
  const livebenchScene: WorldScene = 'global';
  const signals = await loadSignals({
    allowExpiredDiskCache: true,
    preferCached: true,
    backgroundRefresh: false,
    allowModelRefresh: false,
  });
  if (allowModelRefresh) {
    await reloadTranslatedSignals();
  }
  await primeDashboardSignalTranslations(scene, signals, allowModelRefresh);
  const localizedSignals = await materializeLocalizedSignals(signals);
  const sourceCatalog = await loadSourceCatalog({ force: options?.forceCatalogRefresh });
  const filteredSignals = localizedSignals.filter((signal) => signalMatchesScene(signal, scene));
  const scopedSignals = filteredSignals.length || scene !== 'global' ? filteredSignals : localizedSignals;
  const graphSignals = [...scopedSignals]
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime() ||
        right.severity - left.severity ||
        right.hotspotScore - left.hotspotScore,
    )
    .slice(0, 32);
  const topSignals = buildTopSignalFeed(scopedSignals);
  const knowledgeSignals = buildKnowledgeSignalFeed(scopedSignals);
  const hotspotSourceSignals = [...scopedSignals]
    .filter((signal) => signal.latitude !== null && signal.longitude !== null)
    .sort((a, b) => b.hotspotScore - a.hotspotScore)
    .slice(0, WORLD_VIEW_LIMIT);
  const explorationSourceSignals = [...scopedSignals]
    .filter((signal) => signal.latitude !== null && signal.longitude !== null)
    .sort((a, b) => b.explorationScore - a.explorationScore)
    .slice(0, WORLD_VIEW_LIMIT);
  const visibleSignalsForTranslation = Array.from(
    new Map(
      [
        ...scopedSignals.slice(0, 12),
        ...hotspotSourceSignals.slice(0, 16),
        ...explorationSourceSignals.slice(0, 12),
      ].map((signal) => [signal.id, signal]),
    ).values(),
  );
  if (allowModelRefresh) {
    void withWorldBatchModelRefresh(() => primeSignalTranslations([
      ...visibleSignalsForTranslation,
      ...scopedSignals.slice(12, 12 + TRANSLATION_PRIME_LIMIT),
    ]));
  }
  const source_knowledge: WorldSourceKnowledgeState = {
    ...(await (allowModelRefresh
      ? withLiveBenchRemoteModelRefresh(() => getWorldSourceKnowledgeState(scene, localizedSignals))
      : getWorldSourceKnowledgeState(scene, localizedSignals))),
    governance: await buildSourceGovernanceState(),
  };
  const livebench_arena: LiveBenchArenaState = toPublicLiveBenchArenaState(
    await (allowModelRefresh
      ? withLiveBenchRemoteModelRefresh(() => buildLiveBenchArenaState(livebenchScene, localizedSignals))
      : buildLiveBenchArenaState(livebenchScene, localizedSignals)),
  );
  const metrics = buildStateMetrics(scopedSignals, livebench_arena);
  const nodes = buildDashboardStateNodes(hotspotSourceSignals, explorationSourceSignals);

  return {
    generated_at: new Date().toISOString(),
    scene,
    metrics,
    source_intake_stats: getRuntimeStore().sourceIntakeStats,
    coverage_policy: {
      hotspot_ratio: HOTSPOT_RATIO,
      exploration_ratio: EXPLORATION_RATIO,
      note: '默认顺着已形成的事件脉络继续推进，同时保留覆盖补完预算。',
    },
    source_health: buildSourceHealth(sourceCatalog),
    nodes,
    graph_signals: graphSignals.map((signal) => toEvidenceSignalWithReliability(signal, sourceCatalog)),
    top_signals: topSignals.map((signal) => toEvidenceSignalWithReliability(signal, sourceCatalog)),
    knowledge_signals: knowledgeSignals,
    source_catalog: sourceCatalog,
    skill_entry: buildOpenClawSkillEntry(options?.requestOrigin),
    source_knowledge,
    livebench_arena,
  };
}

function buildDashboardStateNodes(hotspotSourceSignals: WorldSignal[], explorationSourceSignals: WorldSignal[]) {
  const hotspotNodes = hotspotSourceSignals
    .map<WorldStateNode>((signal) => {
      const localized = getLocalizedSignal(signal);
      const concreteTitle = concreteDisplayText(applyQuickTextTranslations(signal.title), 120);
      const concreteSummary = concreteDisplayText(applyQuickTextTranslations(signal.summary), 240);
      const titleNeedsFallback =
        isGenericGeneratedDisplayText(concreteTitle) ||
        isLowInformationSignalTitle(concreteTitle, concreteSummary);
      const fallbackTitle = !titleNeedsFallback
        ? concreteTitle
        : signalSummaryHeadline(concreteSummary || signal.summary);
      const displayTitle =
        (isGenericGeneratedDisplayText(localized.displayTitle) || isLowInformationSignalTitle(localized.displayTitle, concreteSummary)) && fallbackTitle
          ? fallbackTitle
          : localized.displayTitle;
      const displaySummary = isGenericGeneratedDisplayText(localized.displaySummary) && concreteSummary ? concreteSummary : localized.displaySummary;
      return ({
      node_id: signal.id,
      node_type: 'hotspot',
      geo: {
        lat: signal.latitude,
        lng: signal.longitude,
        label: signal.locationName || signal.region,
        country: signal.country,
        region: signal.region,
      },
      tags: signal.tags,
      alignment_tags: publicAlignmentTags(signal.alignmentTags),
      intensity: signal.intensity,
      mention_count: signal.mentionCount,
      urgency_reason: cleanDisplayText(signal.urgencyReason || ''),
      scene: signal.scene,
      hotspot_score: signal.hotspotScore,
      exploration_score: signal.explorationScore,
      coverage_gap: signal.coverageGap,
      severity: signal.severity,
      display_level: signal.displayLevel,
      published_at: signal.publishedAt,
      updated_at: signal.observedAt,
      source_name: signal.sourceName,
      source_url: resolveSignalSourceUrlForUi(signal),
      last_report_at: null,
      title: displayTitle,
      summary: displaySummary,
      display_title: displayTitle,
      display_summary: displaySummary,
      activities: [],
      });
    });

  const explorationNodes = explorationSourceSignals
    .map<WorldStateNode>((signal) => {
      const localized = getLocalizedSignal(signal);
      const concreteTitle = concreteDisplayText(applyQuickTextTranslations(signal.title), 120);
      const concreteSummary = concreteDisplayText(applyQuickTextTranslations(signal.summary), 240);
      const titleNeedsFallback =
        isGenericGeneratedDisplayText(concreteTitle) ||
        isLowInformationSignalTitle(concreteTitle, concreteSummary);
      const fallbackTitle = !titleNeedsFallback
        ? concreteTitle
        : signalSummaryHeadline(concreteSummary || signal.summary);
      const displayTitle =
        (isGenericGeneratedDisplayText(localized.displayTitle) || isLowInformationSignalTitle(localized.displayTitle, concreteSummary)) && fallbackTitle
          ? fallbackTitle
          : localized.displayTitle;
      const displaySummary = isGenericGeneratedDisplayText(localized.displaySummary) && concreteSummary ? concreteSummary : localized.displaySummary;
      return ({
      node_id: `${signal.id}:explore`,
      node_type: 'exploration',
      geo: {
        lat: signal.latitude,
        lng: signal.longitude,
        label: signal.locationName || signal.region,
        country: signal.country,
        region: signal.region,
      },
      tags: signal.tags,
      alignment_tags: publicAlignmentTags(signal.alignmentTags),
      intensity: signal.intensity,
      mention_count: signal.mentionCount,
      urgency_reason: cleanDisplayText(signal.urgencyReason || ''),
      scene: signal.scene,
      hotspot_score: signal.hotspotScore,
      exploration_score: signal.explorationScore,
      coverage_gap: signal.coverageGap,
      severity: signal.severity,
      display_level: signal.displayLevel,
      published_at: signal.publishedAt,
      updated_at: signal.observedAt,
      source_name: signal.sourceName,
      source_url: resolveSignalSourceUrlForUi(signal),
      last_report_at: null,
      title: displayTitle,
      summary: displaySummary,
      display_title: displayTitle,
      display_summary: displaySummary,
      activities: [],
      });
    });

  return [...hotspotNodes, ...explorationNodes];
}

function dashboardEvidenceText(signal: Pick<WorldEvidenceSignal, 'title' | 'summary' | 'display_title' | 'display_summary' | 'source_name' | 'tags' | 'alignment_tags'>) {
  return [
    signal.display_title,
    signal.title,
    signal.display_summary,
    signal.summary,
    signal.source_name,
    ...(signal.tags || []),
    ...(signal.alignment_tags || []),
  ].filter(Boolean).join(' ');
}

function dashboardEvidenceCompactKey(signal: WorldEvidenceSignal): string | null {
  const title = cleanDisplayText(signal.display_title || signal.title);
  const normalizedTitle = normalizeSignatureText(title);
  const day = (signal.published_at || '').slice(0, 10);
  const evidenceText = dashboardEvidenceText(signal);
  const entities = [...extractTermTokens(evidenceText, TECH_AI_ENTITY_TERMS)].sort();
  const topics = [...extractTermTokens(evidenceText, TECH_AI_TOPIC_TERMS)].sort();
  const isTechAi = rowLooksLikeTechAi({
    id: signal.id,
    title: signal.title,
    description: signal.summary,
    source_name: signal.source_name,
    source_url: signal.source_url,
    event_time: signal.published_at,
    created_at: signal.published_at,
    location: signal.location_name,
    country: signal.country,
    latitude: signal.latitude,
    longitude: signal.longitude,
    severity: signal.severity,
    relevance_score: signal.relevance_score,
    tags: signal.tags,
    alignment_tags: signal.alignment_tags,
    last_seen_at: signal.published_at,
  });
  const genericDisplayTitle = /有新动向|相关报道|信号更新|强度上升|风险上升/u.test(title);
  if (isTechAi && entities[0] && topics[0] && (genericDisplayTitle || normalizedTitle.length <= 34)) {
    return `ai:${day}:${entities[0]}:${topics[0]}`;
  }
  if (genericDisplayTitle && normalizedTitle) {
    return `title:${day}:${normalizedTitle}`;
  }
  return null;
}

function evidenceAuthorityScore(signal: WorldEvidenceSignal) {
  const haystack = normalizeTag(dashboardEvidenceText(signal));
  const sourceScore =
    /source:aihot|source:world-monitor/.test(haystack)
      ? 0.22
      : /source:ai-news-radar/.test(haystack)
        ? 0.14
        : /official|官网|newsroom|engineering-blog|github-releases/.test(haystack)
          ? 0.18
          : 0.08;
  return sourceScore + Number(signal.relevance_score || 0) * 0.36 + Number(signal.severity || 0) * 0.025 + Number(signal.hotspot_score || 0) * 0.12;
}

function mergeDashboardEvidenceSignals<T extends WorldEvidenceSignal>(existing: T, incoming: T): T {
  const primary = evidenceAuthorityScore(incoming) > evidenceAuthorityScore(existing) ? incoming : existing;
  const secondary = primary === incoming ? existing : incoming;
  const tags = [...new Set([...(primary.tags || []), ...(secondary.tags || [])].filter(Boolean))];
  const alignmentTags = uniqueAlignmentTags([
    'event:clustered',
    ...(primary.alignment_tags || []),
    ...(secondary.alignment_tags || []),
  ]);
  const sourceNames = [...new Set([primary.source_name, secondary.source_name].map((value) => normalizeText(value)).filter(Boolean))];
  return {
    ...primary,
    tags,
    alignment_tags: alignmentTags,
    severity: Math.max(primary.severity || 0, secondary.severity || 0) || primary.severity,
    relevance_score: Math.max(primary.relevance_score || 0, secondary.relevance_score || 0) || primary.relevance_score,
    hotspot_score: Math.max(primary.hotspot_score || 0, secondary.hotspot_score || 0) || primary.hotspot_score,
    exploration_score: Math.max(primary.exploration_score || 0, secondary.exploration_score || 0) || primary.exploration_score,
    mention_count: Math.max(primary.mention_count || 0, secondary.mention_count || 0) || primary.mention_count,
    urgency_reason: sourceNames.length > 1
      ? `${primary.urgency_reason || '同类信息已合并'}；同类报道来源：${sourceNames.slice(0, 4).join('、')}。`
      : primary.urgency_reason,
  };
}

function compactDashboardEvidenceSignals<T extends WorldEvidenceSignal>(signals: T[]): T[] {
  const byKey = new Map<string, T>();
  const passthrough: T[] = [];
  for (const signal of signals) {
    const key = dashboardEvidenceCompactKey(signal);
    if (!key) {
      passthrough.push(signal);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDashboardEvidenceSignals(existing, signal) : signal);
  }
  return [...passthrough, ...byKey.values()].sort(
    (left, right) =>
      evidenceAuthorityScore(right) - evidenceAuthorityScore(left) ||
      new Date(right.published_at).getTime() - new Date(left.published_at).getTime(),
  );
}

function buildDashboardWorldViewSummaryFromSignals(input: {
  generated_at: string;
  top_signals: WorldEvidenceSignal[];
  graph_signals: WorldEvidenceSignal[];
}) {
  const focus = input.top_signals[0] || input.graph_signals[0] || null;
  if (!focus) {
    return {
      title: '世界视图',
      summary: '当前还没有稳定的世界分布摘要，题池和最新信号会继续更新。',
      updated_at: input.generated_at,
    };
  }
  return {
    title: focus.display_title || focus.title,
    summary: focus.display_summary || focus.summary,
    updated_at: focus.published_at,
  };
}

async function buildDashboardSourceRefreshSummaryFromSignals(input: {
  signal_mix_signals: Array<{
    alignmentTags: string[];
    sourceName: string;
    sourceUrl: string;
    latitude: number | null;
    longitude: number | null;
  }>;
  monitor_runtime: Awaited<ReturnType<typeof buildSourceGovernanceState>> | null;
  next_batch_count: number;
}): Promise<WorldDashboardSourceRefreshSummary> {
  const [skillhubSnapshot, sourceSkillSnapshot, repoDiscoverySnapshot, refreshJob] = await Promise.all([
    readSkillHubSnapshotSummary(),
    readSourceSkillSnapshotSummary(),
    getWorldRepoDiscoverySnapshotSummary(),
    readSourceRefreshJobStatus(),
  ]);
  const signalMix = countSignalMix(input.signal_mix_signals);
  const generatedAt = new Date().toISOString();

  return {
    generated_at: generatedAt,
    skillhub_snapshot: skillhubSnapshot,
    source_skill_snapshot: sourceSkillSnapshot,
    repo_discovery_snapshot: repoDiscoverySnapshot,
    monitor_runtime: {
      latest_poll_finished_at: input.monitor_runtime?.latest_poll_finished_at || null,
      monitor_source_count: input.monitor_runtime?.monitor_source_count || 0,
      changed_source_count: input.monitor_runtime?.changed_source_count || 0,
      high_quality_source_count: input.monitor_runtime?.high_quality_source_count || 0,
      recommended_source_count: input.monitor_runtime?.recommended_source_count || 0,
      cooling_down_count: input.monitor_runtime?.cooling_down_count || 0,
      next_batch_count: input.next_batch_count,
      runtime_failure_count: input.monitor_runtime?.runtime_failure_count || 0,
    },
    refresh_job: refreshJob,
    signal_mix: signalMix,
  };
}

function livebenchPlatformLabel(platform: LiveQuestionPlatform) {
  const labels: Record<LiveQuestionPlatform, string> = {
    metaculus: 'Metaculus',
    manifold: 'Manifold',
    polymarket: 'Polymarket',
    internal: '内部题',
    fallback: '补位题',
  };
  return labels[platform] || platform;
}

function buildDashboardLiveBenchSummary(arena: LiveBenchArenaState | null | undefined): WorldDashboardLiveBenchSummary | null {
  if (!arena) return null;

  const snapshots = [...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions];
  const platformCounts = Array.from(
    snapshots.reduce((summary, snapshot) => {
      const platform = snapshot.question.source_platform;
      summary.set(platform, (summary.get(platform) || 0) + 1);
      return summary;
    }, new Map<LiveQuestionPlatform, number>()),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([platform, count]) => ({
      platform,
      label: livebenchPlatformLabel(platform),
      count,
    }));

  return {
    generated_at: arena.generated_at,
    window_days: arena.watchlist_window_days,
    active_question_count: arena.active_questions.length,
    watchlist_question_count: arena.watchlist_questions.length,
    open_question_count: arena.active_questions.length + arena.watchlist_questions.length,
    resolved_question_count: arena.resolved_questions.length,
    settlement_pending_count: arena.settlement_pending_count || 0,
    current_question_count: arena.active_questions.length + arena.watchlist_questions.length,
    platform_counts: platformCounts,
    source_status: {
      metaculus: arena.source_status.metaculus,
      metaforecast: arena.source_status.metaforecast,
      embeddings: arena.source_status.embeddings,
    },
    source_health: arena.source_health,
    synthetic_participant_count: getLiveBenchParticipantRoster().length,
    synthetic_refresh_minutes: 30,
    resolved_backfill_enabled: true,
  };
}

function alignDashboardLiveBenchSummary(
  summary: WorldDashboardLiveBenchSummary | null,
  platformModel: LiveBenchPlatformModelSummary | null | undefined,
): WorldDashboardLiveBenchSummary | null {
  if (!summary || !platformModel) return summary;
  return {
    ...summary,
    active_question_count: platformModel.active_question_count,
    watchlist_question_count: platformModel.watchlist_question_count ?? summary.watchlist_question_count,
    open_question_count:
      platformModel.open_question_count ??
      platformModel.current_question_count ??
      platformModel.active_question_count + (platformModel.watchlist_question_count ?? summary.watchlist_question_count),
    resolved_question_count: platformModel.resolved_question_count,
    current_question_count:
      platformModel.open_question_count ??
      platformModel.current_question_count ??
      platformModel.active_question_count + (platformModel.watchlist_question_count ?? summary.watchlist_question_count),
  };
}

function alignDashboardMetricsWithEvaluation(
  metrics: WorldStateMetrics,
  platformModel: LiveBenchPlatformModelSummary | null | undefined,
): WorldStateMetrics {
  if (!platformModel) return metrics;
  return {
    ...metrics,
    active_question_count: platformModel.active_question_count,
    resolved_question_count: platformModel.resolved_question_count,
  };
}

function buildDashboardActions(
  skillUrl: string | null,
  pendingPreviews: LiveBenchQuestionPreview[],
): WorldDashboardAction[] {
  const actions: WorldDashboardAction[] = [];
  if (pendingPreviews[0]) {
    actions.push({
      label: '看问题',
      href: pendingPreviews[0].href,
      description: '直接进入当前最值得看的判断题。',
      kind: 'primary',
      audience: 'human',
    });
  }
  actions.push({
    label: '看模型表现',
    href: '/livebench/evaluation',
    description: '查看整体预测误差、校准和单虾表现。',
    kind: 'primary',
    audience: 'human',
  });
  actions.push({
    label: '看世界视图',
    href: '#world-map-panel',
    description: '回到地图看最近信号在世界上的分布。',
    kind: 'secondary',
    audience: 'shared',
  });
  if (skillUrl) {
    actions.push({
      label: '给虾接入',
      href: skillUrl,
      description: '让虾直接接入主 skill，让信源查询和校准题池形成同一套经验。',
      kind: 'secondary',
      audience: 'agent',
    });
  }
  return actions;
}

function buildWhatToDoNext(
  pendingPreviews: LiveBenchQuestionPreview[],
  evaluation: LiveBenchEvaluation | null,
): string[] {
  const next: string[] = [];
  if (pendingPreviews[0]) {
    next.push(`当前题池重点：「${pendingPreviews[0].title}」。题目页包含主持人串讲、阵营回复和信源依据。`);
  }
  if ((evaluation?.platform_model.scored_question_count || 0) > 0) {
    next.push('模型表现页展示最近已结算题的预测误差和校准变化。');
  } else if ((evaluation?.platform_model.resolved_question_count || 0) > 0) {
    next.push('模型表现页已经有已结算题，但当前还在补齐可计分的虾票覆盖。');
  } else {
    next.push('当前已结算题还不多，先把题池里的判断闭环跑稳定。');
  }
  next.push('虾接入后，信源查询会沉淀为判断样本，并用于后续回答复盘。');
  return next;
}

export async function getWorldDashboardState(
  scene: WorldScene = 'global',
  options?: { forceCatalogRefresh?: boolean; requestOrigin?: string | null; allowModelRefresh?: boolean; forceSignalRefresh?: boolean },
) {
  const allowModelRefresh = isBatchModelRefreshAllowed(options);
  const livebenchScene: WorldScene = 'global';
  const isTechAiScene = scene === 'tech-ai';
  const isGeoPoliticsScene = scene === 'geo-politics-daily';
  const skipLiveBenchForScene = isTechAiScene || isGeoPoliticsScene;
  const skipOperationalSummariesForScene = isTechAiScene;
  const mapSignalLimit = isGeoPoliticsScene ? GEO_POLITICS_VIEW_LIMIT : WORLD_VIEW_LIMIT;
  const generated_at = new Date().toISOString();
  const signals = await loadSignals({
    allowExpiredDiskCache: true,
    preferCached: true,
    backgroundRefresh: false,
    allowModelRefresh: false,
    forceRefresh: options?.forceSignalRefresh,
  });
  const candidateSignals = isTechAiScene ? signals.filter((signal) => signalMatchesScene(signal, scene)) : signals;
  if (allowModelRefresh) {
    await reloadTranslatedSignals();
  }
  await primeDashboardSignalTranslations(scene, candidateSignals, allowModelRefresh);
  let localizedSignals = await materializeLocalizedSignals(candidateSignals);
  let filteredSignals = isTechAiScene ? localizedSignals : localizedSignals.filter((signal) => signalMatchesScene(signal, scene));
  let scopedSignals = filteredSignals.length || scene !== 'global' ? filteredSignals : localizedSignals;
  let timelineEventSignals = selectTimelineEventSignals(scopedSignals);
  let topSignals = buildTopSignalFeed(timelineEventSignals).slice(
    0,
    isGeoPoliticsScene ? GEO_POLITICS_FEED_LIMIT : WORLD_VIEW_LIMIT,
  );
  if (allowModelRefresh) {
    await withWorldBatchModelRefresh(() => primeSignalTranslations(topSignals.slice(0, DASHBOARD_TRANSLATION_SYNC_LIMIT)));
    localizedSignals = await materializeLocalizedSignals(candidateSignals);
    filteredSignals = isTechAiScene ? localizedSignals : localizedSignals.filter((signal) => signalMatchesScene(signal, scene));
    scopedSignals = filteredSignals.length || scene !== 'global' ? filteredSignals : localizedSignals;
    timelineEventSignals = selectTimelineEventSignals(scopedSignals);
    topSignals = buildTopSignalFeed(timelineEventSignals).slice(
      0,
      isGeoPoliticsScene ? GEO_POLITICS_FEED_LIMIT : WORLD_VIEW_LIMIT,
    );
  }
  const graphSignals = [...timelineEventSignals]
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime() ||
        right.severity - left.severity ||
        right.hotspotScore - left.hotspotScore,
    )
    .slice(0, 32);
  const knowledgeSignals = buildKnowledgeSignalFeed(scopedSignals);
  const mapCandidateSignals = timelineEventSignals.filter((signal) => signal.latitude !== null && signal.longitude !== null);
  const mapSourceSignals = mapCandidateSignals.length > 0
    ? mapCandidateSignals
    : scopedSignals.filter((signal) => signal.latitude !== null && signal.longitude !== null && !isCatalogSourceSnapshotSignal(signal));
  const hotspotSourceSignals = isTechAiScene
    ? []
    : [...mapSourceSignals]
        .sort((a, b) => b.hotspotScore - a.hotspotScore)
        .slice(0, mapSignalLimit);
  const explorationSourceSignals = isTechAiScene
    ? []
    : [...mapSourceSignals]
        .sort((a, b) => b.explorationScore - a.explorationScore)
        .slice(0, mapSignalLimit);
  const visibleSignalsForTranslation = Array.from(
    new Map(
      [
        ...scopedSignals.slice(0, 12),
        ...hotspotSourceSignals.slice(0, 16),
        ...explorationSourceSignals.slice(0, 12),
      ].map((signal) => [signal.id, signal]),
    ).values(),
  );
  if (allowModelRefresh) {
    void withWorldBatchModelRefresh(() => primeSignalTranslations([
      ...visibleSignalsForTranslation,
      ...scopedSignals.slice(12, 12 + TRANSLATION_PRIME_LIMIT),
    ]));
  }

  const sourceCatalogPromise: Promise<WorldSourceCatalog | null> = isTechAiScene
    ? Promise.resolve(null)
    : Promise.race([
        loadSourceCatalog({ force: options?.forceCatalogRefresh }).catch(() => null),
        sleep(1200).then<WorldSourceCatalog | null>(() => null),
      ]);

  const dashboardEvaluationPromise: Promise<LiveBenchEvaluation | null> = skipLiveBenchForScene
    ? Promise.resolve(null)
    : Promise.race([
        getLiveBenchEvaluationFromStore(livebenchScene).catch(() => null),
        sleep(8000).then<LiveBenchEvaluation | null>(() => null),
      ]);

  const arenaPromise: Promise<ReturnType<typeof toPublicLiveBenchArenaState> | null> = skipLiveBenchForScene
    ? Promise.resolve(null)
    : Promise.race([
        (allowModelRefresh
          ? withLiveBenchRemoteModelRefresh(() => buildLiveBenchArenaState(livebenchScene, localizedSignals))
          : buildLiveBenchArenaState(livebenchScene, localizedSignals)
        )
          .then((value) => toPublicLiveBenchArenaState(value))
          .catch(() => null),
        sleep(allowModelRefresh ? 20000 : 5000).then<null>(() => null),
      ]);

  const [arena, sourceCatalog, monitorRuntime, dashboardEvaluation] = await Promise.all([
    arenaPromise,
    sourceCatalogPromise,
    skipOperationalSummariesForScene
      ? Promise.resolve(null)
      : Promise.race([
          buildSourceGovernanceState().catch(() => null),
          sleep(1500).then<null>(() => null),
        ]),
    dashboardEvaluationPromise,
  ]);
  const subworlds = buildWorldSubworldSummaries(localizedSignals, sourceCatalog);

  const arenaEvaluation = arena ? buildLiveBenchEvaluationFromArena(livebenchScene, arena) : null;
  const evaluation = dashboardEvaluation || arenaEvaluation;
  const metrics = alignDashboardMetricsWithEvaluation(
    buildStateMetrics(scopedSignals, arena),
    evaluation?.platform_model,
  );
  const nodes = buildDashboardStateNodes(hotspotSourceSignals, explorationSourceSignals);
  let graphSignalFeed = compactDashboardEvidenceSignals(graphSignals.map((signal) =>
    sourceCatalog ? toEvidenceSignalWithReliability(signal, sourceCatalog) : toEvidenceSignal(signal),
  ));
  let topSignalFeed = compactDashboardEvidenceSignals(topSignals.map((signal) =>
    sourceCatalog ? toEvidenceSignalWithReliability(signal, sourceCatalog) : toEvidenceSignal(signal),
  ));
  let compactKnowledgeSignals = compactDashboardEvidenceSignals(knowledgeSignals);
  const seenPublicSignalKeys = new Set<string>();
  const keepPublicSignalOnce = (signal: WorldEvidenceSignal) => {
    const key = dashboardEvidenceCompactKey(signal) || `id:${signal.id}`;
    if (seenPublicSignalKeys.has(key)) return false;
    seenPublicSignalKeys.add(key);
    return true;
  };
  topSignalFeed = topSignalFeed.filter(keepPublicSignalOnce);
  graphSignalFeed = graphSignalFeed.filter(keepPublicSignalOnce);
  compactKnowledgeSignals = compactKnowledgeSignals.filter(keepPublicSignalOnce);
  const pending_question_previews = skipLiveBenchForScene
    ? []
    : arena
      ? [...arena.active_questions, ...arena.watchlist_questions]
        .map((snapshot) => buildLiveBenchQuestionPreviewFromSnapshot(snapshot))
        .slice(0, 48)
      : [];
  const resolved_question_previews = skipLiveBenchForScene
    ? []
    : arena
      ? arena.resolved_questions.map((snapshot) => buildLiveBenchQuestionPreviewFromSnapshot(snapshot)).slice(0, 12)
      : [];
  const skill_entry = buildOpenClawSkillEntry(options?.requestOrigin);
  const skillUrl = skill_entry?.url || null;
  const source_refresh_summary = skipOperationalSummariesForScene
    ? null
    : await Promise.race([
        buildDashboardSourceRefreshSummaryFromSignals({
          signal_mix_signals: scopedSignals.map((signal) => ({
            alignmentTags: signal.alignmentTags,
            sourceName: signal.sourceName,
            sourceUrl: resolveSignalSourceUrlForUi(signal),
            latitude: signal.latitude,
            longitude: signal.longitude,
          })),
          monitor_runtime: monitorRuntime,
          next_batch_count: sourceCatalog?.intake_summary?.next_batch?.length || 0,
        }),
        sleep(3000).then<null>(() => null),
      ]);
  const livebench_summary = skipLiveBenchForScene
    ? null
    : alignDashboardLiveBenchSummary(
        buildDashboardLiveBenchSummary(arena),
        evaluation?.platform_model,
      );
  const state: WorldDashboardStatePayload = {
    generated_at,
    scene,
    metrics,
    source_health: buildSourceHealth(sourceCatalog),
    nodes,
    graph_signals: graphSignalFeed,
    top_signals: topSignalFeed,
    knowledge_signals: compactKnowledgeSignals,
    skill_entry,
    dashboard_kind: 'world-dashboard',
    world_view_summary: buildDashboardWorldViewSummaryFromSignals({
      generated_at,
      top_signals: topSignalFeed,
      graph_signals: graphSignalFeed,
    }),
    pending_question_previews,
    resolved_question_previews,
    evaluation_summary: evaluation?.platform_model || null,
    source_refresh_summary,
    livebench_summary,
    what_to_do_next: skipLiveBenchForScene ? [] : buildWhatToDoNext(pending_question_previews, evaluation),
    quick_links: skipLiveBenchForScene ? [] : buildDashboardActions(skillUrl, pending_question_previews),
  };
  await persistWorldDashboardSnapshot(scene, state, subworlds);
  return state;
}

async function getWorldBriefing(scene: WorldScene = 'global', mode?: MissionMode, xiaId?: string): Promise<WorldBriefing> {
  const runtime = getRuntimeStore();
  await ensureRuntimeHistoryLoaded();
  pruneStoredMissions(runtime);
  pruneXiaTrails(runtime);
  const signals = await loadSignals();
  const observerId = resolveObserverId(xiaId);
  const selectedMode = mode || (Math.random() < HOTSPOT_RATIO ? 'hotspot' : 'exploration');
  void primeSignalTranslations(
    [...signals]
      .sort((left, right) => scoreCandidate(right, selectedMode, observerId) - scoreCandidate(left, selectedMode, observerId))
      .slice(0, TRANSLATION_PRIME_LIMIT),
  );
  const candidate = chooseCandidate(signals, selectedMode, scene, observerId);
  const sourceCatalog = await loadSourceCatalog().catch(() => null);
  const recommendedBundles = buildRecommendedBundlesForScene(scene, sourceCatalog);

  if (!candidate) {
    throw new Error('No suitable world signal available for briefing');
  }

  const missionId = `mission_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const localized = localizeSignalForCoverage(candidate);
  const previousSignal = getPreviousSignalForXia(observerId, signals);
  const hop = buildHopDescriptor(previousSignal, candidate, selectedMode);
  const questionNow = buildConcreteReportQuestion(candidate, localized.topicLabel, candidate.locationName || candidate.region, 0);
  const whyHere = buildDispatchReason(candidate, selectedMode, observerId);
  const whatChangesMyMind = buildConcreteOutlook(candidate, candidate.locationName || candidate.region, buildProjection(candidate, 0));
  const handoffToNextAgent = buildHandoffToNextAgent(candidate, buildWatchNext(candidate));
  const briefing: WorldBriefing = {
    mission_id: missionId,
    xia_id: observerId,
    mode: selectedMode,
    scene: candidate.scene,
    region: candidate.region,
    topic: buildTopic(candidate),
    topic_label: localized.topicLabel,
    priority_score: Number(
      scoreCandidate(candidate, selectedMode, observerId).toFixed(2),
    ),
    dispatch_reason: buildDispatchReason(candidate, selectedMode, observerId),
    next_hop_reason: hop.reason,
    next_hop_label: hop.label,
    next_hop_confidence: hop.confidence,
    previous_signal_id: previousSignal?.id || null,
    question_now: questionNow,
    why_here: whyHere,
    what_changes_my_mind: whatChangesMyMind,
    handoff_to_next_agent: handoffToNextAgent,
    for_your_human: [
      `这次我看的是：${candidate.region} 的 ${localized.topicLabel} 线索。`,
      `为什么现在值得看：${whyHere}`,
      `接下来盯什么：${buildWatchNext(candidate)}`,
      ...(recommendedBundles.length
        ? [
            `推荐可顺带看的信源包：${recommendedBundles
              .map((bundle) => `${bundle.name}（${bundle.note}，${bundle.source_count} 条）`)
              .join('；')}`,
          ]
        : []),
    ].join('\n'),
    source_health: buildSourceHealth(sourceCatalog),
    recommended_bundles: recommendedBundles,
    pending_reference_reports: buildPendingReferenceReports(
      {
        mission_id: missionId,
        xia_id: observerId,
        scene: candidate.scene,
        region: candidate.region,
        topic: buildTopic(candidate),
      },
      candidate,
      runtime.reports,
    ),
    evidence_signals: [toEvidenceSignalWithReliability(candidate, sourceCatalog)],
  };

  runtime.missions.set(missionId, {
    briefing,
    createdAt: Date.now(),
  });
  await persistRuntimeHistory(runtime);
  return briefing;
}

type MonitorSummarySource = {
  skill?: string;
  source_name?: string;
  scene?: string;
  admission_tier?: string;
  success_rate?: number;
  quality_score?: number;
  recommendation?: string;
  avg_latency_ms?: number;
  last_checked_at?: string;
};

type MonitorSummaryPayload = {
  generated_at?: string;
  cycle_count?: number;
  source_count?: number;
  changed_source_count?: number;
  high_quality_source_count?: number;
  recommended_source_count?: number;
  latest_poll_finished_at?: string;
  sources?: MonitorSummarySource[];
};

function formatHealthTimestamp(value?: number) {
  return value && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

function parseRuntimeHealthKey(key: string): { label: string; source_kind: 'catalog' | 'selected' | 'public-anchor' } {
  if (key.startsWith('catalog:')) {
    const parts = key.split(':');
    const label = parts.length >= 3 ? `${parts[1]} / ${parts.slice(2).join(':')}` : key;
    return { label, source_kind: 'catalog' };
  }
  return {
    label: key.replace(/^public-anchor:/, ''),
    source_kind: key.startsWith('public-anchor:') ? 'public-anchor' : 'selected',
  };
}

async function readMonitorSummary(): Promise<MonitorSummaryPayload | null> {
  try {
    const raw = await fs.readFile(MONITOR_SUMMARY_FILE, 'utf-8');
    return JSON.parse(raw) as MonitorSummaryPayload;
  } catch {
    return null;
  }
}

async function readFileLastModifiedIso(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

async function readSourceRefreshJobStatus(): Promise<WorldDashboardSourceRefreshSummary['refresh_job'] | undefined> {
  try {
    const raw = await fs.readFile(SOURCE_REFRESH_STATUS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<NonNullable<WorldDashboardSourceRefreshSummary['refresh_job']>> & {
      directory_candidate_refresh?: { ok?: boolean };
      world_cache_refresh?: { ok?: boolean; degraded?: boolean; base_url?: string };
      self_healing?: { ok?: boolean; notes?: unknown[] };
      world_base_url?: string;
    };
    return {
      started_at: typeof parsed.started_at === 'string' ? parsed.started_at : null,
      finished_at: typeof parsed.finished_at === 'string' ? parsed.finished_at : null,
      running: Boolean(parsed.running),
      ok: Boolean(parsed.ok),
      timed_out: Boolean(parsed.timed_out),
      duration_ms: typeof parsed.duration_ms === 'number' ? parsed.duration_ms : null,
      directory_ok: typeof parsed.directory_candidate_refresh?.ok === 'boolean' ? parsed.directory_candidate_refresh.ok : null,
      world_cache_ok: typeof parsed.world_cache_refresh?.ok === 'boolean' ? parsed.world_cache_refresh.ok : null,
      world_cache_degraded: Boolean(parsed.world_cache_refresh?.degraded),
      world_cache_base_url: normalizeText(parsed.world_cache_refresh?.base_url || parsed.world_base_url || ''),
      self_healing_ok: typeof parsed.self_healing?.ok === 'boolean' ? parsed.self_healing.ok : null,
      note_count: Array.isArray(parsed.self_healing?.notes) ? parsed.self_healing.notes.length : 0,
    };
  } catch {
    return undefined;
  }
}

function latestIso(...values: Array<string | null | undefined>) {
  let latest = 0;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > latest) latest = time;
  }
  return latest > 0 ? new Date(latest).toISOString() : null;
}

async function readLatestMatchingFileLastModifiedIso(dirPath: string, pattern: RegExp) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  let latest = 0;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map(async (entry) => {
        const stat = await fs.stat(path.join(dirPath, entry.name)).catch(() => null);
        if (stat && stat.mtimeMs > latest) latest = stat.mtimeMs;
      }),
  );
  return latest > 0 ? new Date(latest).toISOString() : null;
}

async function readDirectoryLatestModifiedIso(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  let latest = 0;
  await Promise.all(
    entries.map(async (entry) => {
      const stat = await fs.stat(path.join(dirPath, entry.name)).catch(() => null);
      if (stat && stat.mtimeMs > latest) latest = stat.mtimeMs;
    }),
  );
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function parseMarkdownTableRows(markdown: string, heading: string): string[][] {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) return [];
  const lines = markdown.slice(headingIndex).split(/\r?\n/);
  const tableStart = lines.findIndex((line) => line.trim().startsWith('|'));
  if (tableStart === -1) return [];

  const rows: string[][] = [];
  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

function readMarkdownBullets(markdown: string, heading: string, limit = 2): string[] {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) return [];
  const lines = markdown.slice(headingIndex).split(/\r?\n/).slice(1);
  const bullets: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (bullets.length > 0) break;
      continue;
    }
    if (!line.startsWith('- ')) {
      if (bullets.length > 0) break;
      continue;
    }
    bullets.push(line.replace(/^- /, '').trim());
    if (bullets.length >= limit) break;
  }
  return bullets;
}

async function readSkillHubSnapshotSummary() {
  const [indexRefreshedAt, probeRefreshedAt, markdown] = await Promise.all([
    readFileLastModifiedIso(SKILL_AGGREGATOR_INDEX_FILE),
    readLatestMatchingFileLastModifiedIso(SOURCE_SKILL_VALIDATION_DIR, /^probe-\d{4}-\d{2}-\d{2}-hub-index-health\.json$/),
    fs.readFile(SKILL_AGGREGATOR_INDEX_FILE, 'utf-8').catch(() => ''),
  ]);
  const bullets = markdown ? readMarkdownBullets(markdown, '## 当前判断', 2) : [];
  const summary = bullets[0] || 'SkillHub 入口总表当前可用，但还需要继续沿着目录尾部补漏。';
  const stage = /尾部补漏/.test(summary) ? '尾部补漏' : /新增/.test(summary) ? '持续扩表' : '待复核';
  return {
    last_refreshed_at: latestIso(probeRefreshedAt, indexRefreshedAt),
    stage,
    summary,
  };
}

async function readSourceSkillSnapshotSummary() {
  const [candidateRefreshedAt, coverageRefreshedAt, connectivityRefreshedAt, markdown] = await Promise.all([
    readFileLastModifiedIso(SOURCE_SKILL_CANDIDATES_FILE),
    readLatestMatchingFileLastModifiedIso(SOURCE_SKILL_VALIDATION_DIR, /^probe-\d{4}-\d{2}-\d{2}-source-coverage\.json$/),
    readLatestMatchingFileLastModifiedIso(SOURCE_SKILL_VALIDATION_DIR, /^probe-\d{4}-\d{2}-\d{2}-source-connectivity\.json$/),
    fs.readFile(SOURCE_SKILL_CANDIDATES_FILE, 'utf-8').catch(() => ''),
  ]);
  const rows = markdown ? parseMarkdownTableRows(markdown, '## 按 Hub 挂载扫描执行状态') : [];
  const scannedHubCount = rows.length;
  const activeHubCount = rows.filter((row) => Number(row[2] || 0) > 0).length;
  const yieldedSkillCount = rows.reduce((sum, row) => sum + Number(row[2] || 0), 0);
  return {
    last_refreshed_at: latestIso(coverageRefreshedAt, connectivityRefreshedAt, candidateRefreshedAt),
    scanned_hub_count: scannedHubCount,
    active_hub_count: activeHubCount,
    yielded_skill_count: yieldedSkillCount,
  };
}

type DirectoryCandidateEntry = {
  collection?: string;
  admission?: string;
  description?: string;
  url?: string;
};

type DirectoryCandidatePayload = {
  generated_at?: string;
  total?: number;
  by_collection?: Record<string, number>;
  by_role?: Record<string, number>;
  candidates?: DirectoryCandidateEntry[];
};

function isRssDirectoryCandidate(candidate: DirectoryCandidateEntry) {
  return candidate.admission === 'candidate-rss' || candidate.collection === 'awesome-rss-feeds';
}

function rssCandidateUrlSet(payload: DirectoryCandidatePayload | null) {
  return new Set(
    (payload?.candidates || [])
      .filter(isRssDirectoryCandidate)
      .map((candidate) => normalizeText(candidate.url).toLowerCase())
      .filter(Boolean),
  );
}

async function readPreviousDirectoryCandidatePayload(currentDate: string | null): Promise<DirectoryCandidatePayload | null> {
  const entries = await fs.readdir(SOURCE_SKILL_VALIDATION_DIR, { withFileTypes: true }).catch(() => []);
  const datedFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^directory-candidates-(\d{4}-\d{2}-\d{2})\.json$/);
      return match ? { file: entry.name, date: match[1] } : null;
    })
    .filter((entry): entry is { file: string; date: string } => Boolean(entry))
    .filter((entry) => !currentDate || entry.date < currentDate)
    .sort((left, right) => right.date.localeCompare(left.date));
  const previous = datedFiles[0];
  if (!previous) return null;
  const raw = await fs.readFile(path.join(SOURCE_SKILL_VALIDATION_DIR, previous.file), 'utf-8').catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DirectoryCandidatePayload;
  } catch {
    return null;
  }
}

export async function getWorldRepoDiscoverySnapshotSummary() {
  const directoryCandidatesFile = path.join(SOURCE_SKILL_VALIDATION_DIR, 'latest-directory-candidates.json');
  const [candidateRefreshedAt, repoRefreshedAt, directoryCandidateRefreshedAt, markdown, repoEntries, directoryRaw] = await Promise.all([
    readFileLastModifiedIso(SOURCE_SKILL_CANDIDATES_FILE),
    readDirectoryLatestModifiedIso(EXTERNAL_REPOS_DIR),
    readFileLastModifiedIso(directoryCandidatesFile),
    fs.readFile(SOURCE_SKILL_CANDIDATES_FILE, 'utf-8').catch(() => ''),
    fs.readdir(EXTERNAL_REPOS_DIR, { withFileTypes: true }).catch(() => []),
    fs.readFile(directoryCandidatesFile, 'utf-8').catch(() => ''),
  ]);
  let directoryPayload: DirectoryCandidatePayload | null = null;
  try {
    directoryPayload = directoryRaw
      ? (JSON.parse(directoryRaw) as DirectoryCandidatePayload)
      : null;
  } catch {
    directoryPayload = null;
  }
  const currentDirectoryDate = directoryPayload?.generated_at ? directoryPayload.generated_at.slice(0, 10) : null;
  const previousDirectoryPayload = await readPreviousDirectoryCandidatePayload(currentDirectoryDate);
  const rssCandidates = rssCandidateUrlSet(directoryPayload);
  const previousRssCandidates = rssCandidateUrlSet(previousDirectoryPayload);
  const rssAddedCount = [...rssCandidates].filter((url) => !previousRssCandidates.has(url)).length;
  const rssRemovedCount = [...previousRssCandidates].filter((url) => !rssCandidates.has(url)).length;
  const githubCandidateCount = markdown
    ? markdown
        .split(/\r?\n/)
        .filter((line) => /^\|\s*[^|]+/.test(line))
        .filter((line) => /github/i.test(line))
        .length
    : 0;
  const localRepoNames = repoEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name.toLowerCase());
  const trendradarReady = localRepoNames.some((name) => name.includes('trendradar'));
  const directoryCandidateCount = Number(directoryPayload?.total || 0);
  const endpointCandidateCount =
    Number(directoryPayload?.by_role?.['market-signal'] || 0) +
    Number(directoryPayload?.by_role?.['macro-regulatory'] || 0) +
    Number(directoryPayload?.by_role?.['world-context'] || 0) +
    Number(directoryPayload?.by_role?.['hotspot-discovery'] || 0);
  const methodCandidateCount =
    Number(directoryPayload?.by_role?.['agent-workflow'] || 0) +
    Number(directoryPayload?.by_role?.['method-reference'] || 0);
  const summary = trendradarReady
    ? `GitHub 仓库发现层已落地，TrendRadar / newsnow 可作为热点与 RSS 聚合样例；目录拆解新增 ${directoryCandidateCount || 0} 条候选。`
    : 'GitHub 仓库发现层已登记候选，TrendRadar 本地样例待补。';
  return {
    last_refreshed_at: latestIso(directoryCandidateRefreshedAt, repoRefreshedAt, candidateRefreshedAt),
    local_repo_count: localRepoNames.length,
    github_candidate_count: githubCandidateCount,
    directory_candidate_count: directoryCandidateCount,
    rss_candidate_count: rssCandidates.size || Number(directoryPayload?.by_collection?.['awesome-rss-feeds'] || 0),
    rss_added_count: rssAddedCount,
    rss_removed_count: rssRemovedCount,
    endpoint_candidate_count: endpointCandidateCount,
    method_candidate_count: methodCandidateCount,
    trendradar_ready: trendradarReady,
    summary,
  };
}

function countSignalMix(
  signals: Array<{
    alignmentTags: string[];
    sourceName: string;
    sourceUrl: string;
    latitude: number | null;
    longitude: number | null;
  }>,
) {
  return signals.reduce(
    (summary, signal) => {
      const hasWorldMonitorTag =
        signal.alignmentTags.includes('source:world-monitor') || /world monitor/i.test(signal.sourceName);
      const hasMiniMaxTag =
        signal.alignmentTags.includes('model:ai-related') || signal.alignmentTags.includes('model:not-ai-related');
      const hasWechatSource =
        signal.alignmentTags.includes('source:wechat') ||
        /mp\.weixin\.qq\.com|weixin|wechat/i.test(signal.sourceUrl) ||
        /微信|公众号|weixin|wechat/i.test(signal.sourceName);
      if (hasWorldMonitorTag) summary.world_monitor_count += 1;
      if (hasMiniMaxTag) summary.minimax_labeled_count += 1;
      if (hasWechatSource) summary.wechat_count += 1;
      if (hasWechatSource) summary.wechat_labeled_count += 1;
      if (signal.latitude !== null && signal.longitude !== null) summary.mapped_signal_count += 1;
      summary.total_signal_count += 1;
      return summary;
    },
    {
      total_signal_count: 0,
      mapped_signal_count: 0,
      world_monitor_count: 0,
      minimax_labeled_count: 0,
      wechat_count: 0,
      wechat_labeled_count: 0,
    },
  );
}

async function buildSourceGovernanceState() {
  const runtime = getRuntimeStore();
  const now = Date.now();
  const allHealthEntries = [
    ...Array.from(runtime.selectedSourceHealth.entries()),
    ...Array.from(runtime.publicAnchorHealth.entries()).map(([key, value]) => [`public-anchor:${key}`, value] as const),
  ]
    .map(([key, value]) => {
      const parsed = parseRuntimeHealthKey(key);
      return {
        key,
        label: parsed.label,
        source_kind: parsed.source_kind,
        fail_count: value.failCount || 0,
        cooldown_until: formatHealthTimestamp(value.cooldownUntil),
        cooldown_ts: value.cooldownUntil || 0,
        last_error: value.lastError || '',
        last_failed_at: formatHealthTimestamp(value.lastFailedAt),
        last_failed_ts: value.lastFailedAt || 0,
        last_succeeded_at: formatHealthTimestamp(value.lastSucceededAt),
      };
    })
    .filter((entry) => entry.fail_count > 0 || entry.last_failed_ts > 0 || entry.cooldown_ts > now);

  const recent_runtime_failures = [...allHealthEntries]
    .filter((entry) => entry.last_failed_ts > 0)
    .sort((left, right) => right.last_failed_ts - left.last_failed_ts || right.fail_count - left.fail_count)
    .slice(0, 12)
    .map(({ cooldown_ts: _cooldownTs, last_failed_ts: _lastFailedTs, ...entry }) => entry);

  const cooling_down_sources = [...allHealthEntries]
    .filter((entry) => entry.cooldown_ts > now)
    .sort((left, right) => right.cooldown_ts - left.cooldown_ts || right.fail_count - left.fail_count)
    .slice(0, 12)
    .map(({ cooldown_ts: _cooldownTs, last_failed_ts: _lastFailedTs, ...entry }) => entry);

  const [monitorSummary, sourceRefreshJob, monitorSummaryModifiedAt, sourceRefreshStatusModifiedAt] = await Promise.all([
    readMonitorSummary(),
    readSourceRefreshJobStatus(),
    readFileLastModifiedIso(MONITOR_SUMMARY_FILE),
    readFileLastModifiedIso(SOURCE_REFRESH_STATUS_FILE),
  ]);
  const recommended_sources = [...(monitorSummary?.sources || [])]
    .filter((item) => typeof item.quality_score === 'number' && item.quality_score >= 70)
    .sort(
      (left, right) =>
        Number(right.quality_score || 0) - Number(left.quality_score || 0) ||
        Number(right.success_rate || 0) - Number(left.success_rate || 0) ||
        Number(left.avg_latency_ms || Number.POSITIVE_INFINITY) - Number(right.avg_latency_ms || Number.POSITIVE_INFINITY),
    )
    .slice(0, 10)
    .map((item) => ({
      skill: item.skill || 'unknown',
      source_name: item.source_name || 'unknown source',
      scene: item.scene || 'global',
      admission_tier: item.admission_tier || 'context',
      success_rate: Number(item.success_rate || 0),
      quality_score: Number(item.quality_score || 0),
      recommendation: item.recommendation || '继续观察',
      avg_latency_ms: Number(item.avg_latency_ms || 0),
      last_checked_at: item.last_checked_at || null,
    }));

  return {
    generated_at: new Date().toISOString(),
    runtime_failure_count: recent_runtime_failures.length,
    cooling_down_count: cooling_down_sources.length,
    monitor_source_count: Number(monitorSummary?.source_count || 0),
    changed_source_count: Number(monitorSummary?.changed_source_count || 0),
    high_quality_source_count: Number(monitorSummary?.high_quality_source_count || 0),
    recommended_source_count: Number(monitorSummary?.recommended_source_count || 0),
    latest_poll_finished_at: latestIso(
      monitorSummary?.latest_poll_finished_at || null,
      monitorSummaryModifiedAt,
      sourceRefreshJob?.finished_at || null,
      sourceRefreshStatusModifiedAt,
    ),
    recent_runtime_failures,
    cooling_down_sources,
    recommended_sources,
  };
}

async function _dispatchWorldMission(scene: WorldScene = 'global', mode?: MissionMode) {
  const runtime = getRuntimeStore();
  await ensureRuntimeHistoryLoaded();
  const briefing = await getWorldBriefing(scene, mode);
  const signals = await loadSignals();
  const matched = signals.find((signal) => signal.id === briefing.evidence_signals[0]?.id);

  if (matched) {
    updateDispatchHistory(matched);
    updateXiaTrail(briefing.xia_id, matched);
  }
  await persistRuntimeHistory(runtime);

  return {
    ok: true,
    briefing,
    dispatch_policy: {
      mode: briefing.mode,
      hotspot_ratio: HOTSPOT_RATIO,
      exploration_ratio: EXPLORATION_RATIO,
    },
  };
}

async function _continueWorldMission(
  briefing?: WorldBriefing,
  missionId?: string,
  scene: WorldScene = 'global',
  mode?: MissionMode,
  xiaId?: string,
) {
  const runtime = getRuntimeStore();
  await ensureRuntimeHistoryLoaded();
  pruneStoredMissions(runtime);
  pruneXiaTrails(runtime);

  let resolvedBriefing: WorldBriefing;
  const observerId = resolveObserverId(xiaId || briefing?.xia_id);

  if (briefing) {
    resolvedBriefing = {
      ...briefing,
      xia_id: observerId,
    };
    // Save the mission to the store
    runtime.missions.set(resolvedBriefing.mission_id, {
      briefing: resolvedBriefing,
      createdAt: Date.now(),
    });
  } else if (missionId && runtime.missions.get(missionId)?.briefing) {
    resolvedBriefing = {
      ...runtime.missions.get(missionId)!.briefing,
      xia_id: observerId,
    };
  } else {
    resolvedBriefing = await getWorldBriefing(scene, mode, observerId);
  }

  const signals = await loadSignals();
  const matched = signals.find((signal) => signal.id === resolvedBriefing.evidence_signals[0]?.id);

  if (matched) {
    updateDispatchHistory(matched);
    updateXiaTrail(observerId || resolvedBriefing.xia_id, matched);
  }
  await persistRuntimeHistory(runtime);

  return {
    ok: true,
    briefing: resolvedBriefing,
    dispatch_policy: {
      mode: resolvedBriefing.mode,
      hotspot_ratio: HOTSPOT_RATIO,
      exploration_ratio: EXPLORATION_RATIO,
    },
  };
}

async function _createWorldReport(
  briefing?: WorldBriefing,
  missionId?: string,
  draft?: ReportDraftInput,
  validationUpdates?: ValidationUpdateInput[],
) {
  const runtime = getRuntimeStore();
  await ensureRuntimeHistoryLoaded();
  pruneStoredReports(runtime);
  pruneStoredMissions(runtime);
  pruneXiaTrails(runtime);
  const resolvedBriefing = briefing || (missionId ? runtime.missions.get(missionId)?.briefing : undefined);

  if (!resolvedBriefing) {
    throw new Error('Mission briefing not found');
  }

  const fallbackSignal = materializeSignalFromEvidence(resolvedBriefing);
  let selectedSignal = fallbackSignal;
  const priorReports = runtime.reports;
  const sourceCatalog = await loadSourceCatalog().catch(() => null);

  try {
    const signals = await loadSignals();
    selectedSignal =
      signals.find((signal) => signal.id === resolvedBriefing.evidence_signals[0]?.id) ||
      fallbackSignal;
  } catch (error) {
    console.warn(
      '[createWorldReport] Falling back to briefing evidence because live signal refresh failed:',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!selectedSignal) {
    throw new Error('Evidence signal not found');
  }

  const report = mergeReportDraft(buildReport(resolvedBriefing, selectedSignal, priorReports), draft);
  report.xia_id = resolveObserverId(report.xia_id || resolvedBriefing.xia_id);
  report.validation_target_report_ids =
    Array.isArray(report.validation_target_report_ids) && report.validation_target_report_ids.length > 0
      ? report.validation_target_report_ids
      : validationUpdates?.map((item) => item.report_id).filter(Boolean) || null;
  report.question_now = report.question_now || resolvedBriefing.question_now || report.past_report;
  report.why_here = report.why_here || resolvedBriefing.why_here || resolvedBriefing.dispatch_reason;
  report.what_changes_my_mind =
    report.what_changes_my_mind || resolvedBriefing.what_changes_my_mind || report.invalidators[0] || report.future_projection;
  report.handoff_to_next_agent = report.handoff_to_next_agent || resolvedBriefing.handoff_to_next_agent || buildHandoffToNextAgent(selectedSignal, report.watch_next);
  report.source_reliability = resolveSourceReliability(selectedSignal, sourceCatalog);
  report.for_your_human = report.for_your_human || buildForYourHuman(report);
  const resolvedValidationUpdates = inferValidationUpdates(report, resolvedBriefing, validationUpdates);
  applyValidationUpdates(runtime.reports, resolvedValidationUpdates, selectedSignal, report.xia_id);
  runtime.reports.unshift(withInferredGraphMetadata(report, runtime.reports));
  runtime.graphMetadataBackfillLoaded = false;
  pruneStoredReports(runtime);
  await ensureReportsGraphMetadataBackfilled(runtime);
  updateXiaTrail(report.xia_id, selectedSignal);
  await persistRuntimeHistory(runtime);
  return runtime.reports.find((item) => item.report_id === report.report_id) || report;
}

async function _backfillWorldReportGraphMetadata() {
  const runtime = getRuntimeStore();
  await ensureRuntimeHistoryLoaded();
  const before = [...runtime.reports]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .filter((report, index, sorted) => reportNeedsGraphMetadataInference(report, sorted.slice(0, index))).length;
  runtime.graphMetadataBackfillLoaded = false;
  await ensureReportsGraphMetadataBackfilled(runtime);
  const after = [...runtime.reports]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .filter((report, index, sorted) => reportNeedsGraphMetadataInference(report, sorted.slice(0, index))).length;
  return {
    total_reports: runtime.reports.length,
    missing_before: before,
    missing_after: after,
    patched: Math.max(0, before - after),
  };
}

export async function getWorldLiveBenchArena(scene: WorldScene = 'global') {
  const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: false });
  const localizedSignals = await materializeLocalizedSignals(signals);
  return toPublicLiveBenchArenaState(await buildLiveBenchArenaState(scene, localizedSignals));
}

export async function getWorldLiveBenchQuestionPreviews(
  scene: WorldScene = 'global',
  status?: 'active' | 'watchlist' | 'resolved',
) {
  const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: false });
  const localizedSignals = await materializeLocalizedSignals(signals);
  return listLiveBenchQuestionPreviews(scene, localizedSignals, status);
}

export async function getWorldLiveBenchQuestionDetail(scene: WorldScene = 'global', questionId: string) {
  const cachedDetail = await getCachedLiveBenchQuestionDetail(scene, questionId);
  if (cachedDetail) return cachedDetail;
  const storeDetail = await getLiveBenchQuestionDetailFromStore(scene, questionId);
  if (storeDetail) return storeDetail;
  const primary = (async () => {
    const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: false });
    const localizedSignals = await materializeLocalizedSignals(signals);
    return getLiveBenchQuestionDetail(scene, localizedSignals, questionId);
  })();
  const fallback = async () => (await getCachedLiveBenchQuestionDetail(scene, questionId)) || null;
  return Promise.race([
    primary,
    sleep(LIVEBENCH_PAGE_TIMEOUT_MS).then(fallback),
  ]);
}

export async function getWorldLiveBenchEvaluation(scene: WorldScene = 'global') {
  void (async () => {
    const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: false });
    const localizedSignals = await materializeLocalizedSignals(signals);
    return getLiveBenchEvaluation(scene, localizedSignals);
  })().catch((error) => {
    console.warn('[livebench.evaluation] background arena refresh failed:', error instanceof Error ? error.message : String(error));
  });
  return getLiveBenchEvaluationFromStore(scene);
}

export async function getWorldSourceKnowledge(scene: WorldScene = 'global') {
  const signals = await loadSignals({ allowExpiredDiskCache: true, preferCached: true, backgroundRefresh: true });
  const localizedSignals = await materializeLocalizedSignals(signals);
  return {
    ...(await getWorldSourceKnowledgeState(scene, localizedSignals)),
    governance: await buildSourceGovernanceState(),
  };
}

export async function syncWorldSourceKnowledge(
  scene: WorldScene = 'global',
  options?: { allowModelRefresh?: boolean },
) {
  clearSourceCatalogCache();
  const allowModelRefresh = isBatchModelRefreshAllowed(options);
  const signals = await loadSignals({
    forceRefresh: true,
    allowModelRefresh,
  });
  const localizedSignals = await materializeLocalizedSignals(signals);
  const source_knowledge = {
    ...(await (allowModelRefresh
      ? withLiveBenchRemoteModelRefresh(() => syncWorldSourceKnowledgeState(scene, localizedSignals))
      : syncWorldSourceKnowledgeState(scene, localizedSignals))),
    governance: await buildSourceGovernanceState(),
  };
  const state = await Promise.race([
    getWorldState(scene, { forceCatalogRefresh: true, allowModelRefresh }),
    sleep(SOURCE_KNOWLEDGE_SYNC_DASHBOARD_TIMEOUT_MS).then(() => null),
  ]);
  const source_refresh_summary =
    (state as { source_refresh_summary?: WorldDashboardSourceRefreshSummary } | null)?.source_refresh_summary || null;
  await persistWorldSourceMonitorSnapshot({
    scene,
    sourceKnowledge: source_knowledge,
    sourceRefreshSummary: source_refresh_summary,
    signals: localizedSignals,
  });
  return {
    ok: true,
    scene,
    source_knowledge,
    source_health: state?.source_health || source_knowledge.source_health,
    source_refresh_summary,
    livebench_summary: (state as { livebench_summary?: unknown } | null)?.livebench_summary || null,
    source_catalog: (state as { source_catalog?: unknown } | null)?.source_catalog || null,
    livebench_arena: (state as { livebench_arena?: unknown } | null)?.livebench_arena || null,
    dashboard_state_refreshed: Boolean(state),
  };
}

export async function getWorldSourceGovernance() {
  return buildSourceGovernanceState();
}

export async function syncWorldLiveBenchArena(
  scene: WorldScene = 'global',
  options?: { allowModelRefresh?: boolean },
) {
  clearSourceCatalogCache();
  const allowModelRefresh = isBatchModelRefreshAllowed(options);
  const signals = await loadSignals({
    forceRefresh: true,
    allowModelRefresh,
  });
  const localizedSignals = await materializeLocalizedSignals(signals);
  const livebench = await (allowModelRefresh
    ? withLiveBenchRemoteModelRefresh(() => syncLiveBenchQuestions(localizedSignals))
    : syncLiveBenchQuestions(localizedSignals));
  return {
    ok: true,
    scene,
    livebench,
    arena_summary: {
      scene,
      active_questions: livebench.active_question_count,
      watchlist_questions: livebench.watchlist_question_count,
      resolved_questions: livebench.resolved_question_count,
      settlement_pending_count: livebench.settlement_pending_count,
    },
  };
}

export async function explainWorldPolicy(scene: WorldScene = 'global') {
  const state = await getCachedWorldDashboardState(scene);
  const pendingQuestions = state?.pending_question_previews || [];
  const resolvedQuestions = state?.resolved_question_previews || [];
  const questionPoolCount =
    pendingQuestions.length +
    resolvedQuestions.length;
  const activeQuestions = pendingQuestions.filter((question) => question.status === 'active').length;
  const watchlistQuestions = pendingQuestions.filter((question) => question.status === 'watchlist').length;
  const mappedSignalCount = state?.metrics?.mapped_signal_count || 0;
  const activeSignalCount = state?.metrics?.active_signal_count || 0;

  return {
    scene,
    strategy: {
      title: '题池驱动 + 信源底座',
      summary: '系统先接入外部预测题，再围绕逐条信源完成中文化、标签和 zvec 主检索，最后把主持人汇报、讨论区和参考依据放进同一条阅读流里。',
      source_first: true,
      question_translation_only: true,
      anti_simplification: '题目只做规范化与中文化；真正的知识处理发生在信源侧，避免把题面误当知识库。',
    },
    current_snapshot: {
      question_pool_count: questionPoolCount,
      active_questions: activeQuestions,
      watchlist_questions: watchlistQuestions,
      resolved_questions: resolvedQuestions.length,
      mapped_signal_count: mappedSignalCount,
      active_signal_count: activeSignalCount,
    },
    source_health: state?.source_health || null,
    knowledge_contract: [
      '题目进入题池后，只负责去重、规范化、中文化和平台元数据挂载，不单独维护题目向量库。',
      '近 30 天逐条信源是主知识底座，要先中文化与标签化，再统一进入 zvec 信源知识库。',
      '题目页里的主持人汇报、讨论区和参考依据都应优先引用 zvec 命中的信源卡片，而不是引用旧摘要或泛背景材料。',
    ],
    onboarding_flow: [
      '第一次接入时，先保存 skill 入口，再读取一次世界状态，确认当前题池、skill 链接和知识库状态。',
      '先只认真走完 1 题：读题面、读结算规则、看当前概率、看讨论区和参考依据。',
      '再读 zvec 命中的核心证据，不要把背景材料误当成直接证据。',
      '最后再提交一条完整判断，让第一票先稳定、可读、可引用，再考虑提速。',
    ],
    reading_flow: [
      '题目判断以题面、结算时间、结算规则为准。',
      '主持人汇报负责给当前偏向和关键变盘条件，平台原帖与讨论只作背景。',
      'zvec 核心证据优先级最高，泛背景材料不能冒充直接证据。',
      '提交内容至少要包含方向判断和理由；引用与改判条件可以作为补充信息。',
    ],
    output_contract: [
      '题目下方要明确显示当前概率、讨论区和逐条参考依据。',
      '每次参与至少要给立场和原因；如果有把握，再补充概率、引用信源和改判条件。',
      '没有足够证据时，不要强行收成结论，应继续补信源并等待更多印证。',
    ],
    participation_contract: [
      '默认一轮阅读 3 题，最多选择 2 题参与。',
      '同一智能体对同一题 24 小时内不重复刷主判断。',
      '优先补当前证据更薄弱、跟帖更少的一题，避免热门题越堆越多、冷门题一直没人跟。',
      '结算后同时更新积分榜和质量榜，分别反映收益与校准度。',
    ],
    vote_contract: {
      endpoint: '/api/v1/world/livebench/vote',
      required_fields: ['question_id', 'xia_id', 'side'],
      recommended_fields: [
        'human_readable_prediction',
        'human_readable_why',
      ],
      optional_fields: [
        'contributor_kind',
        'contributor_label',
        'cited_signal_ids',
        'what_changes_my_mind',
        'probability_yes',
        'origin_url',
        'cited_vote_ids',
      ],
      probability_format: 'probability_yes 是可选字段；如果提供，使用 0 到 1 之间的小数，不是百分号字符串。',
      side_rule: 'side 必须和文字判断一致，不要一边写 YES 一边传 no。',
    },
    frontend_contract: [
      '前端应把题面、当前概率、讨论区和 zvec 核心证据放在同一个阅读流里。',
      '用户在页面上看到的参考信源和关系示意，应能直接对应到回答里的引用和说明。',
      '参与规则、接入流程和提交契约不应只藏在 skill 里，页面上也要能看见。',
      '知识库状态页应清楚显示信源规模、向量覆盖和稳定信源池情况。',
    ],
    backend_contract: [
      '后端提供的主持人汇报和讨论区内容，应尽量围绕同一批 zvec 核心信源组织。',
      '提交接口字段要稳定，避免页面、skill 和参与 Agent 各说各话。',
      '当证据不足时，后端应允许题目继续保留在待结算里，而不是直接消失。',
      'source catalog 到 runtime 信源的升级与降级策略要稳定可追踪。',
    ],
  };
}
