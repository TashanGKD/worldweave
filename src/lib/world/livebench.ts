import { execFile } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { readWorldApiSnapshot } from './api-snapshot';
import type {
  ArenaScorecard,
  LiveBenchArenaState,
  LiveBenchAggregateVote,
  LiveBenchCalibrationBucket,
  LiveBenchEvaluation,
  LiveBenchEvidenceSection,
  LiveBenchGroupedPositions,
  LiveBenchPlatformModelSummary,
  LiveBenchQuestionDetail,
  LiveBenchQuestionDiscussionEntry,
  LiveBenchQuestionPosition,
  LiveBenchQuestionPreview,
  LiveBenchResolvedQuestionSeriesItem,
  LiveBenchSettlementScore,
  LiveBenchSourceHealth,
  LiveQuestion,
  LiveQuestionDebateSide,
  LiveQuestionModeratorView,
  LiveQuestionPlatform,
  LiveQuestionReference,
  LiveQuestionSide,
  LiveQuestionSnapshot,
  LiveQuestionStatus,
  LiveVote,
  SourceEmbeddingChunk,
  LiveVoteSource,
  WorldSourceKnowledgeState,
  WorldScene,
  WorldSignal,
} from '@/lib/world/types';

const ACTIVE_WINDOW_DAYS = 7;
const WATCHLIST_WINDOW_DAYS = 30;
const SETTLEMENT_PENDING_WINDOW_DAYS = 30;
const AGGREGATE_CALIBRATION_RANGES = [
  [0, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.00001],
] as const;
const LIVEBENCH_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const SOURCE_KNOWLEDGE_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const LIVEBENCH_EMBED_DIMENSIONS = 96;
const LIVEBENCH_EMBED_BATCH_SIZE = 5;
const LIVEBENCH_ZVEC_TOP_K = 6;
const LIVEBENCH_ZVEC_QUERY_LIMIT = 48;
const LIVEBENCH_REFERENCE_LIMIT = 10;
const LIVEBENCH_EVIDENCE_PROMPT_LIMIT = 8;
const LIVEBENCH_ACTIVE_LIMIT = 64;
const LIVEBENCH_RESOLVED_LIMIT = 48;
const LIVEBENCH_WATCHLIST_LIMIT = 96;
const LIVEBENCH_ACTIVE_CANDIDATE_LIMIT = 96;
const LIVEBENCH_RESOLVED_CANDIDATE_LIMIT = 64;
const LIVEBENCH_WATCHLIST_CANDIDATE_LIMIT = 160;
const LIVEBENCH_RECENTLY_RESOLVED_WINDOW_DAYS = 30;
const LIVEBENCH_QUESTION_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LIVEBENCH_MIN_OPEN_QUESTION_COUNT = 20;
const LIVEBENCH_MIN_TOTAL_QUESTION_COUNT = 40;
const SYNTHETIC_XIA_VOTE_WINDOW_MS = 30 * 60 * 1000;
const SYNTHETIC_XIA_PARTICIPANTS = [
  {
    id: 'arena-harbor',
    label: '节奏观察虾',
    stance: '更看重价格、运输、供应链和市场节奏的变化。',
    opening: '我更在意价格、船流、交付和节奏有没有真的发生变化。',
    lens: '优先盯价格、运力、交期、库存、通航量这些连续变化。',
  },
  {
    id: 'arena-citadel',
    label: '政策观察虾',
    stance: '更看重政策动作、官方表态和执行层证据是否真正落地。',
    opening: '我更在意官方动作、政策口径和执行层证据有没有真正落地。',
    lens: '优先盯官方表态、停火/会谈、制裁、监管、公司确认和执行动作。',
  },
] as const;
const SYNTHETIC_XIA_ID_SET = new Set<string>(SYNTHETIC_XIA_PARTICIPANTS.map((persona) => persona.id));

export function getLiveBenchParticipantRoster() {
  return SYNTHETIC_XIA_PARTICIPANTS.map((persona) => ({
    xia_id: persona.id,
    label: persona.label,
  }));
}
const LIVEBENCH_FETCH_TIMEOUT_MS = 5000;
const REQUESTED_EMBEDDING_MODEL = process.env.WORLD_ARENA_EMBEDDING_MODEL || 'Qwen3-Embedding-8B';
const EMBEDDING_FALLBACK_MODEL = process.env.WORLD_ARENA_EMBEDDING_FALLBACK_MODEL || 'local-hash-96d';
const LIVEBENCH_REMOTE_EMBED_UPGRADE_LIMIT = Number(process.env.WORLD_ARENA_REMOTE_EMBED_UPGRADE_LIMIT || 24);
const LIVEBENCH_STATE_FILE = path.join(process.cwd(), '.cache', 'world-source-knowledge-state.json');
const LIVEBENCH_RETAINED_ARCHIVE_FILE = path.join(process.cwd(), '.cache', 'world-livebench-retained-archive.json');
const LIVEBENCH_VOTE_JOURNAL_FILE = path.join(process.cwd(), '.cache', 'world-livebench-votes.jsonl');
const _LIVEBENCH_GRAPH_DIR = path.join(process.cwd(), '.cache', 'world-source-knowledge-graphs');
const LIVEBENCH_ARENA_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-source-knowledge-arena-cache.json');
const LIVEBENCH_ZVEC_DIR = path.join(process.cwd(), '.cache', 'world-source-knowledge-zvec');
const LIVEBENCH_ZVEC_MANIFEST_FILE = path.join(LIVEBENCH_ZVEC_DIR, 'manifest.json');
const LEGACY_LIVEBENCH_STATE_FILE = path.join(process.cwd(), '.cache', 'world-livebench-state.json');
const _LEGACY_LIVEBENCH_GRAPH_DIR = path.join(process.cwd(), '.cache', 'world-livebench-graphs');
const LEGACY_LIVEBENCH_ARENA_CACHE_FILE = path.join(process.cwd(), '.cache', 'world-livebench-arena-cache.json');
const LEGACY_LIVEBENCH_ZVEC_DIR = path.join(process.cwd(), '.cache', 'world-livebench-zvec');
const LEGACY_LIVEBENCH_ZVEC_MANIFEST_FILE = path.join(LEGACY_LIVEBENCH_ZVEC_DIR, 'manifest.json');
const LIVEBENCH_ZVEC_BRIDGE_SCRIPT = path.join(process.cwd(), 'scripts', 'world_zvec_bridge.py');
const METAFORECAST_GRAPHQL_URL = 'https://metaforecast.org/api/graphql';
const METAFORECAST_PAGE_SIZE = 50;
const METAFORECAST_MAX_PAGES = 32;
const METASO_SEARCH_URL = (process.env.METASO_SEARCH_URL || 'https://metaso.cn/api/v1/search').trim();
const METASO_API_KEY = (process.env.METASO_API_KEY || '').trim();
const METASO_RESULT_LIMIT = 5;
const METASO_CHUNK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const remoteModelRefreshContext = new AsyncLocalStorage<boolean>();
const execFileAsync = promisify(execFile);

function isRemoteModelRefreshAllowed() {
  return remoteModelRefreshContext.getStore() === true || process.env.WORLD_ALLOW_BATCH_MODEL_REFRESH === '1';
}

export function withLiveBenchRemoteModelRefresh<T>(fn: () => Promise<T>): Promise<T> {
  return remoteModelRefreshContext.run(true, fn);
}
const MANUAL_VERIFIED_OUTCOMES: Record<
  string,
  {
    official_outcome: LiveQuestionSide;
    official_resolved_at: string;
    note: string;
  }
> = {
  'https://polymarket.com/market/nvda-up-or-down-on-april-16-2026': {
    official_outcome: 'no',
    official_resolved_at: '2026-04-16T23:59:00.000Z',
    note: 'Polymarket 官方页面已显示 Final outcome: Down；当前环境直连 Gamma 超时，先按人工核验结果回写。',
  },
  'https://polymarket.com/market/will-claude-4pt7-be-released-on-or-prior-to-april-16-2026': {
    official_outcome: 'yes',
    official_resolved_at: '2026-04-16T18:03:00.000Z',
    note: 'Polymarket 官方页面已显示 Final outcome: Yes；当前环境直连 Gamma 超时，先按人工核验结果回写。',
  },
};

const MANUAL_VERIFIED_QUESTION_SPECS: Array<{
  question_id: string;
  source_platform: LiveQuestionPlatform;
  source_question_id: string;
  origin_url: string;
  title: string;
  background: string;
  resolution_criteria: string;
  resolve_at: string;
  raw_source_platform: string;
}> = [
  {
    question_id: 'polymarket:manual:nvda-up-or-down-on-april-16-2026',
    source_platform: 'polymarket',
    source_question_id: 'manual:nvda-up-or-down-on-april-16-2026',
    origin_url: 'https://polymarket.com/market/nvda-up-or-down-on-april-16-2026',
    title: 'NVIDIA (NVDA) Up or Down on April 16?',
    background: '这道题在问 2026 年 4 月 16 日 NVDA 当日收盘表现是上涨还是下跌，按 Polymarket 官方市场结算结果验证。',
    resolution_criteria: '以 Polymarket 官方结算结果为准；Up 记为 YES，Down 记为 NO。',
    resolve_at: '2026-04-16T23:59:00.000Z',
    raw_source_platform: 'Polymarket',
  },
  {
    question_id: 'polymarket:manual:will-claude-4pt7-be-released-on-or-prior-to-april-16-2026',
    source_platform: 'polymarket',
    source_question_id: 'manual:will-claude-4pt7-be-released-on-or-prior-to-april-16-2026',
    origin_url: 'https://polymarket.com/market/will-claude-4pt7-be-released-on-or-prior-to-april-16-2026',
    title: 'Will Claude 4.7 be released on or prior to April 16, 2026?',
    background: '这道题在问 Claude 4.7 是否会在 2026 年 4 月 16 日或之前正式发布，按 Polymarket 官方市场结算结果验证。',
    resolution_criteria: '以 Polymarket 官方结算结果为准；Released on or prior 记为 YES，否则记为 NO。',
    resolve_at: '2026-04-16T18:03:00.000Z',
    raw_source_platform: 'Polymarket',
  },
];

type LiveBenchStore = {
  version: number;
  last_synced_at: string | null;
  last_source_knowledge_synced_at?: string | null;
  last_source_knowledge_signal_count?: number | null;
  last_embedding_backend: string | null;
  source_status: {
    metaculus: string;
    metaforecast: string;
    embeddings: string;
  };
  source_health?: LiveBenchSourceHealth;
  questions: LiveQuestion[];
  votes: LiveVote[];
  chunks: SourceEmbeddingChunk[];
};

type LiveBenchStoreDiskCache = {
  file_path: string;
  mtime_ms: number;
  size: number;
  store: LiveBenchStore;
};

type RetainedLiveBenchArchive = {
  version: number;
  saved_at: string;
  questions: LiveQuestion[];
  votes: LiveVote[];
  chunks: SourceEmbeddingChunk[];
};

type ZvecIndexGroupManifest = {
  group_key: string;
  fingerprint: string;
  dimension: number;
  chunk_count: number;
};

type ZvecIndexManifest = {
  fingerprint: string;
  groups: ZvecIndexGroupManifest[];
  updated_at: string;
};

type ZvecIndexGroupSelection = {
  groupKey: string;
  indexChunks: SourceEmbeddingChunk[];
  dimension: number;
  fingerprint: string;
  collectionPath: string;
};

type ZvecIndexSelection = {
  fingerprint: string;
  groups: ZvecIndexGroupSelection[];
  residualChunks: SourceEmbeddingChunk[];
};

type ZvecBridgeBuildResult = {
  ok?: boolean;
  count?: number;
  dimension?: number;
};

type ZvecBridgeQueryResult = {
  ok?: boolean;
  hits?: Array<{
    id?: string;
    score?: number | null;
  }>;
};

async function readFilePreferCurrent(targetPath: string, legacyPath?: string) {
  try {
    return await fs.readFile(targetPath, 'utf-8');
  } catch {
    if (!legacyPath) throw new Error(`missing file: ${targetPath}`);
    return fs.readFile(legacyPath, 'utf-8');
  }
}

const LIVEBENCH_STORE_VERSION = 7;
const LIVEBENCH_ARENA_CACHE_TTL_MS = 60 * 1000;
const LIVEBENCH_RELAXED_ARENA_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MANIFOLD_DISCOVERY_TERMS = [
  'oil',
  'crude oil',
  'wti',
  'brent',
  'hormuz',
  'iran',
  'nuclear',
  'shipping',
  'OpenAI',
  'Anthropic',
  'Claude',
  'Gemini',
  'Nvidia',
  'NVDA',
  'UAE',
  'tariff',
  'memory',
  'HBM',
  'DRAM',
  'Ukraine',
  'chip',
  'supply chain',
  'Taiwan',
  'China',
  'South China Sea',
  'Red Sea',
  'OPEC',
  'Fed',
  'interest rates',
  'inflation',
  'CPI',
  'GDP',
  'recession',
  'election',
  'sanction',
  'export controls',
  'datacenter',
  'AI compute',
] as const;
const MANIFOLD_COMMENT_SYNC_LIMIT = 6;
const STRATEGIC_MARKET_DISCOVERY_TERMS = [
  'wti',
  'crude oil',
  'brent',
  'hormuz',
  'strait of hormuz',
  'shipping',
  'tanker',
  'port',
  'naval',
  'blockade',
  'iran',
  'israel',
  'ukraine',
  'uae',
  'drone',
  'missile',
  'nuclear',
  'ground invasion',
  'tariff',
  'anthropic',
  'claude',
  'openai',
  'gemini',
  'frontier model',
  "humanity's last exam",
  'nvidia',
  'nvda',
  'amd',
  'tsmc',
  'semiconductor',
  'chip',
  'gpu',
  'hbm',
  'dram',
  'ddr5',
  'nand',
  'cowos',
  'advanced packaging',
  'server cpu',
  'cpu',
  'datacenter',
  'supply chain',
  'taiwan',
  'china',
  'south china sea',
  'red sea',
  'suez',
  'opec',
  'export controls',
  'sanction',
  'interest rate',
  'fed',
  'federal reserve',
  'inflation',
  'cpi',
  'gdp',
  'recession',
  'election',
  'bond yield',
  'treasury',
  'dollar',
  'rare earth',
  'lithium',
  'copper',
  'datacenter',
  'ai compute',
  'compute cluster',
] as const;

type InternalQuestionTemplate = {
  key: string;
  topic_bucket: string;
  region_hint: string;
  resolve_in_days: number;
  question_title: (dateLabel: string) => string;
  background_lead: string;
  resolution_criteria: string;
  metaso_query: string;
  validation_query: string;
  validation_mode: NonNullable<LiveQuestion['validation_mode']>;
  signal_keywords: string[];
  tags: string[];
};

const INTERNAL_INDUSTRY_TEMPLATES: InternalQuestionTemplate[] = [
  {
    key: 'gpu-supply-ease',
    topic_bucket: 'chip-supply',
    region_hint: 'Global',
    resolve_in_days: 6,
    question_title: (dateLabel) => `${dateLabel}前，AI 服务器 GPU 供货紧张会不会明显缓解？`,
    background_lead: '关注 AI 服务器 GPU 的交付、配货和供货节奏是否真正松动。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向 GPU 交付改善、等待时间缩短或供货变松，则记 YES；若材料仍明显指向配额、缺货、交期拉长或持续紧张，则记 NO。',
    metaso_query: 'AI server GPU supply shortage lead time allocation 2026 Nvidia B200 GB200 supply easing',
    validation_query: 'AI server GPU supply shortage lead time allocation 2026 Nvidia B200 GB200 supply easing latest',
    validation_mode: 'metaso-supply-ease',
    signal_keywords: ['gpu', 'nvidia', 'nvda', 'gb200', 'b200', 'ai server', 'datacenter', '供货', '交付', 'lead time'],
    tags: ['internal-industry', 'gpu', 'supply'],
  },
  {
    key: 'hbm-price-up',
    topic_bucket: 'chip-supply',
    region_hint: 'Global',
    resolve_in_days: 8,
    question_title: (dateLabel) => `${dateLabel}前，HBM 高带宽内存价格还会不会继续走高？`,
    background_lead: '关注 HBM 报价、抢货和供需错配是否继续把价格往上推。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向 HBM 报价上涨、价格维持强势或继续提价，则记 YES；若材料更偏向回落、转弱或价格走平，则记 NO。',
    metaso_query: 'HBM memory price trend 2026 high bandwidth memory spot contract price latest',
    validation_query: 'HBM memory price trend 2026 high bandwidth memory spot contract price latest',
    validation_mode: 'metaso-price-up',
    signal_keywords: ['hbm', 'memory', 'dram', 'semiconductor', 'chip', 'price', '报价'],
    tags: ['internal-industry', 'hbm', 'price'],
  },
  {
    key: 'dram-price-up',
    topic_bucket: 'chip-supply',
    region_hint: 'Global',
    resolve_in_days: 12,
    question_title: (dateLabel) => `${dateLabel}前，DDR5 / DRAM 价格还会不会继续上行？`,
    background_lead: '关注 DRAM 与 DDR5 现货、合约价和渠道补库是否继续推升价格。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向 DDR5 / DRAM 涨价、报价上调或价格更强，则记 YES；若材料更偏向回落、下调或转弱，则记 NO。',
    metaso_query: 'DDR5 DRAM price trend 2026 spot contract price latest',
    validation_query: 'DDR5 DRAM price trend 2026 spot contract price latest',
    validation_mode: 'metaso-price-up',
    signal_keywords: ['dram', 'ddr5', 'memory', 'price', '报价', '库存', '渠道'],
    tags: ['internal-industry', 'dram', 'price'],
  },
  {
    key: 'advanced-packaging-ease',
    topic_bucket: 'chip-supply',
    region_hint: 'Asia',
    resolve_in_days: 16,
    question_title: (dateLabel) => `${dateLabel}前，先进封装（CoWoS / 2.5D）产能瓶颈会不会明显缓解？`,
    background_lead: '关注先进封装扩产、良率和排产瓶颈是否真正松动。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向 CoWoS / 先进封装扩产落地、排产改善或瓶颈缓解，则记 YES；若材料仍更偏向紧张、排队、产能受限，则记 NO。',
    metaso_query: 'CoWoS advanced packaging capacity bottleneck 2026 latest supply easing',
    validation_query: 'CoWoS advanced packaging capacity bottleneck 2026 latest supply easing',
    validation_mode: 'metaso-supply-ease',
    signal_keywords: ['cowos', 'advanced packaging', '2.5d', '封装', '先进封装', '产能', '台积电', 'tsmc'],
    tags: ['internal-industry', 'advanced-packaging', 'capacity'],
  },
  {
    key: 'nand-price-up',
    topic_bucket: 'chip-supply',
    region_hint: 'Global',
    resolve_in_days: 20,
    question_title: (dateLabel) => `${dateLabel}前，企业级 SSD / NAND 价格还会不会继续走高？`,
    background_lead: '关注 NAND、企业级 SSD 的报价、减产和补库是否继续支撑涨价。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向 NAND / 企业级 SSD 继续提价、价格更强或供给收紧，则记 YES；若材料更偏向价格转弱、回落或供给改善，则记 NO。',
    metaso_query: 'enterprise SSD NAND price trend 2026 latest',
    validation_query: 'enterprise SSD NAND price trend 2026 latest',
    validation_mode: 'metaso-price-up',
    signal_keywords: ['nand', 'ssd', 'enterprise ssd', 'flash', 'storage', 'price', '报价'],
    tags: ['internal-industry', 'nand', 'price'],
  },
  {
    key: 'server-cpu-tight',
    topic_bucket: 'chip-supply',
    region_hint: 'Global',
    resolve_in_days: 18,
    question_title: (dateLabel) => `${dateLabel}前，服务器 CPU 供货会不会继续偏紧？`,
    background_lead: '关注服务器 CPU 的排产、交期和渠道供货是否继续吃紧。',
    resolution_criteria:
      '以到期时最近一周公开可验证材料为准：若更多可靠材料明确指向服务器 CPU 交付偏紧、渠道缺货或交期拉长，则记 YES；若材料更偏向供给改善、交期缩短或供货恢复，则记 NO。',
    metaso_query: 'server CPU supply lead time shortage 2026 latest x86 server CPU',
    validation_query: 'server CPU supply lead time shortage 2026 latest x86 server CPU',
    validation_mode: 'metaso-supply-tight',
    signal_keywords: ['cpu', 'server cpu', 'x86', 'lead time', '供货', '交期', '数据中心', 'datacenter'],
    tags: ['internal-industry', 'server-cpu', 'supply'],
  },
];

type MetaforecastDiscovery = {
  id: string;
  title: string;
  url: string;
  description: string;
  platform_id: string;
  platform_label: string;
  fetched_at: string | null;
  first_seen_at: string | null;
  stars: number;
  volume: number | null;
  liquidity: number | null;
};

type MetasoSearchResponse = {
  webpages?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    position?: number;
    date?: string;
    authors?: string[];
    score?: string;
  }>;
  total?: number;
};

const DISCUSSION_VOTE_SOURCES = new Set<LiveVoteSource>(['xia', 'external']);

type MetaforecastQuestionsResponse = {
  questions?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    edges?: Array<{
      node?: {
        id?: string;
        title?: string;
        url?: string;
        description?: string;
        fetchedStr?: string;
        firstSeenStr?: string;
        platform?: { id?: string; label?: string };
        qualityIndicators?: {
          stars?: number;
          volume?: number | null;
          liquidity?: number | null;
        };
      };
    }>;
  };
};

type MetaforecastQuestionNode = NonNullable<
  NonNullable<MetaforecastQuestionsResponse['questions']>['edges']
>[number]['node'];

function nowIso() {
  return new Date().toISOString();
}

function compactText(value: string, max = 220) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

function monthNumber(month: string) {
  const months: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  return months[month.trim().toLowerCase()] || null;
}

function translateEnglishDateToZh(value: string) {
  const compact = compactText(value, 80);
  const isoDay = compact.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoDay) {
    return `${Number(isoDay[1])}年${Number(isoDay[2])}月${Number(isoDay[3])}日`;
  }
  const monthDayRange = compact.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*-\s*((January|February|March|April|May|June|July|August|September|October|November|December)\s+)?(\d{1,2})(?:,\s*(\d{4}))?/i,
  );
  if (monthDayRange) {
    const startMonth = monthNumber(monthDayRange[1]);
    const startDay = Number(monthDayRange[2]);
    const endMonth = monthDayRange[4] ? monthNumber(monthDayRange[4]) : startMonth;
    const endDay = Number(monthDayRange[5]);
    const year = monthDayRange[6] ? Number(monthDayRange[6]) : null;
    if (startMonth && endMonth && startDay && endDay) {
      const range = startMonth === endMonth ? `${startMonth}月${startDay}-${endDay}日` : `${startMonth}月${startDay}日到${endMonth}月${endDay}日`;
      return year ? `${year}年${range}` : range;
    }
  }
  const beforeMonthYear = compact.match(/before\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (beforeMonthYear) {
    const month = monthNumber(beforeMonthYear[1]);
    const year = Number(beforeMonthYear[2]);
    if (month && year) {
      return `${year}年${month}月之前`;
    }
  }
  const monthYear = compact.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (monthYear) {
    const month = monthNumber(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month && year) {
      return `${year}年${month}月`;
    }
  }
  const monthDayYear = compact.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i,
  );
  if (monthDayYear) {
    const month = monthNumber(monthDayYear[1]);
    const day = Number(monthDayYear[2]);
    const year = monthDayYear[3] ? Number(monthDayYear[3]) : null;
    if (month && day) {
      return year ? `${year}年${month}月${day}日` : `${month}月${day}日`;
    }
  }
  return compact;
}

function extractExplicitYears(value: string) {
  return [...String(value || '').matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
}

function preferStableYearText(generated: string | null | undefined, fallback: string, source?: string | null) {
  const cleanedGenerated = cleanHumanReadableText(generated || '', 240);
  if (!cleanedGenerated) return fallback;
  const fallbackYears = [...new Set([...extractExplicitYears(fallback), ...extractExplicitYears(source || '')])];
  const generatedYears = [...new Set(extractExplicitYears(cleanedGenerated))];
  if (
    fallbackYears.length > 0 &&
    generatedYears.length > 0 &&
    generatedYears.some((year) => !fallbackYears.includes(year))
  ) {
    return fallback;
  }
  return cleanedGenerated;
}

function translateEntityNameToZh(value: string) {
  let compact = compactText(value, 220).replace(/^the\s+/i, '');
  const knownMap: Array<[RegExp, string]> = [
    [/\bUS lift its naval blockade of the 霍尔木兹海峡/i, '美国解除对霍尔木兹海峡的海上封锁'],
    [/\bUS lift its naval blockade of the Strait of Hormuz\b/i, '美国解除对霍尔木兹海峡的海上封锁'],
    [/\bUS, Israel and\/or one of the non-Iranian Gulf states occupy Larak Island \(Iran\)/i, '美国、以色列或非伊朗海湾国家占领伊朗拉腊克岛'],
    [/\bIran charges "?霍尔木兹海峡 fees"?/i, '伊朗收取“霍尔木兹海峡通行费”'],
    [/\bIran charges "?Strait of Hormuz fees"?/i, '伊朗收取“霍尔木兹海峡通行费”'],
    [/\bStrait of Hormuz fully reopen to unrestricted commercial shipping\b/i, '霍尔木兹海峡完全恢复不受限制的商业航运'],
    [/\bfully reopen to unrestricted commercial shipping\b/i, '完全恢复不受限制的商业航运'],
    [/\bUS and Iran agree to a ceasefire\b/i, '美国和伊朗达成停火'],
    [/\bUnited States attack Iran\b/i, '美国攻击伊朗'],
    [/\bU\.S\. attack Iran\b/i, '美国攻击伊朗'],
    [/\bUnited States conduct a ground invasion of Iran\b/i, '美国对伊朗发动地面入侵'],
    [/\bU\.S\. conduct a ground invasion of Iran\b/i, '美国对伊朗发动地面入侵'],
    [/\ban AI model reach a 3 hour time horizon with 80% reliability during 2026\b/i, '2026 年内有 AI 模型在 3 小时时间跨度任务上达到 80% 可靠性'],
    [/\bOpenAI file for an IPO during 2026\b/i, 'OpenAI 在 2026 年提交 IPO 申请'],
    [/\bNVIDIA\s*\(?(NVDA)?\)?/i, '英伟达（NVDA）'],
    [/\bNVDA\b/i, '英伟达（NVDA）'],
    [/\bOpenAI\b/i, 'OpenAI'],
    [/\bAnthropic\b/i, 'Anthropic'],
    [/\bClaude\b/i, 'Claude'],
    [/\bGemini\b/i, 'Gemini'],
    [/\bMicrosoft\b/i, '微软'],
    [/\bGoogle\b/i, '谷歌'],
    [/\bMeta\b/i, 'Meta'],
    [/\bAMD\b/i, 'AMD'],
    [/\bTSMC\b/i, '台积电（TSMC）'],
    [/\bHBM\b/i, 'HBM'],
    [/\bDRAM\b/i, 'DRAM'],
    [/\bCPU\b/i, 'CPU'],
    [/\bGPU\b/i, 'GPU'],
    [/\bWTI\b/i, 'WTI 原油'],
    [/\bBrent\b/i, '布伦特原油'],
    [/\bStrait of Hormuz\b/i, '霍尔木兹海峡'],
    [/\bUAE\b/i, '阿联酋'],
    [/\bUnited States\b/i, '美国'],
    [/\bU\.S\.\b/i, '美国'],
    [/\bUSA\b/i, '美国'],
    [/\bUS\b/i, '美国'],
    [/\bSpot Price\b/i, '现货价格'],
    [/\bup or down\b/i, '涨还是跌'],
    [/\bcost more than\b/i, '高于'],
    [/\bclose above\b/i, '收盘高于'],
    [/\bbe released\b/i, '发布'],
    [/\bhas been lifted\b/i, '已解除'],
  ];
  for (const [pattern, label] of knownMap) {
    compact = compact.replace(pattern, label);
  }
  compact = compact
    .replace(/^\[SHORT FUSE\]\s*/giu, '')
    .replace(/\battack Iran\b/giu, '攻击伊朗')
    .replace(/\bconduct a ground invasion of Iran\b/giu, '对伊朗发动地面入侵')
    .replace(/\bagree to a ceasefire\b/giu, '达成停火')
    .replace(/\bfile for an IPO\b/giu, '提交 IPO 申请')
    .replace(/\bcrude oil\b/giu, '原油')
    .replace(/\boil prices\b/giu, '油价')
    .replace(/\bwill there be one more ceasefire agreement between 美国\/Israel and Iran till the end of April 2026\b/giu, '2026 年 4 月底前，美国或以色列与伊朗之间会再出现一次停火协议吗')
    .replace(/\bUS\/Israel and Iran\b/giu, '美国或以色列与伊朗');
  compact = compact.replace(/英伟达（英伟达（NVDA））/g, '英伟达（NVDA）');
  return compact;
}

function cleanQuestionTitleForUi(value: string) {
  let cleaned = translateEntityNameToZh(value)
    .replace(/(WTI 原油|布伦特原油)(?:\s+原油)+/giu, '$1')
    .replace(/(WTI 原油|布伦特原油)\s+现货价格/giu, '$1 现货价格')
    .replace(/原油\s+油价/giu, '原油价格')
    .replace(/伊朗收取“霍尔木兹海峡通行费” on (.+?)会发生吗？$/iu, (_match, date) => `在 ${translateEnglishDateToZh(date)} 时，伊朗会收取“霍尔木兹海峡通行费”吗？`)
    .replace(/\s+是否会发生？$/u, '会发生吗？')
    .replace(/\s*会发生吗？会发生吗？$/u, '会发生吗？')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  cleaned = cleaned.replace(
    /^(WTI 原油|布伦特原油)\s+高于\s+\$?([\d.]+)\/barrel before (.+?)(?:\?|$).*会发生吗？$/iu,
    (_match, commodity, price, date) => `在 ${translateEnglishDateToZh(date)} 之前，${commodity}会高于每桶 ${price} 美元吗？`,
  );
  if (/(WTI|布伦特|原油|油价|现货价格)/i.test(cleaned)) {
    cleaned = cleaned
      .replace(/会高于\s+([\d.]+)\s+吗？?$/u, '会高于 $1 美元吗？')
      .replace(/会低于\s+([\d.]+)\s+吗？?$/u, '会低于 $1 美元吗？');
  }
  return compactText(cleaned, 220);
}

function discussionSpeakerLabel(vote: LiveVote) {
  if (vote.contributor_label) return compactText(vote.contributor_label, 48);
  return compactText(vote.xia_id, 48) || '参与者';
}

function normalizeTag(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string) {
  const normalizedHaystack = String(haystack || '').toLowerCase();
  const normalizedTerm = String(term || '').toLowerCase().trim();
  if (!normalizedTerm) return false;
  if (/[\u4e00-\u9fa5]/.test(normalizedTerm)) {
    return normalizedHaystack.includes(normalizedTerm);
  }
  if (normalizedTerm.includes(' ')) {
    return normalizedHaystack.includes(normalizedTerm);
  }
  return new RegExp(`\\b${escapeRegex(normalizedTerm)}\\b`, 'i').test(normalizedHaystack);
}

function compactQuestionSignals(values: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const text = compactText(String(value || '').replace(/\s+/g, ' ').trim(), 140);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= limit) break;
  }
  return items;
}

function matchesStrategicMarketDiscovery(text: string) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return false;
  return STRATEGIC_MARKET_DISCOVERY_TERMS.some((term) => containsTerm(haystack, term));
}

function parseTime(value?: string | null) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hostFromUrl(value?: string | null) {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function daysUntil(value?: string | null) {
  const timestamp = parseTime(value);
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return (timestamp - Date.now()) / 86400000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function hashVector(value: string, dimensions = LIVEBENCH_EMBED_DIMENSIONS) {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = String(value || '')
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"“”'‘’/\\|<>+=_-]+/)
    .filter(Boolean);
  for (const token of tokens) {
    const digest = crypto.createHash('sha256').update(token).digest();
    const index = digest[0] % dimensions;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + (digest[2] % 7) / 10);
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => Number((item / norm).toFixed(6)));
}

function resolveMiniMaxApiKey() {
  return (process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
}

function resolveMiniMaxBaseUrl() {
  return (
    process.env.MINIMAX_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.scnet.cn/api/llm/v1'
  ).replace(/\/$/, '');
}

function resolveMiniMaxApiStyle(): 'anthropic' | 'openai-completions' {
  const raw = (process.env.MINIMAX_API_STYLE || process.env.MINIMAX_API || 'openai-completions').trim().toLowerCase();
  if (raw === 'openai-completions' || raw === 'openai' || raw === 'chat-completions') {
    return 'openai-completions';
  }
  return 'anthropic';
}

const MINIMAX_BASE_URL = resolveMiniMaxBaseUrl();
const MINIMAX_API_KEY = resolveMiniMaxApiKey();
const MINIMAX_MODEL = (process.env.MINIMAX_MODEL || 'MiniMax-M2.5').trim();
const MINIMAX_API_STYLE = resolveMiniMaxApiStyle();
const LIVEBENCH_REMOTE_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const LIVEBENCH_EMBEDDING_FAILURE_COOLDOWN_MS = 60 * 1000;
const LIVEBENCH_EMBEDDING_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;

type LiveBenchRemoteHealth = {
  embeddingUnavailableUntil: number;
  minimaxUnavailableUntil: number;
  embeddingLastStatus?: number | null;
  embeddingLastError?: string | null;
  embeddingLastCheckedAt?: string | null;
};

function getRemoteHealth(): LiveBenchRemoteHealth {
  const globalStore = globalThis as typeof globalThis & {
    __worldLiveBenchRemoteHealth?: LiveBenchRemoteHealth;
  };

  if (!globalStore.__worldLiveBenchRemoteHealth) {
    globalStore.__worldLiveBenchRemoteHealth = {
      embeddingUnavailableUntil: 0,
      minimaxUnavailableUntil: 0,
      embeddingLastStatus: null,
      embeddingLastError: null,
      embeddingLastCheckedAt: null,
    };
  }

  return globalStore.__worldLiveBenchRemoteHealth;
}

function markEmbeddingRemoteFailure(status: number | null, message: string) {
  const health = getRemoteHealth();
  health.embeddingLastStatus = status;
  health.embeddingLastError = message;
  health.embeddingLastCheckedAt = nowIso();
  health.embeddingUnavailableUntil =
    Date.now() + (status === 429 ? LIVEBENCH_EMBEDDING_RATE_LIMIT_COOLDOWN_MS : LIVEBENCH_EMBEDDING_FAILURE_COOLDOWN_MS);
}

function markEmbeddingRemoteSuccess() {
  const health = getRemoteHealth();
  health.embeddingUnavailableUntil = 0;
  health.embeddingLastStatus = 200;
  health.embeddingLastError = null;
  health.embeddingLastCheckedAt = nowIso();
}

async function readMiniMaxError(response: Response) {
  try {
    const payload = (await response.clone().json()) as { error?: { message?: string; code?: string } };
    return payload.error?.message || payload.error?.code || `HTTP ${response.status}`;
  } catch {
    try {
      return (await response.clone().text()).slice(0, 240) || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

async function requestMiniMaxJson<T>(system: string, prompt: string): Promise<T | null> {
  if (!isRemoteModelRefreshAllowed() || !MINIMAX_API_KEY || MINIMAX_API_STYLE !== 'openai-completions') {
    return null;
  }
  const health = getRemoteHealth();
  if (health.minimaxUnavailableUntil > Date.now()) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return null;
    health.minimaxUnavailableUntil = 0;
    try {
      return JSON.parse(raw) as T;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  } catch {
    health.minimaxUnavailableUntil = Date.now() + LIVEBENCH_REMOTE_FAILURE_COOLDOWN_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryRemoteEmbedding(text: string): Promise<{ embedding: number[]; backend: string } | null> {
  if (!MINIMAX_API_KEY || MINIMAX_API_STYLE !== 'openai-completions') {
    return null;
  }
  const health = getRemoteHealth();
  if (health.embeddingUnavailableUntil > Date.now()) {
    return null;
  }

  const tryModels = [REQUESTED_EMBEDDING_MODEL].filter(Boolean);
  for (const model of tryModels) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${MINIMAX_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [text],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorMessage = await readMiniMaxError(response);
        markEmbeddingRemoteFailure(response.status, errorMessage);
        continue;
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embedding = payload.data?.[0]?.embedding;
      if (Array.isArray(embedding) && embedding.length > 0) {
        markEmbeddingRemoteSuccess();
        return { embedding, backend: model };
      }
    } catch (error) {
      markEmbeddingRemoteFailure(null, error instanceof Error ? error.message : 'embedding request failed');
    }
  }
  if (!health.embeddingLastError) {
    markEmbeddingRemoteFailure(null, 'embedding response did not include a usable vector');
  }
  return null;
}

async function tryRemoteEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; backend: string } | null> {
  if (!MINIMAX_API_KEY || MINIMAX_API_STYLE !== 'openai-completions' || texts.length === 0) {
    return null;
  }
  const health = getRemoteHealth();
  if (health.embeddingUnavailableUntil > Date.now()) {
    return null;
  }

  const tryModels = [REQUESTED_EMBEDDING_MODEL].filter(Boolean);
  let batchFailureMessage: string | null = null;
  for (const model of tryModels) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${MINIMAX_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: texts,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorMessage = await readMiniMaxError(response);
        markEmbeddingRemoteFailure(response.status, errorMessage);
        return null;
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embeddings = (payload.data || []).map((item) => item.embedding).filter((embedding): embedding is number[] => Array.isArray(embedding) && embedding.length > 0);
      if (embeddings.length === texts.length) {
        markEmbeddingRemoteSuccess();
        return { embeddings, backend: model };
      }
      batchFailureMessage = 'embedding batch response did not include usable vectors';
    } catch (error) {
      batchFailureMessage = error instanceof Error ? error.message : 'embedding batch request failed';
    }

    if (texts.length > 1) {
      const singleEmbeddings: number[][] = [];
      try {
        for (const text of texts) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(`${MINIMAX_BASE_URL}/embeddings`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${MINIMAX_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              input: [text],
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!response.ok) {
            const errorMessage = await readMiniMaxError(response);
            markEmbeddingRemoteFailure(response.status, errorMessage);
            return null;
          }

          const payload = (await response.json()) as {
            data?: Array<{ embedding?: number[] }>;
          };
          const embedding = payload.data?.[0]?.embedding;
          if (!Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('single embedding response did not include a usable vector');
          }
          singleEmbeddings.push(embedding);
        }
        markEmbeddingRemoteSuccess();
        return { embeddings: singleEmbeddings, backend: model };
      } catch (error) {
        batchFailureMessage = error instanceof Error ? error.message : batchFailureMessage || 'embedding single fallback failed';
      }
    }
  }
  if (batchFailureMessage || !health.embeddingLastError) {
    markEmbeddingRemoteFailure(null, batchFailureMessage || 'embedding batch response did not include usable vectors');
  }
  return null;
}

function embeddingFallbackStatusMessage() {
  const health = getRemoteHealth();
  if (health.embeddingLastStatus === 429) {
    return `${REQUESTED_EMBEDDING_MODEL} 已接到限流返回，当前临时使用本地 hash 向量；MiniMax 文本链路可独立保持可用`;
  }
  if (health.embeddingLastError) {
    return `${REQUESTED_EMBEDDING_MODEL} 本轮向量请求未成功（${compactText(health.embeddingLastError, 80)}），已临时使用本地 hash 向量`;
  }
  return `${REQUESTED_EMBEDDING_MODEL} 当前未返回可用向量，已临时使用本地 hash 向量`;
}

async function embedText(text: string): Promise<{ embedding: number[]; backend: string; model: string }> {
  const remote = isRemoteModelRefreshAllowed() ? await tryRemoteEmbedding(text) : null;
  if (remote) {
    return {
      embedding: remote.embedding,
      backend: remote.backend,
      model: REQUESTED_EMBEDDING_MODEL,
    };
  }

  return {
    embedding: hashVector(text),
    backend: 'local-hash-fallback',
    model: EMBEDDING_FALLBACK_MODEL,
  };
}

async function embedTexts(texts: string[]): Promise<Array<{ embedding: number[]; backend: string; model: string }>> {
  if (texts.length === 0) return [];
  const remote = isRemoteModelRefreshAllowed() ? await tryRemoteEmbeddings(texts) : null;
  if (remote) {
    return remote.embeddings.map((embedding) => ({
      embedding,
      backend: remote.backend,
      model: REQUESTED_EMBEDDING_MODEL,
    }));
  }
  return texts.map((text) => ({
    embedding: hashVector(text),
    backend: 'local-hash-fallback',
    model: EMBEDDING_FALLBACK_MODEL,
  }));
}

function getLiveBenchZvecState() {
  const globalStore = globalThis as typeof globalThis & {
    __worldLiveBenchZvec?: {
      pythonPath?: string | null;
      readyFingerprint?: string | null;
      buildPromise?: Promise<ZvecIndexSelection | null> | null;
    };
  };

  if (!globalStore.__worldLiveBenchZvec) {
    globalStore.__worldLiveBenchZvec = {
      pythonPath: undefined,
      readyFingerprint: null,
      buildPromise: null,
    };
  }

  return globalStore.__worldLiveBenchZvec;
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function resolveZvecPythonPath() {
  const state = getLiveBenchZvecState();
  if (typeof state.pythonPath !== 'undefined') {
    return state.pythonPath;
  }

  const candidates = uniqueValues([
    (process.env.WORLD_ARENA_ZVEC_PYTHON || '').trim() || null,
    path.join(process.cwd(), '.venv-zvec', 'bin', 'python'),
    path.join(process.cwd(), '.venv-zvec', 'bin', 'python3'),
    'python3',
  ]);

  for (const candidate of candidates) {
    try {
      await execFileAsync(
        candidate,
        ['-c', 'import zvec, sys; sys.stdout.write(getattr(zvec, "__version__", "unknown"))'],
        {
          maxBuffer: 256 * 1024,
        },
      );
      state.pythonPath = candidate;
      return candidate;
    } catch {
      // keep trying
    }
  }

  state.pythonPath = null;
  return null;
}

async function readZvecManifest(): Promise<ZvecIndexManifest | null> {
  try {
    const raw = await readFilePreferCurrent(LIVEBENCH_ZVEC_MANIFEST_FILE, LEGACY_LIVEBENCH_ZVEC_MANIFEST_FILE);
    const parsed = JSON.parse(raw) as Partial<ZvecIndexManifest>;
    if (
      !parsed.fingerprint ||
      !Array.isArray(parsed.groups) ||
      !parsed.updated_at
    ) {
      return null;
    }
    return {
      fingerprint: parsed.fingerprint,
      groups: parsed.groups
        .map((group) => ({
          group_key: String(group?.group_key || ''),
          fingerprint: String(group?.fingerprint || ''),
          dimension: Number(group?.dimension),
          chunk_count: Number(group?.chunk_count),
        }))
        .filter(
          (group) =>
            Boolean(group.group_key) &&
            Boolean(group.fingerprint) &&
            Number.isFinite(group.dimension) &&
            Number.isFinite(group.chunk_count),
        ),
      updated_at: parsed.updated_at,
    };
  } catch {
    return null;
  }
}

async function persistZvecManifest(manifest: ZvecIndexManifest) {
  await fs.mkdir(LIVEBENCH_ZVEC_DIR, { recursive: true });
  const tempFile = `${LIVEBENCH_ZVEC_MANIFEST_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(manifest, null, 2), 'utf-8');
  await moveTempFileIntoPlace(tempFile, LIVEBENCH_ZVEC_MANIFEST_FILE);
}

async function moveTempFileIntoPlace(tempFile: string, targetFile: string) {
  try {
    await fs.rename(tempFile, targetFile);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code || '') : '';
    if (code !== 'EPERM' && code !== 'EEXIST') {
      throw error;
    }

    await fs.copyFile(tempFile, targetFile);
    await fs.unlink(tempFile).catch(() => {
      // ignore cleanup failure for temp files
    });
  }
}

function computeZvecFingerprint(chunks: SourceEmbeddingChunk[]) {
  const hash = crypto.createHash('sha1');
  const orderedChunks = [...chunks].sort((left, right) => left.chunk_id.localeCompare(right.chunk_id));
  for (const chunk of orderedChunks) {
    hash.update(chunk.chunk_id);
    hash.update('\0');
    hash.update(chunk.embedding_backend || '');
    hash.update('\0');
    hash.update(chunk.embedding_model || '');
    hash.update('\0');
    hash.update(JSON.stringify(chunk.embedding || []));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function docIdForZvecChunk(chunk: Pick<SourceEmbeddingChunk, 'chunk_id'>) {
  return `z${crypto.createHash('sha1').update(chunk.chunk_id).digest('hex').slice(0, 24)}`;
}

function zvecGroupKeyForChunk(chunk: Pick<SourceEmbeddingChunk, 'embedding' | 'embedding_backend'>) {
  const backendKind = chunk.embedding_backend === 'local-hash-fallback' ? 'fallback' : 'remote';
  return `${chunk.embedding.length}-${backendKind}`;
}

function collectionPathForZvecGroup(groupKey: string) {
  return path.join(LIVEBENCH_ZVEC_DIR, `collection-${normalizeTag(groupKey)}`);
}

function selectZvecIndexChunks(chunks: SourceEmbeddingChunk[]): ZvecIndexSelection | null {
  const eligible = chunks.filter(
    (chunk) =>
      chunk.chunk_id.startsWith('signal:') &&
      Array.isArray(chunk.embedding) &&
      chunk.embedding.length > 0,
  );
  if (eligible.length === 0) return null;

  const groups = new Map<string, SourceEmbeddingChunk[]>();
  for (const chunk of eligible) {
    const key = zvecGroupKeyForChunk(chunk);
    const group = groups.get(key) || [];
    group.push(chunk);
    groups.set(key, group);
  }

  const sortedGroups = [...groups.entries()].sort((left, right) => {
    const [, leftKind] = left[0].split('-');
    const [, rightKind] = right[0].split('-');
    if (leftKind !== rightKind) {
      return leftKind === 'remote' ? -1 : 1;
    }
    return right[1].length - left[1].length;
  });
  const selections = sortedGroups
    .map(([groupKey, indexChunks]) => {
      if (!indexChunks.length) return null;
      return {
        groupKey,
        indexChunks,
        dimension: indexChunks[0].embedding.length,
        fingerprint: computeZvecFingerprint(indexChunks),
        collectionPath: collectionPathForZvecGroup(groupKey),
      } satisfies ZvecIndexGroupSelection;
    })
    .filter((group): group is ZvecIndexGroupSelection => Boolean(group));
  if (selections.length === 0) return null;

  const selectedIds = new Set(selections.flatMap((group) => group.indexChunks.map((chunk) => chunk.chunk_id)));
  return {
    fingerprint: crypto
      .createHash('sha1')
      .update(
        selections
          .map((group) => `${group.groupKey}:${group.fingerprint}:${group.indexChunks.length}:${group.dimension}`)
          .join('\n'),
      )
      .digest('hex'),
    groups: selections,
    residualChunks: eligible.filter((chunk) => !selectedIds.has(chunk.chunk_id)),
  };
}

async function runZvecBridge<T>(command: 'build' | 'query', payload: unknown): Promise<T | null> {
  const pythonPath = await resolveZvecPythonPath();
  if (!pythonPath) return null;

  await fs.mkdir(LIVEBENCH_ZVEC_DIR, { recursive: true });
  const runId = `${command}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const inputFile = path.join(LIVEBENCH_ZVEC_DIR, `${runId}.input.json`);
  const outputFile = path.join(LIVEBENCH_ZVEC_DIR, `${runId}.output.json`);

  try {
    await fs.writeFile(inputFile, JSON.stringify(payload), 'utf-8');
    await execFileAsync(pythonPath, [LIVEBENCH_ZVEC_BRIDGE_SCRIPT, command, inputFile, outputFile], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const raw = await fs.readFile(outputFile, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  } finally {
    await Promise.all(
      [inputFile, outputFile].map((targetPath) =>
        fs.unlink(targetPath).catch(() => {
          // ignore temp cleanup failures
        }),
      ),
    );
  }
}

async function ensureZvecIndex(chunks: SourceEmbeddingChunk[]): Promise<ZvecIndexSelection | null> {
  const selection = selectZvecIndexChunks(chunks);
  if (!selection) return null;

  const state = getLiveBenchZvecState();
  if (state.readyFingerprint === selection.fingerprint) {
    return selection;
  }
  if (state.buildPromise) {
    return state.buildPromise;
  }

  state.buildPromise = (async () => {
    const pythonPath = await resolveZvecPythonPath();
    if (!pythonPath) return null;

    const manifest = await readZvecManifest();
    if (manifest?.fingerprint === selection.fingerprint) {
      state.readyFingerprint = selection.fingerprint;
      return selection;
    }

    const manifestGroups = new Map((manifest?.groups || []).map((group) => [group.group_key, group]));
    for (const group of selection.groups) {
      const previous = manifestGroups.get(group.groupKey);
      const collectionExists = await pathExists(group.collectionPath);
      if (
        collectionExists &&
        previous?.fingerprint === group.fingerprint &&
        previous.dimension === group.dimension &&
        previous.chunk_count === group.indexChunks.length
      ) {
        continue;
      }

      const buildResult = await runZvecBridge<ZvecBridgeBuildResult>('build', {
        collection_path: group.collectionPath,
        dimension: group.dimension,
        docs: group.indexChunks.map((chunk) => ({
          id: docIdForZvecChunk(chunk),
          embedding: chunk.embedding,
        })),
      });
      if (!buildResult?.ok) {
        return null;
      }
    }

    await persistZvecManifest({
      fingerprint: selection.fingerprint,
      groups: selection.groups.map((group) => ({
        group_key: group.groupKey,
        fingerprint: group.fingerprint,
        dimension: group.dimension,
        chunk_count: group.indexChunks.length,
      })),
      updated_at: nowIso(),
    });
    state.readyFingerprint = selection.fingerprint;
    return selection;
  })().finally(() => {
    state.buildPromise = null;
  });

  return state.buildPromise;
}

async function recallZvecSignalChunks(
  chunks: SourceEmbeddingChunk[],
  queryEmbedding: number[],
  topK = LIVEBENCH_ZVEC_QUERY_LIMIT,
): Promise<{ hits: SourceEmbeddingChunk[]; residualChunks: SourceEmbeddingChunk[] } | null> {
  const selection = await ensureZvecIndex(chunks);
  if (!selection) {
    return null;
  }

  const matchedGroups = selection.groups.filter((group) => group.dimension === queryEmbedding.length);
  if (matchedGroups.length === 0) {
    return null;
  }

  const allHits: Array<{ chunk: SourceEmbeddingChunk; score: number }> = [];
  for (const group of matchedGroups) {
    const queryResult = await runZvecBridge<ZvecBridgeQueryResult>('query', {
      collection_path: group.collectionPath,
      topk: topK,
      vector: queryEmbedding,
    });
    if (!queryResult?.ok || !Array.isArray(queryResult.hits)) {
      continue;
    }
    const chunkById = new Map(group.indexChunks.map((chunk) => [docIdForZvecChunk(chunk), chunk]));
    for (const hit of queryResult.hits) {
      if (!hit?.id) continue;
      const chunk = chunkById.get(hit.id);
      if (!chunk) continue;
      allHits.push({
        chunk,
        score: typeof hit.score === 'number' ? hit.score : 0,
      });
    }
  }

  const hits = allHits
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map((item) => item.chunk)
    .filter((chunk, index, ordered) => ordered.findIndex((candidate) => candidate.chunk_id === chunk.chunk_id) === index);
  if (hits.length === 0) {
    return null;
  }

  return {
    hits,
    residualChunks: mergeUniqueChunks(
      selection.residualChunks,
      ...selection.groups
        .filter((group) => group.dimension !== queryEmbedding.length)
        .map((group) => group.indexChunks),
    ),
  };
}

function mergeUniqueChunks(...groups: SourceEmbeddingChunk[][]) {
  const unique = new Map<string, SourceEmbeddingChunk>();
  for (const group of groups) {
    for (const chunk of group) {
      if (!unique.has(chunk.chunk_id)) {
        unique.set(chunk.chunk_id, chunk);
      }
    }
  }
  return [...unique.values()];
}

function withZvecCoverageStatus(baseStatus: string, chunks: SourceEmbeddingChunk[]) {
  const normalizedBase = String(baseStatus || '')
    .replace(/；zvec 已接管.*$/u, '')
    .replace(/；zvec 未就绪.*$/u, '')
    .replace(/；信源知识向量库已接管.*$/u, '')
    .replace(/；信源知识向量库未就绪.*$/u, '');
  const selection = selectZvecIndexChunks(chunks);
  if (!selection) {
    return `${normalizedBase}；信源知识向量库未就绪，继续使用进程内全量扫描`;
  }
  const totalIndexed = selection.groups.reduce((sum, group) => sum + group.indexChunks.length, 0);
  return `${normalizedBase}；信源知识向量库已接管 ${totalIndexed} 条近 30 天信源 ANN 召回（${selection.groups.length} 组）`;
}

function summarizeEmbeddingGroups(chunks: SourceEmbeddingChunk[]) {
  const grouped = new Map<string, { backend: string; model: string; dimension: number; count: number }>();
  for (const chunk of chunks) {
    if (!chunk.chunk_id.startsWith('signal:')) continue;
    const dimension = Array.isArray(chunk.embedding) ? chunk.embedding.length : 0;
    const backend = chunk.embedding_backend || 'unknown';
    const model = chunk.embedding_model || 'unknown';
    const key = `${backend}:${model}:${dimension}`;
    const current = grouped.get(key) || { backend, model, dimension, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count || right.dimension - left.dimension);
}

function buildSourceKnowledgeState(
  scene: WorldScene,
  store: LiveBenchStore,
  signals: WorldSignal[],
): WorldSourceKnowledgeState {
  const selectedSignals = selectSignalsForKnowledgeBase(signals);
  const freshSignalChunks = store.chunks.filter((chunk) => chunk.chunk_id.startsWith('signal:') && hasFreshChunk(chunk));
  const zvecSelection = selectZvecIndexChunks(freshSignalChunks);
  const publishedTimes = selectedSignals
    .map((signal) => parseTime(signal.publishedAt))
    .filter((value): value is number => Number.isFinite(value));
  const generatedAt = nowIso();
  const generatedTime = Date.parse(generatedAt);
  const latestPublishedTime = publishedTimes.length ? Math.min(Math.max(...publishedTimes), generatedTime) : null;

  return {
    generated_at: generatedAt,
    scene,
    window_days: WATCHLIST_WINDOW_DAYS,
    signal_count: selectedSignals.length,
    indexed_signal_count: zvecSelection?.groups.reduce((sum, group) => sum + group.indexChunks.length, 0) || 0,
    chunk_count: freshSignalChunks.length,
    zvec_group_count: zvecSelection?.groups.length || 0,
    last_synced_at: store.last_source_knowledge_synced_at || null,
    last_embedding_backend: store.last_embedding_backend || null,
    latest_signal_published_at: latestPublishedTime === null ? null : new Date(latestPublishedTime).toISOString(),
    oldest_signal_published_at: publishedTimes.length ? new Date(Math.min(...publishedTimes)).toISOString() : null,
    source_status: {
      embeddings: withZvecCoverageStatus(store.source_status.embeddings, freshSignalChunks),
    },
    embedding_groups: summarizeEmbeddingGroups(freshSignalChunks),
  };
}

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit, timeoutMs = LIVEBENCH_FETCH_TIMEOUT_MS): Promise<T | null> {
  const fetchViaCurl = async (): Promise<T | null> => {
    try {
      const curlArgs = [
        '-L',
        '--silent',
        '--show-error',
        '--max-time',
        String(Math.max(3, Math.ceil(timeoutMs / 1000))),
      ];
      const method = String(init?.method || 'GET').toUpperCase();
      if (method !== 'GET') {
        curlArgs.push('-X', method);
      }
      const headers = new Headers(init?.headers || {});
      headers.forEach((value, key) => {
        curlArgs.push('-H', `${key}: ${value}`);
      });
      if (typeof init?.body === 'string') {
        curlArgs.push('--data-raw', init.body);
      }
      curlArgs.push(url);
      const { stdout } = await execFileAsync('curl', curlArgs, {
        maxBuffer: 12 * 1024 * 1024,
      });
      const trimmed = stdout.trim();
      if (!trimmed || trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
        return null;
      }
      return JSON.parse(trimmed) as T;
    } catch {
      return null;
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      return await fetchViaCurl();
    }
    try {
      return (await response.json()) as T;
    } catch {
      return await fetchViaCurl();
    }
  } catch {
    return await fetchViaCurl();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMetasoBackground(question: LiveQuestion): Promise<SourceEmbeddingChunk[]> {
  if (!METASO_API_KEY) return [];

  const query = compactText(
    [question.title_zh || question.title, question.background_zh || question.background, question.resolution_criteria_zh || question.resolution_criteria]
      .filter(Boolean)
      .join(' '),
    240,
  );
  const hits = await fetchMetasoSearchHits(query, METASO_RESULT_LIMIT);
  if (hits.length === 0) return [];

  const candidates = hits
    .map((item) => {
      const stableId = crypto.createHash('sha1').update(`${question.question_id}:${item.link}`).digest('hex').slice(0, 16);
      return {
        chunk_id: `metaso:${question.question_id}:${stableId}`,
        signal_id: `metaso:${stableId}`,
        title: item.title,
        text: compactText([item.title, item.snippet].filter(Boolean).join('\n'), 520),
        published_at: item.published_at || nowIso(),
        scene: topicSceneForQuestion(question),
        region: question.region_hint || 'Global',
        tags: ['metaso-background', question.topic_bucket].filter(Boolean),
        source_name: item.source_name,
        source_url: item.link,
      } satisfies Omit<SourceEmbeddingChunk, 'embedding' | 'embedding_model' | 'embedding_backend' | 'expires_at'>;
    })
    .filter((item) => item.text.length >= 20);
  if (candidates.length === 0) return [];

  const embedded = await embedTexts(candidates.map((item) => item.text));
  return candidates.map((candidate, index) => ({
    ...candidate,
    embedding: embedded[index]?.embedding || hashVector(candidate.text),
    embedding_model: embedded[index]?.model || EMBEDDING_FALLBACK_MODEL,
    embedding_backend: embedded[index]?.backend || 'local-hash-fallback',
    expires_at: new Date(Date.now() + METASO_CHUNK_TTL_MS).toISOString(),
  }));
}

type MetasoSearchHit = {
  title: string;
  link: string;
  snippet: string;
  source_name: string;
  host: string | null;
  published_at: string | null;
};

async function fetchMetasoSearchHits(query: string, size = METASO_RESULT_LIMIT): Promise<MetasoSearchHit[]> {
  if (!METASO_API_KEY) return [];
  const normalizedQuery = compactText(query, 240);
  if (!normalizedQuery) return [];

  const payload = await fetchJsonWithTimeout<MetasoSearchResponse>(
    METASO_SEARCH_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${METASO_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: normalizedQuery,
        scope: 'webpage',
        includeSummary: false,
        size: String(size),
        includeRawContent: false,
        conciseSnippet: false,
      }),
    },
    20000,
  );

  if (!payload?.webpages?.length) return [];
  return payload.webpages
    .filter((item) => item?.title && item?.link)
    .map((item) => {
      const link = String(item.link || '');
      const host = hostFromUrl(link);
      return {
        title: compactText(String(item.title || ''), 140),
        link,
        snippet: compactText(String(item.snippet || ''), 420),
        source_name: host ? `秘塔搜索 · ${host}` : '秘塔搜索',
        host,
        published_at: typeof item.date === 'string' && item.date.trim() ? item.date : null,
      } satisfies MetasoSearchHit;
    })
    .filter((item) => item.title && item.link)
    .slice(0, size);
}

function getInitialStore(): LiveBenchStore {
  return {
    version: LIVEBENCH_STORE_VERSION,
    last_synced_at: null,
    last_source_knowledge_synced_at: null,
    last_source_knowledge_signal_count: null,
    last_embedding_backend: null,
    source_status: {
      metaculus: '未同步',
      metaforecast: '未同步',
      embeddings: `${REQUESTED_EMBEDDING_MODEL} 待尝试`,
    },
    questions: [],
    votes: [],
    chunks: [],
  };
}

type LiveBenchArenaCacheEntry = {
  scene: WorldScene;
  expires_at: number;
  signal_count: number;
  arena: LiveBenchArenaState;
};

type LiveBenchArenaDiskCache = {
  scene: WorldScene;
  signal_count: number;
  store_synced_at: string | null;
  saved_at: string;
  arena: LiveBenchArenaState;
};

function getArenaCache() {
  const globalStore = globalThis as typeof globalThis & {
    __worldLiveBenchArenaCache?: Map<string, LiveBenchArenaCacheEntry>;
  };

  if (!globalStore.__worldLiveBenchArenaCache) {
    globalStore.__worldLiveBenchArenaCache = new Map();
  }

  return globalStore.__worldLiveBenchArenaCache;
}

async function readArenaDiskCache(
  scene: WorldScene,
  signalCount: number,
  storeSyncedAt: string | null,
): Promise<LiveBenchArenaState | null> {
  try {
    const raw = await readFilePreferCurrent(LIVEBENCH_ARENA_CACHE_FILE, LEGACY_LIVEBENCH_ARENA_CACHE_FILE);
    const parsed = JSON.parse(raw) as LiveBenchArenaDiskCache;
    if (parsed.scene !== scene) return null;
    if (parsed.signal_count !== signalCount) return null;
    if ((parsed.store_synced_at || null) !== (storeSyncedAt || null)) return null;
    return parsed.arena || null;
  } catch {
    return null;
  }
}

async function readRelaxedArenaDiskCache(scene: WorldScene): Promise<LiveBenchArenaState | null> {
  try {
    const raw = await readFilePreferCurrent(LIVEBENCH_ARENA_CACHE_FILE, LEGACY_LIVEBENCH_ARENA_CACHE_FILE);
    const parsed = JSON.parse(raw) as LiveBenchArenaDiskCache;
    if (parsed.scene !== scene) return null;
    const savedAt = parseTime(parsed.saved_at);
    if (!savedAt || Date.now() - savedAt > LIVEBENCH_RELAXED_ARENA_CACHE_TTL_MS) return null;
    return parsed.arena || null;
  } catch {
    return null;
  }
}

async function persistArenaDiskCache(
  scene: WorldScene,
  signalCount: number,
  storeSyncedAt: string | null,
  arena: LiveBenchArenaState,
) {
  const payload: LiveBenchArenaDiskCache = {
    scene,
    signal_count: signalCount,
    store_synced_at: storeSyncedAt,
    saved_at: nowIso(),
    arena,
  };
  await fs.mkdir(path.dirname(LIVEBENCH_ARENA_CACHE_FILE), { recursive: true });
  const tempFile = `${LIVEBENCH_ARENA_CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
  await moveTempFileIntoPlace(tempFile, LIVEBENCH_ARENA_CACHE_FILE);
}

async function clearArenaDiskCache() {
  try {
    await fs.unlink(LIVEBENCH_ARENA_CACHE_FILE);
  } catch {
    try {
      await fs.unlink(LEGACY_LIVEBENCH_ARENA_CACHE_FILE);
    } catch {
      // ignore missing cache file
    }
  }
}

function clearArenaCache(scene?: WorldScene) {
  const cache = getArenaCache();
  if (scene) {
    cache.delete(scene);
    return;
  }
  cache.clear();
}

function getLiveBenchPersistState() {
  const globalStore = globalThis as typeof globalThis & {
    __worldLiveBenchPersistQueue?: Promise<void>;
    __worldLiveBenchArenaBuild?: Promise<LiveBenchStore> | null;
    __worldLiveBenchBackgroundSync?: Promise<void> | null;
    __worldLiveBenchStoreCache?: LiveBenchStoreDiskCache | null;
  };
  if (!globalStore.__worldLiveBenchPersistQueue) {
    globalStore.__worldLiveBenchPersistQueue = Promise.resolve();
  }
  if (typeof globalStore.__worldLiveBenchArenaBuild === 'undefined') {
    globalStore.__worldLiveBenchArenaBuild = null;
  }
  if (typeof globalStore.__worldLiveBenchBackgroundSync === 'undefined') {
    globalStore.__worldLiveBenchBackgroundSync = null;
  }
  return globalStore;
}

async function readLiveBenchStoreFile() {
  try {
    const stat = await fs.stat(LIVEBENCH_STATE_FILE);
    const raw = await fs.readFile(LIVEBENCH_STATE_FILE, 'utf-8');
    return { raw, file_path: LIVEBENCH_STATE_FILE, mtime_ms: stat.mtimeMs, size: stat.size };
  } catch {
    const stat = await fs.stat(LEGACY_LIVEBENCH_STATE_FILE);
    const raw = await fs.readFile(LEGACY_LIVEBENCH_STATE_FILE, 'utf-8');
    return { raw, file_path: LEGACY_LIVEBENCH_STATE_FILE, mtime_ms: stat.mtimeMs, size: stat.size };
  }
}

async function readLiveBenchVoteJournal(): Promise<LiveVote[]> {
  try {
    const raw = await fs.readFile(LIVEBENCH_VOTE_JOURNAL_FILE, 'utf-8');
    return raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LiveVote)
      .filter((vote) => vote.vote_id && vote.question_id && vote.xia_id);
  } catch {
    return [];
  }
}

async function appendLiveBenchVoteJournal(vote: LiveVote) {
  await fs.mkdir(path.dirname(LIVEBENCH_VOTE_JOURNAL_FILE), { recursive: true });
  await fs.appendFile(LIVEBENCH_VOTE_JOURNAL_FILE, `${JSON.stringify(vote)}\n`, 'utf-8');
}

function mergeJournalVotesIntoStore(store: LiveBenchStore, journalVotes: LiveVote[]) {
  if (!journalVotes.length) return store;
  const questionById = new Map(store.questions.map((question) => [question.question_id, question]));
  const normalizedJournalVotes = journalVotes.map((vote) => normalizeStoredSyntheticVote(vote, questionById));
  return {
    ...store,
    votes: mergeVotesById(store.votes, normalizedJournalVotes),
  };
}

function rememberLiveBenchStoreCache(cache: LiveBenchStoreDiskCache) {
  getLiveBenchPersistState().__worldLiveBenchStoreCache = cache;
}

function addVoteToLiveBenchStoreCache(vote: LiveVote) {
  const state = getLiveBenchPersistState();
  const cached = state.__worldLiveBenchStoreCache;
  if (!cached) return;
  if (cached.store.votes.some((item) => item.vote_id === vote.vote_id)) return;
  cached.store = {
    ...cached.store,
    votes: mergeVotesById([vote], cached.store.votes),
  };
}

async function loadStore(): Promise<LiveBenchStore> {
  try {
    const state = getLiveBenchPersistState();
    const file = await readLiveBenchStoreFile();
    const cached = state.__worldLiveBenchStoreCache;
    if (
      cached &&
      cached.file_path === file.file_path &&
      cached.mtime_ms === file.mtime_ms &&
      cached.size === file.size
    ) {
      return cached.store;
    }
    const raw = file.raw;
    const parsed = JSON.parse(raw) as Partial<LiveBenchStore>;
    if (parsed.version !== LIVEBENCH_STORE_VERSION) {
      return getInitialStore();
    }
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questionById = new Map(questions.map((question) => [question.question_id, question]));
    const normalizedVotes = Array.isArray(parsed.votes)
      ? parsed.votes.map((vote) => normalizeStoredSyntheticVote(vote as LiveVote, questionById))
      : [];
    const normalizedChunks = Array.isArray(parsed.chunks)
      ? parsed.chunks.map((chunk) => ({
          ...chunk,
          title:
            compactText(
              String(
                chunk.title ||
                  String(chunk.text || '')
                    .split('\n')
                    .find((line) => line.trim()) ||
                  chunk.source_name ||
                  chunk.signal_id,
              ),
              140,
            ) || '参考条目',
        }))
      : [];
    const normalizedStore = {
      ...getInitialStore(),
      ...parsed,
      questions,
      votes: normalizedVotes,
      chunks: normalizedChunks,
      source_status: {
        metaculus:
          typeof parsed.source_status?.metaculus === 'string'
            ? parsed.source_status.metaculus
            : getInitialStore().source_status.metaculus,
        metaforecast:
          typeof parsed.source_status?.metaforecast === 'string'
            ? parsed.source_status.metaforecast
            : getInitialStore().source_status.metaforecast,
        embeddings:
          typeof parsed.source_status?.embeddings === 'string'
            ? parsed.source_status.embeddings
            : getInitialStore().source_status.embeddings,
      },
    } as LiveBenchStore;
    const shouldRepairVotes = Array.isArray(parsed.votes) && JSON.stringify(parsed.votes) !== JSON.stringify(normalizedVotes);
    if (shouldRepairVotes) {
      const tempFile = `${LIVEBENCH_STATE_FILE}.${process.pid}.${Date.now()}.repair.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(normalizedStore, null, 2), 'utf-8');
      await moveTempFileIntoPlace(tempFile, LIVEBENCH_STATE_FILE);
    }
    const storeWithMetadata = {
      ...normalizedStore,
      last_source_knowledge_synced_at: normalizedStore.last_source_knowledge_synced_at || null,
      last_source_knowledge_signal_count:
        typeof normalizedStore.last_source_knowledge_signal_count === 'number'
          ? normalizedStore.last_source_knowledge_signal_count
          : null,
    };
    const storeWithJournal = mergeJournalVotesIntoStore(storeWithMetadata, await readLiveBenchVoteJournal());
    rememberLiveBenchStoreCache({
      file_path: file.file_path,
      mtime_ms: file.mtime_ms,
      size: file.size,
      store: storeWithJournal,
    });
    return storeWithJournal;
  } catch {
    return getInitialStore();
  }
}

async function persistStore(
  store: LiveBenchStore,
  options: {
    updateRetainedArchive?: boolean;
  } = {},
): Promise<void> {
  const updateRetainedArchive = options.updateRetainedArchive !== false;
  const state = getLiveBenchPersistState();
  state.__worldLiveBenchPersistQueue = state.__worldLiveBenchPersistQueue!.then(async () => {
    let storeToWrite = store;
    try {
      const currentRaw = await readFilePreferCurrent(LIVEBENCH_STATE_FILE, LEGACY_LIVEBENCH_STATE_FILE);
      const current = JSON.parse(currentRaw) as Partial<LiveBenchStore>;
      const currentLastSyncedAt = typeof current.last_synced_at === 'string' ? current.last_synced_at : null;
      const currentVotes = Array.isArray(current.votes) ? (current.votes as LiveVote[]) : [];
      if (currentVotes.length > 0) {
        const validQuestionIds = new Set(store.questions.map((question) => question.question_id));
        const voteIds = new Set(store.votes.map((vote) => vote.vote_id));
        const missingVotes = currentVotes.filter((vote) => {
          return vote.vote_id && !voteIds.has(vote.vote_id) && validQuestionIds.has(vote.question_id);
        });
        if (missingVotes.length > 0) {
          storeToWrite = {
            ...store,
            votes: [...store.votes, ...missingVotes].sort(
              (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
            ),
          };
        }
      }
      if (!storeToWrite.last_synced_at && currentLastSyncedAt) {
        storeToWrite = {
          ...storeToWrite,
          last_synced_at: currentLastSyncedAt,
        };
      }
    } catch {
      storeToWrite = store;
    }
    if (!storeToWrite.last_synced_at && storeToWrite.questions.length > 0) {
      storeToWrite = {
        ...storeToWrite,
        last_synced_at: nowIso(),
      };
    }
    await fs.mkdir(path.dirname(LIVEBENCH_STATE_FILE), { recursive: true });
    const tempFile = `${LIVEBENCH_STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(storeToWrite, null, 2), 'utf-8');
    await moveTempFileIntoPlace(tempFile, LIVEBENCH_STATE_FILE);
    try {
      const stat = await fs.stat(LIVEBENCH_STATE_FILE);
      rememberLiveBenchStoreCache({
        file_path: LIVEBENCH_STATE_FILE,
        mtime_ms: stat.mtimeMs,
        size: stat.size,
        store: storeToWrite,
      });
    } catch {
      // Cache refresh is best-effort; disk persistence above is authoritative.
    }
    if (updateRetainedArchive) {
      await persistRetainedLiveBenchArchive(storeToWrite);
    }
  });
  return state.__worldLiveBenchPersistQueue;
}

function emptyRetainedLiveBenchArchive(): RetainedLiveBenchArchive {
  return {
    version: LIVEBENCH_STORE_VERSION,
    saved_at: nowIso(),
    questions: [],
    votes: [],
    chunks: [],
  };
}

async function readRetainedLiveBenchArchive(): Promise<RetainedLiveBenchArchive> {
  try {
    const raw = await fs.readFile(LIVEBENCH_RETAINED_ARCHIVE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RetainedLiveBenchArchive>;
    if (parsed.version !== LIVEBENCH_STORE_VERSION) return emptyRetainedLiveBenchArchive();
    return {
      version: LIVEBENCH_STORE_VERSION,
      saved_at: typeof parsed.saved_at === 'string' ? parsed.saved_at : nowIso(),
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
      chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [],
    };
  } catch {
    return emptyRetainedLiveBenchArchive();
  }
}

function _shouldRetainQuestionInArchive(question: LiveQuestion) {
  const normalized = normalizeStoredQuestionForArena(question);
  if (!isExternalLiveBenchQuestion(normalized)) return false;
  if (normalized.status === 'pending') return false;
  return shouldKeepQuestionForArenaSync(normalized);
}

function retainableArchiveQuestions(questions: LiveQuestion[]) {
  return questions
    .map(normalizeStoredQuestionForArena)
    .filter(isExternalLiveBenchQuestion)
    .filter((question) => question.status !== 'pending')
    .filter((question) => shouldKeepQuestionForArenaSync(question))
    .map((question) => ({
      ...question,
      status: classifyQuestionStatus(question),
    }));
}

function mergeVotesById(...groups: LiveVote[][]) {
  const merged = new Map<string, LiveVote>();
  for (const votes of groups) {
    for (const vote of votes) {
      if (!vote?.vote_id) continue;
      merged.set(vote.vote_id, vote);
    }
  }
  return [...merged.values()];
}

function mergeChunksById(...groups: SourceEmbeddingChunk[][]) {
  const merged = new Map<string, SourceEmbeddingChunk>();
  for (const chunks of groups) {
    for (const chunk of chunks) {
      if (!chunk?.chunk_id) continue;
      if (!hasFreshChunk(chunk)) continue;
      merged.set(chunk.chunk_id, chunk);
    }
  }
  return [...merged.values()];
}

function mergeRetainedArchiveIntoStore(store: LiveBenchStore, archive: RetainedLiveBenchArchive): LiveBenchStore {
  const mergedQuestions = new Map<string, LiveQuestion>();
  const seenOrigins = new Set<string>();
  const seenSemantics = new Set<string>();

  const addQuestion = (question: LiveQuestion) => {
    const normalized = normalizeStoredQuestionForArena(question);
    if (!isExternalLiveBenchQuestion(normalized)) return;
    if (normalized.status === 'pending') return;
    if (!filterQuestionTopic(normalized) || !hasQuestionQuality(normalized)) return;
    const originKey = questionOriginRetentionKey(normalized);
    const semanticKey = questionSemanticRetentionKey(normalized);
    if (mergedQuestions.has(normalized.question_id) || seenOrigins.has(originKey) || seenSemantics.has(semanticKey)) return;
    mergedQuestions.set(normalized.question_id, normalized);
    seenOrigins.add(originKey);
    seenSemantics.add(semanticKey);
  };

  for (const question of store.questions) addQuestion(question);
  for (const question of retainableArchiveQuestions(archive.questions)) addQuestion(question);

  const validQuestionIds = new Set(mergedQuestions.keys());
  return {
    ...store,
    questions: [...mergedQuestions.values()],
    votes: mergeVotesById(archive.votes, store.votes).filter((vote) => validQuestionIds.has(vote.question_id)),
    chunks: mergeChunksById(store.chunks, archive.chunks),
  };
}

async function persistRetainedLiveBenchArchive(store: LiveBenchStore): Promise<void> {
  const existingArchive = await readRetainedLiveBenchArchive();
  const mergedStore = mergeRetainedArchiveIntoStore(store, existingArchive);
  const questions = retainableArchiveQuestions(mergedStore.questions);
  const validQuestionIds = new Set(questions.map((question) => question.question_id));
  const payload: RetainedLiveBenchArchive = {
    version: LIVEBENCH_STORE_VERSION,
    saved_at: nowIso(),
    questions,
    votes: mergeVotesById(existingArchive.votes, mergedStore.votes, store.votes).filter((vote) =>
      validQuestionIds.has(vote.question_id),
    ),
    chunks: mergeChunksById(mergedStore.chunks, existingArchive.chunks, store.chunks),
  };
  await fs.mkdir(path.dirname(LIVEBENCH_RETAINED_ARCHIVE_FILE), { recursive: true });
  const tempFile = `${LIVEBENCH_RETAINED_ARCHIVE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
  await moveTempFileIntoPlace(tempFile, LIVEBENCH_RETAINED_ARCHIVE_FILE);
}

function topicBucketForText(text: string) {
  return questionTopicProfileForText(text).bucket;
}

function inferRegion(text: string) {
  const normalized = normalizeTag(text);
  if (/(china|taiwan|shenzhen|beijing|hong-kong|china)/.test(normalized)) return 'China';
  if (/(middle-east|iran|israel|gaza|red-sea|hormuz)/.test(normalized)) return 'Middle East';
  if (/(europe|ukraine|russia|eu|united-kingdom)/.test(normalized)) return 'Europe';
  if (/(us|united-states|washington|america)/.test(normalized)) return 'North America';
  if (/(africa|sudan|ethiopia|nigeria)/.test(normalized)) return 'Africa';
  return 'Global';
}

function questionTopicHaystack(value: Pick<LiveQuestion, 'title' | 'background' | 'resolution_criteria' | 'tags'> | { title?: string | null; background?: string | null; description?: string | null; tags?: string[] | null }) {
  return `${value.title || ''} ${value.background || ''} ${'resolution_criteria' in value ? value.resolution_criteria || '' : value.description || ''} ${Array.isArray(value.tags) ? value.tags.join(' ') : ''}`.toLowerCase();
}

function questionTopicProfileForText(text: string) {
  const haystack = String(text || '').toLowerCase();
  const has = (term: string) => containsTerm(haystack, term);
  const oilLike =
    has('wti') ||
    containsTerm(haystack, 'crude oil') ||
    containsTerm(haystack, 'oil price') ||
    has('barrel') ||
    (has('brent') && (has('crude') || has('oil') || has('barrel')));
  const shippingLike =
    containsTerm(haystack, 'strait of hormuz') ||
    containsTerm(haystack, 'red sea') ||
    containsTerm(haystack, 'suez') ||
    containsTerm(haystack, 'shipping traffic') ||
    containsTerm(haystack, 'portwatch') ||
    containsTerm(haystack, 'ship transit') ||
    containsTerm(haystack, 'transit through') ||
    ((has('shipping') || has('tanker') || has('vessel') || has('ship')) && (has('hormuz') || has('strait') || has('red sea')));
  const frontierAiLike =
    has('openai') ||
    has('anthropic') ||
    has('claude') ||
    has('gemini') ||
    containsTerm(haystack, 'frontier model') ||
    containsTerm(haystack, 'ai model') ||
    containsTerm(haystack, 'app store') ||
    containsTerm(haystack, 'super-app');
  const chipLike =
    has('nvidia') ||
    has('nvda') ||
    has('gpu') ||
    has('hbm') ||
    has('dram') ||
    has('semiconductor') ||
    has('chip') ||
    has('server') ||
    has('datacenter') ||
    containsTerm(haystack, 'supply chain risk');
  const escalationLike =
    containsTerm(haystack, 'nuclear weapon') ||
    containsTerm(haystack, 'ground invasion') ||
    containsTerm(haystack, 'projectiles') ||
    containsTerm(haystack, 'missiles') ||
    containsTerm(haystack, 'airspace violation') ||
    containsTerm(haystack, 'ceasefire') ||
    containsTerm(haystack, 'peace deal') ||
    containsTerm(haystack, 'diplomatic meeting') ||
    containsTerm(haystack, 'withdraws from lebanon') ||
    containsTerm(haystack, 'withdrawal from lebanon') ||
    containsTerm(haystack, 'hezbollah') ||
    containsTerm(haystack, 'south china sea') ||
    containsTerm(haystack, 'taiwan strait') ||
    containsTerm(haystack, 'export controls') ||
    (has('israel') && has('iran')) ||
    (has('israel') && has('lebanon')) ||
    (has('china') && has('taiwan')) ||
    (has('china') && has('u.s.')) ||
    (has('u.s.') && has('iran')) ||
    (containsTerm(haystack, 'united states') && has('iran')) ||
    (has('iran') && (has('uae') || has('u.s.') || containsTerm(haystack, 'united states')));
  const publicHealthLike =
    has('virus') || has('outbreak') || has('disease') || has('clinical') || has('biosecurity') || has('疫情');
  const macroPolicyLike =
    containsTerm(haystack, 'federal reserve') ||
    containsTerm(haystack, 'interest rate') ||
    containsTerm(haystack, 'bond yield') ||
    containsTerm(haystack, 'treasury yield') ||
    containsTerm(haystack, 'inflation') ||
    has('cpi') ||
    has('gdp') ||
    has('recession') ||
    has('election') ||
    has('opec') ||
    containsTerm(haystack, 'rare earth') ||
    has('lithium') ||
    has('copper');

  if (oilLike) {
    return { bucket: 'oil-price', label: '油价' };
  }
  if (shippingLike) {
    return { bucket: 'shipping-flow', label: '航运' };
  }
  if (chipLike) {
    return { bucket: 'chip-supply', label: '芯片 / 关键部件' };
  }
  if (frontierAiLike) {
    return { bucket: 'frontier-ai', label: '前沿 AI' };
  }
  if (escalationLike) {
    return { bucket: 'geopolitical-escalation', label: '升级风险' };
  }
  if (publicHealthLike) {
    return { bucket: 'public-health', label: '公共卫生' };
  }
  if (macroPolicyLike) {
    return { bucket: 'macro-policy', label: '宏观 / 政策' };
  }
  return { bucket: 'other', label: '其他' };
}

function questionTopicProfile(question: Pick<LiveQuestion, 'title' | 'background' | 'resolution_criteria' | 'tags'>) {
  return questionTopicProfileForText(questionTopicHaystack(question));
}

function defaultProbabilityForQuestion(question: LiveQuestion) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'geopolitical-escalation') return 0.18;
  if (profile === 'shipping-flow') return 0.42;
  if (profile === 'oil-price') return 0.48;
  if (profile === 'chip-supply') return 0.4;
  if (profile === 'frontier-ai') return 0.46;
  return 0.45;
}

function topicSceneForQuestion(question: Pick<LiveQuestion, 'title' | 'background' | 'resolution_criteria' | 'tags'>): WorldScene {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'oil-price' || profile === 'shipping-flow' || profile === 'chip-supply') return 'capacity';
  if (profile === 'frontier-ai') return 'technology';
  if (profile === 'geopolitical-escalation') return 'war';
  if (profile === 'public-health') return 'health';
  return 'global';
}

function matchesTopicText(title: string, description = '') {
  const input = {
    title,
    background: description,
    description,
    tags: [],
  };
  const haystack = questionTopicHaystack(input);
  const profile = questionTopicProfileForText(haystack);
  const blocked =
    /(sport|sports|soccer|football|baseball|basketball|tennis|atp|wta|nba|nfl|mlb|nhl|grand slam|movie|music|celebrity|reality show|tv show|survivor|episode|season|contestant|eliminated|淘汰|综艺|娱乐|体育|coinflip|lottery|weather|rain|highest temperature|temperature in|forecast weather|travel stipend|will i |my trip|free lottery|daily market|daily coinflip|prediction market|cursor|grok|support in|support for|app support|market manipulation|insider trading case|exact score|both teams to score|total corners|toss match|toss winner|sidemen charity match|set handicap|match o\/u|games total|draw\?|over\/under|\bvs\b)/.test(
      haystack,
    );
  const strategicSignal =
    /(openai|anthropic|claude|gemini|google|microsoft|meta|nvidia|nvda|tsmc|gpu|chip|semiconductor|hbm|dram|oil|crude|wti|brent|shipping|ship|port|hormuz|red sea|suez|iran|israel|ukraine|taiwan|china|south china sea|tariff|sanction|export control|nuclear|missile|drone|supply chain|supply-chain|invasion|military|ai model|frontier model|app store|government contract|projectile|uae|united states|u\.s\.|virus|outbreak|disease|clinical|biosecurity|federal reserve|interest rate|inflation|cpi|gdp|recession|election|opec|rare earth|lithium|copper|疫情)/i.test(
      haystack,
    );
  return !blocked && (profile.bucket !== 'other' || matchesStrategicMarketDiscovery(haystack)) && strategicSignal;
}

function extractCommentPlainText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => extractCommentPlainText(item)).join(' ').trim();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const textPart = typeof record.text === 'string' ? record.text : '';
    const contentPart = extractCommentPlainText(record.content);
    const attrsPart = extractCommentPlainText(record.attrs);
    return [textPart, contentPart, attrsPart].filter(Boolean).join(' ').trim();
  }
  return '';
}

function extractRichTextSummary(value: unknown, max = 320): string {
  return compactText(extractCommentPlainText(value), max);
}

function formatCnMonthDay(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function buildInternalResolveAt(daysFromNow: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString();
}

function findTemplateSignals(signals: WorldSignal[], template: InternalQuestionTemplate) {
  return signals
    .filter((signal) => {
      const haystack = `${signal.title} ${signal.summary} ${signal.displayTitle} ${signal.displaySummary} ${signal.tags.join(' ')}`.toLowerCase();
      return template.signal_keywords.some((keyword) => containsTerm(haystack, keyword.toLowerCase()));
    })
    .sort((left, right) => {
      const leftScore = left.hotspotScore * 0.45 + left.explorationScore * 0.25 + left.relevanceScore * 0.3;
      const rightScore = right.hotspotScore * 0.45 + right.explorationScore * 0.25 + right.relevanceScore * 0.3;
      return rightScore - leftScore || new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    })
    .slice(0, 3);
}

function internalTemplateTag(question: LiveQuestion) {
  return question.tags.find((tag) => tag.startsWith('internal-template:')) || null;
}

function internalQuestionStillOpen(question: LiveQuestion) {
  if (question.source_platform !== 'internal') return false;
  if (question.official_outcome) return false;
  const closeDays = Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at));
  return closeDays >= 0;
}

function buildInternalQuestionBackground(template: InternalQuestionTemplate, signals: WorldSignal[], hits: MetasoSearchHit[]) {
  const signalSummary = signals.length
    ? `近 30 天主信源里，最相关的是：${signals
        .map((signal) => compactText(signal.displayTitle || signal.title, 42))
        .join('；')}。`
    : '';
  const searchSummary = hits.length
    ? `秘塔补充检索里，最常见的线索是：${hits.map((hit) => compactText(hit.title, 42)).join('；')}。`
    : '';
  return compactText([template.background_lead, signalSummary, searchSummary].filter(Boolean).join(' '), 320);
}

function buildInternalQuestionSourceNote(template: InternalQuestionTemplate, signals: WorldSignal[], hits: MetasoSearchHit[]) {
  const signalPart = signals.length ? `世界信源命中 ${signals.length} 条` : '世界信源暂未直接命中';
  const searchPart = hits.length ? `秘塔补充研究 ${hits.length} 条网页结果` : '秘塔暂未返回稳定结果';
  return `内部产业题 · ${signalPart}；${searchPart}；模板 ${template.key}。`;
}

function buildInternalQuestionPlatformContext(template: InternalQuestionTemplate, signals: WorldSignal[], hits: MetasoSearchHit[]) {
  return `内部题池当前没有平台定价；这道题由世界信源 + 秘塔研究共同出题，并按 ${template.validation_mode} 规则定期验证。当前已抓到 ${signals.length} 条主信源、${hits.length} 条补充网页线索。`;
}

async function validateInternalQuestion(question: LiveQuestion): Promise<LiveQuestion> {
  if (question.source_platform !== 'internal' || question.official_outcome) return question;
  const due = Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at));
  if (due > 0) return question;

  const hits = await fetchMetasoSearchHits(question.validation_query || question.title, METASO_RESULT_LIMIT);
  if (hits.length === 0) return question;

  const priceUpRegex = /(上涨|涨价|提价|上调|走高|偏强|price(?:s)?\s+(?:rose|rising|higher|up|firm|increase))/i;
  const priceDownRegex = /(下跌|降价|回落|转弱|走低|疲软|price(?:s)?\s+(?:fell|falling|lower|down|decline|soften))/i;
  const supplyEaseRegex = /(缓解|改善|扩产|产能提升|交期缩短|供货改善|availability improved|shortage eased|lead times? shortened|capacity ramp|more supply)/i;
  const supplyTightRegex = /(紧张|短缺|吃紧|瓶颈|受限|排队|交期拉长|tight supply|shortage|allocation|bottleneck|lead times? extended)/i;

  let positive = 0;
  let negative = 0;
  for (const hit of hits) {
    const haystack = `${hit.title} ${hit.snippet}`;
    if (question.validation_mode === 'metaso-price-up') {
      if (priceUpRegex.test(haystack)) positive += 1;
      if (priceDownRegex.test(haystack)) negative += 1;
    } else if (question.validation_mode === 'metaso-price-down') {
      if (priceDownRegex.test(haystack)) positive += 1;
      if (priceUpRegex.test(haystack)) negative += 1;
    } else if (question.validation_mode === 'metaso-supply-ease') {
      if (supplyEaseRegex.test(haystack)) positive += 1;
      if (supplyTightRegex.test(haystack)) negative += 1;
    } else if (question.validation_mode === 'metaso-supply-tight') {
      if (supplyTightRegex.test(haystack)) positive += 1;
      if (supplyEaseRegex.test(haystack)) negative += 1;
    }
  }

  if (positive === negative) return question;
  const official_outcome: LiveQuestionSide = positive > negative ? 'yes' : 'no';
  const verifiedAt = nowIso();

  return {
    ...question,
    official_outcome,
    official_resolved_at: verifiedAt,
    status: 'resolved',
    updated_at: verifiedAt,
    source_note: compactText(
      `${question.source_note || '内部产业题'} 到期后已用秘塔补充验证；最近一轮命中 ${hits.length} 条结果，判断为 ${
        official_outcome === 'yes' ? 'YES' : 'NO'
      }。`,
      320,
    ),
  };
}

function applyManualVerifiedOutcome(question: LiveQuestion): LiveQuestion {
  if (question.official_outcome) return question;
  const override = MANUAL_VERIFIED_OUTCOMES[question.origin_url || ''];
  if (!override) return question;

  return {
    ...question,
    official_outcome: override.official_outcome,
    official_resolved_at: override.official_resolved_at,
    status: 'resolved',
    updated_at: nowIso(),
    source_note: compactText([question.source_note, override.note].filter(Boolean).join(' '), 320),
    platform_context: compactText(
      [
        question.platform_context,
        '当前运行环境直连 Polymarket 结算接口不稳定，这题先按人工核验过的官方结果回写，并在后续自动同步恢复后继续用平台结算兜底。',
      ]
        .filter(Boolean)
        .join(' '),
      320,
    ),
  };
}

async function _buildInternalIndustryQuestions(store: LiveBenchStore, signals: WorldSignal[]): Promise<LiveQuestion[]> {
  const freshSignals = signals.filter((signal) => new Date(signal.publishedAt).getTime() >= Date.now() - WATCHLIST_WINDOW_DAYS * 86400000);
  const questions: LiveQuestion[] = [];

  for (const template of INTERNAL_INDUSTRY_TEMPLATES) {
    const existing = store.questions.find(
      (question) => internalQuestionStillOpen(question) && internalTemplateTag(question) === `internal-template:${template.key}`,
    );
    const matchedSignals = findTemplateSignals(freshSignals, template);
    const fallbackSignals =
      matchedSignals.length > 0
        ? matchedSignals
        : freshSignals
            .filter((signal) => {
              const haystack = `${signal.title} ${signal.summary} ${signal.displayTitle} ${signal.displaySummary} ${signal.tags.join(' ')}`;
              return questionTopicProfileForText(haystack).bucket === template.topic_bucket;
            })
            .sort((left, right) => {
              const leftScore = left.hotspotScore * 0.45 + left.explorationScore * 0.25 + left.relevanceScore * 0.3;
              const rightScore = right.hotspotScore * 0.45 + right.explorationScore * 0.25 + right.relevanceScore * 0.3;
              return rightScore - leftScore || new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
            })
            .slice(0, 3);
    const hits = await fetchMetasoSearchHits(template.metaso_query, 3);
    if (fallbackSignals.length === 0 && hits.length === 0 && !existing) continue;

    const resolveAt = existing?.resolve_at || buildInternalResolveAt(template.resolve_in_days);
    const openAt = existing?.open_at || nowIso();
    const questionId = existing?.question_id || `internal:${template.key}:${resolveAt.slice(0, 10)}`;
    const title = template.question_title(formatCnMonthDay(resolveAt));
    const base: LiveQuestion = {
      question_id: questionId,
      source_platform: 'internal',
      discovered_via: 'internal-metaso-scout',
      source_question_id: questionId,
      origin_url: '',
      title,
      title_zh: title,
      background: buildInternalQuestionBackground(template, fallbackSignals, hits),
      background_zh: buildInternalQuestionBackground(template, fallbackSignals, hits),
      resolution_criteria: template.resolution_criteria,
      resolution_criteria_zh: template.resolution_criteria,
      region_hint: template.region_hint,
      topic_bucket: template.topic_bucket,
      tags: [...template.tags, `internal-template:${template.key}`],
      open_at: openAt,
      freeze_at: resolveAt,
      close_at: resolveAt,
      resolve_at: resolveAt,
      status: 'pending',
      official_outcome: existing?.official_outcome || null,
      official_resolved_at: existing?.official_resolved_at || null,
      platform_probability_yes: null,
      platform_probability_updated_at: nowIso(),
      display_mode: 'consensus',
      platform_commentary: compactQuestionSignals([
        buildInternalQuestionBackground(template, fallbackSignals, hits),
      ]),
      platform_participants: compactQuestionSignals([
        fallbackSignals.length ? `世界信源命中 ${fallbackSignals.length} 条` : '',
        hits.length ? `秘塔补充 ${hits.length} 条` : '',
      ]),
      platform_market_structure: [],
      platform_question_url: null,
      source_note: buildInternalQuestionSourceNote(template, fallbackSignals, hits),
      raw_source_platform: 'Internal Industry Desk',
      validation_mode: template.validation_mode,
      validation_query: template.validation_query,
      platform_context: buildInternalQuestionPlatformContext(template, fallbackSignals, hits),
      updated_at: nowIso(),
      created_at: existing?.created_at || nowIso(),
    };
    const validated = await validateInternalQuestion(base);
    questions.push({
      ...validated,
      status: classifyQuestionStatus(validated),
    });
  }

  return questions.filter((question) => question.status !== 'pending');
}

async function syncExternalDiscussionVotes(store: LiveBenchStore) {
  const candidateQuestions = store.questions
    .filter((question) => question.source_platform === 'manifold')
    .filter((question) => question.status === 'active' || question.status === 'watchlist')
    .slice(0, MANIFOLD_COMMENT_SYNC_LIMIT);

  for (const question of candidateQuestions) {
    const contractId = question.source_question_id;
    if (!contractId) continue;
    const comments = await fetchJsonWithTimeout<Array<Record<string, unknown>>>(
      `https://api.manifold.markets/v0/comments?contractId=${encodeURIComponent(contractId)}`,
      {
        headers: { 'User-Agent': 'world-source-knowledge/1.0' },
      },
      10000,
    );
    if (!Array.isArray(comments) || comments.length === 0) continue;

    for (const comment of comments.slice(0, 8)) {
      const commentId = compactText(String(comment.id || ''), 80);
      if (!commentId) continue;
      const existing = store.votes.find((vote) => vote.vote_id === `external:${commentId}`);
      if (existing) continue;

      const text = compactText(extractCommentPlainText(comment.content), 320);
      if (!text || text.length < 12) continue;

      const outcomeRaw = compactText(String(comment.commentorPositionOutcome || ''), 24).toUpperCase();
      const prob = Number(comment.commentorPositionProb || 0);
      const side: LiveQuestionSide =
        outcomeRaw === 'YES' ? 'yes' : outcomeRaw === 'NO' ? 'no' : prob >= 0.5 ? 'yes' : 'no';
      const probability_yes = clamp(Number.isFinite(prob) && prob > 0 ? prob : side === 'yes' ? 0.62 : 0.38, 0.01, 0.99);
      const author = compactText(String(comment.userName || comment.userUsername || '外部讨论'), 64);
      const createdAt = Number(comment.createdTime || 0);

      store.votes.unshift({
        vote_id: `external:${commentId}`,
        question_id: question.question_id,
        xia_id: `external:${commentId}`,
        source: 'external',
        contributor_kind: 'community',
        contributor_label: author || '外部讨论',
        origin_url: question.origin_url || null,
        side,
        probability_yes,
        human_readable_prediction: side === 'yes' ? '我倾向赞成。' : '我倾向不赞成。',
        human_readable_why: text,
        cited_signal_ids: [],
        cited_vote_ids: [],
        what_changes_my_mind: '',
        created_at: createdAt ? new Date(createdAt).toISOString() : nowIso(),
        freeze_probability_yes: question.platform_probability_yes,
        resolved_outcome: question.official_outcome || null,
        resolved_at: question.official_resolved_at || null,
        points_delta: question.official_outcome
          ? side === question.official_outcome
            ? Number(impliedPayout(question.platform_probability_yes, side).toFixed(2))
            : -1
          : null,
        brier_score:
          question.official_outcome === 'yes'
            ? Number(((probability_yes - 1) ** 2).toFixed(4))
            : question.official_outcome === 'no'
              ? Number((probability_yes ** 2).toFixed(4))
              : null,
      });
    }
  }
}

function filterQuestionTopic(question: LiveQuestion) {
  return matchesTopicText(question.title, `${question.background} ${question.resolution_criteria}`);
}

function hasQuestionQuality(question: LiveQuestion) {
  const title = String(question.title || '').trim();
  if (!title || title.length < 18) return false;

  const normalized = title.toLowerCase();
  if (/^(will i|daily market|daily coinflip|free lottery|will it rain)/.test(normalized)) {
    return false;
  }
  if (/\[(polymarket|manifold)\]/i.test(title)) {
    return false;
  }
  if (/[\u0600-\u06ff]/.test(title)) {
    return false;
  }
  if (/(ethereum|solana|xrp|hyperliquid|btc|bitcoin)/i.test(title)) {
    return false;
  }
  if (/\b(5m|15m|30m|1h|4h)\b/i.test(title)) {
    return false;
  }
  if (/\b\d{1,2}:\d{2}(am|pm)\b/i.test(title)) {
    return false;
  }
  if (/^(yes|no)\s+[a-z]/i.test(title)) {
    return false;
  }
  if (/\b(vs|versus)\b/i.test(title)) {
    return false;
  }
  if ((title.match(/\byes\b/gi) || []).length >= 3) {
    return false;
  }
  if (/,yes\s+/i.test(title)) {
    return false;
  }
  if (/\b(brent council|yellow globes|retain control of brent council)\b/i.test(title)) {
    return false;
  }
  if (/\b(survivor|episode|season|contestant|eliminated|match|tennis|nba|nfl|mlb|nhl|atp|wta)\b/i.test(title)) {
    return false;
  }
  if (/\b(counter-?strike|cs2|esports|valorant|dota|league of legends|group stage|bo3|bo5)\b/i.test(title)) {
    return false;
  }

  return true;
}

function hasQuestionQualityText(title: string) {
  return hasQuestionQuality({ title } as LiveQuestion);
}

export function isLiveBenchSettlementPending(question: Pick<LiveQuestion, 'close_at' | 'resolve_at' | 'official_outcome'>) {
  if (question.official_outcome) return false;
  const closeDays = Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at));
  return closeDays < 0 && closeDays >= -SETTLEMENT_PENDING_WINDOW_DAYS;
}

function classifyQuestionStatus(question: Pick<LiveQuestion, 'close_at' | 'resolve_at' | 'official_outcome'>): LiveQuestionStatus {
  if (question.official_outcome) return 'resolved';
  const closeDays = Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at));
  if (closeDays < 0) return closeDays >= -SETTLEMENT_PENDING_WINDOW_DAYS ? 'watchlist' : 'pending';
  if (closeDays <= ACTIVE_WINDOW_DAYS) return 'active';
  if (closeDays <= WATCHLIST_WINDOW_DAYS) return 'watchlist';
  return 'pending';
}

async function fetchMetaculusQuestions(): Promise<{ questions: LiveQuestion[]; status: string }> {
  const token = (process.env.METACULUS_API_TOKEN || '').trim();
  if (!token) {
    return { questions: [], status: '未配置 METACULUS_API_TOKEN，当前不会接入 Metaculus 题池' };
  }

  try {
    const headers = {
      Authorization: `Token ${token}`,
      'User-Agent': 'world-source-knowledge/1.0',
    };
    const payloads = await Promise.all([
      fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
        'https://www.metaculus.com/api/posts/?statuses=open&forecast_type=binary&order_by=-hotness&limit=160',
        { headers },
      ),
      fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
        'https://www.metaculus.com/api/posts/?statuses=resolved&forecast_type=binary&order_by=-hotness&limit=120',
        { headers },
      ),
    ]);
    const mergedResults = payloads.flatMap((payload) => payload?.results || []);
    if (mergedResults.length === 0) {
      return { questions: [], status: 'Metaculus 请求失败或超时' };
    }
    const questions: LiveQuestion[] = [];
    for (const item of mergedResults) {
      const id = String(item.id || '').trim();
      const title = compactText(String(item.title || ''), 220);
      const question = item.question as
        | (Record<string, unknown> & {
            aggregations?: {
              recency_weighted?: {
                latest?: {
                  centers?: {
                    full_weight?: number;
                  };
                };
              };
            };
          })
        | undefined;
      const probability = Number(item.community_prediction || question?.aggregations?.recency_weighted?.latest?.centers?.full_weight);
      const draft: LiveQuestion = {
        question_id: `metaculus:${id}`,
        source_platform: 'metaculus',
        discovered_via: 'metaculus-direct',
        source_question_id: id,
        origin_url: `https://www.metaculus.com/questions/${id}/`,
        title,
        background: compactText(String(item.description || item.short_description || title), 320),
        resolution_criteria: compactText(String(question?.resolution_criteria || item.resolution_criteria || '以 Metaculus 官方 resolved outcome 为准。'), 320),
        region_hint: inferRegion(title),
        topic_bucket: topicBucketForText(title),
        tags: [],
        open_at: String(item.created_at || item.created_time || '') || null,
        freeze_at: String(question?.cp_reveal_time || item.cp_reveal_time || '') || null,
        close_at: String(question?.scheduled_close_time || item.scheduled_close_time || '') || null,
        resolve_at: String(question?.scheduled_resolve_time || item.scheduled_resolve_time || '') || null,
        status: 'pending',
        official_outcome: null,
        official_resolved_at: null,
        platform_probability_yes: Number.isFinite(probability) ? clamp(probability, 0.01, 0.99) : null,
        platform_probability_updated_at: nowIso(),
        display_mode: 'consensus',
        platform_commentary: compactQuestionSignals([
          Number.isFinite(probability) ? `社区预测 YES ${Math.round(clamp(probability, 0.01, 0.99) * 100)}%` : '社区预测当前不可用',
          compactText(String(question?.resolution_criteria || item.resolution_criteria || ''), 120),
        ]),
        platform_participants: compactQuestionSignals([
          typeof item.nr_forecasters === 'number' ? `${Math.round(Number(item.nr_forecasters))} 位预测者` : '',
          typeof item.comment_count === 'number' ? `${Math.round(Number(item.comment_count))} 条评论` : '',
        ]),
        platform_market_structure: [],
        platform_question_url: `https://www.metaculus.com/questions/${id}/`,
        source_note: `Metaculus 直连题源${Number.isFinite(probability) ? `；社区概率 YES ${Math.round(clamp(probability, 0.01, 0.99) * 100)}%` : ''}。`,
        platform_context: Number.isFinite(probability)
          ? `Metaculus 当前社区概率为 YES ${Math.round(clamp(probability, 0.01, 0.99) * 100)}%，可直接拿来和内部共识做偏移对照。`
          : 'Metaculus 直连题源，但当前没有拿到稳定可用的社区概率。',
        raw_source_platform: 'Metaculus',
        updated_at: nowIso(),
        created_at: nowIso(),
      };
      draft.status = classifyQuestionStatus(draft);
      if (filterQuestionTopic(draft) && draft.status !== 'pending') {
        questions.push(draft);
      }
    }
    return { questions, status: `Metaculus 直连 ${questions.length} 题` };
  } catch (error) {
    return {
      questions: [],
      status: `Metaculus 失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function fetchMetaforecastGraphql<T>(query: string, timeoutMs = 15000): Promise<T | null> {
  const url = new URL(METAFORECAST_GRAPHQL_URL);
  url.searchParams.set('query', query);
  const payload = await fetchJsonWithTimeout<{ data?: T }>(url.toString(), undefined, timeoutMs);
  return payload?.data || null;
}

async function fetchMetaforecastDiscoveries(): Promise<{
  discoveries: MetaforecastDiscovery[];
  status: string;
  scanned_count: number;
  platform_candidate_count: number;
}> {
  try {
    const discoveries: MetaforecastDiscovery[] = [];
    let afterCursor: string | null = null;
    let page = 0;
    let scannedCount = 0;

    while (page < METAFORECAST_MAX_PAGES) {
      const afterClause: string = afterCursor ? `, after: ${JSON.stringify(afterCursor)}` : '';
      const data: MetaforecastQuestionsResponse | null = await fetchMetaforecastGraphql<MetaforecastQuestionsResponse>(
        `{ questions(first: ${METAFORECAST_PAGE_SIZE}, orderBy: FIRST_SEEN_DESC${afterClause}) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                url
                description
                fetchedStr
                firstSeenStr
                platform { id label }
                qualityIndicators { stars volume liquidity }
              }
            }
          }
        }`,
      );
      if (!data?.questions?.edges?.length) {
        if (page === 0) {
          return {
            discoveries: [],
            scanned_count: 0,
            platform_candidate_count: 0,
            status: 'Metaforecast GraphQL 未返回可解析题目数据，可能被上游安全检查或网络策略拦截',
          };
        }
        break;
      }

      scannedCount += data.questions.edges.length;

      discoveries.push(
        ...data.questions.edges
          .map((edge: { node?: MetaforecastQuestionNode }) => edge.node)
          .filter((node): node is NonNullable<typeof node> => Boolean(node?.id && node?.title && node?.url))
          .map((node) => ({
            id: String(node.id),
            title: compactText(String(node.title || ''), 220),
            url: String(node.url || ''),
            description: compactText(String(node.description || node.title || ''), 500),
            platform_id: String(node.platform?.id || ''),
            platform_label: String(node.platform?.label || ''),
            fetched_at: String(node.fetchedStr || '') || null,
            first_seen_at: String(node.firstSeenStr || '') || null,
            stars: Number(node.qualityIndicators?.stars || 0),
            volume: typeof node.qualityIndicators?.volume === 'number' ? node.qualityIndicators.volume : null,
            liquidity: typeof node.qualityIndicators?.liquidity === 'number' ? node.qualityIndicators.liquidity : null,
          })),
      );

      afterCursor = data.questions.pageInfo?.hasNextPage ? String(data.questions.pageInfo?.endCursor || '') || null : null;
      if (!afterCursor) {
        break;
      }
      page += 1;
    }

    const platformCandidates = discoveries.filter((item) => /^(Manifold Markets|Metaculus|Polymarket)$/i.test(item.platform_label));
    const filtered = platformCandidates
      .filter((item) => matchesTopicText(item.title, item.description))
      .filter((item) => hasQuestionQualityText(item.title));

    const byPlatform = filtered.reduce<Record<string, number>>((accumulator, item) => {
      const key = item.platform_label || 'Unknown';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
    const parts = Object.entries(byPlatform)
      .sort((left, right) => right[1] - left[1])
      .map(([label, count]) => `${label} ${count} 题`);

    return {
      discoveries: filtered,
      scanned_count: scannedCount,
      platform_candidate_count: platformCandidates.length,
      status: filtered.length
        ? `Metaforecast GraphQL 已直连，扫描 ${scannedCount} 条、平台候选 ${platformCandidates.length} 条后筛到相关候选 ${filtered.length} 题${parts.length ? `（${parts.join('，')}）` : ''}`
        : `Metaforecast GraphQL 已直连，但扫描最近 ${scannedCount} 条、平台候选 ${platformCandidates.length} 条后还没有筛到相关候选题`,
    };
  } catch (error) {
    return {
      discoveries: [],
      scanned_count: 0,
      platform_candidate_count: 0,
      status: `Metaforecast GraphQL 失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function resolvePlatformFromLabel(label: string): LiveQuestionPlatform | null {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'metaculus') return 'metaculus';
  if (normalized === 'manifold markets' || normalized === 'manifold') return 'manifold';
  if (normalized === 'polymarket') return 'polymarket';
  return null;
}

function buildIsoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
}

function parseQuestionDeadline(value: string) {
  const text = compactText(value, 800);
  if (!text) return null;

  const monthPattern =
    '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
  const normalizeYear = (raw: string | undefined) => {
    const cleaned = String(raw || '').trim().replace(/^'/, '');
    if (!cleaned) return null;
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return null;
    if (value < 100) return 2000 + value;
    if (value >= 2000 && value <= 2099) return value;
    return null;
  };
  const candidates = [
    text,
    text
      .replace(/[-_/]+/g, ' ')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim(),
  ];

  for (const candidate of candidates) {
    const isoDate = candidate.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
    if (isoDate) {
      return buildIsoDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
    }

    const slashDate = candidate.match(/\b(\d{1,2})\/(\d{1,2})\/((?:20)?\d{2})\b/);
    if (slashDate) {
      const year = normalizeYear(slashDate[3]);
      if (year) {
        return buildIsoDate(year, Number(slashDate[1]), Number(slashDate[2]));
      }
    }

    const longDate = candidate.match(
      new RegExp(`\\b(?:before|by|on|before\\s+the\\s+end\\s+of)?\\s*${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+'?((?:20)?\\d{2})\\b`, 'i'),
    );
    if (longDate) {
      const month = monthNumber(longDate[1]);
      const year = normalizeYear(longDate[3]);
      if (month && year) {
        return buildIsoDate(year, month, Number(longDate[2]));
      }
    }

    const dayMonthDate = candidate.match(
      new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthPattern}(?:,)?\\s+'?((?:20)?\\d{2})\\b`, 'i'),
    );
    if (dayMonthDate) {
      const month = monthNumber(dayMonthDate[2]);
      const year = normalizeYear(dayMonthDate[3]);
      if (month && year) {
        return buildIsoDate(year, month, Number(dayMonthDate[1]));
      }
    }

    const monthYear = candidate.match(new RegExp(`\\b(?:before|by|on)?\\s*${monthPattern}\\s+((?:20\\d{2})|'\\d{2})\\b`, 'i'));
    if (monthYear) {
      const month = monthNumber(monthYear[1]);
      const year = normalizeYear(monthYear[2]);
      if (month && year) {
        return buildIsoDate(year, month, 1);
      }
    }
  }

  return null;
}

function buildDiscoveryFallbackQuestions(
  discoveries: MetaforecastDiscovery[],
  platform: LiveQuestionPlatform,
  polymarketSnapshots?: Map<string, PolymarketMarketSnapshot>,
) {
  const questions: LiveQuestion[] = [];
  const seen = new Set<string>();

  for (const item of discoveries) {
    if (resolvePlatformFromLabel(item.platform_label) !== platform) continue;
    const title = compactText(item.title, 220);
    if (!matchesTopicText(title, item.description) || !hasQuestionQualityText(title)) continue;

    const resolveAt = parseQuestionDeadline(`${item.title}\n${item.description}\n${item.url}`);
    if (!resolveAt) continue;

    const question: LiveQuestion = {
      question_id: `${platform}:metaforecast:${item.id}`,
      source_platform: platform,
      discovered_via: 'metaforecast-discovery',
      source_question_id: item.id,
      origin_url: item.url,
      title,
      background: compactText(item.description || title, 320),
      resolution_criteria:
        platform === 'metaculus'
          ? '以 Metaculus 官方结算结果为准。'
          : platform === 'manifold'
            ? '以 Manifold 官方结算结果为准。'
            : '以 Polymarket 官方结算结果为准。',
      region_hint: inferRegion(`${title} ${item.description}`),
      topic_bucket: topicBucketForText(`${title} ${item.description}`),
      tags: [],
      open_at: item.first_seen_at || item.fetched_at || null,
      freeze_at: resolveAt,
      close_at: resolveAt,
      resolve_at: resolveAt,
      status: 'pending',
      official_outcome: null,
      official_resolved_at: null,
      platform_probability_yes: null,
      platform_probability_updated_at: item.fetched_at || nowIso(),
      display_mode: 'consensus',
      platform_commentary: compactQuestionSignals([
        item.description,
        item.stars ? `质量星级 ${item.stars}` : '',
      ]),
      platform_participants: compactQuestionSignals([
        item.volume !== null ? `成交量 ${Math.round(item.volume)}` : '',
        item.liquidity !== null ? `流动性 ${Math.round(item.liquidity)}` : '',
      ]),
      platform_market_structure: [],
      platform_question_url: item.url,
      source_note: `通过 Metaforecast 聚合发现；质量星级 ${item.stars || 0}，${
        item.volume !== null ? `成交量 ${Math.round(item.volume)}` : '成交量待补'
      }，${item.liquidity !== null ? `流动性 ${Math.round(item.liquidity)}` : '流动性待补'}。`,
      raw_source_platform: item.platform_label,
      platform_context:
        item.volume !== null || item.liquidity !== null
          ? `${item.platform_label} 当前先走 Metaforecast 聚合补位，已拿到${
              item.volume !== null ? `成交量 ${Math.round(item.volume)}` : '部分成交信息'
            }，${item.liquidity !== null ? `流动性 ${Math.round(item.liquidity)}` : '部分流动性信息'}。`
          : `${item.platform_label} 当前先走 Metaforecast 聚合补位，先保留题面与平台原链接，等待更完整的直连市场信息。`,
      updated_at: nowIso(),
      created_at: nowIso(),
    };

    if (platform === 'polymarket') {
      const slug = polymarketSlugFromUrl(item.url);
      const snapshot = slug ? polymarketSnapshots?.get(slug) || null : null;
      if (snapshot) {
        if (snapshot.resolveAt) {
          question.freeze_at = snapshot.resolveAt;
          question.close_at = snapshot.resolveAt;
          question.resolve_at = snapshot.resolveAt;
        }
        question.platform_probability_yes = snapshot.probabilityYes;
        question.platform_probability_updated_at = item.fetched_at || nowIso();
        question.official_outcome = snapshot.officialOutcome;
        question.official_resolved_at = snapshot.officialResolvedAt;
        question.platform_commentary = snapshot.commentary;
        question.platform_participants = snapshot.participants;
        question.source_note = `${question.source_note}；官方市场补全成功。`;
        question.platform_context = snapshot.platformContext;
      }
    }

    question.status = classifyQuestionStatus(question);
    if (question.status === 'pending') continue;

    const semanticKey = normalizeTag(`${question.title}|${question.resolve_at}|${question.source_platform}`);
    if (seen.has(semanticKey)) continue;
    seen.add(semanticKey);
    questions.push(question);
  }

  return questions;
}

function polymarketSlugFromUrl(url: string) {
  const match = String(url || '').match(/polymarket\.com\/(?:market|event)\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

type PolymarketMarketSnapshot = {
  slug: string;
  conditionId: string;
  title: string;
  resolveAt: string | null;
  probabilityYes: number | null;
  officialOutcome: LiveQuestionSide | null;
  officialResolvedAt: string | null;
  commentary: string[];
  participants: string[];
  sourceNote: string;
  platformContext: string;
};

function parsePolymarketOutcomePrices(item: Record<string, unknown>) {
  const rawOutcomes = item.outcomes;
  const rawPrices = item.outcomePrices;
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = Array.isArray(rawOutcomes)
      ? rawOutcomes.map(String)
      : typeof rawOutcomes === 'string'
        ? JSON.parse(rawOutcomes)
        : [];
  } catch {
    outcomes = [];
  }
  try {
    prices = Array.isArray(rawPrices)
      ? rawPrices.map((value) => Number(value))
      : typeof rawPrices === 'string'
        ? JSON.parse(rawPrices).map((value: unknown) => Number(value))
        : [];
  } catch {
    prices = [];
  }
  if (!Array.isArray(outcomes) || !Array.isArray(prices) || outcomes.length !== prices.length) {
    return { outcomes: [] as string[], prices: [] as number[] };
  }
  return { outcomes, prices };
}

function pickPolymarketProbabilityYes(title: string, outcomes: string[], prices: number[]) {
  if (!outcomes.length || !prices.length) return null;
  const yesIndex = outcomes.findIndex((item) => /^yes$/i.test(String(item)));
  if (yesIndex >= 0) return Number.isFinite(prices[yesIndex]) ? clamp(prices[yesIndex], 0.01, 0.99) : null;
  if (/up or down/i.test(title)) {
    const upIndex = outcomes.findIndex((item) => /^up$/i.test(String(item)));
    if (upIndex >= 0) return Number.isFinite(prices[upIndex]) ? clamp(prices[upIndex], 0.01, 0.99) : null;
  }
  return null;
}

function shouldKeepQuestionForArenaSync(question: Pick<LiveQuestion, 'official_outcome' | 'official_resolved_at' | 'resolve_at' | 'close_at'>) {
  if (question.official_outcome) {
    const referenceTime = question.official_resolved_at || question.resolve_at || question.close_at;
    return Math.abs(daysUntil(referenceTime)) <= LIVEBENCH_RECENTLY_RESOLVED_WINDOW_DAYS;
  }
  const closeDays = Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at));
  return closeDays >= -SETTLEMENT_PENDING_WINDOW_DAYS && closeDays <= WATCHLIST_WINDOW_DAYS;
}

function normalizeStoredQuestionForArena(question: LiveQuestion): LiveQuestion {
  let next: LiveQuestion = { ...question };
  if (next.source_platform === 'polymarket') {
    const slug = polymarketSlugFromUrl(next.origin_url || next.platform_question_url || '') || '';
    const normalizedResolveAt = choosePolymarketResolveAt(next.resolve_at || next.close_at || null, next.title, slug);
    if (normalizedResolveAt) {
      next = {
        ...next,
        freeze_at: normalizedResolveAt,
        close_at: normalizedResolveAt,
        resolve_at: normalizedResolveAt,
        official_resolved_at: next.official_outcome ? next.official_resolved_at || normalizedResolveAt : next.official_resolved_at || null,
      };
    }
  }
  const resolvedQuestion = applyManualVerifiedOutcome(next);
  return {
    ...resolvedQuestion,
    status: classifyQuestionStatus(resolvedQuestion),
  };
}

function questionSemanticRetentionKey(question: Pick<LiveQuestion, 'title' | 'region_hint' | 'topic_bucket'>) {
  return normalizeTag(`${question.title}|${question.region_hint}|${question.topic_bucket}`);
}

function questionOriginRetentionKey(question: Pick<LiveQuestion, 'origin_url' | 'platform_question_url' | 'question_id'>) {
  return normalizeTag(question.origin_url || question.platform_question_url || question.question_id);
}

function isExternalLiveBenchQuestion(question: Pick<LiveQuestion, 'source_platform'>) {
  return question.source_platform !== 'internal';
}

function retainRecentResolvedQuestions(current: LiveQuestion[], previous: LiveQuestion[]) {
  const retained: LiveQuestion[] = [];
  const seenOrigins = new Set(current.map((question) => questionOriginRetentionKey(question)));
  const seenSemantics = new Set(current.map((question) => questionSemanticRetentionKey(question)));

  for (const prior of previous) {
    const resolvedPrior = applyManualVerifiedOutcome(prior);
    if (!isExternalLiveBenchQuestion(resolvedPrior)) continue;
    if (!resolvedPrior.official_outcome) continue;
    if (!shouldKeepQuestionForArenaSync(resolvedPrior)) continue;

    const originKey = questionOriginRetentionKey(resolvedPrior);
    const semanticKey = questionSemanticRetentionKey(resolvedPrior);
    if (seenOrigins.has(originKey) || seenSemantics.has(semanticKey)) continue;

    retained.push({
      ...resolvedPrior,
      status: classifyQuestionStatus(resolvedPrior),
      updated_at: nowIso(),
    });
    seenOrigins.add(originKey);
    seenSemantics.add(semanticKey);
  }

  return retained;
}

function retainRecentOpenQuestions(previous: LiveQuestion[]) {
  return previous
    .map(normalizeStoredQuestionForArena)
    .filter(isExternalLiveBenchQuestion)
    .filter((question) => !question.official_outcome)
    .filter((question) => question.status !== 'pending')
    .filter((question) => shouldKeepQuestionForArenaSync(question));
}

function applyPolymarketSnapshotToQuestion(question: LiveQuestion, snapshot: PolymarketMarketSnapshot): LiveQuestion {
  const next: LiveQuestion = {
    ...question,
    source_question_id: snapshot.conditionId || question.source_question_id,
    title: question.title || snapshot.title,
    platform_probability_yes: snapshot.probabilityYes,
    platform_probability_updated_at: nowIso(),
    platform_commentary: snapshot.commentary.length ? snapshot.commentary : question.platform_commentary,
    platform_participants: snapshot.participants.length ? snapshot.participants : question.platform_participants,
    source_note: snapshot.sourceNote || question.source_note,
    platform_context: snapshot.platformContext || question.platform_context,
    updated_at: nowIso(),
  };

  if (snapshot.resolveAt) {
    next.freeze_at = snapshot.resolveAt;
    next.close_at = snapshot.resolveAt;
    next.resolve_at = snapshot.resolveAt;
  }

  if (snapshot.officialOutcome) {
    next.official_outcome = snapshot.officialOutcome;
    next.official_resolved_at = snapshot.officialResolvedAt || snapshot.resolveAt || nowIso();
  }

  next.status = classifyQuestionStatus(next);
  return next;
}

function mapManifoldResolutionToSide(resolution: unknown): LiveQuestionSide | null {
  const text = String(resolution || '').trim().toUpperCase();
  if (text === 'YES') return 'yes';
  if (text === 'NO') return 'no';
  return null;
}

async function refreshRetainedQuestionFromPlatform(question: LiveQuestion): Promise<LiveQuestion> {
  if (question.official_outcome) return question;

  if (question.source_platform === 'polymarket') {
    const slug =
      polymarketSlugFromUrl(question.origin_url || '') || polymarketSlugFromUrl(question.platform_question_url || '');
    if (!slug) return question;
    try {
      const snapshot = await fetchPolymarketSnapshotBySlug(slug);
      return snapshot ? applyPolymarketSnapshotToQuestion(question, snapshot) : question;
    } catch {
      return question;
    }
  }

  if (question.source_platform === 'manifold') {
    const contractId = String(question.source_question_id || '').trim();
    if (!contractId) return question;
    try {
      const item = await fetchJsonWithTimeout<Record<string, unknown>>(
        `https://api.manifold.markets/v0/market/${encodeURIComponent(contractId)}`,
        {
          headers: { 'User-Agent': 'world-source-knowledge/1.0' },
        },
        10000,
      );
      if (!item) return question;

      const probability = Number(item.probability);
      const closeTime = Number(item.closeTime || item.resolutionTime || 0);
      const officialOutcome = item.isResolved ? mapManifoldResolutionToSide(item.resolution) : null;
      const next: LiveQuestion = {
        ...question,
        platform_probability_yes: Number.isFinite(probability) ? clamp(probability, 0.01, 0.99) : question.platform_probability_yes,
        platform_probability_updated_at: item.lastUpdatedTime ? new Date(Number(item.lastUpdatedTime)).toISOString() : nowIso(),
        updated_at: nowIso(),
      };

      if (closeTime > 0) {
        const closeAt = new Date(closeTime).toISOString();
        next.freeze_at = closeAt;
        next.close_at = closeAt;
        next.resolve_at = closeAt;
      }
      if (officialOutcome) {
        next.official_outcome = officialOutcome;
        next.official_resolved_at = item.resolutionTime ? new Date(Number(item.resolutionTime)).toISOString() : next.resolve_at || nowIso();
      }

      next.status = classifyQuestionStatus(next);
      return next;
    } catch {
      return question;
    }
  }

  return question;
}

async function refreshRetainedOpenQuestions(previous: LiveQuestion[]) {
  const retained = retainRecentOpenQuestions(previous);
  const refreshed = await Promise.all(
    retained.map((question) =>
      isLiveBenchSettlementPending(question) ? refreshRetainedQuestionFromPlatform(question) : Promise.resolve(question),
    ),
  );
  return {
    questions: refreshed,
    resolvedCount: refreshed.filter((question) => Boolean(question.official_outcome)).length,
    scheduleUpdatedCount: refreshed.filter(
      (question, index) =>
        !question.official_outcome &&
        (question.resolve_at !== retained[index]?.resolve_at || question.close_at !== retained[index]?.close_at),
    ).length,
  };
}

function buildManualVerifiedQuestions() {
  return MANUAL_VERIFIED_QUESTION_SPECS.map((spec) => {
    const question: LiveQuestion = {
      question_id: spec.question_id,
      source_platform: spec.source_platform,
      discovered_via: 'platform-direct-fallback',
      source_question_id: spec.source_question_id,
      origin_url: spec.origin_url,
      title: spec.title,
      background: spec.background,
      resolution_criteria: spec.resolution_criteria,
      region_hint: inferRegion(`${spec.title} ${spec.background}`),
      topic_bucket: topicBucketForText(`${spec.title} ${spec.background}`),
      tags: [],
      open_at: spec.resolve_at,
      freeze_at: spec.resolve_at,
      close_at: spec.resolve_at,
      resolve_at: spec.resolve_at,
      status: 'pending',
      official_outcome: null,
      official_resolved_at: null,
      platform_probability_yes: null,
      platform_probability_updated_at: spec.resolve_at,
      display_mode: 'consensus',
      platform_commentary: compactQuestionSignals([spec.background]),
      platform_participants: [],
      platform_market_structure: [],
      platform_question_url: spec.origin_url,
      source_note: '平台最近已结算题的稳定保留条目；当聚合发现暂时缩量时，仍保留官方验证与历史展示。',
      platform_context: '这道题当前作为最近已结算平台题保留在题池中，避免因为聚合发现缩量而从已结算区消失。',
      raw_source_platform: spec.raw_source_platform,
      updated_at: nowIso(),
      created_at: nowIso(),
    };
    const resolved = applyManualVerifiedOutcome(question);
    return {
      ...resolved,
      status: classifyQuestionStatus(resolved),
    } satisfies LiveQuestion;
  }).filter((question) => shouldKeepQuestionForArenaSync(question));
}

function mapPolymarketOutcomeToSide(title: string, outcome: unknown, outcomes: string[] = [], prices: number[] = []): LiveQuestionSide | null {
  const text = String(outcome || '').trim().toLowerCase();
  if (text) {
    if (text.includes('yes')) return 'yes';
    if (text.includes('no')) return 'no';
    if (/up or down on/i.test(title) || /^will .* be up on /i.test(title)) {
      if (text.includes('up')) return 'yes';
      if (text.includes('down')) return 'no';
    }
  }

  if (outcomes.length === prices.length && outcomes.length > 0) {
    const normalized = outcomes.map((item) => String(item || '').trim().toLowerCase());
    const settledIndex = prices.findIndex((value) => Number.isFinite(value) && value >= 0.999);
    const losingCount = prices.filter((value, index) => index !== settledIndex && Number.isFinite(value) && value <= 0.001).length;
    if (settledIndex >= 0 && losingCount === prices.length - 1) {
      const winner = normalized[settledIndex];
      if (winner === 'yes' || winner === 'up') return 'yes';
      if (winner === 'no' || winner === 'down') return 'no';
    }
  }
  return null;
}

function normalizePolymarketTitle(title: string, outcomes: string[]) {
  if (/up or down on/i.test(title)) {
    return title.replace(/^(.*?)\s+Up or Down on\s+(.*)\?$/i, 'Will $1 be up on $2?');
  }
  if (/^Will .* be #1 Free App/i.test(title)) {
    return title;
  }
  if (outcomes.some((item) => /^yes$/i.test(item))) {
    return title;
  }
  return title;
}

function choosePolymarketResolveAt(rawResolveAt: string | null, title: string, slug: string) {
  const rawTimestamp = parseTime(rawResolveAt);
  const rawYear = rawResolveAt ? new Date(rawResolveAt).getUTCFullYear() : Number.NaN;
  const parsedFromText = parseQuestionDeadline(`${title}\n${slug.replace(/[-_/]+/g, ' ')}`);
  if (!rawTimestamp) return parsedFromText || null;
  if (rawYear >= 2024) return rawResolveAt;
  return parsedFromText || rawResolveAt;
}

function polymarketSnapshotFromMarket(item: Record<string, unknown>): PolymarketMarketSnapshot | null {
  const conditionId = String(item.conditionId || item.id || '').trim();
  const rawSlug = String(item.slug || '').trim();
  if (!conditionId || !rawSlug) return null;

  const { outcomes, prices } = parsePolymarketOutcomePrices(item);
  const title = compactText(normalizePolymarketTitle(String(item.question || item.title || ''), outcomes), 220);
  const probability = pickPolymarketProbabilityYes(title, outcomes, prices);
  const resolveAtRaw = String(item.endDate || item.end_date_iso || item.end_datetime || '').trim() || null;
  const resolveAt = choosePolymarketResolveAt(resolveAtRaw, title, rawSlug);
  const priceSettledOutcome = mapPolymarketOutcomeToSide(title, item.outcome, outcomes, prices);
  const officialOutcome = item.closed || priceSettledOutcome ? priceSettledOutcome : null;

  return {
    slug: rawSlug,
    conditionId,
    title,
    resolveAt,
    probabilityYes: typeof probability === 'number' && Number.isFinite(probability) ? clamp(probability, 0.01, 0.99) : null,
    officialOutcome,
    officialResolvedAt: officialOutcome && resolveAt ? resolveAt : null,
    commentary: compactQuestionSignals([
      typeof probability === 'number' && Number.isFinite(probability)
        ? `市场概率 YES ${Math.round(clamp(probability, 0.01, 0.99) * 100)}%`
        : '',
      outcomes.length ? `结果项 ${outcomes.join(' / ')}` : '',
      compactText(String(item.description || ''), 120),
    ]),
    participants: compactQuestionSignals([
      Number(item.volumeNum || 0) > 0 ? `成交量 ${Math.round(Number(item.volumeNum || 0))}` : '',
      Number(item.liquidityNum || 0) > 0 ? `流动性 ${Math.round(Number(item.liquidityNum || 0))}` : '',
    ]),
    sourceNote: `Polymarket 公开市场：成交量 ${Math.round(Number(item.volumeNum || 0))}，流动性 ${Math.round(
      Number(item.liquidityNum || 0),
    )}，结果项 ${outcomes.join(' / ') || '未给出'}。`,
    platformContext:
      typeof probability === 'number' && Number.isFinite(probability)
        ? `Polymarket 当前公开定价为 YES ${Math.round(clamp(probability, 0.01, 0.99) * 100)}%，并可看到成交量、流动性和结果项。`
        : `Polymarket 当前没给出稳定可用的 YES 概率，但还能拿到成交量 ${Math.round(Number(item.volumeNum || 0))}、流动性 ${Math.round(
            Number(item.liquidityNum || 0),
          )} 和结果项。`,
  };
}

async function fetchPolymarketSnapshotBySlug(slug: string): Promise<PolymarketMarketSnapshot | null> {
  if (!slug) return null;
  const item = await fetchJsonWithTimeout<Record<string, unknown>>(
    `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`,
    {
      headers: { 'User-Agent': 'world-source-knowledge/1.0' },
    },
    12000,
  );
  if (!item) return null;
  return polymarketSnapshotFromMarket(item);
}

async function fetchManifoldQuestions(): Promise<LiveQuestion[]> {
  try {
    const openUrls = MANIFOLD_DISCOVERY_TERMS.map(
      (term) =>
        `https://api.manifold.markets/v0/search-markets?limit=30&term=${encodeURIComponent(term)}&contractType=BINARY&filter=open&sort=newest`,
    );
    const supplementalUrls = MANIFOLD_DISCOVERY_TERMS.map(
      (term) =>
        `https://api.manifold.markets/v0/search-markets?limit=20&term=${encodeURIComponent(term)}&contractType=BINARY&sort=newest`,
    );
    const urls = [...openUrls, ...supplementalUrls];
    const payloads: Array<Array<Record<string, unknown>> | null> = [];
    for (const url of urls) {
      const payload = await fetchJsonWithTimeout<Array<Record<string, unknown>>>(
        url,
        {
          headers: { 'User-Agent': 'world-source-knowledge/1.0' },
        },
        10000,
      );
      payloads.push(payload);
      const currentCount = payloads.reduce((sum, item) => sum + (Array.isArray(item) ? item.length : 0), 0);
      if (currentCount >= 900 && payloads.length >= MANIFOLD_DISCOVERY_TERMS.length) {
        break;
      }
    }
    const mergedItems = payloads.flatMap((payload) => (Array.isArray(payload) ? payload : []));
    if (mergedItems.length === 0) return [];

    const seenQuestionIds = new Set<string>();
    return mergedItems
      .map((item) => {
        const id = String(item.id || '');
        const title = compactText(String(item.question || ''), 220);
        const resolveAt = Number(item.closeTime || item.resolutionTime || 0);
        const question: LiveQuestion = {
          question_id: `manifold:${id}`,
          source_platform: 'manifold',
          discovered_via: 'platform-direct-fallback',
          source_question_id: id,
          origin_url: String(item.url || ''),
          title,
          background: extractRichTextSummary(item.description, 280) || title,
          resolution_criteria: '以 Manifold 官方 resolved outcome 为准。',
          region_hint: inferRegion(title),
          topic_bucket: topicBucketForText(title),
          tags: [],
          open_at: item.createdTime ? new Date(Number(item.createdTime)).toISOString() : null,
          freeze_at: item.closeTime ? new Date(Number(item.closeTime)).toISOString() : null,
          close_at: item.closeTime ? new Date(Number(item.closeTime)).toISOString() : null,
          resolve_at: resolveAt ? new Date(resolveAt).toISOString() : null,
          status: 'pending',
          official_outcome: item.isResolved ? ((item.resolution === 'YES' ? 'yes' : 'no') as LiveQuestionSide) : null,
          official_resolved_at: item.isResolved && resolveAt ? new Date(resolveAt).toISOString() : null,
          platform_probability_yes: Number.isFinite(Number(item.probability)) ? clamp(Number(item.probability), 0.01, 0.99) : null,
          platform_probability_updated_at: item.lastUpdatedTime ? new Date(Number(item.lastUpdatedTime)).toISOString() : nowIso(),
          display_mode: 'consensus',
          platform_commentary: compactQuestionSignals([
            extractRichTextSummary(item.description, 140),
            Number.isFinite(Number(item.probability))
              ? `市场概率 YES ${Math.round(clamp(Number(item.probability), 0.01, 0.99) * 100)}%`
              : '',
          ]),
          platform_participants: compactQuestionSignals([
            Number(item.uniqueBettorCount || 0) > 0 ? `${Math.round(Number(item.uniqueBettorCount || 0))} 位参与者` : '',
            Number(item.volume || 0) > 0 ? `成交量 ${Math.round(Number(item.volume || 0))}` : '',
            Number(item.totalLiquidity || 0) > 0 ? `流动性 ${Math.round(Number(item.totalLiquidity || 0))}` : '',
          ]),
          platform_market_structure: [],
          platform_question_url: String(item.url || ''),
          source_note: `Manifold 公开市场：${Number(item.uniqueBettorCount || 0)} 位参与者，成交量 ${Math.round(
            Number(item.volume || 0),
          )}，流动性 ${Math.round(Number(item.totalLiquidity || 0))}。`,
          platform_context: Number.isFinite(Number(item.probability))
            ? `Manifold 当前公开定价为 YES ${Math.round(clamp(Number(item.probability), 0.01, 0.99) * 100)}%，并可看到参与人数、成交量和流动性。`
            : 'Manifold 公开市场已接入，但当前没有拿到稳定可用的即时概率。',
          raw_source_platform: 'Manifold',
          updated_at: nowIso(),
          created_at: nowIso(),
        };
        question.status = classifyQuestionStatus(question);
        return question;
      })
      .filter((item) => {
        if (!item.question_id || seenQuestionIds.has(item.question_id)) return false;
        seenQuestionIds.add(item.question_id);
        return true;
      })
      .filter((item) => filterQuestionTopic(item) && hasQuestionQuality(item) && item.status !== 'pending')
      .filter((item) => shouldKeepQuestionForArenaSync(item))
      .sort((left, right) => {
        const leftDays = Math.min(daysUntil(left.resolve_at), daysUntil(left.close_at));
        const rightDays = Math.min(daysUntil(right.resolve_at), daysUntil(right.close_at));
        return leftDays - rightDays;
      })
      .slice(0, 60);
  } catch {
    return [];
  }
}

async function fetchRecentMetaforecastPolymarketSlugs(): Promise<string[]> {
  const rankedCandidates: Array<{
    slug: string;
    stars: number;
    volume: number;
    liquidity: number;
    freshness: number;
  }> = [];

  let afterCursor: string | null = null;
  let page = 0;

  while (page < Math.min(METAFORECAST_MAX_PAGES, 12)) {
    const afterClause: string = afterCursor ? `, after: ${JSON.stringify(afterCursor)}` : '';
    const data = await fetchMetaforecastGraphql<MetaforecastQuestionsResponse>(
      `{ questions(first: ${METAFORECAST_PAGE_SIZE}, orderBy: FIRST_SEEN_DESC${afterClause}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              title
              url
              description
              fetchedStr
              firstSeenStr
              platform { label }
              qualityIndicators { stars volume liquidity }
            }
          }
        }
      }`,
      20000,
    );
    if (!data?.questions?.edges?.length) break;

    for (const edge of data.questions.edges) {
      const node = edge.node;
      if (!node?.url || !node?.title) continue;
      if (String(node.platform?.label || '') !== 'Polymarket') continue;
      if (!matchesStrategicMarketDiscovery(`${node.title || ''} ${node.description || ''}`)) continue;

      const slug = polymarketSlugFromUrl(String(node.url || ''));
      if (!slug) continue;

      rankedCandidates.push({
        slug,
        stars: Number(node.qualityIndicators?.stars || 0),
        volume: typeof node.qualityIndicators?.volume === 'number' ? node.qualityIndicators.volume : 0,
        liquidity: typeof node.qualityIndicators?.liquidity === 'number' ? node.qualityIndicators.liquidity : 0,
        freshness: Date.parse(String(node.firstSeenStr || node.fetchedStr || '')) || 0,
      });
    }

    afterCursor = data.questions.pageInfo?.hasNextPage ? String(data.questions.pageInfo?.endCursor || '') || null : null;
    if (!afterCursor) break;
    page += 1;
  }

  const seen = new Set<string>();
  return rankedCandidates
    .sort((left, right) => {
      const leftScore = left.stars * 5 + left.volume * 0.002 + left.liquidity * 0.003 + left.freshness * 0.00000001;
      const rightScore = right.stars * 5 + right.volume * 0.002 + right.liquidity * 0.003 + right.freshness * 0.00000001;
      return rightScore - leftScore;
    })
    .map((item) => item.slug)
    .filter((slug) => {
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    })
    .slice(0, 64);
}

async function fetchRecentDirectPolymarketSlugs(): Promise<string[]> {
  try {
    const payloads = await Promise.all([
      fetchJsonWithTimeout<Array<Record<string, unknown>>>(
        'https://gamma-api.polymarket.com/markets?limit=200&closed=false',
        {
          headers: { 'User-Agent': 'world-source-knowledge/1.0' },
        },
        15000,
      ),
      fetchJsonWithTimeout<Array<Record<string, unknown>>>(
        'https://gamma-api.polymarket.com/markets?limit=120&closed=true',
        {
          headers: { 'User-Agent': 'world-source-knowledge/1.0' },
        },
        15000,
      ),
    ]);
    const payload = payloads.flatMap((items) => (Array.isArray(items) ? items : []));
    if (payload.length === 0) return [];

    const ranked = payload
      .map((item) => {
        const title = compactText(String(item.question || item.title || ''), 220);
        const slug = String(item.slug || '').trim();
        return {
          slug,
          title,
          score:
            Number(item.volumeNum || 0) * 0.002 +
            Number(item.liquidityNum || 0) * 0.003 +
            (Date.parse(String(item.endDate || item.createdAt || '')) || 0) * 0.00000001,
        };
      })
      .filter((item) => item.slug && matchesStrategicMarketDiscovery(item.title))
      .filter((item) => hasQuestionQualityText(item.title))
      .sort((left, right) => right.score - left.score);

    const seen = new Set<string>();
    return ranked
      .map((item) => item.slug)
      .filter((slug) => {
        if (seen.has(slug)) return false;
        seen.add(slug);
        return true;
      })
      .slice(0, 64);
  } catch {
    return [];
  }
}

async function fetchPolymarketQuestions(discoveries: MetaforecastDiscovery[] = []): Promise<LiveQuestion[]> {
  try {
    const discoverySlugs = [
      ...new Set(
        discoveries
          .filter((item) => item.platform_label === 'Polymarket')
          .map((item) => polymarketSlugFromUrl(item.url))
          .filter((item): item is string => Boolean(item)),
      ),
    ];
    const [metaforecastFallbackSlugs, directFallbackSlugs] = await Promise.all([
      fetchRecentMetaforecastPolymarketSlugs(),
      fetchRecentDirectPolymarketSlugs(),
    ]);
    const slugs = [...new Set([...discoverySlugs, ...metaforecastFallbackSlugs, ...directFallbackSlugs])].slice(0, 80);
    if (slugs.length === 0) return [];

    const payloads = await Promise.allSettled(
      slugs.map((slug) =>
        fetchJsonWithTimeout<Record<string, unknown>>(
          `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`,
          {
            headers: { 'User-Agent': 'world-source-knowledge/1.0' },
          },
          12000,
        ),
      ),
    );

    return payloads
      .filter((item): item is PromiseFulfilledResult<Record<string, unknown> | null> => item.status === 'fulfilled')
      .map((item) => item.value)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const snapshot = polymarketSnapshotFromMarket(item);
        if (!snapshot) return null;
        const question: LiveQuestion = {
          question_id: `polymarket:${snapshot.conditionId}`,
          source_platform: 'polymarket',
          discovered_via: 'platform-direct-fallback',
          source_question_id: snapshot.conditionId,
          origin_url: String(item.slug ? `https://polymarket.com/event/${item.slug}` : item.url || ''),
          title: snapshot.title,
          background: compactText(String(item.description || snapshot.title), 280),
          resolution_criteria: '以 Polymarket 官方 settled outcome 为准。',
          region_hint: inferRegion(snapshot.title),
          topic_bucket: topicBucketForText(snapshot.title),
          tags: [],
          open_at: String(item.startDate || item.createdAt || '') || null,
          freeze_at: snapshot.resolveAt,
          close_at: snapshot.resolveAt,
          resolve_at: snapshot.resolveAt,
          status: 'pending',
          official_outcome: snapshot.officialOutcome,
          official_resolved_at: snapshot.officialResolvedAt,
          platform_probability_yes: snapshot.probabilityYes,
          platform_probability_updated_at: nowIso(),
          display_mode: 'consensus',
          platform_commentary: snapshot.commentary,
          platform_participants: snapshot.participants,
          platform_market_structure: [],
          platform_question_url: String(item.slug ? `https://polymarket.com/event/${item.slug}` : item.url || ''),
          source_note: snapshot.sourceNote,
          platform_context: snapshot.platformContext,
          raw_source_platform: 'Polymarket',
          updated_at: nowIso(),
          created_at: nowIso(),
        };
        question.status = classifyQuestionStatus(question);
        return question;
      })
      .filter((item): item is LiveQuestion => Boolean(item))
      .filter((item) => filterQuestionTopic(item) && hasQuestionQuality(item) && item.status !== 'pending')
      .filter((item) => shouldKeepQuestionForArenaSync(item))
      .slice(0, 48);
  } catch {
    return [];
  }
}

function questionKeyTerms(question: LiveQuestion) {
  const stopwords = new Set([
    'will',
    'the',
    'a',
    'an',
    'of',
    'and',
    'or',
    'be',
    'before',
    'after',
    'within',
    'price',
    'single',
    'day',
    'more',
    'than',
    'officially',
    'launch',
    'publicly',
    'named',
    'new',
    'any',
    'this',
    'that',
    'into',
    'from',
    'with',
    'would',
    'could',
    'april',
    'march',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'january',
    'february',
    'free',
    'app',
    'store',
    'united',
    'states',
    'state',
    'close',
    'above',
    'below',
    'point',
    'drop',
    'rise',
    'be',
    'up',
    'down',
    'any',
    'on',
    'at',
    'in',
    'us',
    'apple',
  ]);
  const whitelist = new Set(['wti', 'oil', 'cpu', 'gpu', 'hbm', 'dram', 'ai']);
  const raw = `${question.title} ${question.background || ''} ${question.resolution_criteria || ''} ${question.topic_bucket} ${question.region_hint} ${question.tags.join(' ')}`.toLowerCase();
  const matches = raw.match(/[a-z0-9.+-]+|[\u4e00-\u9fa5]{2,}/g) || [];
  return [...new Set(matches)]
    .map((term) => term.trim())
    .filter((term) => term && !stopwords.has(term))
    .filter((term) => term.length >= 4 || whitelist.has(term) || /[\u4e00-\u9fa5]/.test(term))
    .slice(0, 18);
}

function questionAnchorTerms(question: LiveQuestion) {
  const profile = questionTopicProfile(question).bucket;
  const preferredByTopic: Record<string, string[]> = {
    'oil-price': ['wti', 'brent', 'oil', 'crude', 'barrel', 'tanker', 'shipping', 'hormuz'],
    'shipping-flow': ['shipping', 'hormuz', 'strait', 'tanker', 'vessel', 'transit', 'portwatch'],
    'chip-supply': ['nvidia', 'nvda', 'gpu', 'hbm', 'dram', 'chip', 'semiconductor', 'server', 'datacenter'],
    'frontier-ai': ['openai', 'anthropic', 'claude', 'gemini', 'model', 'launch', 'release', 'app'],
    'geopolitical-escalation': ['iran', 'uae', 'taiwan', 'china', 'projectile', 'missile', 'invasion', 'nuclear', 'weapon'],
    'macro-policy': ['fed', 'inflation', 'cpi', 'gdp', 'recession', 'election', 'opec', 'treasury', 'copper'],
  };
  const preferred = new Set(preferredByTopic[profile] || []);
  return questionKeyTerms(question).filter((term) => preferred.has(term) || term.length >= 6);
}

function questionStrictAnchorTerms(question: LiveQuestion) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'oil-price') {
    return ['wti', 'brent', 'crude oil', 'oil price', 'barrel'];
  }
  if (profile === 'shipping-flow') {
    return ['shipping traffic', 'strait of hormuz', 'hormuz', 'transit', 'ship', 'ships', 'vessel', 'tanker', 'portwatch'];
  }
  if (profile === 'chip-supply') {
    return ['nvidia', 'nvda', 'gpu', 'hbm', 'dram', 'memory', 'chip', 'semiconductor', 'server', 'datacenter'];
  }
  if (profile === 'frontier-ai') {
    return ['openai', 'anthropic', 'claude', 'gemini', 'model', 'app store', 'launch', 'release', 'super-app'];
  }
  if (profile === 'geopolitical-escalation') {
    return ['iran', 'uae', 'projectile', 'projectiles', 'missile', 'missiles', 'ground invasion', 'nuclear weapon'];
  }
  return questionAnchorTerms(question);
}

function questionEvidenceTerms(question: LiveQuestion) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'oil-price') {
    return ['wti', 'brent', 'crude oil', 'oil price', 'barrel'];
  }
  if (profile === 'shipping-flow') {
    return ['shipping traffic', 'strait of hormuz', 'hormuz', 'transit', 'portwatch', 'ship', 'ships', 'vessel'];
  }
  if (profile === 'chip-supply') {
    return ['nvidia', 'nvda', 'gpu', 'hbm', 'dram', 'memory', 'chip', 'semiconductor'];
  }
  if (profile === 'frontier-ai') {
    return ['openai', 'anthropic', 'claude', 'gemini', 'model', 'app store', 'launch', 'release'];
  }
  if (profile === 'geopolitical-escalation') {
    return ['iran', 'uae', 'projectile', 'projectiles', 'missile', 'missiles', 'ground invasion', 'nuclear weapon'];
  }
  return questionStrictAnchorTerms(question);
}

function questionEvidenceActionTerms(question: LiveQuestion) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'geopolitical-escalation') {
    return [
      'attack',
      'strike',
      'missile',
      'military',
      'naval',
      'blockade',
      'ceasefire',
      'talks',
      'negotiation',
      'ultimatum',
      'war',
      'nuclear',
      'irgc',
      'trump',
      'cargo ship',
      'hormuz',
      '攻击',
      '袭击',
      '导弹',
      '军事',
      '封锁',
      '停火',
      '谈判',
      '最后通牒',
      '战争',
      '核',
      '霍尔木兹',
    ];
  }
  if (profile === 'shipping-flow') {
    return ['traffic', 'transit', 'ship', 'vessel', 'tanker', 'port', 'blockade', '航运', '船', '油轮', '过境', '港口', '封锁'];
  }
  if (profile === 'oil-price') {
    return ['price', 'crude', 'oil', 'brent', 'wti', 'barrel', '能源', '油价', '原油', '布伦特'];
  }
  return [];
}

function chunkKeywordHitsForQuestion(question: LiveQuestion, chunk: SourceEmbeddingChunk) {
  const haystack = `${chunk.text} ${chunk.region} ${chunk.tags.join(' ')} ${chunk.source_name}`.toLowerCase();
  const keyTerms = questionKeyTerms(question);
  const anchorTerms = questionAnchorTerms(question);
  const strictAnchorTerms = questionStrictAnchorTerms(question);
  const actionTerms = questionEvidenceActionTerms(question);
  return {
    haystack,
    keyTerms,
    anchorTerms,
    strictAnchorTerms,
    actionTerms,
    keywordHits: keyTerms.filter((term) => containsTerm(haystack, term)).length,
    anchorHits: anchorTerms.filter((term) => containsTerm(haystack, term)).length,
    strictAnchorHits: strictAnchorTerms.filter((term) => containsTerm(haystack, term)).length,
    actionHits: actionTerms.filter((term) => containsTerm(haystack, term)).length,
    exactTopicHit: question.topic_bucket ? containsTerm(haystack, question.topic_bucket.toLowerCase()) : false,
  };
}

function isDirectEvidenceForQuestion(
  question: LiveQuestion,
  item: ReturnType<typeof chunkKeywordHitsForQuestion> & { score: number },
) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'geopolitical-escalation' || profile === 'shipping-flow' || profile === 'oil-price') {
    return item.strictAnchorHits > 0 && item.actionHits > 0;
  }
  return item.strictAnchorHits > 0 || item.exactTopicHit;
}

function scoreChunkForQuestion(question: LiveQuestion, chunk: SourceEmbeddingChunk, queryEmbedding: number[], chunkEmbedding: number[]) {
  const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
  const { keywordHits, anchorHits, strictAnchorHits, actionHits, exactTopicHit } = chunkKeywordHitsForQuestion(question, chunk);
  const hasMeaningfulHit = strictAnchorHits > 0 || exactTopicHit;
  const freshnessBoost = Math.max(0, 1 - (Date.now() - new Date(chunk.published_at).getTime()) / (WATCHLIST_WINDOW_DAYS * 86400000));
  return (
    similarity * 0.38 +
    keywordHits * 0.06 +
    anchorHits * 0.14 +
    strictAnchorHits * 0.3 +
    actionHits * 0.18 +
    freshnessBoost * 0.05 +
    (exactTopicHit ? 0.1 : 0) -
    (hasMeaningfulHit ? 0 : 0.75)
  );
}

function hasStrongEvidenceForQuestion(question: LiveQuestion, chunks: SourceEmbeddingChunk[]) {
  if (chunks.length === 0) return false;
  const evidenceTerms = questionEvidenceTerms(question);
  if (evidenceTerms.length === 0) return true;
  return chunks.some((chunk) => {
    const haystack = `${chunk.text} ${chunk.region} ${chunk.tags.join(' ')} ${chunk.source_name}`.toLowerCase();
    return evidenceTerms.some((term) => containsTerm(haystack, term));
  });
}

function cleanHumanReadableText(value?: string | null, max = 260) {
  return compactText(
    String(value || '')
      .replace(/\b(?:World Monitor|world-monitor|world monitor|Signal Arena|Metaculus|Manifold|Polymarket)\b/giu, '')
      .replace(/观察池级别|世界脉络补位源/giu, '')
      .replace(/我现在偏向赞成/gu, '当前倾向赞成')
      .replace(/我现在偏向不赞成/gu, '当前倾向不赞成')
      .replace(/我现在更看重的是/gu, '关键在于')
      .replace(/我现在最看重的依据是/gu, '当前最关键的依据是')
      .replace(/我现在最看重的是/gu, '当前最关键的是')
      .replace(/我现在/gu, '当前')
      .replace(/我不会轻易/gu, '暂不宜')
      .replace(/在我看到/gu, '在看到')
      .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '出现新的$1信号。')
      .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '后续重点看是否影响$1。')
      .replace(/这一笔声量起得不低，适合先压住。?/gu, '目前热度较高，需继续跟踪。')
      .replace(/先轻轻记下，不急着加重语气。?/gu, '按普通监测处理。')
      .replace(/它未必最显眼，但这条线现在值得先补一笔。?/gu, '这条线索值得补充观察。')
      .replace(/续写/gu, '更新')
      .replace(/\b[A-Za-z][A-Za-z\s-]*Bundle Feed\s*\d+\s*信源更新\b/giu, '信源包更新')
      .replace(/\b[A-Za-z][A-Za-z\s-]*Bundle Feed\s*\d+\b/giu, '信源包')
      .replace(/\bGlobal Feed\b/giu, '全局信号')
      .replace(/\bMiddle East\b/giu, '中东')
      .replace(/\bEurope\b/giu, '欧洲')
      .replace(/\bNorth America\b/giu, '北美')
      .replace(/\bSouth America\b/giu, '南美')
      .replace(/\bStrait of Hormuz\b/giu, '霍尔木兹海峡')
      .replace(/\bGaza Strip\b/giu, '加沙地带')
      .replace(/\battack Iran\b/giu, '攻击伊朗')
      .replace(/\b(?:relevance_?score|hotspot_?score|exploration_?score|intensity|mention_?count|coverage_?gap)\s*=?\s*[\d.]+/giu, '')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    max,
  );
}

function sideFromProbability(probabilityYes: number): LiveQuestionSide {
  return probabilityYes >= 0.5 ? 'yes' : 'no';
}

function explicitVoteTextPolarity(value?: string | null): LiveQuestionSide | null {
  const text = cleanHumanReadableText(value || '', 260).toLowerCase();
  if (!text) return null;

  const negativePatterns = [
    /我反对/,
    /不赞成/,
    /不会/,
    /不可能/,
    /还看不到明显改善/,
    /短期还看不到明显改善/,
    /冲不过/,
    /跨不过/,
    /落不了地/,
    /恢复不到常态/,
    /不会举行/,
    /不会延长/,
    /不会达到/,
  ];
  if (negativePatterns.some((pattern) => pattern.test(text))) {
    return 'no';
  }

  const positivePatterns = [
    /我赞成/,
    /偏向赞成/,
    /会举行/,
    /会发生/,
    /会落地/,
    /会恢复/,
    /会继续恢复/,
    /会冲过/,
    /会跨过/,
    /会延长/,
    /会替代/,
    /会出现更明确的改善/,
  ];
  if (positivePatterns.some((pattern) => pattern.test(text))) {
    return 'yes';
  }

  return null;
}

function ensureVoteNarrativeMatchesSide(
  text: string,
  side: LiveQuestionSide,
  fallback: string,
) {
  const explicitSide = explicitVoteTextPolarity(text);
  if (explicitSide && explicitSide !== side) {
    return fallback;
  }
  return text;
}

function referenceLabelForChunk(chunk: SourceEmbeddingChunk) {
  const title = compactText(chunk.title || '', 96);
  if (title) {
    return title;
  }
  const sourceName = compactText(chunk.source_name || '', 48);
  if (sourceName) {
    return sourceName;
  }
  return compactText(chunk.region || chunk.signal_id || '参考条目', 48);
}

function referenceUrlForChunk(chunk: SourceEmbeddingChunk) {
  if (chunk.source_url && /^https?:\/\//.test(chunk.source_url)) {
    return chunk.source_url;
  }
  return chunk.signal_id ? `/signals/${encodeURIComponent(chunk.signal_id)}` : '#';
}

function buildReferenceIdForChunk(chunk: SourceEmbeddingChunk) {
  return `ref-${normalizeTag(chunk.chunk_id) || chunk.signal_id || chunk.title}`;
}

function topicConflictTextForQuestion(question: LiveQuestion, text: string) {
  const profile = questionTopicProfile(question).bucket;
  const haystack = String(text || '').toLowerCase();
  if (profile === 'oil-price') {
    return /\b(coinbase|bitcoin|btc|ethereum|crypto|solana|xrp)\b|加密货币|虚拟货币|现货价格快照|spot price api/i.test(haystack);
  }
  return false;
}

function isOffTopicChunkForQuestion(question: LiveQuestion, chunk: SourceEmbeddingChunk) {
  return topicConflictTextForQuestion(
    question,
    `${chunk.title} ${chunk.text} ${chunk.region} ${chunk.tags.join(' ')} ${chunk.source_name} ${chunk.source_url}`,
  );
}

function isOffTopicReferenceForQuestion(question: LiveQuestion, reference: LiveQuestionReference) {
  return topicConflictTextForQuestion(
    question,
    `${reference.label} ${reference.note || ''} ${reference.source_name} ${reference.url}`,
  );
}

function hasOffTopicPresentationForQuestion(
  question: LiveQuestion,
  summary?: string | null,
  references?: LiveQuestionReference[] | null,
) {
  return (
    topicConflictTextForQuestion(question, summary || '') ||
    (Array.isArray(references) && references.some((reference) => isOffTopicReferenceForQuestion(question, reference)))
  );
}

function safeReferencesForQuestion(question: LiveQuestion, references: LiveQuestionReference[]) {
  return references.filter(
    (reference) => reference.recall_role === 'question-rule' || !isOffTopicReferenceForQuestion(question, reference),
  );
}

function buildSnapshotReferences(
  question: LiveQuestion,
  zvecChunks: SourceEmbeddingChunk[],
  options?: {
    coreChunkIds?: Set<string>;
  },
) {
  const unique = new Map<string, LiveQuestionReference>();
  const orderedChunks = [...zvecChunks].sort((left, right) => {
    const leftExternal = /^https?:\/\//.test(referenceUrlForChunk(left)) ? 1 : 0;
    const rightExternal = /^https?:\/\//.test(referenceUrlForChunk(right)) ? 1 : 0;
    return rightExternal - leftExternal;
  });
  for (const chunk of orderedChunks) {
    if (isOffTopicChunkForQuestion(question, chunk)) continue;
    if (unique.has(chunk.chunk_id)) continue;
    const url = referenceUrlForChunk(chunk);
    const recallRole = options?.coreChunkIds?.has(chunk.chunk_id) ? 'zvec-core' : 'zvec-core';
    unique.set(chunk.chunk_id, {
      ref_id: buildReferenceIdForChunk(chunk),
      label: referenceLabelForChunk(chunk),
      url,
      source_name: chunk.source_name || '参考条目',
      source_kind: 'signal',
      recall_role: recallRole,
      published_at: chunk.published_at,
      signal_id: chunk.signal_id || null,
      note: compactText(chunk.text, 88),
    });
    if (unique.size >= LIVEBENCH_REFERENCE_LIMIT) break;
  }
  if (question.origin_url && ![...unique.values()].some((reference) => reference.url === question.origin_url)) {
    unique.set(`origin:${question.question_id}`, {
      ref_id: `ref-${unique.size + 1}`,
      label: '题目规则说明',
      url: question.origin_url,
      source_name: '题目规则说明',
      source_kind: 'question_rule',
      recall_role: 'question-rule',
      published_at: question.updated_at || question.resolve_at || question.close_at || null,
      signal_id: null,
      note: compactText(question.resolution_criteria_zh || question.background_zh || question.resolution_criteria || question.background || question.title, 88),
    });
  }
  return [...unique.values()];
}

function sameReferenceSet(left: LiveQuestionReference[] | null | undefined, right: LiveQuestionReference[]) {
  const leftIds = Array.isArray(left) ? left.map((item) => item.ref_id).sort() : [];
  const rightIds = right.map((item) => item.ref_id).sort();
  if (leftIds.length !== rightIds.length) return false;
  return leftIds.every((value, index) => value === rightIds[index]);
}

function readableChineseNotes(notes: string[]) {
  return notes.filter((note) => /[\u4e00-\u9fa5]/.test(note) && !/[A-Za-z]{12,}/.test(note));
}

function evidenceLeadForTopic(question: LiveQuestion, notes: string[]) {
  const profile = questionTopicProfile(question).bucket;
  const top = readableChineseNotes(notes).slice(0, 2).join('；');
  if (profile === 'shipping-flow') {
    return top
      ? `当前更需要核对船流、过境量和港口数据有没有继续恢复。眼前能抓住的依据是：${top}。`
      : '当前更需要核对船流、过境量和港口数据有没有继续恢复。';
  }
  if (profile === 'oil-price') {
    return top
      ? `当前更需要核对油价门槛附近的价格变化，以及航运风险有没有继续把油价往上推。眼前能抓住的依据是：${top}。`
      : '当前更需要核对油价门槛附近的价格变化，以及航运风险有没有继续把油价往上推。';
  }
  if (profile === 'chip-supply') {
    return top
      ? `当前更需要核对公司、产品和关键部件链条有没有出现直接的新进展。眼前能抓住的依据是：${top}。`
      : '当前更需要核对公司、产品和关键部件链条有没有出现直接的新进展。';
  }
  if (profile === 'frontier-ai') {
    return top
      ? `当前更需要核对产品发布、榜单变化和官方动作是否真的落地。眼前能抓住的依据是：${top}。`
      : '当前更需要核对产品发布、榜单变化和官方动作是否真的落地。';
  }
  if (profile === 'geopolitical-escalation') {
    return top
      ? `当前更需要核对局势是否真的升级到题目写的那一步。眼前能抓住的依据是：${top}。`
      : '当前更需要核对局势是否真的升级到题目写的那一步。';
  }
  return top ? `当前最关键的依据是：${top}。` : '当前最关键的是已经能直接对上题目的公开依据。';
}

function fallbackModeratorText(question: LiveQuestion, leaningYes: boolean, notes: string[]) {
  const profile = questionTopicProfile(question).bucket;
  const lead = evidenceLeadForTopic(question, notes);
  if (profile === 'shipping-flow') {
    return leaningYes
      ? `当前偏向赞成。${lead}如果接下来船流、通航量和港口统计继续回升，这道题会越来越接近成立。`
      : `当前偏向不赞成。${lead}在船流和过境量真正回到常态之前，不宜轻易改成赞成。`;
  }
  if (profile === 'oil-price') {
    return leaningYes
      ? `当前偏向赞成。${lead}只要油价和运输风险继续往上顶，题目给定的价格门槛并不算远。`
      : `当前偏向不赞成。${lead}在价格连续走强之前，不宜轻易认为它能冲过题目给的门槛。`;
  }
  if (profile === 'chip-supply') {
    return leaningYes
      ? `当前偏向赞成。${lead}如果公司和产品层面的新进展继续累积，这道题更容易向赞成一边倾斜。`
      : `当前偏向不赞成。${lead}在更直接的公司或产品证据出现之前，不宜把判断推到赞成。`;
  }
  if (profile === 'frontier-ai') {
    return leaningYes
      ? `当前偏向赞成。${lead}如果发布动作或产品排名真的落地，这道题很容易很快转向赞成。`
      : `当前偏向不赞成。${lead}在发布、上线或榜单变化真的发生之前，不宜轻易站到赞成一边。`;
  }
  if (profile === 'geopolitical-escalation') {
    return leaningYes
      ? `当前偏向赞成。${lead}如果接下来再出现一轮升级动作，这道题会很快走向赞成。`
      : `当前偏向不赞成。${lead}在局势真的跨过升级门槛之前，不宜轻易改成赞成。`;
  }
  return leaningYes
    ? `当前偏向赞成。${lead}`
    : `当前偏向不赞成。${lead}`;
}

function fallbackDebateText(question: LiveQuestion, side: 'pro' | 'con', notes: string[]) {
  const profile = questionTopicProfile(question).bucket;
  const top = readableChineseNotes(notes).slice(0, 2).join('；');
  if (profile === 'shipping-flow') {
    return side === 'pro'
      ? `我赞成，因为只要船流、过境量和港口数据继续回升，这道题就会越来越接近 Yes。${top ? `我最看重的是：${top}。` : ''}`
      : `我反对，因为我还没看到船流和过境量真正回到正常水平，离“恢复常态”这一步还差关键证据。`;
  }
  if (profile === 'oil-price') {
    return side === 'pro'
      ? `我赞成，因为只要油价继续上冲，或者运输风险继续抬升，题目给定的门槛就有机会被打穿。${top ? `我最看重的是：${top}。` : ''}`
      : `我反对，因为我还没看到足够连续的价格催化，暂时不愿意说它一定能冲过题目给的门槛。`;
  }
  if (profile === 'chip-supply') {
    return side === 'pro'
      ? `我赞成，因为只要公司、产品或关键部件链条出现更直接的利好，这道题就会明显向赞成一边倾斜。${top ? `我最看重的是：${top}。` : ''}`
      : `我反对，因为我还没看到能把结果坐实的直接公司证据，眼下的公开信息还不够硬。`;
  }
  if (profile === 'frontier-ai') {
    return side === 'pro'
      ? `我赞成，因为只要发布动作、产品上线或榜单变化真的落地，这道题很容易很快走向 Yes。${top ? `我最看重的是：${top}。` : ''}`
      : `我反对，因为我还没看到真正落地的产品动作或官方确认，眼下离结果成立还差最后一脚。`;
  }
  if (profile === 'geopolitical-escalation') {
    return side === 'pro'
      ? `我赞成，因为只要再出现一轮更强的军事或政策动作，局势就可能升级到题目写的那一步。${top ? `我最看重的是：${top}。` : ''}`
      : `我反对，因为现在离真正升级到那一步还差关键动作，我不愿意只凭情绪把判断推高。`;
  }
  return side === 'pro' ? '我赞成，因为最近公开信息更偏向这一边。' : '我反对，因为目前还看不到足够直接、足够连续的依据。';
}

function syntheticPersonaLead(persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number]) {
  return persona.id === 'arena-harbor'
    ? '从节奏和交易/供需变化看，'
    : '从官方动作和落地证据看，';
}

function syntheticPersonaLabel(persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number]) {
  return persona.label;
}

function syntheticQuestionHandle(question: LiveQuestion) {
  const innerCommunityQuestion = extractCommunityPredictionInnerTitle(question);
  const displayTitle = innerCommunityQuestion
    ? fallbackQuestionTitleZh({
        ...question,
        title: innerCommunityQuestion,
        title_zh: null,
      })
    : fallbackQuestionTitleZh(question);
  return compactText(
    displayTitle
      .replace(/^这道题在问[:：]?\s*/u, '')
      .replace(/[？?]\s*$/u, '')
      .trim(),
    72,
  );
}

function syntheticFallbackPrediction(
  question: LiveQuestion,
  side: LiveQuestionSide,
  persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number],
) {
  const handle = syntheticQuestionHandle(question);
  return side === 'yes'
    ? `${syntheticPersonaLead(persona)}我偏向这题会发生：${handle}。`
    : `${syntheticPersonaLead(persona)}我偏向这题还不会发生：${handle}。`;
}

function syntheticFallbackWhatChanges(
  question: LiveQuestion,
  persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number],
) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'oil-price') {
    return persona.id === 'arena-harbor'
      ? '如果连续两三个交易时段里油价和运价一起抬升，我会改判。'
      : '如果官方供给、制裁或通航政策出现新的硬动作，我会改判。';
  }
  if (profile === 'shipping-flow') {
    return persona.id === 'arena-harbor'
      ? '如果船流、过境量和等待时间连续恢复，我会改判。'
      : '如果出现正式停火、港口放行或官方复航安排，我会改判。';
  }
  if (profile === 'chip-supply') {
    return persona.id === 'arena-harbor'
      ? '如果交期、报价和库存连续改善，我会改判。'
      : '如果公司确认扩产、交付恢复或客户拿货变顺，我会改判。';
  }
  if (profile === 'frontier-ai') {
    return persona.id === 'arena-harbor'
      ? '如果榜单、产品流量或用户侧数据出现实锤变化，我会改判。'
      : '如果公司正式发布、上线或给出官方确认，我会改判。';
  }
  if (profile === 'geopolitical-escalation') {
    return persona.id === 'arena-harbor'
      ? '如果区域内的航运、市场或军事节奏突然连续恶化，我会改判。'
      : '如果出现正式会谈破裂、停火失效或新的军事命令，我会改判。';
  }
  return persona.id === 'arena-harbor'
    ? '如果连续变化开始朝相反方向走，我会改判。'
    : '如果官方动作和落地证据开始朝相反方向走，我会改判。';
}

function syntheticFallbackWhy(
  question: LiveQuestion,
  side: LiveQuestionSide,
  persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number],
) {
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'oil-price') {
    return persona.id === 'arena-harbor'
      ? side === 'yes'
        ? '我赞成，因为只要油价、运价和船流继续同向抬升，这道门槛就更容易被冲过去。'
        : '我反对，因为现在还没看到油价、运价和船流连续同向走强。'
      : side === 'yes'
        ? '我赞成，因为如果供给、制裁或通航政策出现新的硬动作，这道油价线就会更容易被坐实。'
        : '我反对，因为目前还缺足够硬的官方动作去把这道油价线真正推过去。';
  }
  if (profile === 'shipping-flow') {
    return persona.id === 'arena-harbor'
      ? side === 'yes'
        ? '我赞成，因为只要过境量、等待时间和船流连续恢复，航运就更像是在回到常态。'
        : '我反对，因为现在还没看到过境量和等待时间连续改善。'
      : side === 'yes'
        ? '我赞成，因为如果停火、放行或复航安排真正落地，恢复会更快被坐实。'
        : '我反对，因为眼下还缺正式放行或复航层面的硬动作。';
  }
  if (profile === 'chip-supply') {
    return persona.id === 'arena-harbor'
      ? side === 'yes'
        ? '我赞成，因为只要交期、报价和库存连续改善，这条产业链的缓和就会更明确。'
        : '我反对，因为现在还没看到交期、报价和库存一起持续变好。'
      : side === 'yes'
        ? '我赞成，因为如果公司确认扩产、交付恢复或客户拿货转顺，改善就会更可信。'
        : '我反对，因为目前还缺公司层面能把供货改善坐实的直接证据。';
  }
  if (profile === 'frontier-ai') {
    return persona.id === 'arena-harbor'
      ? side === 'yes'
        ? '我赞成，因为如果产品流量、榜单表现和用户侧变化一起出现，这件事就更像是真的落地了。'
        : '我反对，因为现在还没看到足够扎实的用户侧和产品侧变化。'
      : side === 'yes'
        ? '我赞成，因为只要公司正式发布、上线或给出明确确认，这题就会明显转向。'
        : '我反对，因为眼下还缺正式发布或官方确认这类硬动作。';
  }
  if (profile === 'geopolitical-escalation') {
    return persona.id === 'arena-harbor'
      ? side === 'yes'
        ? '我赞成，因为如果航运、市场和军事节奏连续恶化，局势就更容易跨过题目写的那条线。'
        : '我反对，因为现在还没看到航运、市场和军事节奏一起持续恶化。'
      : side === 'yes'
        ? '我赞成，因为一旦正式会谈破裂、停火失效或新的军事命令出现，局势就会更快升级。'
        : '我反对，因为目前还缺能把局势推到下一层的正式动作。';
  }
  return persona.id === 'arena-harbor'
    ? side === 'yes'
      ? '我赞成，因为最近连续变化更像是在往这一边走。'
      : '我反对，因为最近连续变化还没有稳定地往这一边走。'
    : side === 'yes'
      ? '我赞成，因为目前的官方动作和落地迹象更偏向这一边。'
      : '我反对，因为目前还缺把这件事坐实的官方动作和落地证据。';
}

function genericStoredPredictionFallback(question: LiveQuestion, side: 'yes' | 'no') {
  const prompt = fallbackQuestionTitleZh(question);
  return side === 'yes' ? `当前偏向赞成：${prompt}` : `当前偏向不赞成：${prompt}`;
}

function genericStoredWhyFallback(question: LiveQuestion, side: 'yes' | 'no') {
  const bucket = questionTopicProfile(question).bucket;
  if (bucket === 'chip-supply') {
    return side === 'yes'
      ? '我赞成，因为最近公司、交付和关键部件链条里已经出现更直接的改善信号。'
      : '我反对，因为目前还缺公司、交付和关键部件层面能把改善坐实的直接证据。';
  }
  if (bucket === 'oil-price' || bucket === 'shipping-flow') {
    return side === 'yes'
      ? '我赞成，因为最近价格、航运和风险节奏更像是在往题目这一边推进。'
      : '我反对，因为目前还没看到价格、航运和局势一起连续走到题目写的那一步。';
  }
  if (bucket === 'geopolitical-escalation') {
    return side === 'yes'
      ? '我赞成，因为最近官方动作和局势升级迹象更接近题目写的那条线。'
      : '我反对，因为目前还缺能把局势推到题目那一步的正式动作。';
  }
  return side === 'yes'
    ? '我赞成，因为最近公开材料更偏向这一边。'
    : '我反对，因为目前还缺把这件事坐实的直接证据。';
}

function genericStoredWhatChangesFallback(question: LiveQuestion) {
  const bucket = questionTopicProfile(question).bucket;
  if (bucket === 'chip-supply') {
    return '如果后续出现更明确的交付改善、报价回落、库存释放或公司正式确认，我会改判。';
  }
  if (bucket === 'oil-price' || bucket === 'shipping-flow') {
    return '如果后续出现价格、航运和风险节奏明显反向的新变化，我会改判。';
  }
  if (bucket === 'geopolitical-escalation') {
    return '如果后续出现更明确的官方动作、军事升级或正式会谈结果，我会改判。';
  }
  return '如果后续出现方向相反、而且足够有分量的新材料，我会改判。';
}

function normalizeStoredGenericText(text: string | null | undefined, fallback: string) {
  if (looksGenericArenaCopy(text)) return fallback;
  const value = compactText(String(text || '').trim(), 220);
  if (!value) return fallback;
  if (/^我目前更倾向于/.test(value)) return fallback;
  if (/社区对“.+?预测概率会|community prediction/i.test(value)) return fallback;
  return value;
}

function normalizeStoredBaselineVote(vote: LiveVote, questionById: Map<string, LiveQuestion>) {
  if (vote.source !== 'baseline') return vote;
  const question = questionById.get(vote.question_id);
  if (!question) return vote;
  const normalizedSide = sideFromProbability(clamp(vote.probability_yes, 0.01, 0.99));
  return {
    ...vote,
    side: normalizedSide,
    human_readable_prediction: ensureVoteNarrativeMatchesSide(
      normalizeStoredGenericText(vote.human_readable_prediction, genericStoredPredictionFallback(question, normalizedSide)),
      normalizedSide,
      genericStoredPredictionFallback(question, normalizedSide),
    ),
    human_readable_why: ensureVoteNarrativeMatchesSide(
      normalizeStoredGenericText(vote.human_readable_why, genericStoredWhyFallback(question, normalizedSide)),
      normalizedSide,
      genericStoredWhyFallback(question, normalizedSide),
    ),
    what_changes_my_mind: hasConcreteChangeMindText(vote.what_changes_my_mind)
      ? vote.what_changes_my_mind
      : genericStoredWhatChangesFallback(question),
  };
}

function normalizeStoredSyntheticVote(vote: LiveVote, questionById: Map<string, LiveQuestion>) {
  if (vote.source === 'baseline') {
    return normalizeStoredBaselineVote(vote, questionById);
  }
  if (vote.source !== 'xia') return vote;
  const question = questionById.get(vote.question_id);
  if (!question) return vote;
  const persona = SYNTHETIC_XIA_PARTICIPANTS.find((candidate) => candidate.id === vote.xia_id);
  if (!persona) {
    return {
      ...vote,
      human_readable_prediction: normalizeStoredGenericText(
        vote.human_readable_prediction,
        genericStoredPredictionFallback(question, vote.side),
      ),
      human_readable_why: normalizeStoredGenericText(
        vote.human_readable_why,
        genericStoredWhyFallback(question, vote.side),
      ),
      what_changes_my_mind: hasConcreteChangeMindText(vote.what_changes_my_mind)
        ? vote.what_changes_my_mind
        : genericStoredWhatChangesFallback(question),
    };
  }

  const normalizedSide = sideFromProbability(clamp(vote.probability_yes, 0.01, 0.99));
  return {
    ...vote,
    side: normalizedSide,
    human_readable_prediction: ensureVoteNarrativeMatchesSide(
      normalizeStoredGenericText(
        vote.human_readable_prediction,
        syntheticFallbackPrediction(question, normalizedSide, persona),
      ),
      normalizedSide,
      syntheticFallbackPrediction(question, normalizedSide, persona),
    ),
    human_readable_why: ensureVoteNarrativeMatchesSide(
      normalizeStoredGenericText(vote.human_readable_why, syntheticFallbackWhy(question, normalizedSide, persona)),
      normalizedSide,
      syntheticFallbackWhy(question, normalizedSide, persona),
    ),
    what_changes_my_mind: hasConcreteChangeMindText(vote.what_changes_my_mind)
      ? vote.what_changes_my_mind
      : syntheticFallbackWhatChanges(question, persona),
  };
}

function hasConcreteChangeMindText(text: string | null | undefined) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/如果接下来出现更硬的新材料，或者原本缺失的关键环节被补上，我会改判。?/.test(value)) return false;
  return value.length >= 12;
}

function hasEnoughCitations(ids: string[] | null | undefined) {
  return Array.isArray(ids) && ids.filter(Boolean).length >= 2;
}

function citationIdsFromIndexes(indexes: number[] | undefined, references: LiveQuestionReference[]) {
  if (!Array.isArray(indexes) || indexes.length === 0) return [];
  return indexes
    .map((value) => references[value - 1]?.ref_id)
    .filter((value): value is string => Boolean(value));
}

function looksGenericArenaCopy(text: string | null | undefined) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (
    [
      '我目前更倾向于不赞成。',
      '我目前更倾向于赞成。',
      '我目前更倾向于不赞成这件事会发生。',
      '我目前更倾向于赞成这件事会发生。',
      '如果接下来出现更硬的新材料，或者原本缺失的关键环节被补上，我会改判。',
      '如果后续出现方向相反、而且足够有分量的新材料，我会改判。',
    ].includes(raw)
  ) {
    return true;
  }
  if (
    /最近公开信息更偏向这一边|目前还看不到足够直接、足够连续的依据|还差关键动作|还没看到能把结果坐实的直接公司证据|我不愿意只凭情绪把判断推高/.test(
      raw,
    )
  ) {
    return true;
  }
  const value = normalizeTag(text || '');
  if (!value) return true;
  return [
    'wo-mu-qian-geng-qing-xiang-yu-zan-cheng-zhe-jian-shi-hui-fa-sheng',
    'wo-mu-qian-geng-qing-xiang-yu-zan-cheng',
    'wo-mu-qian-geng-qing-xiang-yu-bu-zan-cheng',
    'zui-jin-zui-xiang-guan-de-cai-liao-zan-shi-geng-zhi-chi-zhe-yi-bian',
    'wo-hui-ba-zhong-dian-fang-zai-zui-jin-cai-liao-li',
    'ru-guo-hou-xu-chu-xian-fang-xiang-xiang-fan',
    'yan-xia-hai-kan-bu-dao-zu-gou-qiang-de-xin-xi',
  ].some((pattern) => value.includes(pattern));
}

function fallbackQuestionTitleZh(question: LiveQuestion): string {
  const raw = String(question.title || '').replace(/\s+/g, ' ').trim();
  const base = compactText(raw, 220);
  if (!base) return '这道题在问什么';
  if (/[\u4e00-\u9fa5]/.test(base)) return cleanQuestionTitleForUi(base);
  const hormuzReturn = base.match(/^Will shipping traffic through the Strait of Hormuz return to normal before (.+?)\?$/i);
  if (hormuzReturn) {
    return `在 ${translateEnglishDateToZh(hormuzReturn[1])} 之前，霍尔木兹海峡的航运流量会恢复到正常水平吗？`;
  }
  const communityPrediction = raw.match(
    /^Will the community prediction be (higher|lower) than ([\d.]+)% on (.+?) for the Metaculus question "(.+?)"\?$/i,
  );
  if (communityPrediction) {
    const direction = communityPrediction[1].toLowerCase() === 'higher' ? '高于' : '低于';
    return `到 ${translateEnglishDateToZh(communityPrediction[3])} 时，Metaculus 社区对“${fallbackQuestionTitleZh({
      ...question,
      title: communityPrediction[4],
      title_zh: null,
    })}”的预测概率会${direction} ${communityPrediction[2]}% 吗？`;
  }
  const designatedRisk = base.match(/^Will (.+?) be a designated supply chain risk on (.+?)\?$/i);
  if (designatedRisk) {
    return `${translateEnglishDateToZh(designatedRisk[2])}时，${translateEntityNameToZh(designatedRisk[1])}会被正式列为供应链风险吗？`;
  }
  const aboveOnDate = base.match(/^Will (.+?) be above \$?([\d.]+) on (.+?)\?$/i);
  if (aboveOnDate) {
    return `${translateEnglishDateToZh(aboveOnDate[3])}时，${translateEntityNameToZh(aboveOnDate[1])}会高于 ${aboveOnDate[2]} 吗？`;
  }
  const abovePerBarrelOnDate = base.match(/^Will (.+?) be above \$?([\d.]+)\/barrel on (.+?)\?*$/i);
  if (abovePerBarrelOnDate) {
    return `${translateEnglishDateToZh(abovePerBarrelOnDate[3])}时，${translateEntityNameToZh(abovePerBarrelOnDate[1])}会高于每桶 ${abovePerBarrelOnDate[2]} 美元吗？`;
  }
  const belowOnDate = base.match(/^Will (.+?) be below \$?([\d.]+) on (.+?)\?$/i);
  if (belowOnDate) {
    return `${translateEnglishDateToZh(belowOnDate[3])}时，${translateEntityNameToZh(belowOnDate[1])}会低于 ${belowOnDate[2]} 吗？`;
  }
  const closeAbove = base.match(/^Will (.+?) close above \$?([\d.]+) on (.+?)\?$/i);
  if (closeAbove) {
    return `${translateEnglishDateToZh(closeAbove[3])}收盘时，${translateEntityNameToZh(closeAbove[1])}会高于 ${closeAbove[2]} 美元吗？`;
  }
  const closeBelow = base.match(/^Will (.+?) close below \$?([\d.]+) on (.+?)\?$/i);
  if (closeBelow) {
    return `${translateEnglishDateToZh(closeBelow[3])}收盘时，${translateEntityNameToZh(closeBelow[1])}会低于 ${closeBelow[2]} 美元吗？`;
  }
  const closeBelowPerBarrel = base.match(/^Will (.+?) close below \$?([\d.]+)\/barrel on (.+?)\?*$/i);
  if (closeBelowPerBarrel) {
    return `${translateEnglishDateToZh(closeBelowPerBarrel[3])}收盘时，${translateEntityNameToZh(closeBelowPerBarrel[1])}会低于每桶 ${closeBelowPerBarrel[2]} 美元吗？`;
  }
  const beUpOn = base.match(/^Will (.+?) be up on (.+?)\?$/i);
  if (beUpOn) {
    return `${translateEnglishDateToZh(beUpOn[2])}收盘时，${translateEntityNameToZh(beUpOn[1])}会以上涨收盘吗？`;
  }
  const numberOneFreeApp = base.match(/^Will (.+?) be #1 Free App in the US Apple App Store on (.+?)\?$/i);
  if (numberOneFreeApp) {
    return `到 ${translateEnglishDateToZh(numberOneFreeApp[2])} 时，${translateEntityNameToZh(numberOneFreeApp[1])} 会成为美国 Apple App Store 免费榜第一吗？`;
  }
  const rankedFreeApp = base.match(/^Will (.+?) be #(\d+) Free App in the US Apple App Store on (.+?)\?$/i);
  if (rankedFreeApp) {
    return `到 ${translateEnglishDateToZh(rankedFreeApp[3])} 时，${translateEntityNameToZh(rankedFreeApp[1])} 会排到美国 Apple App Store 免费榜第 ${rankedFreeApp[2]} 名吗？`;
  }
  const numberOnePaidApp = base.match(/^Will (.+?) be #1 Paid App in the US Apple App Store on (.+?)\?$/i);
  if (numberOnePaidApp) {
    return `到 ${translateEnglishDateToZh(numberOnePaidApp[2])} 时，${translateEntityNameToZh(numberOnePaidApp[1])} 会成为美国 Apple App Store 付费榜第一吗？`;
  }
  const rankedPaidApp = base.match(/^Will (.+?) be #(\d+) Paid App in the US Apple App Store on (.+?)\?$/i);
  if (rankedPaidApp) {
    return `到 ${translateEnglishDateToZh(rankedPaidApp[3])} 时，${translateEntityNameToZh(rankedPaidApp[1])} 会排到美国 Apple App Store 付费榜第 ${rankedPaidApp[2]} 名吗？`;
  }
  const launchBefore = base.match(/^Will (.+?) officially launch (.+?) before (.+)\?$/i);
  if (launchBefore) {
    return `在 ${translateEnglishDateToZh(launchBefore[3])} 之前，${translateEntityNameToZh(launchBefore[1])}会正式推出 ${translateEntityNameToZh(launchBefore[2])} 吗？`;
  }
  const priceMove = base.match(/^Will the price of (.+?) experience a single-day rise of \$?([\d.]+) or more before (.+)\?$/i);
  if (priceMove) {
    return `在 ${translateEnglishDateToZh(priceMove[3])} 之前，${translateEntityNameToZh(priceMove[1])} 会不会单日上涨 ${priceMove[2]} 美元或以上？`;
  }
  const oilExceed = base.match(/^(?:\[SHORT FUSE\]\s*)?Will (.+?) exceed \$?([\d.]+)\/barrel before (.+?)\?$/i);
  if (oilExceed) {
    return `在 ${translateEnglishDateToZh(oilExceed[3])} 之前，${translateEntityNameToZh(oilExceed[1])}会超过每桶 ${oilExceed[2]} 美元吗？`;
  }
  const oilHit = base.match(/^(?:\[SHORT FUSE\]\s*)?Will (.+?) hit \$?([\d.]+) in (.+?)\?$/i);
  if (oilHit) {
    return `在 ${translateEnglishDateToZh(oilHit[3])} 期间，${translateEntityNameToZh(oilHit[1])}会触及 ${oilHit[2]} 美元吗？`;
  }
  const oilCloseAbove = base.match(/^(.+?) closes above \$?([\d.]+) on (.+?)\?*$/i);
  if (oilCloseAbove) {
    return `${translateEnglishDateToZh(oilCloseAbove[3])}收盘时，${translateEntityNameToZh(oilCloseAbove[1])}会高于 ${oilCloseAbove[2]} 美元吗？`;
  }
  const dropBelowAtAnyPoint = base.match(/^Will (.+?) drop below \$?([\d.]+)(?:\/barrel)? at any point in (.+?)\?$/i);
  if (dropBelowAtAnyPoint) {
    return `在 ${translateEnglishDateToZh(dropBelowAtAnyPoint[3])} 期间，${translateEntityNameToZh(dropBelowAtAnyPoint[1])} 会跌破 ${dropBelowAtAnyPoint[2]} 吗？`;
  }
  const useNuclear = base.match(/^Will the United States use a nuclear weapon before (.+?)\?$/i);
  if (useNuclear) {
    return `在 ${translateEnglishDateToZh(useNuclear[1])} 之前，美国会动用核武器吗？`;
  }
  const hormuzTrafficBy = base.match(/^(?:Will\s+)?(?:Strait of Hormuz|霍尔木兹海峡) traffic returns? to normal by (.+?)\?*$/i);
  if (hormuzTrafficBy) {
    return `到 ${translateEnglishDateToZh(hormuzTrafficBy[1])} 时，霍尔木兹海峡航运会恢复正常吗？`;
  }
  const groundInvasion = base.match(/^Will the U\.S\. conduct a ground invasion of Iran before (.+?)\?$/i);
  if (groundInvasion) {
    return `在 ${translateEnglishDateToZh(groundInvasion[1])} 之前，美国会对伊朗发动地面入侵吗？`;
  }
  const attackIran = base.match(/^Will the U\.?S\.? attack Iran before (.+?)\?$/i);
  if (attackIran) {
    return `在 ${translateEnglishDateToZh(attackIran[1])} 之前，美国会攻击伊朗吗？`;
  }
  const additionalProjectiles = base.match(/^Will the UAE engage with (\d+)\s+or more additional Iranian projectiles \(drones or missiles\) before (.+?)\?$/i);
  if (additionalProjectiles) {
    return `在 ${translateEnglishDateToZh(additionalProjectiles[2])} 之前，阿联酋会再拦截 ${additionalProjectiles[1]} 枚或更多伊朗无人机或导弹吗？`;
  }
  const shipTransitBelow = base.match(/^Will fewer than (.+?) ships transit (.+?) between (.+?)\?$/i);
  if (shipTransitBelow) {
    return `在 ${translateEnglishDateToZh(shipTransitBelow[3])} 期间，通过 ${translateEntityNameToZh(shipTransitBelow[2])} 的船只会少于 ${translateEntityNameToZh(shipTransitBelow[1])} 艘吗？`;
  }
  const shipTransitMore = base.match(/^Will (\d+)\s+or more ships transit (.+?) between (.+?)\?$/i);
  if (shipTransitMore) {
    return `在 ${translateEnglishDateToZh(shipTransitMore[3])} 期间，会有至少 ${shipTransitMore[1]} 艘船通过 ${translateEntityNameToZh(shipTransitMore[2])} 吗？`;
  }
  const shipTransitRange = base.match(/^Will (.+?) ships transit (.+?) between (.+?)\?$/i);
  if (shipTransitRange) {
    return `在 ${translateEnglishDateToZh(shipTransitRange[3])} 期间，会有 ${translateEntityNameToZh(shipTransitRange[1])} 艘船通过 ${translateEntityNameToZh(shipTransitRange[2])} 吗？`;
  }
  const announceLiftedBlockade = base.match(
    /^Will Donald Trump announce that the United States blockade of the Strait of Hormuz has been lifted by (.+?)\?$/i,
  );
  if (announceLiftedBlockade) {
    return `在 ${translateEnglishDateToZh(announceLiftedBlockade[1])} 之前，特朗普会宣布美国已解除对霍尔木兹海峡的封锁吗？`;
  }
  const releaseOnOrPrior = base.match(/^Will (.+?) be released on or prior to (.+?)\?$/i);
  if (releaseOnOrPrior) {
    return `在 ${translateEnglishDateToZh(releaseOnOrPrior[2])} 或之前，${translateEntityNameToZh(releaseOnOrPrior[1])} 会发布吗？`;
  }
  const upOrDownOn = base.match(/^(.+?) Up or Down on (.+?)\?$/i);
  if (upOrDownOn) {
    return `${translateEnglishDateToZh(upOrDownOn[2])}收盘时，${translateEntityNameToZh(upOrDownOn[1])}会上涨收盘吗？`;
  }
  const rankOneLeaderboard = base.match(/^Will (.+?) rank #1 on the (.+?) leaderboard on (.+?)\?$/i);
  if (rankOneLeaderboard) {
    return `在 ${translateEnglishDateToZh(rankOneLeaderboard[3])} 时，${translateEntityNameToZh(rankOneLeaderboard[1])}会登上 ${translateEntityNameToZh(rankOneLeaderboard[2])} 榜首吗？`;
  }
  const aiTimeHorizon = base.match(/^Will an AI model reach a 3 hour time horizon with 80% reliability during 2026\.?\??$/i);
  if (aiTimeHorizon) {
    return '2026 年内，会有 AI 模型在 3 小时时间跨度任务上达到 80% 可靠性吗？';
  }
  const openAiIpo = base.match(/^Will OpenAI file for an IPO during 2026\.?\??$/i);
  if (openAiIpo) {
    return 'OpenAI 会在 2026 年提交 IPO 申请吗？';
  }
  const diplomaticMeeting = base.match(/^Israel x Lebanon diplomatic meeting by (.+?)\??$/i);
  if (diplomaticMeeting) {
    return `在 ${translateEnglishDateToZh(diplomaticMeeting[1])} 之前，以色列和黎巴嫩会举行外交会谈吗？`;
  }
  const oilPressConference = base.match(/^(?:\[URGENT\]\s*)?Will (.+?) increase during Hegseth's press conference this morning\.?\??$/i);
  if (oilPressConference) {
    return `赫格塞思今天上午的记者会期间，${translateEntityNameToZh(oilPressConference[1])}会走高吗？`;
  }
  const moreCeasefire = base.match(/^Will there be one more ceasefire agreement between (?:US|美国)\/Israel and Iran till the end of April 2026\.?\??$/i);
  if (moreCeasefire) {
    return '2026 年 4 月底前，美国或以色列与伊朗之间会再出现一次停火协议吗？';
  }
  const stockHit = base.match(/^Will (.+?) hit \((HIGH|LOW)\) \$?([\d.]+) Week of (.+?)\?$/i);
  if (stockHit) {
    return `${translateEnglishDateToZh(stockHit[4])}这一周，${translateEntityNameToZh(stockHit[1])}会触及 ${stockHit[3]} 美元${stockHit[2].toUpperCase() === 'HIGH' ? '高点' : '低点'}吗？`;
  }
  const finishWeekAbove = base.match(/^Will (.+?) finish week of (.+?) above \$?([\d.]+)\?$/i);
  if (finishWeekAbove) {
    return `${translateEnglishDateToZh(finishWeekAbove[2])}这一周结束时，${translateEntityNameToZh(finishWeekAbove[1])}会高于 ${finishWeekAbove[3]} 美元吗？`;
  }
  const closeFinalRange = base.match(
    /^Will (.+?) close at \$?([\d.]+)-\$?([\d.]+) on the final day of trading of the week of (.+?)\?$/i,
  );
  if (closeFinalRange) {
    return `${translateEnglishDateToZh(closeFinalRange[4])}这一周最后一个交易日，${translateEntityNameToZh(closeFinalRange[1])}会收在 ${closeFinalRange[2]} 到 ${closeFinalRange[3]} 美元之间吗？`;
  }
  const closeFinalAbove = base.match(
    /^Will (.+?) close at >\$?([\d.]+) on the final day of trading of the week of (.+?)\?$/i,
  );
  if (closeFinalAbove) {
    return `${translateEnglishDateToZh(closeFinalAbove[3])}这一周最后一个交易日，${translateEntityNameToZh(closeFinalAbove[1])}会收在 ${closeFinalAbove[2]} 美元以上吗？`;
  }
  const genericBy = base.match(/^Will (.+?) by (.+?)\?$/i);
  if (genericBy) {
    return `在 ${translateEnglishDateToZh(genericBy[2])} 之前，${translateEntityNameToZh(genericBy[1])}会发生吗？`;
  }
  const genericBefore = base.match(/^Will (.+?) before (.+)\?$/i);
  if (genericBefore) {
    return `在 ${translateEnglishDateToZh(genericBefore[2])} 之前，${translateEntityNameToZh(genericBefore[1])} 会发生吗？`;
  }
  const topAiModel = base.match(/^Will (.+?) be the top AI model on (.+?)(?: \((.+)\))?\?$/i);
  if (topAiModel) {
    const suffix = topAiModel[3] ? `（${translateEntityNameToZh(topAiModel[3])}）` : '';
    return `${translateEnglishDateToZh(topAiModel[2])}，${translateEntityNameToZh(topAiModel[1])} 会登上 AI 模型榜首吗${suffix}？`;
  }
  const cleanedBase = translateEntityNameToZh(base.replace(/^Will\s+/i, '').replace(/\?$/, '').trim());
  return cleanedBase ? `${cleanedBase} 是否会发生？` : '这个判断会成立吗？';
}

function extractCommunityPredictionInnerTitle(question: LiveQuestion) {
  const raw = String(question.title || '').replace(/\s+/g, ' ').trim();
  const match = raw.match(
    /^Will the community prediction be (higher|lower) than ([\d.]+)% on (.+?) for the Metaculus question "(.+?)"\?$/i,
  );
  return match ? match[4] : null;
}

function fallbackBackgroundZh(question: LiveQuestion) {
  const background = compactText(question.background || question.title, 180);
  if (!background) return '请围绕题目本身、当前材料与过往判断来回答。';
  if (/[\u4e00-\u9fa5]/.test(background)) return background;
  const profile = questionTopicProfile(question).bucket;
  if (profile === 'shipping-flow') {
    return '这道题关注的是在给定时间窗内，霍尔木兹海峡的船流和通航量是否会恢复到常态。';
  }
  if (profile === 'oil-price') {
    return '这道题关注的是在给定时间窗内，油价是否会触及题目设定的价格门槛。';
  }
  if (profile === 'frontier-ai') {
    return '这道题关注的是相关公司是否会在给定时间窗内发布新产品、模型或取得题目设定的产品结果。';
  }
  if (profile === 'chip-supply') {
    return '这道题关注的是芯片、算力和关键部件链条里，目标公司或产品是否会达到题目设定的结果。';
  }
  if (profile === 'geopolitical-escalation') {
    return '这道题关注的是指定时间窗内，局势会不会升级到题目描述的那一步。';
  }
  if (/official closing price/i.test(background) && /higher than|above/i.test(background)) {
    return '这道题关注的是指定日期收盘时，目标价格是否会站上题目给定的门槛。';
  }
  if (/official closing price/i.test(background) && /lower than|below/i.test(background)) {
    return '这道题关注的是指定日期收盘时，目标价格是否会跌破题目给定的门槛。';
  }
  if (/at any point/i.test(background) && /below/i.test(background)) {
    return '这道题关注的是在指定时间窗口里，目标价格是否会在任意时点跌破题目给定的门槛。';
  }
  if (/be above/i.test(background) || /above/i.test(background)) {
    return '这道题关注的是在指定日期或时间点，目标价格是否会站上题目给定的门槛。';
  }
  return '请结合最近材料、已有讨论和题目的时间窗，直接回答这道题。';
}

function fallbackResolutionZh(question: LiveQuestion) {
  const criteria = compactText(question.resolution_criteria || '', 160);
  if (!criteria) return '以外部平台官方结算结果为准。';
  if (/[\u4e00-\u9fa5]/.test(criteria)) return criteria;
  if (/Metaculus/i.test(criteria)) return '以题目所在平台最终公布的结果为准。';
  return '以题目所在平台的官方结算结果为准。';
}

async function localizeQuestionForRetrieval(question: LiveQuestion, useModel = true): Promise<LiveQuestion> {
  if (question.title_zh && question.background_zh && question.resolution_criteria_zh) {
    return {
      ...question,
      topic_bucket: questionTopicProfile({
        title: question.title_zh,
        background: question.background_zh,
        resolution_criteria: question.resolution_criteria_zh,
        tags: question.tags,
      }).bucket,
    };
  }

  const fallbackTitle = fallbackQuestionTitleZh(question);
  const fallbackBackground = fallbackBackgroundZh(question);
  const fallbackResolution = fallbackResolutionZh(question);

  const response = useModel
    ? await requestMiniMaxJson<{
        title_zh?: string;
        background_zh?: string;
        resolution_criteria_zh?: string;
        topic_bucket?: string;
      }>(
        '你在世界脉络里负责把外部预测题整理成自然中文。先理解原题在问什么、时间窗是什么、最后怎么判，再输出可检索、可阅读的中文题面。题型只允许是：oil-price, shipping-flow, chip-supply, frontier-ai, geopolitical-escalation, public-health, other。输出 JSON，不要 markdown。',
        [
          `原题：${question.title}`,
          `背景：${question.background || question.title}`,
          `结算标准：${question.resolution_criteria || '以外部平台官方结算为准。'}`,
          `当前粗分类：${question.topic_bucket}`,
          '输出字段：title_zh, background_zh, resolution_criteria_zh, topic_bucket。',
          '要求：title_zh 必须像正常中文提问；background_zh 和 resolution_criteria_zh 必须是自然中文；不要保留 attack Iran、community prediction、official outcome、Bundle Feed 之类英文模板字样；不要把英文标题碎片、抓取说明或 feed 名直接塞进中文句子里；topic_bucket 只能从给定枚举里选最贴近的一项。',
        ].join('\n\n'),
      )
    : null;

  const localized = {
    title_zh: compactText(preferStableYearText(response?.title_zh, fallbackTitle, question.title), 160),
    background_zh: compactText(preferStableYearText(response?.background_zh, fallbackBackground, question.background), 240),
    resolution_criteria_zh: compactText(
      preferStableYearText(response?.resolution_criteria_zh, fallbackResolution, question.resolution_criteria),
      240,
    ),
  };
  const localizedTopic = questionTopicProfile({
    title: localized.title_zh,
    background: localized.background_zh,
    resolution_criteria: localized.resolution_criteria_zh,
    tags: question.tags,
  }).bucket;

  return {
    ...question,
    ...localized,
    topic_bucket:
      typeof response?.topic_bucket === 'string' && response.topic_bucket.trim()
        ? response.topic_bucket.trim()
        : localizedTopic,
  };
}

async function buildQuestionPresentation(
  question: LiveQuestion,
  baseline: LiveVote | null,
  discussionVotes: LiveVote[],
  zvecChunks: SourceEmbeddingChunk[],
  referenceChunks: SourceEmbeddingChunk[],
  useModel = true,
) {
  const latestDiscussionAt = discussionVotes.reduce((latest, vote) => {
    const timestamp = parseTime(vote.created_at);
    return timestamp && timestamp > latest ? timestamp : latest;
  }, 0);
  const presentationGeneratedAt = parseTime(question.presentation_generated_at || null) || 0;
  const coreChunkIds = new Set(zvecChunks.map((chunk) => chunk.chunk_id));
  const currentReferences = buildSnapshotReferences(question, referenceChunks, { coreChunkIds });
  if (
    question.title_zh &&
    question.background_zh &&
    question.resolution_criteria_zh &&
    question.moderator_view_cache &&
    question.debate_cache &&
    Array.isArray(question.references_cache) &&
    sameReferenceSet(question.references_cache, currentReferences) &&
    !hasOffTopicPresentationForQuestion(question, question.moderator_view_cache.summary, question.references_cache) &&
    !looksGenericArenaCopy(question.moderator_view_cache.summary) &&
    !looksGenericArenaCopy(question.debate_cache.pro?.summary) &&
    !looksGenericArenaCopy(question.debate_cache.con?.summary) &&
    presentationGeneratedAt >= latestDiscussionAt
  ) {
    return {
      question,
      moderatorView: question.moderator_view_cache,
      debate: question.debate_cache,
      references: question.references_cache,
    };
  }

  const references = currentReferences;
  const topEvidenceNotes = referenceChunks
    .slice(0, LIVEBENCH_EVIDENCE_PROMPT_LIMIT)
    .map((chunk) => compactText(chunk.text.replace(/\s+/g, ' '), 84))
    .filter(Boolean);
  const defaultCitationIds = references.slice(0, Math.min(2, references.length)).map((reference) => reference.ref_id);
  const usableVotes = discussionVotes
    .filter((vote) => DISCUSSION_VOTE_SOURCES.has(vote.source))
    .filter((vote) => {
      const text = `${vote.human_readable_prediction} ${vote.human_readable_why}`;
      return !/(观察池|wm:|外溢|第二来源|coverage|mention|intensity|信号强度|监测级别|global 线索|跨区域扩散)/i.test(text);
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const latestProVote = usableVotes.find((vote) => vote.side === 'yes') || null;
  const latestConVote = usableVotes.find((vote) => vote.side === 'no') || null;
  const baselineLeaningYes = (baseline?.probability_yes ?? question.platform_probability_yes ?? 0.5) >= 0.5;
  const fallbackModeratorSummary = cleanHumanReadableText(
    topEvidenceNotes.length > 0
      ? fallbackModeratorText(question, baselineLeaningYes, topEvidenceNotes)
      : `${baseline?.human_readable_prediction || ''} ${baseline?.human_readable_why || ''}`,
    260,
    ) || `当前倾向${baselineLeaningYes ? '赞成' : '不赞成'}，但还需要更多能直接对上题目的依据。`;
  const fallbackProSummary =
    cleanHumanReadableText(
      latestProVote?.human_readable_why ||
        fallbackDebateText(question, 'pro', topEvidenceNotes),
      220,
    ) || '我赞成，因为最近的公开信息更偏向这一边。';
  const fallbackConSummary =
    cleanHumanReadableText(
      latestConVote?.human_readable_why ||
        fallbackDebateText(question, 'con', topEvidenceNotes) ||
        baseline?.what_changes_my_mind,
      220,
    ) || '我反对，因为目前还看不到足够直接、足够连续的依据。';
  const response = useModel
    ? await requestMiniMaxJson<{
        title_zh?: string;
        background_zh?: string;
        resolution_criteria_zh?: string;
        moderator_view?: string;
        moderator_citation_indexes?: number[];
        pro_summary?: string;
        pro_citation_indexes?: number[];
        con_summary?: string;
        con_citation_indexes?: number[];
      }>(
        '你是世界脉络前台页面的中文编辑。请把题目、讨论和材料整理成自然、直接、适合网页阅读的中文。先把题面、背景和结算标准翻成自然中文，再把主持人简报、赞成意见和反对意见写得像人在讨论，而不是后台摘要。不要写接口字段、打分词、系统备注、抓取过程或后台语气。输出 JSON，不要 markdown。',
        [
          `原题：${question.title}`,
          `背景：${question.background || question.title}`,
          `结算标准：${question.resolution_criteria}`,
          baseline ? `主持人内部种子：${baseline.human_readable_prediction} ${baseline.human_readable_why}` : '',
          usableVotes.length > 0
            ? ['已有讨论：', ...usableVotes.slice(0, 6).map((vote, index) => `${index + 1}. ${discussionSpeakerLabel(vote)}｜${vote.side === 'yes' ? '赞成' : '不赞成'}｜${vote.human_readable_prediction}；${vote.human_readable_why}`)].join('\n')
            : '已有讨论：暂无稳定的虾讨论，可基于公开材料直接整理。',
          references.length > 0
            ? ['参考材料：', ...references.map((reference, index) => `${index + 1}. ${reference.label}｜${reference.note || ''}`)].join('\n')
            : '参考材料：暂无稳定的外部材料脚注。',
          '请输出字段：title_zh, background_zh, resolution_criteria_zh, moderator_view, moderator_citation_indexes, pro_summary, pro_citation_indexes, con_summary, con_citation_indexes。',
          `当前题型：${questionTopicProfile(question).label}`,
          '写法要求：title_zh 必须是自然中文问题，不要保留英文原句；background_zh 和 resolution_criteria_zh 也必须是中文；如果参考材料是英文，先理解意思再写中文，不要把英文碎片、feed 名、站点名、评论计数或抓取痕迹直接塞进句子里；moderator_view 只讲这题在问什么、现在偏哪边、为什么，不要把材料串成流水账；pro_summary 必须像“我赞成，因为……”；con_summary 必须像“我反对，因为……”。不要写“这些材料”“当前能对上的材料”“我会先按这些材料组织判断”这类虚话。',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    : null;

  const localizedQuestion: LiveQuestion = {
    ...question,
    title_zh: compactText(
      preferStableYearText(response?.title_zh, fallbackQuestionTitleZh(question), question.title),
      140,
    ),
    background_zh: compactText(
      preferStableYearText(response?.background_zh, fallbackBackgroundZh(question), question.background),
      220,
    ),
    resolution_criteria_zh: compactText(
      preferStableYearText(response?.resolution_criteria_zh, fallbackResolutionZh(question), question.resolution_criteria),
      220,
    ),
    topic_bucket: topicBucketForText(
      [
        response?.title_zh,
        response?.background_zh,
        response?.resolution_criteria_zh,
        question.title,
        question.background,
        question.resolution_criteria,
      ]
        .filter(Boolean)
        .join(' '),
    ),
  };

  const rawModeratorSummary = cleanHumanReadableText(response?.moderator_view || fallbackModeratorSummary, 240);
  const moderatorView: LiveQuestionModeratorView = {
    summary: hasOffTopicPresentationForQuestion(localizedQuestion, rawModeratorSummary, references)
      ? fallbackModeratorSummary
      : rawModeratorSummary,
    citation_ids: citationIdsFromIndexes(response?.moderator_citation_indexes, references).length
      ? citationIdsFromIndexes(response?.moderator_citation_indexes, references)
      : defaultCitationIds,
  };

  const debate = {
    pro: {
      summary: cleanHumanReadableText(response?.pro_summary || fallbackProSummary, 220),
      citation_ids: citationIdsFromIndexes(response?.pro_citation_indexes, references).length
        ? citationIdsFromIndexes(response?.pro_citation_indexes, references)
        : defaultCitationIds,
      vote_ids: usableVotes.filter((vote) => vote.side === 'yes').map((vote) => vote.vote_id),
      count: usableVotes.filter((vote) => vote.side === 'yes').length,
    } satisfies LiveQuestionDebateSide,
    con: {
      summary: cleanHumanReadableText(response?.con_summary || fallbackConSummary, 220),
      citation_ids: citationIdsFromIndexes(response?.con_citation_indexes, references).length
        ? citationIdsFromIndexes(response?.con_citation_indexes, references)
        : defaultCitationIds,
      vote_ids: usableVotes.filter((vote) => vote.side === 'no').map((vote) => vote.vote_id),
      count: usableVotes.filter((vote) => vote.side === 'no').length,
    } satisfies LiveQuestionDebateSide,
  };

  return {
    question: localizedQuestion,
    moderatorView,
    debate,
    references,
  };
}

function bucketLabel(min: number, max: number) {
  return `${Math.round(min * 100)}-${Math.round(max * 100)}%`;
}

function computeScorecards(votes: LiveVote[]): ArenaScorecard[] {
  const byXia = new Map<string, LiveVote[]>();
  const roster = new Map<string, string>(getLiveBenchParticipantRoster().map((entry) => [entry.xia_id, entry.label]));
  const labelsByXia = new Map<string, string>();
  for (const vote of votes.filter((item) => item.source === 'xia')) {
    byXia.set(vote.xia_id, [...(byXia.get(vote.xia_id) || []), vote]);
    const label = compactText(vote.contributor_label || '', 64);
    if (label && !labelsByXia.has(vote.xia_id)) {
      labelsByXia.set(vote.xia_id, label);
    }
  }
  return [...byXia.entries()]
    .map(([xiaId, items]) => {
      const resolved = items.filter((item) => item.resolved_outcome);
      const hits = resolved.filter((item) => item.resolved_outcome === item.side).length;
      const leadHours =
        resolved
          .map((item) => {
            const resolvedAt = parseTime(item.resolved_at);
            const createdAt = parseTime(item.created_at);
            if (!resolvedAt || !createdAt) return null;
            return (resolvedAt - createdAt) / 3600000;
          })
          .filter((value): value is number => value !== null);
      const calibrationRanges = [
        [0, 0.4],
        [0.4, 0.6],
        [0.6, 0.8],
        [0.8, 1],
      ] as const;
      return {
        xia_id: xiaId,
        label: labelsByXia.get(xiaId) || roster.get(xiaId) || xiaId,
        vote_count: items.length,
        resolved_vote_count: resolved.length,
        hit_rate: resolved.length ? hits / resolved.length : 0,
        avg_brier_score:
          resolved.length > 0
            ? resolved.reduce((sum, item) => sum + (item.brier_score ?? 0), 0) / resolved.length
            : null,
        avg_lead_hours:
          leadHours.length > 0 ? leadHours.reduce((sum, item) => sum + item, 0) / leadHours.length : null,
        calibration_buckets: calibrationRanges.map(([min, max]) => {
          const bucketVotes = resolved.filter((item) => item.probability_yes >= min && item.probability_yes < max);
          const bucketHits = bucketVotes.filter((item) => item.resolved_outcome === item.side).length;
          return {
            label: bucketLabel(min, max),
            min,
            max,
            count: bucketVotes.length,
            hit_rate: bucketVotes.length ? bucketHits / bucketVotes.length : 0,
          };
        }),
        quality_score:
          resolved.length > 0
            ? hits * 3 - resolved.reduce((sum, item) => sum + (item.brier_score ?? 0), 0)
            : 0,
        points_balance: items.reduce((sum, item) => sum + (item.points_delta ?? 0), 0),
      } satisfies ArenaScorecard;
    })
    .sort((left, right) => right.quality_score - left.quality_score || right.points_balance - left.points_balance);
}

function isSyntheticXiaId(xiaId: string) {
  return SYNTHETIC_XIA_ID_SET.has(xiaId);
}

function _isSyntheticXiaVote(vote: LiveVote) {
  return vote.source === 'xia' && isSyntheticXiaId(vote.xia_id);
}

function isSourceAttachedFormalVote(vote: LiveVote) {
  return vote.source === 'xia' && !isSyntheticXiaId(vote.xia_id) && (vote.source_attached === true || Boolean(vote.source_snapshot_id));
}

type _LiveBenchRosterEntry = {
  xia_id: string;
  label: string;
};

function buildLiveBenchHref(questionId: string) {
  return `/livebench/${encodeURIComponent(questionId)}`;
}

function questionIdMatches(inputId: string, questionId: string) {
  const candidates = new Set([inputId]);
  try {
    candidates.add(decodeURIComponent(inputId));
  } catch {}
  try {
    candidates.add(decodeURIComponent(decodeURIComponent(inputId)));
  } catch {}
  candidates.add(encodeURIComponent(inputId));
  candidates.add(encodeURIComponent(questionId));
  return candidates.has(questionId);
}

function latestVotesByXia(votes: LiveVote[], options?: { includeSynthetic?: boolean }) {
  const includeSynthetic = options?.includeSynthetic !== false;
  const latest = new Map<string, LiveVote>();
  const sorted = [...votes]
    .filter((vote) => vote.source === 'xia' && (includeSynthetic || !isSyntheticXiaId(vote.xia_id)))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  for (const vote of sorted) {
    if (!latest.has(vote.xia_id)) {
      latest.set(vote.xia_id, vote);
    }
  }
  return [...latest.values()];
}

function buildLiveBenchRoster(votes: LiveVote[], options?: { includeSynthetic?: boolean }) {
  const includeSynthetic = options?.includeSynthetic !== false;
  const roster = new Map<string, string>(
    includeSynthetic ? getLiveBenchParticipantRoster().map((item) => [item.xia_id, item.label]) : [],
  );
  for (const vote of votes.filter((item) => item.source === 'xia' && (includeSynthetic || !isSyntheticXiaId(item.xia_id)))) {
    const label = compactText(vote.contributor_label || '', 64) || roster.get(vote.xia_id) || vote.xia_id;
    roster.set(vote.xia_id, label);
  }
  return [...roster.entries()].map(([xia_id, label]) => ({ xia_id, label }));
}

function computeAggregateVote(
  votes: LiveVote[],
  roster = buildLiveBenchRoster(votes),
  options?: { includeSynthetic?: boolean },
): LiveBenchAggregateVote {
  const latest = latestVotesByXia(votes, { includeSynthetic: options?.includeSynthetic !== false });
  if (latest.length === 0) {
    return {
      probability_yes: null,
      side: null,
      participant_count: 0,
      missing_count: roster.length,
      spread: null,
      stddev: null,
      complete: false,
      participant_labels: [],
      updated_at: null,
    };
  }

  const probabilities = latest.map((vote) => vote.probability_yes);
  const avg = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
  const mean = avg;
  const variance = probabilities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / probabilities.length;
  const timestamps = latest
    .map((vote) => new Date(vote.created_at).getTime())
    .filter((value) => Number.isFinite(value));
  return {
    probability_yes: Number(avg.toFixed(4)),
    side: avg >= 0.5 ? 'yes' : 'no',
    participant_count: latest.length,
    missing_count: Math.max(roster.length - latest.length, 0),
    spread: Number((Math.max(...probabilities) - Math.min(...probabilities)).toFixed(4)),
    stddev: Number(Math.sqrt(variance).toFixed(4)),
    complete: roster.length > 0 ? latest.length >= roster.length : latest.length > 0,
    participant_labels: latest.map((vote) => compactText(vote.contributor_label || '', 64) || vote.xia_id),
    updated_at: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
  };
}

function topicLabelForQuestion(question: LiveQuestion) {
  return questionTopicProfile(question).label;
}

function moderatorSummaryForSnapshot(snapshot: LiveQuestionSnapshot) {
  const raw = String(
    snapshot.question.moderator_view_cache?.summary ||
      snapshot.question.platform_context ||
      snapshot.question.background_zh ||
      snapshot.question.background ||
      '主持人正在整理这道题的当前关键信息。',
  );
  const cleaned = cleanHumanReadableText(
    raw
      .replace(/\bYES\s*概率(?:约|为)?\s*\d+%/giu, '')
      .replace(/公开(?:定价|概率)(?:为)?\s*YES\s*\d+%/giu, '')
      .replace(/社区概率(?:为)?\s*YES\s*\d+%/giu, '')
      .replace(/当前，并可看到(?:成交量|流动性|结果项|参与人数|交易).*$/giu, '')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    220,
  );
  if (
    /成交量|流动性|公开定价|平台概率|社区概率|参与人数|交易盘口/.test(cleaned) ||
    hasOffTopicPresentationForQuestion(snapshot.question, cleaned, snapshot.references)
  ) {
    return compactText(fallbackBackgroundZh(snapshot.question) || '主持人正在整理这道题的当前关键信息。', 220);
  }
  return cleaned;
}

function aggregateSummaryLine(aggregate: LiveBenchAggregateVote) {
  if (aggregate.probability_yes === null || !aggregate.side) {
    return '当前还没有稳定可用的虾回复，主持人串讲和证据已保留。';
  }
  return aggregate.side === 'yes'
    ? '模型总票当前偏向“是”，但还要继续盯触发条件有没有兑现。'
    : '模型总票当前偏向“不是”，但还要继续盯会不会出现改判证据。';
}

function evidenceCountsFromReferences(references: LiveQuestionReference[]) {
  const evidence = references.filter((reference) => reference.recall_role === 'zvec-core').length;
  const rules = references.filter((reference) => reference.recall_role === 'question-rule').length;
  return { evidence, rules };
}

function preferredQuestionTitleForUi(question: LiveQuestion) {
  const localized = cleanQuestionTitleForUi(question.title_zh || '');
  const raw = String(question.title || '').replace(/\s+/g, ' ').trim();
  const communityPrediction = raw.match(
    /^Will the community prediction be (higher|lower) than ([\d.]+)% on (.+?) for the Metaculus question "(.+?)"\?$/i,
  );
  if (communityPrediction) {
    const direction = communityPrediction[1].toLowerCase() === 'higher' ? '高于' : '低于';
    return `到 ${translateEnglishDateToZh(communityPrediction[3])} 时，Metaculus 社区对“${fallbackQuestionTitleZh({
      ...question,
      title: communityPrediction[4],
      title_zh: null,
    })}”的预测概率会${direction} ${communityPrediction[2]}% 吗？`;
  }
  if (
    localized &&
    /[\u4e00-\u9fa5]/.test(localized) &&
    !/\bWill\b|Up or Down|higher than|lower than|community prediction|attack Iran|conduct a ground invasion|finish week|final day of trading|hit \((HIGH|LOW)\)|这道题在问/i.test(localized)
  ) {
    return localized;
  }
  return cleanQuestionTitleForUi(fallbackQuestionTitleZh(question));
}

function buildQuestionPreview(snapshot: LiveQuestionSnapshot): LiveBenchQuestionPreview {
  const roster = buildLiveBenchRoster(snapshot.xia_votes, { includeSynthetic: false });
  const aggregate = computeAggregateVote(snapshot.xia_votes, roster, { includeSynthetic: false });
  const latestFormalVotes = latestVotesByXia(snapshot.xia_votes, { includeSynthetic: false });
  const counts = evidenceCountsFromReferences(snapshot.references);
  return {
    question_id: snapshot.question.question_id,
    href: buildLiveBenchHref(snapshot.question.question_id),
    status: snapshot.question.status,
    settlement_status: snapshot.question.official_outcome
      ? 'resolved'
      : isLiveBenchSettlementPending(snapshot.question)
        ? 'pending_official'
        : 'open',
    title: compactText(preferredQuestionTitleForUi(snapshot.question), 160),
    background: compactText(snapshot.question.background_zh || snapshot.question.background || '', 180),
    region_label: compactText(snapshot.question.region_hint || 'Global', 48),
    topic_label: compactText(topicLabelForQuestion(snapshot.question), 48),
    resolve_at: snapshot.question.resolve_at || snapshot.question.close_at || null,
    official_outcome: snapshot.question.official_outcome || null,
    official_resolved_at: snapshot.question.official_resolved_at || null,
    moderator_line: moderatorSummaryForSnapshot(snapshot),
    source_label: compactText(snapshot.question.raw_source_platform || snapshot.question.source_platform, 48),
    evidence_count: counts.evidence,
    rule_count: counts.rules,
    discussion_count: snapshot.discussion_votes.filter((vote) => vote.source === 'external').length + (snapshot.question.platform_commentary?.length || 0),
    xia_count: latestFormalVotes.length,
    aggregate_vote: aggregate,
    platform_question_url: snapshot.question.platform_question_url || snapshot.question.origin_url || null,
  };
}

export function buildLiveBenchQuestionPreviewFromSnapshot(snapshot: LiveQuestionSnapshot) {
  return buildQuestionPreview(snapshot);
}

function buildDiscussionEntries(snapshot: LiveQuestionSnapshot): LiveBenchQuestionDiscussionEntry[] {
  const entries: LiveBenchQuestionDiscussionEntry[] = [];
  for (const [index, item] of (snapshot.question.platform_commentary || []).entries()) {
    entries.push({
      id: `${snapshot.question.question_id}:platform-brief:${index}`,
      kind: 'platform-brief',
      label: '平台信息',
      author: null,
      side: null,
      probability_yes: null,
      summary: compactText(item, 180),
      detail: null,
      created_at: snapshot.question.platform_probability_updated_at || snapshot.question.updated_at,
      origin_url: snapshot.question.platform_question_url || snapshot.question.origin_url || null,
    });
  }
  for (const [index, item] of (snapshot.question.platform_participants || []).entries()) {
    entries.push({
      id: `${snapshot.question.question_id}:platform-participant:${index}`,
      kind: 'platform-participant',
      label: '平台讨论背景',
      author: null,
      side: null,
      probability_yes: null,
      summary: compactText(item, 140),
      detail: null,
      created_at: snapshot.question.platform_probability_updated_at || snapshot.question.updated_at,
      origin_url: snapshot.question.platform_question_url || snapshot.question.origin_url || null,
    });
  }
  const externalVotes = snapshot.discussion_votes
    .filter((vote) => vote.source === 'external')
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  for (const vote of externalVotes) {
    entries.push({
      id: vote.vote_id,
      kind: 'external-post',
      label: compactText(vote.contributor_kind === 'community' ? '原帖 / 平台参与者' : '平台跟帖', 40),
      author: compactText(vote.contributor_label || '', 64) || null,
      side: vote.side,
      probability_yes: vote.probability_yes,
      summary: compactText(vote.human_readable_prediction, 180),
      detail: compactText(vote.human_readable_why, 240) || null,
      created_at: vote.created_at,
      origin_url: vote.origin_url || snapshot.question.platform_question_url || snapshot.question.origin_url || null,
    });
  }
  return entries;
}

function buildGroupedPositions(snapshot: LiveQuestionSnapshot): LiveBenchGroupedPositions {
  const roster = buildLiveBenchRoster(snapshot.xia_votes, { includeSynthetic: false });
  const latest = latestVotesByXia(snapshot.xia_votes, { includeSynthetic: false });
  const knownVotes = new Set(latest.map((vote) => vote.xia_id));
  const allowedSignalIds = new Set(
    safeReferencesForQuestion(snapshot.question, snapshot.references)
      .map((reference) => reference.signal_id)
      .filter((value): value is string => Boolean(value)),
  );
  const positions = latest.map<LiveBenchQuestionPosition>((vote) => ({
    vote_id: vote.vote_id,
    xia_id: vote.xia_id,
    label: compactText(vote.contributor_label || '', 64) || roster.find((item) => item.xia_id === vote.xia_id)?.label || vote.xia_id,
    side: vote.side,
    probability_yes: vote.probability_yes,
    prediction: compactText(vote.human_readable_prediction, 220),
    why: compactText(vote.human_readable_why, 320),
    what_changes_my_mind: compactText(vote.what_changes_my_mind, 220),
    cited_signal_ids: allowedSignalIds.size > 0
      ? vote.cited_signal_ids.filter((signalId) => allowedSignalIds.has(signalId))
      : [],
    created_at: vote.created_at,
    brier_score: vote.brier_score ?? null,
    points_delta: vote.points_delta ?? null,
  }));
  return {
    yes: positions.filter((item) => item.side === 'yes'),
    no: positions.filter((item) => item.side === 'no'),
    missing: roster.filter((item) => !knownVotes.has(item.xia_id)),
  };
}

function buildEvidenceSections(snapshot: LiveQuestionSnapshot): LiveBenchEvidenceSection[] {
  const references = safeReferencesForQuestion(snapshot.question, snapshot.references);
  const core = references.filter((reference) => reference.recall_role === 'zvec-core');
  const rules = references.filter((reference) => reference.recall_role === 'question-rule');
  const sections: LiveBenchEvidenceSection[] = [];
  if (core.length > 0) {
    sections.push({
      role: 'zvec-core',
      title: '核心证据',
      description: '只保留这道题最直接相关的近期证据卡片。',
      total_count: core.length,
      visible_count: Math.min(core.length, 3),
      references: core,
    });
  }
  if (rules.length > 0) {
    sections.push({
      role: 'question-rule',
      title: '规则说明',
      description: '用于确认这题最后怎么判、按什么结果结算。',
      total_count: rules.length,
      visible_count: Math.min(rules.length, 1),
      references: rules,
    });
  }
  return sections;
}

function buildSettlement(snapshot: LiveQuestionSnapshot, aggregate: LiveBenchAggregateVote): LiveBenchSettlementScore {
  const latest = latestVotesByXia(snapshot.xia_votes, { includeSynthetic: false });
  const official = snapshot.question.official_outcome || null;
  const aggregateBrier =
    official && aggregate.probability_yes !== null
      ? Number(((aggregate.probability_yes - (official === 'yes' ? 1 : 0)) ** 2).toFixed(4))
      : null;
  const platformHit = official && aggregate.side ? aggregate.side === official : null;
  const xiaScores = latest.map((vote) => ({
    xia_id: vote.xia_id,
    label: compactText(vote.contributor_label || '', 64) || vote.xia_id,
    side: vote.side,
    probability_yes: vote.probability_yes,
    brier_score: vote.brier_score ?? null,
    points_delta: vote.points_delta ?? null,
    hit: official ? vote.side === official : null,
  }));
  const replaySummary =
    official && aggregate.probability_yes !== null && aggregate.side
      ? `官方结果为${official === 'yes' ? '“是”' : '“不是”'}。模型总票当时偏向${aggregate.side === 'yes' ? '“是”' : '“不是”'}，预测误差为 ${aggregateBrier?.toFixed(4)}。`
      : official
        ? `官方结果已经回写为${official === 'yes' ? '“是”' : '“不是”'}，但这道题在结算前没有形成足够的虾票，所以当前还算不出模型总票成绩。`
        : '这道题尚未进入结算阶段，模型总票和各虾理由会继续更新。';
  return {
    official_outcome: official,
    official_resolved_at: snapshot.question.official_resolved_at || null,
    platform_brier_score: aggregateBrier,
    platform_hit: platformHit,
    replay_summary: replaySummary,
    xia_scores: xiaScores,
  };
}

function buildModeratorBrief(snapshot: LiveQuestionSnapshot, aggregate: LiveBenchAggregateVote) {
  const safeReferences = safeReferencesForQuestion(snapshot.question, snapshot.references);
  const safeReferenceIds = new Set(safeReferences.map((reference) => reference.ref_id));
  const watchFor = latestVotesByXia(snapshot.xia_votes)
    .map((vote) => compactText(vote.what_changes_my_mind, 140))
    .filter(Boolean)
    .slice(0, 2);
  const rawSummary =
    snapshot.question.moderator_view_cache?.summary ||
    snapshot.question.platform_context ||
    snapshot.question.background_zh ||
    snapshot.question.background ||
    '主持人正在整理这道题的核心判断。';
  const cleanedSummary = cleanHumanReadableText(rawSummary, 320);
  const fallbackSummary =
    aggregate.side === 'yes'
      ? `${fallbackBackgroundZh(snapshot.question)} 当前更偏向会发生，但还要继续盯能不能出现真正落地的推进证据。`
      : `${fallbackBackgroundZh(snapshot.question)} 当前更偏向不会发生，但还要继续盯会不会出现改判证据。`;
  const summary =
    /(Bundle Feed|信源包更新|本轮前几条标题|A Sprawling|Ahmed Al Jaber|attack Iran|Strait of Hormuz)/i.test(rawSummary) ||
    hasOffTopicPresentationForQuestion(snapshot.question, rawSummary, snapshot.references)
      ? fallbackSummary
      : cleanedSummary || fallbackSummary;
  return {
    summary,
    resolution_rule: compactText(snapshot.question.resolution_criteria_zh || snapshot.question.resolution_criteria || '', 240),
    current_bias: aggregateSummaryLine(aggregate),
    watch_for: watchFor.length > 0 ? watchFor : ['后续只要出现会改变结算方向的直接证据，就需要重估这道题。'],
    citation_ids: (snapshot.question.moderator_view_cache?.citation_ids || []).filter((refId) => safeReferenceIds.has(refId)),
  };
}

function buildPlatformCalibration(items: LiveBenchResolvedQuestionSeriesItem[]): LiveBenchCalibrationBucket[] {
  return AGGREGATE_CALIBRATION_RANGES.map(([min, max]) => {
    const bucketItems = items.filter((item) => {
      if (item.probability_yes === null) return false;
      return item.probability_yes >= min && item.probability_yes < max;
    });
    const yesCount = bucketItems.filter((item) => item.official_outcome === 'yes').length;
    const avgProbability =
      bucketItems.length > 0
        ? bucketItems.reduce((sum, item) => sum + (item.probability_yes ?? 0), 0) / bucketItems.length
        : null;
    const empirical = bucketItems.length > 0 ? yesCount / bucketItems.length : 0;
    return {
      label: bucketLabel(min, Math.min(max, 1)),
      min,
      max: Math.min(max, 1),
      count: bucketItems.length,
      empirical_yes_rate: empirical,
      avg_probability_yes: avgProbability === null ? null : Number(avgProbability.toFixed(4)),
      gap: avgProbability === null ? null : Number((empirical - avgProbability).toFixed(4)),
    };
  });
}

function buildResolvedSeries(snapshot: LiveQuestionSnapshot): LiveBenchResolvedQuestionSeriesItem {
  const preview = buildQuestionPreview(snapshot);
  const aggregateRoster = buildLiveBenchRoster(snapshot.xia_votes, { includeSynthetic: true });
  const aggregate = computeAggregateVote(snapshot.xia_votes, aggregateRoster, { includeSynthetic: true });
  const formalRoster = buildLiveBenchRoster(snapshot.xia_votes, { includeSynthetic: false });
  const formalAggregate = computeAggregateVote(snapshot.xia_votes, formalRoster, { includeSynthetic: false });
  const sourceFormalVotes = snapshot.xia_votes.filter(isSourceAttachedFormalVote);
  const sourceFormalRoster = buildLiveBenchRoster(sourceFormalVotes, { includeSynthetic: false });
  const sourceFormalAggregate = computeAggregateVote(sourceFormalVotes, sourceFormalRoster, { includeSynthetic: false });
  const official = snapshot.question.official_outcome || null;
  const probability = aggregate.probability_yes;
  const formalProbability = formalAggregate.probability_yes;
  const sourceFormalProbability = sourceFormalAggregate.probability_yes;
  const formalParticipantCount = formalAggregate.participant_count;
  const sourceFormalParticipantCount = sourceFormalAggregate.participant_count;
  const allParticipantCount = latestVotesByXia(snapshot.xia_votes).length;
  const brier =
    official && probability !== null
      ? Number(((probability - (official === 'yes' ? 1 : 0)) ** 2).toFixed(4))
      : null;
  const formalBrier =
    official && formalProbability !== null
      ? Number(((formalProbability - (official === 'yes' ? 1 : 0)) ** 2).toFixed(4))
      : null;
  const sourceFormalBrier =
    official && sourceFormalProbability !== null
      ? Number(((sourceFormalProbability - (official === 'yes' ? 1 : 0)) ** 2).toFixed(4))
      : null;
  return {
    question_id: snapshot.question.question_id,
    title: preview.title,
    href: preview.href,
    resolved_at: snapshot.question.official_resolved_at || snapshot.question.resolve_at || snapshot.question.updated_at,
    probability_yes: probability,
    official_outcome: official,
    hit: official && aggregate.side ? aggregate.side === official : null,
    brier_score: brier,
    participant_count: aggregate.participant_count,
    formal_participant_count: formalParticipantCount,
    synthetic_participant_count: Math.max(allParticipantCount - formalParticipantCount, 0),
    source_formal_participant_count: sourceFormalParticipantCount,
    formal_hit: official && formalAggregate.side ? formalAggregate.side === official : null,
    formal_brier_score: formalBrier,
    formal_scored: formalBrier !== null,
    source_formal_hit: official && sourceFormalAggregate.side ? sourceFormalAggregate.side === official : null,
    source_formal_brier_score: sourceFormalBrier,
    source_formal_scored: sourceFormalBrier !== null,
    scored: brier !== null,
  };
}

function buildHistorySeries(items: LiveBenchResolvedQuestionSeriesItem[]) {
  let brierSum = 0;
  let formalBrierSum = 0;
  let sourceFormalBrierSum = 0;
  let hitCount = 0;
  let formalHitCount = 0;
  let sourceFormalHitCount = 0;
  let scoredCount = 0;
  let formalScoredCount = 0;
  let sourceFormalScoredCount = 0;
  let resolvedCount = 0;
  return [...items]
    .sort((left, right) => new Date(left.resolved_at || 0).getTime() - new Date(right.resolved_at || 0).getTime())
    .map((item) => {
      if (item.brier_score !== null) {
        brierSum += item.brier_score;
        scoredCount += 1;
      }
      if (item.formal_brier_score !== null) {
        formalBrierSum += item.formal_brier_score;
        formalScoredCount += 1;
      }
      if (item.source_formal_brier_score !== null) {
        sourceFormalBrierSum += item.source_formal_brier_score;
        sourceFormalScoredCount += 1;
      }
      if (item.hit) {
        hitCount += 1;
      }
      if (item.formal_hit) {
        formalHitCount += 1;
      }
      if (item.source_formal_hit) {
        sourceFormalHitCount += 1;
      }
      resolvedCount += 1;
      return {
        resolved_at: item.resolved_at,
        avg_brier: scoredCount > 0 ? Number((brierSum / scoredCount).toFixed(4)) : null,
        formal_avg_brier: formalScoredCount > 0 ? Number((formalBrierSum / formalScoredCount).toFixed(4)) : null,
        source_formal_avg_brier:
          sourceFormalScoredCount > 0 ? Number((sourceFormalBrierSum / sourceFormalScoredCount).toFixed(4)) : null,
        hit_rate: scoredCount > 0 ? hitCount / scoredCount : 0,
        formal_hit_rate: formalScoredCount > 0 ? formalHitCount / formalScoredCount : 0,
        source_formal_hit_rate: sourceFormalScoredCount > 0 ? sourceFormalHitCount / sourceFormalScoredCount : 0,
        resolved_question_count: resolvedCount,
        scored_question_count: scoredCount,
        formal_scored_question_count: formalScoredCount,
        source_formal_scored_question_count: sourceFormalScoredCount,
      };
    });
}

export function buildLiveBenchEvaluationFromArena(
  scene: WorldScene,
  arena: LiveBenchArenaState,
  participantScorecards: ArenaScorecard[] = [...arena.quality_board].sort((left, right) => right.quality_score - left.quality_score),
): LiveBenchEvaluation {
  const resolvedSeries = arena.resolved_questions.map(buildResolvedSeries);
  const formalScorecards = participantScorecards.filter((scorecard) => !isSyntheticXiaId(scorecard.xia_id));
  const formalVoteCount = formalScorecards.reduce((sum, scorecard) => sum + scorecard.vote_count, 0);
  const allQuestionSnapshots = [...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions];
  const sourceFormalVoteCount = allQuestionSnapshots
    .flatMap((snapshot) => snapshot.xia_votes)
    .filter(isSourceAttachedFormalVote).length;
  const resolvedQuestionCount = Math.max(
    resolvedSeries.length,
    ...formalScorecards.map((scorecard) => scorecard.resolved_vote_count || 0),
  );
  const brierItems = resolvedSeries.filter((item) => item.brier_score !== null);
  const hitItems = resolvedSeries.filter((item) => item.hit !== null);
  const formalBrierItems = resolvedSeries.filter((item) => item.formal_brier_score !== null);
  const formalHitItems = resolvedSeries.filter((item) => item.formal_hit !== null);
  const sourceFormalBrierItems = resolvedSeries.filter((item) => item.source_formal_brier_score !== null);
  const sourceFormalHitItems = resolvedSeries.filter((item) => item.source_formal_hit !== null);
  const platformModel: LiveBenchPlatformModelSummary = {
    resolved_question_count: resolvedQuestionCount,
    scored_question_count: brierItems.length,
    formal_scored_question_count: formalBrierItems.length,
    source_formal_scored_question_count: sourceFormalBrierItems.length,
    formal_vote_count: formalVoteCount,
    source_formal_vote_count: sourceFormalVoteCount,
    formal_participant_count: formalScorecards.length,
    synthetic_scored_question_count: resolvedSeries.filter((item) => item.scored && !item.formal_scored).length,
    active_question_count: arena.active_questions.length,
    watchlist_question_count: arena.watchlist_questions.length,
    open_question_count: arena.active_questions.length + arena.watchlist_questions.length,
    current_question_count: arena.active_questions.length + arena.watchlist_questions.length,
    avg_brier:
      brierItems.length > 0
        ? Number((brierItems.reduce((sum, item) => sum + (item.brier_score ?? 0), 0) / brierItems.length).toFixed(4))
        : null,
    formal_avg_brier:
      formalBrierItems.length > 0
        ? Number((formalBrierItems.reduce((sum, item) => sum + (item.formal_brier_score ?? 0), 0) / formalBrierItems.length).toFixed(4))
        : null,
    source_formal_avg_brier:
      sourceFormalBrierItems.length > 0
        ? Number((sourceFormalBrierItems.reduce((sum, item) => sum + (item.source_formal_brier_score ?? 0), 0) / sourceFormalBrierItems.length).toFixed(4))
        : null,
    hit_rate: hitItems.length > 0 ? hitItems.filter((item) => item.hit).length / hitItems.length : 0,
    formal_hit_rate: formalHitItems.length > 0 ? formalHitItems.filter((item) => item.formal_hit).length / formalHitItems.length : 0,
    source_formal_hit_rate:
      sourceFormalHitItems.length > 0
        ? sourceFormalHitItems.filter((item) => item.source_formal_hit).length / sourceFormalHitItems.length
        : 0,
    scoring_coverage_rate: resolvedQuestionCount > 0 ? brierItems.length / resolvedQuestionCount : 0,
    formal_scoring_coverage_rate: resolvedQuestionCount > 0 ? formalBrierItems.length / resolvedQuestionCount : 0,
    source_formal_scoring_coverage_rate:
      resolvedQuestionCount > 0 ? sourceFormalBrierItems.length / resolvedQuestionCount : 0,
    calibration: buildPlatformCalibration(resolvedSeries),
  };
  return {
    generated_at: arena.generated_at,
    scene,
    platform_model: platformModel,
    participant_scorecards: formalScorecards,
    history_series: buildHistorySeries(resolvedSeries),
    resolved_question_series: resolvedSeries.sort(
      (left, right) => new Date(right.resolved_at || 0).getTime() - new Date(left.resolved_at || 0).getTime(),
    ),
  };
}

export function buildLiveBenchQuestionDetailFromSnapshot(
  scene: WorldScene,
  snapshot: LiveQuestionSnapshot,
): LiveBenchQuestionDetail {
  const preview = buildQuestionPreview(snapshot);
  const aggregate = preview.aggregate_vote;
  return {
    generated_at: nowIso(),
    scene,
    question: toPublicLiveQuestion(snapshot.question),
    preview,
    moderator_brief: buildModeratorBrief(snapshot, aggregate),
    external_discussion: {
      summary: compactText(
        snapshot.question.platform_context ||
        '原生讨论、评论计数和原帖背景只作为上下文，不计入模型总票。',
        220,
      ),
      entries: buildDiscussionEntries(snapshot),
    },
    xia_positions: buildGroupedPositions(snapshot),
    aggregate_vote: aggregate,
    evidence: buildEvidenceSections(snapshot),
    settlement: buildSettlement(snapshot, aggregate),
  };
}

function buildLiveBenchSourceHealth(input: {
  questions: LiveQuestion[];
  metaculusStatus: string;
  metaforecastCandidateCount: number;
  metaforecastScannedCount: number;
  metaforecastPlatformCandidateCount: number;
  manifoldDirectCount: number;
  manifoldFallbackCount: number;
  polymarketDirectCount: number;
  retainedOpenCount: number;
  retainedResolvedCount: number;
  settlementPendingCount: number;
}): LiveBenchSourceHealth {
  const activeQuestionCount = input.questions.filter((question) => question.status === 'active').length;
  const watchlistQuestionCount = input.questions.filter((question) => question.status === 'watchlist').length;
  const resolvedQuestionCount = input.questions.filter((question) => question.status === 'resolved').length;
  const openQuestionCount = activeQuestionCount + watchlistQuestionCount;
  const metaculusConfigured = !/未配置\s+METACULUS_API_TOKEN/.test(input.metaculusStatus);
  const issues: string[] = [];

  if (!metaculusConfigured) issues.push('METACULUS_API_TOKEN 未配置，Metaculus 题池没有参与补位。');
  if (input.metaforecastScannedCount === 0) {
    issues.push('Metaforecast 没有返回可解析题目数据，可能被上游安全检查或网络策略拦截。');
  } else if (input.metaforecastCandidateCount === 0) {
    issues.push(`Metaforecast 已扫描 ${input.metaforecastScannedCount} 条，但相关候选为 0。`);
  }
  if (openQuestionCount < LIVEBENCH_MIN_OPEN_QUESTION_COUNT) {
    issues.push(`open question 只有 ${openQuestionCount} 题，低于 ${LIVEBENCH_MIN_OPEN_QUESTION_COUNT} 题健康线。`);
  }
  if (input.questions.length < LIVEBENCH_MIN_TOTAL_QUESTION_COUNT) {
    issues.push(`总题池只有 ${input.questions.length} 题，低于 ${LIVEBENCH_MIN_TOTAL_QUESTION_COUNT} 题健康线。`);
  }

  return {
    status: issues.length ? 'degraded' : 'ok',
    total_question_count: input.questions.length,
    open_question_count: openQuestionCount,
    active_question_count: activeQuestionCount,
    watchlist_question_count: watchlistQuestionCount,
    resolved_question_count: resolvedQuestionCount,
    settlement_pending_count: input.settlementPendingCount,
    metaculus_configured: metaculusConfigured,
    metaforecast_candidate_count: input.metaforecastCandidateCount,
    metaforecast_scanned_count: input.metaforecastScannedCount,
    metaforecast_platform_candidate_count: input.metaforecastPlatformCandidateCount,
    manifold_direct_count: input.manifoldDirectCount,
    manifold_fallback_count: input.manifoldFallbackCount,
    polymarket_direct_count: input.polymarketDirectCount,
    retained_open_count: input.retainedOpenCount,
    retained_resolved_count: input.retainedResolvedCount,
    min_open_question_count: LIVEBENCH_MIN_OPEN_QUESTION_COUNT,
    min_total_question_count: LIVEBENCH_MIN_TOTAL_QUESTION_COUNT,
    issues,
    note: issues.length
      ? 'LiveBench 可运行，但题源覆盖不足；需要优先补齐上游 token、检查 Metaforecast 过滤命中，并确认后台刷新是否持续产出。'
      : 'LiveBench 题池规模和上游覆盖当前处于健康线以上。',
  };
}

async function syncQuestions(store: LiveBenchStore, _signals: WorldSignal[]): Promise<LiveBenchStore> {
  const archive = await readRetainedLiveBenchArchive();
  const storeWithArchive = mergeRetainedArchiveIntoStore(store, archive);
  const stale =
    !storeWithArchive.last_synced_at || Date.now() - new Date(storeWithArchive.last_synced_at).getTime() > LIVEBENCH_SYNC_INTERVAL_MS;
  if (!stale && storeWithArchive.questions.length > 0) {
    return storeWithArchive;
  }

  const [metaculus, metaforecast] = await Promise.all([
    fetchMetaculusQuestions(),
    fetchMetaforecastDiscoveries(),
  ]);
  const manifold = await fetchManifoldQuestions();
  const polymarket = await fetchPolymarketQuestions(metaforecast.discoveries);
  const manifoldFallback = buildDiscoveryFallbackQuestions(metaforecast.discoveries, 'manifold');
  const manualVerifiedQuestions = buildManualVerifiedQuestions().filter(isExternalLiveBenchQuestion);
  const retainedOpenQuestions = await refreshRetainedOpenQuestions(storeWithArchive.questions);

  const merged = new Map<string, LiveQuestion>();
  const semanticKeys = new Set<string>();
  for (const question of [
    ...metaculus.questions,
    ...manifold,
    ...polymarket,
    ...manifoldFallback,
    ...manualVerifiedQuestions,
    ...retainedOpenQuestions.questions,
  ]) {
    const semanticKey = normalizeTag(`${question.title}|${question.region_hint}|${question.topic_bucket}`);
    if (semanticKeys.has(semanticKey)) continue;
    semanticKeys.add(semanticKey);
    merged.set(question.question_id, question);
  }

  const retainedResolved = retainRecentResolvedQuestions([...merged.values()], storeWithArchive.questions);
  for (const question of retainedResolved) {
    merged.set(question.question_id, question);
  }

  const questions = [...merged.values()]
    .filter(isExternalLiveBenchQuestion)
    .filter((question) => filterQuestionTopic(question) && hasQuestionQuality(question))
    .map((question) => {
      const resolvedQuestion = applyManualVerifiedOutcome(question);
      return {
        ...resolvedQuestion,
        status: classifyQuestionStatus(resolvedQuestion),
        updated_at: nowIso(),
      };
    })
    .filter((question) => question.status !== 'pending')
    .sort((left, right) => {
      const leftDays = Math.min(daysUntil(left.resolve_at), daysUntil(left.close_at));
      const rightDays = Math.min(daysUntil(right.resolve_at), daysUntil(right.close_at));
      return leftDays - rightDays;
    });
  const settlementPendingCount = questions.filter((question) => isLiveBenchSettlementPending(question)).length;
  const validQuestionIds = new Set(questions.map((question) => question.question_id));
  const sourceHealth = buildLiveBenchSourceHealth({
    questions,
    metaculusStatus: metaculus.status,
    metaforecastCandidateCount: metaforecast.discoveries.length,
    metaforecastScannedCount: metaforecast.scanned_count,
    metaforecastPlatformCandidateCount: metaforecast.platform_candidate_count,
    manifoldDirectCount: manifold.length,
    manifoldFallbackCount: manifoldFallback.length,
    polymarketDirectCount: polymarket.length,
    retainedOpenCount: retainedOpenQuestions.questions.length,
    retainedResolvedCount: retainedResolved.length,
    settlementPendingCount,
  });

  return {
    ...storeWithArchive,
    last_synced_at: nowIso(),
    questions,
    votes: storeWithArchive.votes.filter((vote) => validQuestionIds.has(vote.question_id)),
    chunks: storeWithArchive.chunks,
    source_status: {
      ...storeWithArchive.source_status,
      metaculus: metaculus.status,
      metaforecast: [
        metaforecast.status,
        `直连入池：Manifold ${manifold.length} 题`,
        `直连入池：Polymarket ${polymarket.length} 题`,
        `聚合补位：Manifold ${manifoldFallback.length} 题`,
        manualVerifiedQuestions.length ? `人工核验已结算保留：${manualVerifiedQuestions.length} 题` : '',
        retainedOpenQuestions.questions.length ? `旧题保留：${retainedOpenQuestions.questions.length} 题` : '',
        retainedOpenQuestions.resolvedCount ? `旧题官方结算刷新：${retainedOpenQuestions.resolvedCount} 题` : '',
        retainedOpenQuestions.scheduleUpdatedCount ? `旧题到期时间校正：${retainedOpenQuestions.scheduleUpdatedCount} 题` : '',
        retainedResolved.length ? `最近已结算保留：${retainedResolved.length} 题` : '',
        settlementPendingCount ? `到期待核票：${settlementPendingCount} 题` : '',
      ].filter(Boolean).join('；'),
    },
    source_health: sourceHealth,
  };
}

function selectSignalsForKnowledgeBase(signals: WorldSignal[]) {
  const freshSignals = signals.filter((signal) => new Date(signal.publishedAt).getTime() >= Date.now() - WATCHLIST_WINDOW_DAYS * 86400000);
  return [...freshSignals].sort((left, right) => {
    const leftPublished = parseTime(left.publishedAt) || 0;
    const rightPublished = parseTime(right.publishedAt) || 0;
    const leftScore = (left.relevanceScore || 0) * 0.4 + (left.hotspotScore || 0) * 0.35 + (left.explorationScore || 0) * 0.25;
    const rightScore = (right.relevanceScore || 0) * 0.4 + (right.hotspotScore || 0) * 0.35 + (right.explorationScore || 0) * 0.25;
    return rightPublished - leftPublished || rightScore - leftScore;
  });
}

function hasFreshChunk(chunk: SourceEmbeddingChunk) {
  return new Date(chunk.expires_at).getTime() > Date.now();
}

function selectedSignalChunkIds(signals: WorldSignal[]) {
  return new Set(selectSignalsForKnowledgeBase(signals).map((signal) => `signal:${signal.id}`));
}

function shouldRefreshSourceKnowledge(store: LiveBenchStore, signals: WorldSignal[]) {
  const selectedIds = selectedSignalChunkIds(signals);
  const freshSignalChunks = store.chunks.filter((chunk) => chunk.chunk_id.startsWith('signal:') && hasFreshChunk(chunk));
  const freshChunkIds = new Set(freshSignalChunks.map((chunk) => chunk.chunk_id));
  const missingSelectedSignal = [...selectedIds].some((chunkId) => !freshChunkIds.has(chunkId));
  const staleSelectedSignalCount = freshSignalChunks.length !== selectedIds.size;
  const syncAge = store.last_source_knowledge_synced_at ? Date.now() - new Date(store.last_source_knowledge_synced_at).getTime() : Number.POSITIVE_INFINITY;
  const signalCountChanged =
    typeof store.last_source_knowledge_signal_count === 'number' && store.last_source_knowledge_signal_count !== selectedIds.size;

  return (
    missingSelectedSignal ||
    staleSelectedSignalCount ||
    signalCountChanged ||
    !store.last_source_knowledge_synced_at ||
    syncAge > SOURCE_KNOWLEDGE_SYNC_INTERVAL_MS
  );
}

async function ensureSourceKnowledgeStore(
  signals: WorldSignal[],
  options?: {
    force?: boolean;
  },
): Promise<LiveBenchStore> {
  let store = await loadStore();
  const shouldRefresh = options?.force || shouldRefreshSourceKnowledge(store, signals);
  if (!shouldRefresh) {
    return store;
  }
  store = await buildChunks(store, signals);
  await persistStore(store);
  return store;
}

async function buildChunks(store: LiveBenchStore, signals: WorldSignal[]): Promise<LiveBenchStore> {
  const freshCutoff = Date.now() - WATCHLIST_WINDOW_DAYS * 86400000;
  const existingChunkMap = new Map(store.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const selectedSignals = selectSignalsForKnowledgeBase(signals);
  const candidates = [
    ...selectedSignals
      .filter((signal) => new Date(signal.publishedAt).getTime() >= freshCutoff)
      .map((signal) => ({
        chunk_id: `signal:${signal.id}`,
        signal_id: signal.id,
        title: compactText(signal.displayTitle || signal.title, 140),
        text: compactText(`${signal.displayTitle || signal.title}\n${signal.displaySummary || signal.summary}`, 520),
        published_at: signal.publishedAt,
        scene: signal.scene,
        region: signal.region,
        tags: signal.tags,
        source_name: signal.sourceName,
        source_url: signal.sourceUrl,
      })),
  ];

  const chunks: SourceEmbeddingChunk[] = [];
  let backend = store.last_embedding_backend || `${REQUESTED_EMBEDDING_MODEL} 待尝试`;
  let usedRemoteEmbedding = false;
  let usedFallbackEmbedding = false;
  let remoteUpgradeBudget = Number.isFinite(LIVEBENCH_REMOTE_EMBED_UPGRADE_LIMIT)
    ? Math.max(0, LIVEBENCH_REMOTE_EMBED_UPGRADE_LIMIT)
    : 24;
  const pendingCandidates: typeof candidates = [];
  for (const candidate of candidates) {
    const cached = existingChunkMap.get(candidate.chunk_id);
    const cachedStillFresh = cached && new Date(cached.expires_at).getTime() > Date.now();
    const remoteUnavailable = getRemoteHealth().embeddingUnavailableUntil > Date.now();
    const cachedMatchesRequestedRemote =
      cached?.embedding_backend &&
      cached.embedding_backend !== 'local-hash-fallback' &&
      cached.embedding_backend === REQUESTED_EMBEDDING_MODEL;
    const canReuseCached =
      Boolean(cachedStillFresh) &&
      (cachedMatchesRequestedRemote || (cached?.embedding_backend === 'local-hash-fallback' && remoteUnavailable));
    if (canReuseCached && cached) {
      chunks.push(cached);
      if (cached.embedding_backend && cached.embedding_backend !== 'local-hash-fallback') {
        usedRemoteEmbedding = true;
        backend = cached.embedding_backend;
      } else {
        usedFallbackEmbedding = true;
      }
      continue;
    }
    if (
      cachedStillFresh &&
      cached?.embedding_backend === 'local-hash-fallback' &&
      !remoteUnavailable &&
      remoteUpgradeBudget <= 0
    ) {
      chunks.push(cached);
      usedFallbackEmbedding = true;
      continue;
    }
    if (cachedStillFresh && cached?.embedding_backend === 'local-hash-fallback' && !remoteUnavailable) {
      remoteUpgradeBudget -= 1;
    }
    pendingCandidates.push(candidate);
  }

  for (let index = 0; index < pendingCandidates.length; index += LIVEBENCH_EMBED_BATCH_SIZE) {
    const batch = pendingCandidates.slice(index, index + LIVEBENCH_EMBED_BATCH_SIZE);
    const embeddedBatch = await embedTexts(batch.map((item) => item.text));
    batch.forEach((candidate, batchIndex) => {
      const embedded = embeddedBatch[batchIndex];
      if (embedded?.backend !== 'local-hash-fallback') {
        usedRemoteEmbedding = true;
        backend = embedded.backend;
      } else {
        usedFallbackEmbedding = true;
        if (!usedRemoteEmbedding) {
          backend = embedded?.backend || backend;
        }
      }
      chunks.push({
        ...candidate,
        embedding: embedded?.embedding || hashVector(candidate.text),
        embedding_model: embedded?.model || EMBEDDING_FALLBACK_MODEL,
        embedding_backend: embedded?.backend || 'local-hash-fallback',
        expires_at: new Date(Date.now() + WATCHLIST_WINDOW_DAYS * 86400000).toISOString(),
      });
    });
  }

  const zvecSelection = await ensureZvecIndex(chunks);
  const zvecStatus = zvecSelection
    ? `；信源知识向量库已接管 ${zvecSelection.groups.reduce((sum, group) => sum + group.indexChunks.length, 0)} 条近 30 天信源 ANN 召回（${zvecSelection.groups.length} 组）`
    : '；信源知识向量库未就绪，继续使用进程内全量扫描';

  return {
    ...store,
    last_source_knowledge_synced_at: nowIso(),
    last_source_knowledge_signal_count: selectedSignals.length,
    chunks,
    last_embedding_backend: backend,
    source_status: {
      ...store.source_status,
      embeddings:
        (
          usedRemoteEmbedding
            ? usedFallbackEmbedding
              ? `${backend} 正在驱动信源知识向量库，个别信源条目在失败时会退回本地 hash`
              : `${backend} 正在为最近 30 天逐条信源提供向量召回`
            : embeddingFallbackStatusMessage()
        ) + zvecStatus,
    },
  };
}

async function ensureQuestionBackgroundChunks(store: LiveBenchStore, question: LiveQuestion) {
  const prefix = `metaso:${question.question_id}:`;
  const freshExisting = store.chunks.filter(
    (chunk) => chunk.chunk_id.startsWith(prefix) && new Date(chunk.expires_at).getTime() > Date.now(),
  );
  if (freshExisting.length > 0) {
    return { store, chunks: freshExisting };
  }

  store.chunks = store.chunks.filter((chunk) => !chunk.chunk_id.startsWith(prefix));
  const fetched = await fetchMetasoBackground(question);
  if (fetched.length === 0) {
    return { store, chunks: [] as SourceEmbeddingChunk[] };
  }
  store.chunks.push(...fetched);
  return { store, chunks: fetched };
}

async function buildBaselineVote(question: LiveQuestion, chunks: SourceEmbeddingChunk[], useModel = true): Promise<LiveVote> {
  const fallbackProbability = clamp(question.platform_probability_yes ?? defaultProbabilityForQuestion(question), 0.05, 0.95);
  const fallbackSide: LiveQuestionSide = fallbackProbability >= 0.5 ? 'yes' : 'no';
  const citedSignalIds = [...new Set(chunks.map((chunk) => chunk.signal_id).slice(0, LIVEBENCH_EVIDENCE_PROMPT_LIMIT))];
  const fallback: LiveVote = {
    vote_id: `baseline:${question.question_id}`,
    question_id: question.question_id,
    xia_id: 'MiniMax-M2.5',
    source: 'baseline',
    contributor_kind: 'ai',
    contributor_label: '内部主持人种子',
    origin_url: question.origin_url || null,
    side: fallbackSide,
    probability_yes: fallbackProbability,
    human_readable_prediction:
      fallbackSide === 'yes'
        ? '我目前更倾向于赞成这件事会发生。'
        : '我目前更倾向于不赞成这件事会发生。',
    human_readable_why: chunks.length
      ? fallbackModeratorText(question, fallbackSide === 'yes', chunks.slice(0, Math.min(4, chunks.length)).map((chunk) => compactText(chunk.text, 88)))
      : '现有公开信息还不够，暂按保守口径记录。',
    cited_signal_ids: citedSignalIds,
    cited_vote_ids: [],
    what_changes_my_mind: '如果后续出现方向相反、而且足够有分量的新材料，我会改判。',
    created_at: nowIso(),
    freeze_probability_yes: question.platform_probability_yes,
    resolved_outcome: null,
    resolved_at: null,
    points_delta: null,
    brier_score: null,
  };

  const response = useModel
    ? await requestMiniMaxJson<{
    side?: LiveQuestionSide;
    probability_yes?: number;
    baseline_prediction?: string;
    baseline_why?: string;
  }>(
    '你负责给世界脉络的单题页写一段主持人开场判断。只基于题目、时间窗和材料摘要输出自然中文 JSON。不要提平台、模型、系统内部词、抓取过程或 markdown。',
    [
      `问题：${question.title_zh || fallbackQuestionTitleZh(question)}`,
      `背景：${question.background_zh || fallbackBackgroundZh(question)}`,
      `结算标准：${question.resolution_criteria_zh || fallbackResolutionZh(question)}`,
      `当前平台概率：${question.platform_probability_yes ?? 'unknown'}`,
      `结算时间：${question.resolve_at || question.close_at || 'unknown'}`,
      '证据摘要：',
      ...chunks.slice(0, LIVEBENCH_EVIDENCE_PROMPT_LIMIT).map((chunk, index) => `${index + 1}. ${chunk.text}`),
      `题型：${questionTopicProfile(question).label}`,
      '输出 JSON 字段：side, probability_yes, baseline_prediction, baseline_why。baseline_prediction 要像主持人一句直接判断；baseline_why 只讲 1 到 2 个真正盯着的条件，不要把材料标题串成清单，不要出现 Bundle Feed、站点名或英文碎片，不要写“这些材料”一类空话。',
    ].join('\n'),
  )
    : null;

  if (!response) {
    return fallback;
  }

  const probabilityYes = clamp(
    typeof response.probability_yes === 'number' ? response.probability_yes : fallback.probability_yes,
    0.01,
    0.99,
  );
  const resolvedSide = sideFromProbability(probabilityYes);
  const resolvedPrediction = cleanHumanReadableText(response.baseline_prediction || fallback.human_readable_prediction, 220);
  const resolvedWhy = cleanHumanReadableText(response.baseline_why || fallback.human_readable_why, 260);

  return {
    ...fallback,
    side: resolvedSide,
    probability_yes: probabilityYes,
    human_readable_prediction: ensureVoteNarrativeMatchesSide(
      resolvedPrediction,
      resolvedSide,
      fallback.human_readable_prediction,
    ),
    human_readable_why: ensureVoteNarrativeMatchesSide(resolvedWhy, resolvedSide, fallback.human_readable_why),
  };
}

function voteNeedsRefresh(vote: LiveVote | null, chunks: SourceEmbeddingChunk[]) {
  if (!vote) return true;
  if (chunks.length === 0) return false;
  if (/社区对“.+?预测概率会|community prediction/i.test(`${vote.human_readable_prediction || ''} ${vote.human_readable_why || ''}`)) {
    return true;
  }
  if (looksGenericArenaCopy(vote.human_readable_prediction) || looksGenericArenaCopy(vote.human_readable_why)) {
    return true;
  }
  if (!hasConcreteChangeMindText(vote.what_changes_my_mind)) {
    return true;
  }
  return !hasEnoughCitations(vote.cited_signal_ids);
}

function questionResolutionCutoff(question: Pick<LiveQuestion, 'official_resolved_at' | 'resolve_at' | 'close_at'>) {
  return question.official_resolved_at || question.resolve_at || question.close_at || null;
}

function filterChunksBeforeCutoff(chunks: SourceEmbeddingChunk[], cutoff: string | null) {
  const cutoffMs = parseTime(cutoff);
  if (!cutoffMs) return [];
  return chunks.filter((chunk) => {
    const publishedAt = parseTime(chunk.published_at);
    return publishedAt !== null && publishedAt <= cutoffMs;
  });
}

function hasXiaVoteBeforeCutoff(
  votes: LiveVote[],
  questionId: string,
  xiaId: string,
  cutoff: string | null,
) {
  const cutoffMs = parseTime(cutoff);
  if (!cutoffMs) return false;
  return votes.some((vote) => {
    if (vote.question_id !== questionId || vote.source !== 'xia' || vote.xia_id !== xiaId) return false;
    const createdAtMs = parseTime(vote.created_at);
    return createdAtMs !== null && createdAtMs <= cutoffMs;
  });
}

function backfillSyntheticVoteTimestamp(cutoff: string | null, personaIndex: number) {
  const cutoffMs = parseTime(cutoff);
  if (!cutoffMs) return nowIso();
  return new Date(Math.max(0, cutoffMs - (personaIndex + 1) * 60000)).toISOString();
}

async function buildSyntheticXiaVote(
  question: LiveQuestion,
  chunks: SourceEmbeddingChunk[],
  persona: (typeof SYNTHETIC_XIA_PARTICIPANTS)[number],
  useModel = true,
): Promise<LiveVote> {
  const fallbackProbability = clamp(question.platform_probability_yes ?? defaultProbabilityForQuestion(question), 0.05, 0.95);
  const fallbackSide: LiveQuestionSide = fallbackProbability >= 0.5 ? 'yes' : 'no';
  const citedSignalIds = [...new Set(chunks.map((chunk) => chunk.signal_id).slice(0, LIVEBENCH_EVIDENCE_PROMPT_LIMIT))];
  const fallback: LiveVote = {
    vote_id: `xia:${persona.id}:${question.question_id}:${Date.now()}`,
    question_id: question.question_id,
    xia_id: persona.id,
    source: 'xia',
    contributor_kind: 'ai',
    contributor_label: syntheticPersonaLabel(persona),
    origin_url: question.origin_url || null,
    side: fallbackSide,
    probability_yes: fallbackProbability,
    human_readable_prediction: syntheticFallbackPrediction(question, fallbackSide, persona),
    human_readable_why: syntheticFallbackWhy(question, fallbackSide, persona),
    cited_signal_ids: citedSignalIds,
    cited_vote_ids: [],
    what_changes_my_mind: syntheticFallbackWhatChanges(question, persona),
    created_at: nowIso(),
    freeze_probability_yes: question.platform_probability_yes,
    resolved_outcome: null,
    resolved_at: null,
    points_delta: null,
    brier_score: null,
  };

  const response = useModel
    ? await requestMiniMaxJson<{
        side?: LiveQuestionSide;
        probability_yes?: number;
        prediction?: string;
        why?: string;
        what_changes_my_mind?: string;
        citation_indexes?: number[];
      }>(
        '你在世界脉络里扮演一只参与讨论的虾。请直接回答问题，语气自然，像在和主持人讨论。不要提平台、模型、后台字段、抓取过程或 markdown。',
        [
          `你的对外名字：${syntheticPersonaLabel(persona)}`,
          `你的观察偏好：${persona.stance}`,
          `你的表达习惯：${persona.opening}`,
          `你的重点镜头：${persona.lens}`,
          `问题：${question.title_zh || fallbackQuestionTitleZh(question)}`,
          `背景：${question.background_zh || fallbackBackgroundZh(question)}`,
          `结算：${question.resolution_criteria_zh || fallbackResolutionZh(question)}`,
          '参考材料：',
          ...chunks.slice(0, LIVEBENCH_EVIDENCE_PROMPT_LIMIT).map((chunk, index) => `${index + 1}. ${chunk.text}`),
          '输出字段：side, probability_yes, prediction, why, what_changes_my_mind, citation_indexes。',
          `题型：${questionTopicProfile(question).label}`,
          `另一个虾和你不一样：${persona.id === 'arena-harbor' ? '另一个虾更看重官方动作和政策落地。' : '另一个虾更看重价格、船流、交期和市场节奏。'}`,
          '写法要求：prediction 必须直接点名题目里的对象、阈值或时间窗，不能跨题复用模板句；why 必须点出 1 到 2 个你真正盯着的具体现象，不能只写“还缺硬动作”“还没看到改善”这种空泛话，也不要把英文标题、feed 名或站点名直接塞进中文句子；what_changes_my_mind 必须具体说明什么新变化会让你改判，不能写泛化套话。',
          '如果题目里有数字门槛、价格线、船流区间、发布日期或会谈/停火时间窗，prediction 或 why 里至少提到其中一个具体条件。',
        ].join('\n\n'),
      )
    : null;

  const probabilityYes = clamp(
    typeof response?.probability_yes === 'number' ? response.probability_yes : fallback.probability_yes,
    0.01,
    0.99,
  );
  const resolvedSide = sideFromProbability(probabilityYes);

  const resolvedCitations =
    Array.isArray(response?.citation_indexes) && response!.citation_indexes!.length > 0
      ? response!.citation_indexes!
          .map((value) => chunks[value - 1]?.signal_id)
          .filter((value): value is string => Boolean(value))
      : fallback.cited_signal_ids;
  const resolvedPrediction = cleanHumanReadableText(response?.prediction || fallback.human_readable_prediction, 180);
  const resolvedWhy = cleanHumanReadableText(response?.why || fallback.human_readable_why, 220);
  const resolvedChanges = cleanHumanReadableText(response?.what_changes_my_mind || fallback.what_changes_my_mind, 180);
  const forceFallbackPrediction = Boolean(extractCommunityPredictionInnerTitle(question));

  return {
    ...fallback,
    side: resolvedSide,
    probability_yes: probabilityYes,
    human_readable_prediction:
      forceFallbackPrediction || looksGenericArenaCopy(resolvedPrediction)
        ? fallback.human_readable_prediction
        : ensureVoteNarrativeMatchesSide(resolvedPrediction, resolvedSide, fallback.human_readable_prediction),
    human_readable_why:
      looksGenericArenaCopy(resolvedWhy)
        ? fallback.human_readable_why
        : ensureVoteNarrativeMatchesSide(resolvedWhy, resolvedSide, fallback.human_readable_why),
    what_changes_my_mind: hasConcreteChangeMindText(resolvedChanges) ? resolvedChanges : fallback.what_changes_my_mind,
    cited_signal_ids: hasEnoughCitations(resolvedCitations) ? resolvedCitations : fallback.cited_signal_ids,
  };
}

function impliedPayout(probabilityYes: number | null, side: LiveQuestionSide) {
  const p = clamp(probabilityYes ?? 0.5, 0.05, 0.95);
  const implied = side === 'yes' ? 1 / p : 1 / (1 - p);
  return clamp(implied, 1, 5);
}

function applyResolutionToVotes(question: LiveQuestion, votes: LiveVote[]) {
  if (!question.official_outcome) return votes;
  return votes.map((vote) => {
    if (vote.question_id !== question.question_id || vote.resolved_outcome) return vote;
    const actual = question.official_outcome;
    const hit = vote.side === actual;
    const target = actual === 'yes' ? 1 : 0;
    const brier = (vote.probability_yes - target) ** 2;
    return {
      ...vote,
      resolved_outcome: actual,
      resolved_at: question.official_resolved_at || question.resolve_at || question.close_at || nowIso(),
      points_delta: hit ? Number(impliedPayout(vote.freeze_probability_yes, vote.side).toFixed(2)) : -1,
      brier_score: Number(brier.toFixed(4)),
    };
  });
}

async function ensureSyntheticVotesForQuestion(
  store: LiveBenchStore,
  question: LiveQuestion,
  referenceChunks: SourceEmbeddingChunk[],
) {
  let nextStore = store;
  let refreshedSyntheticVotes = 0;

  if (question.status !== 'resolved') {
    for (const persona of SYNTHETIC_XIA_PARTICIPANTS) {
      const recentSyntheticVote = nextStore.votes.find(
        (vote) =>
          vote.question_id === question.question_id &&
          vote.source === 'xia' &&
          vote.xia_id === persona.id &&
          Date.now() - new Date(vote.created_at).getTime() < SYNTHETIC_XIA_VOTE_WINDOW_MS,
      );
      if (!recentSyntheticVote || voteNeedsRefresh(recentSyntheticVote, referenceChunks)) {
        nextStore = {
          ...nextStore,
          votes: nextStore.votes.filter(
            (vote) => !(vote.question_id === question.question_id && vote.source === 'xia' && vote.xia_id === persona.id),
          ),
        };
        const syntheticVote = await buildSyntheticXiaVote(question, referenceChunks, persona, referenceChunks.length > 0);
        nextStore.votes.unshift(syntheticVote);
        refreshedSyntheticVotes += 1;
      }
    }
    return { store: nextStore, refreshedSyntheticVotes };
  }

  const resolutionCutoff = questionResolutionCutoff(question);
  for (const [personaIndex, persona] of SYNTHETIC_XIA_PARTICIPANTS.entries()) {
    if (hasXiaVoteBeforeCutoff(nextStore.votes, question.question_id, persona.id, resolutionCutoff)) {
      continue;
    }

    const historicalReferenceChunks = filterChunksBeforeCutoff(referenceChunks, resolutionCutoff);
    nextStore = {
      ...nextStore,
      votes: nextStore.votes.filter(
        (vote) => !(vote.question_id === question.question_id && vote.source === 'xia' && vote.xia_id === persona.id),
      ),
    };
    const historicalVote = await buildSyntheticXiaVote(
      question,
      historicalReferenceChunks,
      persona,
      historicalReferenceChunks.length > 0,
    );
    const finalizedVote = applyResolutionToVotes(question, [
      {
        ...historicalVote,
        vote_id: `xia:${persona.id}:${question.question_id}:backfill:${parseTime(resolutionCutoff) || Date.now()}`,
        created_at: backfillSyntheticVoteTimestamp(resolutionCutoff, personaIndex),
      },
    ])[0];
    nextStore.votes.unshift(finalizedVote);
    refreshedSyntheticVotes += 1;
  }

  return { store: nextStore, refreshedSyntheticVotes };
}

async function ensureArenaStore(signals: WorldSignal[]) {
  const state = getLiveBenchPersistState();
  const allowRefresh = isRemoteModelRefreshAllowed();
  const runBackgroundSync = () => {
    if (!allowRefresh || state.__worldLiveBenchBackgroundSync) return;
    state.__worldLiveBenchBackgroundSync = (async () => {
      try {
        let backgroundStore = await loadStore();
        backgroundStore = mergeRetainedArchiveIntoStore(backgroundStore, await readRetainedLiveBenchArchive());
        backgroundStore = await ensureSourceKnowledgeStore(signals);
        backgroundStore = await syncQuestions(backgroundStore, signals);
        backgroundStore.questions = await Promise.all(
          backgroundStore.questions.map(async (question) => localizeQuestionForRetrieval(question, true)),
        );
        await syncExternalDiscussionVotes(backgroundStore);

        const updatedVotes = [...backgroundStore.votes];
        for (const question of backgroundStore.questions) {
          if (!question.official_outcome) continue;
          const next = applyResolutionToVotes(question, updatedVotes);
          updatedVotes.splice(0, updatedVotes.length, ...next);
        }
        backgroundStore.votes = updatedVotes;

        await persistStore(backgroundStore);
        clearArenaCache();
        await clearArenaDiskCache();
      } catch (error) {
        console.warn('[livebench] background sync failed:', error instanceof Error ? error.message : String(error));
      } finally {
        state.__worldLiveBenchBackgroundSync = null;
      }
    })();
  };

  if (state.__worldLiveBenchArenaBuild) {
    return state.__worldLiveBenchArenaBuild;
  }
  state.__worldLiveBenchArenaBuild = (async () => {
    let store = await loadStore();
    store = mergeRetainedArchiveIntoStore(store, await readRetainedLiveBenchArchive());
    store.questions = store.questions
      .map(normalizeStoredQuestionForArena)
      .filter(isExternalLiveBenchQuestion)
      .filter((question) => question.status !== 'pending')
      .filter((question) => filterQuestionTopic(question) && hasQuestionQuality(question));
    const validQuestionIds = new Set(store.questions.map((question) => question.question_id));
    store.votes = store.votes.filter((vote) => validQuestionIds.has(vote.question_id));
    const hasUsableStoredData =
      store.questions.length > 0 &&
      (store.chunks.length > 0 || Boolean(store.last_synced_at));
    const storeFreshEnough =
      Boolean(store.last_synced_at) &&
      Date.now() - new Date(store.last_synced_at as string).getTime() <= LIVEBENCH_SYNC_INTERVAL_MS &&
      (store.questions.length === 0 || store.chunks.some((chunk) => new Date(chunk.expires_at).getTime() > Date.now()));

      if (!storeFreshEnough && hasUsableStoredData) {
        runBackgroundSync();
      } else if (!storeFreshEnough && allowRefresh) {
        store = await ensureSourceKnowledgeStore(signals);
        store = await syncQuestions(store, signals);
      store.questions = await Promise.all(
        store.questions.map(async (question) => localizeQuestionForRetrieval(question, true)),
      );
      await syncExternalDiscussionVotes(store);
    }
    const updatedVotes = [...store.votes];

    for (const question of store.questions) {
      if (!question.official_outcome) continue;
      const next = applyResolutionToVotes(question, updatedVotes);
      updatedVotes.splice(0, updatedVotes.length, ...next);
    }
    store.votes = updatedVotes;

    await persistStore(store);
    return store;
  })();
  try {
    return await state.__worldLiveBenchArenaBuild;
  } finally {
    state.__worldLiveBenchArenaBuild = null;
  }
}

function selectQuestionsForScene(scene: WorldScene, questions: LiveQuestion[]) {
  return questions.filter((question) => {
    if (scene === 'global') return true;
    const haystack = normalizeTag(`${question.region_hint} ${question.topic_bucket} ${question.tags.join(' ')}`);
    return haystack.includes(normalizeTag(scene));
  });
}

function questionPriority(question: LiveQuestion, signalIntensity: number, missingVotes: number) {
  const resolveDays = Math.max(0, Math.min(daysUntil(question.resolve_at), daysUntil(question.close_at)));
  const urgency = resolveDays <= ACTIVE_WINDOW_DAYS ? 1 - resolveDays / ACTIVE_WINDOW_DAYS : 0.1;
  const marketMove = Math.abs((question.platform_probability_yes ?? 0.5) - 0.5);
  return urgency * 0.44 + marketMove * 0.24 + signalIntensity * 0.2 + missingVotes * 0.12;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestValue = 0;
  for (const value of values) {
    const timestamp = parseTime(value);
    if (!timestamp) continue;
    if (timestamp > latestValue) {
      latestValue = timestamp;
      latest = new Date(timestamp).toISOString();
    }
  }
  return latest;
}

function buildSelectionState(discussionVotes: LiveVote[], references: LiveQuestionReference[], question: LiveQuestion) {
  const lastSeenAt = latestTimestamp(
    discussionVotes
      .filter((vote) => vote.source === 'xia' || vote.source === 'external')
      .map((vote) => vote.created_at),
  );
  const freshSignalAt = latestTimestamp(
    references
      .filter((reference) => reference.source_kind === 'signal')
      .map((reference) => reference.published_at || question.updated_at),
  );

  if (!lastSeenAt) {
    return {
      draw_weight: 1,
      recovery_ratio: 1,
      last_seen_at: null,
      fresh_signal_at: freshSignalAt,
      hint: '这题最近没人看过，抽取时不会被额外降权。',
    };
  }

  const seenMs = parseTime(lastSeenAt) || Date.now();
  const freshMs = parseTime(freshSignalAt);
  const elapsedHours = Math.max(0, (Date.now() - seenMs) / 3600000);
  const baseWeight =
    elapsedHours <= 6 ? 0.38 : elapsedHours >= 72 ? 1 : 0.38 + ((elapsedHours - 6) / 66) * 0.62;
  const hasFreshSignal = Boolean(freshMs && freshMs > seenMs);
  const freshnessBoost = hasFreshSignal
    ? clamp(0.22 + Math.min(0.28, ((freshMs! - seenMs) / 3600000) / 48), 0.22, 0.5)
    : 0;
  const drawWeight = clamp(Math.max(baseWeight, baseWeight + freshnessBoost), 0.38, 1);
  const recoveryRatio = clamp((drawWeight - 0.38) / 0.62, 0, 1);

  let hint = '这题刚被看过，短期会降权；如果没有新证据，后面会慢慢恢复正常抽取概率。';
  if (hasFreshSignal) {
    hint = '这题虽然刚被看过，但信源有更新，所以仍然可能被再次抽到，只是短期权重还没完全恢复。';
  } else if (elapsedHours >= 72) {
    hint = '这题距离上次被看已经够久，抽取概率基本恢复正常。';
  } else if (elapsedHours >= 24) {
    hint = '这题已过短期冷却，抽取概率正在恢复，但还会略低于全新题。';
  }

  return {
    draw_weight: Number(drawWeight.toFixed(3)),
    recovery_ratio: Number(recoveryRatio.toFixed(3)),
    last_seen_at: lastSeenAt,
    fresh_signal_at: freshSignalAt,
    hint,
  };
}

export async function buildLiveBenchArenaState(
  scene: WorldScene,
  signals: WorldSignal[],
): Promise<LiveBenchArenaState> {
  const allowRefresh = isRemoteModelRefreshAllowed();
  const cached = getArenaCache().get(scene);
  if (cached && cached.expires_at > Date.now() && cached.signal_count === signals.length) {
    return cached.arena;
  }

  let store = await ensureArenaStore(signals);
  const diskCached = await readArenaDiskCache(scene, signals.length, store.last_synced_at);
  if (diskCached) {
    getArenaCache().set(scene, {
      scene,
      expires_at: Date.now() + LIVEBENCH_ARENA_CACHE_TTL_MS,
      signal_count: signals.length,
      arena: diskCached,
    });
    return diskCached;
  }
  const syntheticIds = new Set<string>(SYNTHETIC_XIA_PARTICIPANTS.map((persona) => persona.id));
  const seenSyntheticVoteKey = new Set<string>();
  store.votes = store.votes.filter((vote) => {
    if (vote.source !== 'xia' || !syntheticIds.has(vote.xia_id)) return true;
    const key = `${vote.question_id}:${vote.xia_id}`;
    if (seenSyntheticVoteKey.has(key)) return false;
    seenSyntheticVoteKey.add(key);
    return true;
  });
  const scopedQuestions = selectQuestionsForScene(scene, store.questions);
  const activeQuestions = scopedQuestions.filter((question) => question.status === 'active');
  const watchlistQuestions = scopedQuestions.filter((question) => question.status === 'watchlist');
  const resolvedQuestions = scopedQuestions.filter((question) => question.status === 'resolved');
  const chunks = store.chunks.filter((chunk) => new Date(chunk.expires_at).getTime() > Date.now());
  const signalChunks = chunks.filter((chunk) => chunk.chunk_id.startsWith('signal:'));
  const snapshots: LiveQuestionSnapshot[] = [];
  const selectionStateByQuestionId = new Map<
    string,
    {
      draw_weight: number;
      recovery_ratio: number;
      last_seen_at: string | null;
      fresh_signal_at: string | null;
      hint: string;
    }
  >();
  let refreshedBaselineVotes = 0;
  let refreshedSyntheticVotes = 0;

  const selectedQuestions = [
    ...activeQuestions.slice(0, LIVEBENCH_ACTIVE_CANDIDATE_LIMIT),
    ...resolvedQuestions.slice(0, LIVEBENCH_RESOLVED_CANDIDATE_LIMIT),
    ...watchlistQuestions.slice(0, LIVEBENCH_WATCHLIST_CANDIDATE_LIMIT),
  ];

  for (const [questionIndex, question] of selectedQuestions.entries()) {
    const backgroundResult = await ensureQuestionBackgroundChunks(store, question);
    store = backgroundResult.store;
    const questionEvidenceChunks = mergeUniqueChunks(signalChunks, backgroundResult.chunks);
    const queryText = [
      question.title,
      question.resolution_criteria,
      question.background,
      question.topic_bucket,
      question.region_hint,
    ].join('\n');
    const queryEmbedding = (await embedText(queryText)).embedding;
    const zvecRecall = await recallZvecSignalChunks(signalChunks, queryEmbedding, LIVEBENCH_ZVEC_QUERY_LIMIT);
    const vectorCandidates =
      zvecRecall && zvecRecall.hits.length > 0
        ? mergeUniqueChunks(zvecRecall.hits, zvecRecall.residualChunks, backgroundResult.chunks)
        : questionEvidenceChunks;
    const rankedZvec = vectorCandidates
      .map((chunk) => ({
        chunk,
        score: scoreChunkForQuestion(question, chunk, queryEmbedding, chunk.embedding),
        ...chunkKeywordHitsForQuestion(question, chunk),
      }))
      .filter((item) => item.score > 0.08)
      .filter((item) => isDirectEvidenceForQuestion(question, item))
      .sort((left, right) => right.score - left.score)
      .slice(0, LIVEBENCH_ZVEC_TOP_K)
      .map((item) => item.chunk);
    const fallbackEvidenceChunks = backgroundResult.chunks.filter((chunk) => !isOffTopicChunkForQuestion(question, chunk));
    const primaryEvidenceChunks =
      rankedZvec.length > 0 ? rankedZvec : fallbackEvidenceChunks.slice(0, LIVEBENCH_ZVEC_TOP_K);
    const _hasStrongEvidence = primaryEvidenceChunks.length > 0 && hasStrongEvidenceForQuestion(question, primaryEvidenceChunks);
    const referenceChunks = primaryEvidenceChunks;

    let baseline = store.votes.find((vote) => vote.question_id === question.question_id && vote.source === 'baseline') || null;
    if (allowRefresh && voteNeedsRefresh(baseline, referenceChunks)) {
      store.votes = store.votes.filter((vote) => !(vote.question_id === question.question_id && vote.source === 'baseline'));
      baseline = await buildBaselineVote(question, referenceChunks, referenceChunks.length > 0);
      store.votes.unshift(baseline);
      refreshedBaselineVotes += 1;
    }

    if (allowRefresh) {
      const syntheticVoteResult = await ensureSyntheticVotesForQuestion(store, question, referenceChunks);
      store = syntheticVoteResult.store;
      refreshedSyntheticVotes += syntheticVoteResult.refreshedSyntheticVotes;
    }

    const discussionVotes = store.votes
      .filter((vote) => vote.question_id === question.question_id && DISCUSSION_VOTE_SOURCES.has(vote.source))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    const xiaVotes = discussionVotes
      .filter((vote) => vote.source === 'xia')
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    const presentation = await buildQuestionPresentation(
      question,
      baseline,
      discussionVotes,
      primaryEvidenceChunks,
      referenceChunks,
      referenceChunks.length > 0 && (question.status === 'active' || questionIndex < 10),
    );
    Object.assign(question, presentation.question, {
      presentation_generated_at: nowIso(),
      moderator_view_cache: presentation.moderatorView,
      debate_cache: presentation.debate,
      references_cache: presentation.references,
    });

    const snapshot: LiveQuestionSnapshot = {
      question,
      xia_votes: xiaVotes,
      discussion_votes: discussionVotes,
      zvec_chunks: primaryEvidenceChunks,
      references: presentation.references,
    };
    selectionStateByQuestionId.set(
      question.question_id,
      buildSelectionState(discussionVotes, presentation.references, question),
    );
    snapshots.push(snapshot);
  }

  if (allowRefresh) {
    await persistStore(store);
  }

  const recentSignalsByQuestion = new Map<string, number>();
  for (const snapshot of snapshots) {
    recentSignalsByQuestion.set(snapshot.question.question_id, snapshot.references.filter((reference) => reference.source_kind === 'signal').length / LIVEBENCH_ZVEC_TOP_K);
  }

  const sortedActive = snapshots
    .filter((item) => item.question.status === 'active')
    .sort((left, right) => {
      const leftPriority =
        questionPriority(left.question, recentSignalsByQuestion.get(left.question.question_id) || 0, 0) *
        (selectionStateByQuestionId.get(left.question.question_id)?.draw_weight || 1);
      const rightPriority =
        questionPriority(right.question, recentSignalsByQuestion.get(right.question.question_id) || 0, 0) *
        (selectionStateByQuestionId.get(right.question.question_id)?.draw_weight || 1);
      return rightPriority - leftPriority;
    })
    .slice(0, LIVEBENCH_ACTIVE_LIMIT);

  const sortedResolved = snapshots
    .filter((item) => item.question.status === 'resolved')
    .sort((left, right) => new Date(right.question.official_resolved_at || right.question.updated_at).getTime() - new Date(left.question.official_resolved_at || left.question.updated_at).getTime())
    .slice(0, LIVEBENCH_RESOLVED_LIMIT);

  const sortedWatchlist = snapshots
    .filter((item) => item.question.status === 'watchlist')
    .sort((left, right) => {
      const leftUrgency = new Date(left.question.resolve_at || left.question.close_at || left.question.updated_at).getTime();
      const rightUrgency = new Date(right.question.resolve_at || right.question.close_at || right.question.updated_at).getTime();
      if (leftUrgency !== rightUrgency) return leftUrgency - rightUrgency;
      return (
        (selectionStateByQuestionId.get(right.question.question_id)?.draw_weight || 1) -
        (selectionStateByQuestionId.get(left.question.question_id)?.draw_weight || 1)
      );
    })
    .slice(0, LIVEBENCH_WATCHLIST_LIMIT);
  const settlementPendingCount = snapshots.filter((item) => isLiveBenchSettlementPending(item.question)).length;

  const oddsBoard = computeScorecards(store.votes).sort((left, right) => right.points_balance - left.points_balance);
  const qualityBoard = computeScorecards(store.votes).sort((left, right) => right.quality_score - left.quality_score);

  const arena = {
    generated_at: nowIso(),
    scene,
    source_status: {
      ...store.source_status,
      embeddings: withZvecCoverageStatus(store.source_status.embeddings, store.chunks),
    },
    source_health: store.source_health,
    active_window_days: ACTIVE_WINDOW_DAYS,
    watchlist_window_days: WATCHLIST_WINDOW_DAYS,
    sticky_question: sortedActive[0] || sortedWatchlist[0] || sortedResolved[0] || null,
    active_questions: sortedActive,
    resolved_questions: sortedResolved,
    watchlist_questions: sortedWatchlist,
    settlement_pending_count: settlementPendingCount,
    odds_board: oddsBoard.slice(0, 8),
    quality_board: qualityBoard.slice(0, 8),
  };

  getArenaCache().set(scene, {
    scene,
    expires_at: Date.now() + LIVEBENCH_ARENA_CACHE_TTL_MS,
    signal_count: signals.length,
    arena,
  });
  if (allowRefresh) {
    await persistArenaDiskCache(scene, signals.length, store.last_synced_at, arena);
  }
  console.log(
    `[source.knowledge] scene=${scene} questions=${selectedQuestions.length} active=${sortedActive.length} watchlist=${sortedWatchlist.length} resolved=${sortedResolved.length} baseline_refreshed=${refreshedBaselineVotes} synthetic_refreshed=${refreshedSyntheticVotes}`,
  );

  return arena;
}

export async function syncLiveBenchQuestions(signals: WorldSignal[]) {
  const seed = mergeRetainedArchiveIntoStore(await loadStore(), await readRetainedLiveBenchArchive());
  const store = await syncQuestions(
    {
      ...seed,
      last_synced_at: null,
    },
    signals,
  );
  await persistStore(store);
  clearArenaCache();
  await clearArenaDiskCache();
  const activeCount = store.questions.filter((question) => question.status === 'active').length;
  const watchlistCount = store.questions.filter((question) => question.status === 'watchlist').length;
  const resolvedCount = store.questions.filter((question) => question.status === 'resolved').length;
  const settlementPendingCount = store.questions.filter((question) => isLiveBenchSettlementPending(question)).length;
  return {
    ok: true,
    synced_at: store.last_synced_at,
    source_status: {
      ...store.source_status,
      embeddings: withZvecCoverageStatus(store.source_status.embeddings, store.chunks),
    },
    source_health: store.source_health,
    question_count: store.questions.length,
    open_question_count: activeCount + watchlistCount,
    active_question_count: activeCount,
    watchlist_question_count: watchlistCount,
    resolved_question_count: resolvedCount,
    settlement_pending_count: settlementPendingCount,
  };
}

export async function getSourceKnowledgeSnapshot(
  scene: WorldScene,
  signals: WorldSignal[],
): Promise<WorldSourceKnowledgeState> {
  const store = await loadStore();
  return buildSourceKnowledgeState(scene, store, signals);
}

export async function syncSourceKnowledgeSnapshot(
  scene: WorldScene,
  signals: WorldSignal[],
): Promise<WorldSourceKnowledgeState> {
  const store = await ensureSourceKnowledgeStore(signals, { force: true });
  clearArenaCache();
  await clearArenaDiskCache();
  return buildSourceKnowledgeState(scene, store, signals);
}

function toPublicLiveQuestion(question: LiveQuestion): LiveQuestion {
  const {
    moderator_view_cache: _moderatorViewCache,
    debate_cache: _debateCache,
    references_cache: _referencesCache,
    ...rest
  } = question;
  return rest as LiveQuestion;
}

export function toPublicLiveQuestionSnapshot(snapshot: LiveQuestionSnapshot): LiveQuestionSnapshot {
  const {
    ...rest
  } = snapshot;
  return {
    ...rest,
    question: toPublicLiveQuestion(snapshot.question),
  } as LiveQuestionSnapshot;
}

export function toPublicLiveBenchArenaState(arena: LiveBenchArenaState): LiveBenchArenaState {
  return {
    ...arena,
    sticky_question: arena.sticky_question ? toPublicLiveQuestionSnapshot(arena.sticky_question) : null,
    active_questions: arena.active_questions.map(toPublicLiveQuestionSnapshot),
    resolved_questions: arena.resolved_questions.map(toPublicLiveQuestionSnapshot),
    watchlist_questions: arena.watchlist_questions.map(toPublicLiveQuestionSnapshot),
  };
}

export async function listLiveBenchQuestionPreviews(
  scene: WorldScene,
  signals: WorldSignal[],
  status?: LiveQuestionStatus,
) {
  const arena = await buildLiveBenchArenaState(scene, signals);
  const questions =
    status === 'active'
      ? arena.active_questions
      : status === 'resolved'
        ? arena.resolved_questions
        : status === 'watchlist'
          ? arena.watchlist_questions
          : [...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions];
  return questions.map(buildQuestionPreview);
}

export async function listLiveBenchQuestionPreviewsFromStore(
  scene: WorldScene,
  status?: LiveQuestionStatus,
) {
  const store = await loadStore();
  const scopedQuestions = selectQuestionsForScene(
    scene,
    store.questions
      .map(normalizeStoredQuestionForArena)
      .filter(isExternalLiveBenchQuestion)
      .filter((question) => question.status !== 'pending')
      .filter((question) => filterQuestionTopic(question) && hasQuestionQuality(question)),
  );
  const selectedQuestions =
    status === 'active'
      ? scopedQuestions.filter((question) => question.status === 'active')
      : status === 'resolved'
        ? scopedQuestions.filter((question) => question.status === 'resolved')
        : status === 'watchlist'
          ? scopedQuestions.filter((question) => question.status === 'watchlist')
          : [
              ...scopedQuestions.filter((question) => question.status === 'active'),
              ...scopedQuestions.filter((question) => question.status === 'watchlist'),
              ...scopedQuestions.filter((question) => question.status === 'resolved'),
            ];
  const votesByQuestion = new Map<string, LiveVote[]>();
  for (const vote of store.votes) {
    if (!votesByQuestion.has(vote.question_id)) votesByQuestion.set(vote.question_id, []);
    votesByQuestion.get(vote.question_id)!.push(vote);
  }

  return selectedQuestions.map((question) => {
    const discussionVotes = (votesByQuestion.get(question.question_id) || [])
      .filter((vote) => DISCUSSION_VOTE_SOURCES.has(vote.source))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const xiaVotes = discussionVotes.filter((vote) => vote.source === 'xia');
    return buildQuestionPreview({
      question,
      xia_votes: xiaVotes,
      discussion_votes: discussionVotes,
      zvec_chunks: [],
      references: Array.isArray(question.references_cache) ? question.references_cache : [],
    });
  });
}

export async function getLiveBenchQuestionDetail(
  scene: WorldScene,
  signals: WorldSignal[],
  questionId: string,
) {
  const arena = await buildLiveBenchArenaState(scene, signals);
  const snapshot = [arena.sticky_question, ...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions]
    .filter((item): item is LiveQuestionSnapshot => Boolean(item))
    .find((item) => questionIdMatches(questionId, item.question.question_id));
  if (!snapshot) return null;
  return buildLiveBenchQuestionDetailFromSnapshot(scene, snapshot);
}

export async function getCachedLiveBenchQuestionDetail(scene: WorldScene, questionId: string) {
  const arena = await readRelaxedArenaDiskCache(scene);
  if (!arena) return null;
  const snapshot = [arena.sticky_question, ...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions]
    .filter((item): item is LiveQuestionSnapshot => Boolean(item))
    .find((item) => questionIdMatches(questionId, item.question.question_id));
  if (!snapshot) return null;
  return buildLiveBenchQuestionDetailFromSnapshot(scene, snapshot);
}

function buildLiveBenchQuestionDetailFromStore(scene: WorldScene, questionId: string, store: LiveBenchStore) {
  const scopedQuestions = selectQuestionsForScene(
    scene,
    store.questions
      .map(normalizeStoredQuestionForArena)
      .filter(isExternalLiveBenchQuestion)
      .filter((question) => question.status !== 'pending')
      .filter((question) => filterQuestionTopic(question) && hasQuestionQuality(question)),
  );
  const question = scopedQuestions.find((item) => questionIdMatches(questionId, item.question_id));
  if (!question) return null;
  const discussionVotes = store.votes
    .filter((vote) => vote.question_id === question.question_id && DISCUSSION_VOTE_SOURCES.has(vote.source))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  return buildLiveBenchQuestionDetailFromSnapshot(scene, {
    question,
    xia_votes: discussionVotes.filter((vote) => vote.source === 'xia'),
    discussion_votes: discussionVotes,
    zvec_chunks: [],
    references: Array.isArray(question.references_cache) ? question.references_cache : [],
  });
}

export async function getLiveBenchQuestionDetailFromStore(scene: WorldScene, questionId: string) {
  const currentStore = await loadStore();
  const currentDetail = buildLiveBenchQuestionDetailFromStore(scene, questionId, currentStore);
  if (currentDetail) return currentDetail;
  const storeWithArchive = mergeRetainedArchiveIntoStore(currentStore, await readRetainedLiveBenchArchive());
  return buildLiveBenchQuestionDetailFromStore(scene, questionId, storeWithArchive);
}

export async function getCachedLiveBenchQuestionPreviews(scene: WorldScene, status?: LiveQuestionStatus) {
  const arena = await readRelaxedArenaDiskCache(scene);
  if (!arena) return null;
  const questions =
    status === 'active'
      ? arena.active_questions
      : status === 'resolved'
        ? arena.resolved_questions
        : status === 'watchlist'
          ? arena.watchlist_questions
          : [...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions];
  return questions.map(buildQuestionPreview);
}

export async function getLiveBenchEvaluation(
  scene: WorldScene,
  signals: WorldSignal[],
) {
  const arena = await buildLiveBenchArenaState(scene, signals);
  const store = await ensureArenaStore(signals);
  const participantScorecards = computeScorecards(store.votes);
  return buildLiveBenchEvaluationFromArena(scene, arena, participantScorecards);
}

export async function getLiveBenchEvaluationFromStore(scene: WorldScene): Promise<LiveBenchEvaluation> {
  const store = await loadStore();
  const scopedQuestions = selectQuestionsForScene(
    scene,
    store.questions
      .map(normalizeStoredQuestionForArena)
      .filter(isExternalLiveBenchQuestion)
      .filter((question) => question.status !== 'pending')
      .filter((question) => filterQuestionTopic(question) && hasQuestionQuality(question)),
  );
  const votesByQuestion = new Map<string, LiveVote[]>();
  for (const vote of store.votes) {
    if (!votesByQuestion.has(vote.question_id)) votesByQuestion.set(vote.question_id, []);
    votesByQuestion.get(vote.question_id)!.push(vote);
  }
  const snapshots = scopedQuestions.map((question): LiveQuestionSnapshot => {
    const discussionVotes = (votesByQuestion.get(question.question_id) || [])
      .filter((vote) => DISCUSSION_VOTE_SOURCES.has(vote.source))
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return {
      question,
      xia_votes: discussionVotes.filter((vote) => vote.source === 'xia'),
      discussion_votes: discussionVotes,
      zvec_chunks: [],
      references: Array.isArray(question.references_cache) ? question.references_cache : [],
    };
  });
  const activeQuestions = snapshots.filter((snapshot) => snapshot.question.status === 'active');
  const watchlistQuestions = snapshots.filter((snapshot) => snapshot.question.status === 'watchlist');
  const resolvedQuestions = snapshots.filter((snapshot) => snapshot.question.status === 'resolved');
  const scorecards = computeScorecards(store.votes);
  const arena: LiveBenchArenaState = {
    generated_at: nowIso(),
    scene,
    source_status: {
      ...store.source_status,
      embeddings: withZvecCoverageStatus(store.source_status.embeddings, store.chunks),
    },
    source_health: store.source_health,
    active_window_days: ACTIVE_WINDOW_DAYS,
    watchlist_window_days: WATCHLIST_WINDOW_DAYS,
    sticky_question: activeQuestions[0] || watchlistQuestions[0] || resolvedQuestions[0] || null,
    active_questions: activeQuestions,
    watchlist_questions: watchlistQuestions,
    resolved_questions: resolvedQuestions,
    settlement_pending_count: snapshots.filter((snapshot) => isLiveBenchSettlementPending(snapshot.question)).length,
    odds_board: [...scorecards].sort((left, right) => right.points_balance - left.points_balance).slice(0, 8),
    quality_board: [...scorecards].sort((left, right) => right.quality_score - left.quality_score).slice(0, 8),
  };
  return buildLiveBenchEvaluationFromArena(scene, arena, scorecards);
}

export async function getCachedLiveBenchEvaluation(scene: WorldScene) {
  const arena = await readRelaxedArenaDiskCache(scene);
  if (!arena) return null;
  return buildLiveBenchEvaluationFromArena(scene, arena, arena.quality_board);
}

export async function listLiveBenchQuestions(
  scene: WorldScene,
  signals: WorldSignal[],
  status?: LiveQuestionStatus,
) {
  const arena = toPublicLiveBenchArenaState(await buildLiveBenchArenaState(scene, signals));
  if (!status) return arena;
  if (status === 'active') return arena.active_questions;
  if (status === 'resolved') return arena.resolved_questions;
  if (status === 'watchlist') return arena.watchlist_questions;
  return [];
}

function cooldownWeight(createdAt: string | null) {
  if (!createdAt) return 1;
  const elapsedHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  if (elapsedHours < 24) return 0;
  if (elapsedHours >= 168) return 1;
  return (elapsedHours - 24) / (168 - 24);
}

function defaultDirectionProbability(side: LiveQuestionSide) {
  return side === 'yes' ? 0.75 : 0.25;
}

type SubmitLiveBenchVoteInput = {
  question_id: string;
  xia_id: string;
  source?: 'xia' | 'external';
  contributor_kind?: 'xia' | 'human' | 'ai' | 'community' | null;
  contributor_label?: string | null;
  origin_url?: string | null;
  side: LiveQuestionSide;
  probability_yes?: number;
  human_readable_prediction: string;
  human_readable_why: string;
  cited_signal_ids?: string[];
  cited_vote_ids?: string[];
  what_changes_my_mind?: string;
  created_at?: string;
  historical_backfill?: boolean;
  source_attached?: boolean;
  source_snapshot_id?: string | null;
  source_context_generated_at?: string | null;
  source_cutoff_at?: string | null;
  source_signal_count?: number | null;
  source_embedding_backend?: string | null;
  source_latest_signal_published_at?: string | null;
  source_governance_finished_at?: string | null;
};

function buildLiveBenchVote(input: SubmitLiveBenchVoteInput, question: LiveQuestion, existingVotes: LiveVote[]) {
  const voteSource: LiveVoteSource = input.source === 'external' ? 'external' : 'xia';
  const requestedCreatedAtMs = input.historical_backfill && input.created_at ? Date.parse(input.created_at) : NaN;
  const createdAt = Number.isFinite(requestedCreatedAtMs) ? new Date(requestedCreatedAtMs).toISOString() : nowIso();
  const recentOwnVote = existingVotes
    .filter((vote) => vote.source === voteSource && vote.question_id === input.question_id && vote.xia_id === input.xia_id)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];

  if (voteSource === 'xia' && !input.historical_backfill && cooldownWeight(recentOwnVote?.created_at || null) === 0) {
    throw new Error('This xia is still in cooldown for the same question');
  }

  const cleanedPrediction = compactText(input.human_readable_prediction, 220);
  const cleanedWhy = compactText(input.human_readable_why, 320);
  const cleanedChanges = compactText(input.what_changes_my_mind || '', 220);
  const cleanedCitations = Array.isArray(input.cited_signal_ids) ? input.cited_signal_ids.filter(Boolean) : [];
  const normalizedProbability = clamp(
    typeof input.probability_yes === 'number' && Number.isFinite(input.probability_yes)
      ? input.probability_yes
      : defaultDirectionProbability(input.side),
    0.01,
    0.99,
  );
  const normalizedSide = sideFromProbability(normalizedProbability);
  if (voteSource === 'xia') {
    if (!cleanedPrediction || !cleanedWhy) {
      throw new Error('xia vote must include human_readable_prediction and human_readable_why');
    }
    if (typeof input.probability_yes === 'number' && input.side !== normalizedSide) {
      throw new Error('xia vote side must align with probability_yes (>= 0.5 => yes, < 0.5 => no)');
    }
    if (looksGenericArenaCopy(cleanedPrediction) || looksGenericArenaCopy(cleanedWhy)) {
      throw new Error('xia vote is too generic; make the prediction and why more question-specific');
    }
    const predictionSide = explicitVoteTextPolarity(cleanedPrediction);
    if (predictionSide && predictionSide !== normalizedSide) {
      throw new Error('xia vote human_readable_prediction conflicts with side/probability_yes');
    }
    const whySide = explicitVoteTextPolarity(cleanedWhy);
    if (whySide && whySide !== normalizedSide) {
      throw new Error('xia vote human_readable_why conflicts with side/probability_yes');
    }
  }

  const vote: LiveVote = {
    vote_id: `vote_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`,
    question_id: input.question_id,
    xia_id: input.xia_id,
    source: voteSource,
    contributor_kind: input.contributor_kind || (voteSource === 'external' ? 'community' : 'xia'),
    contributor_label: compactText(input.contributor_label || '', 64) || null,
    origin_url: compactText(input.origin_url || '', 320) || null,
    side: normalizedSide,
    probability_yes: normalizedProbability,
    human_readable_prediction: cleanedPrediction,
    human_readable_why: cleanedWhy,
    cited_signal_ids: hasEnoughCitations(cleanedCitations) ? cleanedCitations : [],
    cited_vote_ids: Array.isArray(input.cited_vote_ids) ? input.cited_vote_ids : [],
    what_changes_my_mind: hasConcreteChangeMindText(cleanedChanges) ? cleanedChanges : '',
    created_at: createdAt,
    source_attached: input.source_attached === true || Boolean(input.source_snapshot_id),
    source_snapshot_id: compactText(input.source_snapshot_id || '', 96) || null,
    source_context_generated_at: compactText(input.source_context_generated_at || '', 40) || null,
    source_cutoff_at: compactText(input.source_cutoff_at || '', 40) || null,
    source_signal_count:
      typeof input.source_signal_count === 'number' && Number.isFinite(input.source_signal_count)
        ? input.source_signal_count
        : null,
    source_embedding_backend: compactText(input.source_embedding_backend || '', 64) || null,
    source_latest_signal_published_at: compactText(input.source_latest_signal_published_at || '', 40) || null,
    source_governance_finished_at: compactText(input.source_governance_finished_at || '', 40) || null,
    freeze_probability_yes: question.platform_probability_yes,
    resolved_outcome: question.official_outcome || null,
    resolved_at: question.official_resolved_at || null,
    points_delta: question.official_outcome
      ? normalizedSide === question.official_outcome
        ? Number(impliedPayout(question.platform_probability_yes, normalizedSide).toFixed(2))
        : -1
      : null,
    brier_score:
      question.official_outcome === 'yes'
        ? Number(((normalizedProbability - 1) ** 2).toFixed(4))
        : question.official_outcome === 'no'
          ? Number((normalizedProbability ** 2).toFixed(4))
          : null,
  };
  return vote;
}

function liveQuestionPlatformFromId(questionId: string): LiveQuestionPlatform {
  if (questionId.startsWith('metaculus:')) return 'metaculus';
  if (questionId.startsWith('manifold:')) return 'manifold';
  if (questionId.startsWith('polymarket:')) return 'polymarket';
  if (questionId.startsWith('fallback:')) return 'fallback';
  return 'internal';
}

function liveQuestionFromPreview(preview: LiveBenchQuestionPreview): LiveQuestion {
  const now = nowIso();
  return {
    question_id: preview.question_id,
    source_platform: liveQuestionPlatformFromId(preview.question_id),
    discovered_via: null,
    source_question_id: preview.question_id,
    origin_url: preview.platform_question_url || '',
    title: preview.title,
    title_zh: preview.title,
    background: preview.background,
    background_zh: preview.background,
    resolution_criteria: preview.moderator_line || preview.background || '以题目官方结算为准。',
    resolution_criteria_zh: preview.moderator_line || preview.background || '以题目官方结算为准。',
    region_hint: preview.region_label || 'Global',
    topic_bucket: preview.topic_label || 'world',
    tags: [preview.topic_label, preview.region_label].filter(Boolean),
    open_at: null,
    freeze_at: null,
    close_at: preview.resolve_at,
    resolve_at: preview.resolve_at,
    status: preview.status,
    official_outcome: preview.official_outcome,
    official_resolved_at: preview.official_resolved_at,
    platform_probability_yes: preview.aggregate_vote?.probability_yes ?? null,
    platform_probability_updated_at: preview.aggregate_vote?.updated_at || null,
    platform_question_url: preview.platform_question_url || null,
    source_note: preview.source_label || null,
    raw_source_platform: null,
    validation_mode: 'platform',
    validation_query: preview.title,
    platform_context: preview.background,
    presentation_generated_at: now,
    moderator_view_cache: {
      summary: preview.moderator_line || preview.background,
      citation_ids: [],
    },
    debate_cache: null,
    references_cache: [],
    updated_at: now,
    created_at: now,
  };
}

async function findFastVoteQuestion(questionId: string) {
  const cached = getLiveBenchPersistState().__worldLiveBenchStoreCache?.store;
  const cachedQuestion = cached?.questions.find((item) => item.question_id === questionId);
  if (cachedQuestion) {
    return {
      question: cachedQuestion,
      votes: cached?.votes.filter((vote) => vote.question_id === questionId) || [],
    };
  }

  const arena = await readRelaxedArenaDiskCache('global');
  const snapshots = arena
    ? [...arena.active_questions, ...arena.watchlist_questions, ...arena.resolved_questions]
    : [];
  const snapshot = snapshots.find((item) => item.question.question_id === questionId);
  if (!snapshot) {
    const previewSnapshot = await readWorldApiSnapshot<LiveBenchQuestionPreview[]>(
      'global',
      'livebench_questions',
      LIVEBENCH_QUESTION_SNAPSHOT_MAX_AGE_MS,
    );
    const preview = previewSnapshot?.find((item) => item.question_id === questionId);
    if (!preview) return null;
    return {
      question: liveQuestionFromPreview(preview),
      votes: (await readLiveBenchVoteJournal()).filter((vote) => vote.question_id === questionId),
    };
  }
  return {
    question: snapshot.question,
    votes: [...snapshot.discussion_votes, ...(await readLiveBenchVoteJournal()).filter((vote) => vote.question_id === questionId)],
  };
}

async function persistFastVoteIntoStore(vote: LiveVote) {
  const store = await loadStore();
  if (!store.votes.some((item) => item.vote_id === vote.vote_id)) {
    store.votes.unshift(vote);
  }
  await persistStore(store, { updateRetainedArchive: false });
  clearArenaCache();
}

export async function submitLiveBenchVoteFast(input: SubmitLiveBenchVoteInput) {
  const fastQuestion = await findFastVoteQuestion(input.question_id);
  if (!fastQuestion) {
    throw new Error('Live question not found');
  }
  const journalVotes = await readLiveBenchVoteJournal();
  const vote = buildLiveBenchVote(input, fastQuestion.question, [...fastQuestion.votes, ...journalVotes]);
  await appendLiveBenchVoteJournal(vote);
  addVoteToLiveBenchStoreCache(vote);
  void persistFastVoteIntoStore(vote).catch((error) => {
    console.warn('[livebench] fast vote background persistence failed:', error instanceof Error ? error.message : String(error));
  });
  clearArenaCache();
  return vote;
}

export async function submitLiveBenchVote(input: SubmitLiveBenchVoteInput) {
  const store = await loadStore();
  const question = store.questions.find((item) => item.question_id === input.question_id);
  if (!question) {
    throw new Error('Live question not found');
  }

  const vote = buildLiveBenchVote(input, question, store.votes);
  store.votes.unshift(vote);
  const persistence = persistStore(store, { updateRetainedArchive: false }).catch((error) => {
    console.warn('[livebench] vote persistence failed:', error instanceof Error ? error.message : String(error));
  });
  await Promise.race([persistence, new Promise((resolve) => setTimeout(resolve, 2500))]);
  clearArenaCache();
  return vote;
}
