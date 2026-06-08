import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AseanSignalLike } from './asean-topic';

type MetasoSearchResponse = {
  webpages?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
};

type AseanMetasoCacheItem = {
  id: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  first_seen_at: string;
  query: string;
  axis: string;
  host: string;
};

type AseanMetasoCache = {
  version: 1;
  refreshed_at: string;
  queries: string[];
  items: AseanMetasoCacheItem[];
  latest_run?: {
    refreshed_at: string;
    fetched_count: number;
    new_item_count: number;
    retained_item_count: number;
    query_count: number;
  };
};

const CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-metaso-search-cache.json');
const SEARCH_URL = (process.env.METASO_SEARCH_URL || 'https://metaso.cn/api/v1/search').trim();
const API_KEY = (process.env.METASO_API_KEY || '').trim();
const ENABLED = process.env.WORLD_ASEAN_METASO_SEARCH !== '0';
const CACHE_TTL_MS = Math.max(5, Number(process.env.WORLD_ASEAN_METASO_TTL_MINUTES || 60)) * 60 * 1000;
const QUERY_SIZE = Math.min(10, Math.max(3, Number(process.env.WORLD_ASEAN_METASO_QUERY_SIZE || 6)));
const MAX_CACHE_ITEMS = Math.min(160, Math.max(20, Number(process.env.WORLD_ASEAN_METASO_MAX_ITEMS || 80)));
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(5000, Number(process.env.WORLD_ASEAN_METASO_TIMEOUT_MS || 15000)));

export const ASEAN_METASO_KEYWORDS = [
  '中国 东盟 人工智能 应用合作中心 广西 算力',
  '中国 东盟 能源 人工智能 创新合作中心 广西 电网',
  '广西 东盟 数据中心 智算中心 新能源 电力',
  '东盟 电价 GDP 数据中心 AI 算力 广西',
  '中国 东盟 清洁能源 合作 智慧电网',
  '中国 东盟 人工智能 产业合作 数据中心',
] as const;

const ASEAN_TARGETED_SEARCHES: Array<{ axis: string; query: string }> = [
  ...ASEAN_METASO_KEYWORDS.map((query) => ({ axis: 'compute_data_center', query })),
  { axis: 'energy_power', query: '东盟 电价 电力市场 可再生能源 电网 最新 政府' },
  { axis: 'energy_power', query: 'ASEAN electricity tariff renewable energy grid latest government' },
  { axis: 'energy_power', query: '广西 东盟 绿电 跨境电力 清洁能源 合作 最新' },
  { axis: 'compute_data_center', query: 'ASEAN data center AI compute power demand latest government' },
  { axis: 'compute_data_center', query: '东盟 数据中心 算力 GPU 人工智能 基础设施 最新' },
  { axis: 'maritime_ports', query: '东盟 港口 航运 马六甲 南海 供应链 扰动 最新' },
  { axis: 'maritime_ports', query: 'ASEAN port shipping Malacca South China Sea supply chain latest' },
  { axis: 'industry_trade', query: '东盟 贸易 供应链 半导体 电池 关键矿产 投资 最新' },
  { axis: 'industry_trade', query: 'ASEAN supply chain semiconductor battery nickel investment latest' },
  { axis: 'macro_investment', query: '东盟 GDP FDI 通胀 汇率 投资 数据 最新 官方' },
  { axis: 'macro_investment', query: 'ASEAN GDP FDI inflation exchange rate investment latest official data' },
  { axis: 'public_risk', query: '东盟 洪水 台风 地震 登革热 烟霾 公共风险 最新' },
  { axis: 'public_risk', query: 'ASEAN flood typhoon earthquake dengue haze public risk latest' },
  { axis: 'political_security', query: '东盟 政策 选举 边境 安全 外交 监管 最新' },
  { axis: 'political_security', query: 'ASEAN policy election border security diplomacy regulation latest' },
];

export type AseanMetasoSearchStatus = {
  enabled: boolean;
  search_ready: boolean;
  keyword_count: number;
  signal_count: number;
  axis_counts: Array<{ axis: string; count: number }>;
  cache_ttl_minutes: number;
  refreshed_at: string | null;
  latest_run: AseanMetasoCache['latest_run'] | null;
};

const DEFAULT_ALLOWED_HOST_PATTERNS = [
  /(^|\.)gov\.cn$/i,
  /(^|\.)miit\.gov\.cn$/i,
  /(^|\.)nea\.gov\.cn$/i,
  /(^|\.)mofcom\.gov\.cn$/i,
  /(^|\.)gxzf\.gov\.cn$/i,
  /(^|\.)ca-aicc\.com$/i,
  /(^|\.)chinapower\.org\.cn$/i,
  /(^|\.)chinadaily\.com\.cn$/i,
  /(^|\.)asean\.org$/i,
  /(^|\.)aseanstats\.org$/i,
  /(^|\.)aseanenergy\.org$/i,
  /(^|\.)adb\.org$/i,
  /(^|\.)worldbank\.org$/i,
  /(^|\.)imf\.org$/i,
  /(^|\.)amro-asia\.org$/i,
  /(^|\.)data\.gov\.sg$/i,
  /(^|\.)eppo\.go\.th$/i,
  /(^|\.)stats\.gov\.my$/i,
  /(^|\.)openstat\.psa\.gov\.ph$/i,
  /^github\.com$/i,
];

function compactText(value: string, max = 260) {
  const normalized = value
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/gu, ' ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isAllowedHost(host: string) {
  const extra = (process.env.WORLD_ASEAN_METASO_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().replace(/^www\./i, '').toLowerCase())
    .filter(Boolean);
  return DEFAULT_ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host)) || extra.includes(host);
}

function stableMetasoId(url: string) {
  return `asean-metaso:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 18)}`;
}

function normalizePublishedAt(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function hasTopicTerms(value: string) {
  return /(东盟|东南亚|广西|人工智能|\bAI\b|算力|智算|能源|电力|电网|电力市场化|数据中心|数字基础设施|数字贸易|数字丝路|跨境电商|清洁能源|合作中心|南A中心|芯片|半导体)/iu.test(value);
}

function hasCoreTopicTerms(value: string) {
  return /(东盟|东南亚|人工智能|\bAI\b|算力|智算|能源|电力|电网|电力市场化|数据中心|数字基础设施|数字贸易|数字丝路|跨境电商|清洁能源|合作中心|南A中心|芯片|半导体)/iu.test(value);
}

function hasUnusableTitleShape(value: string) {
  const text = compactText(value);
  return (
    !text ||
    /[。；]|图源|文件下载|当前位置|希望双方|截至|如今|作为.*之一|动态更新|持续跟踪/iu.test(text)
  );
}

function isLowInformationTitle(value: string) {
  const text = compactText(value);
  return (
    !text ||
    /^(新闻|动态|工作动态|经贸动态|业界探讨|专题|首页|主页|rss|update)$/iu.test(text) ||
    /当前位置|用户空间|网站首页|门户网站|官方网站|政府信息公开|网上办事|无障碍|长者专区/iu.test(text) ||
    /^\d{4}年部门动态/u.test(text) ||
    /(^|[：:])?(中国—东盟人工智能算力合作线索|中国—东盟能源电力合作线索|东盟区域产业与宏观数据线索|中国—东盟政策合作线索)$/u.test(text) ||
    /事项$|线索$|公开进展$|相关线索更新$/u.test(text)
  );
}

function isUsableOriginalTitle(value: string) {
  const text = compactText(value);
  if (isLowInformationTitle(text) || hasUnusableTitleShape(text)) return false;
  return text.length >= 8;
}

function normalizeFormalTitle(value: string) {
  return compactText(value)
    .replace(/相关动态更新/gu, '线索')
    .replace(/动态更新/gu, '线索')
    .replace(/相关公开信息更新/gu, '线索')
    .replace(/持续跟踪/gu, '跟踪')
    .replace(/\s*-\s*.*$/u, '');
}

function derivedFormalTopicTitle(value: string) {
  const text = compactText(value);
  if (/南A中心|中国[（(]广西[）)]?[-—]?东盟人工智能|中国[-—]东盟人工智能计算中心|五象云谷|智算|算力|数据中心|数字基础设施|人工智能/iu.test(text)) {
    return '中国—东盟人工智能算力合作线索';
  }
  if (/清洁能源|绿色能源|绿电|电力|电价|电网|智慧电网|跨境电力|储能|新能源|能源人工智能/iu.test(text)) {
    return '中国—东盟能源电力合作线索';
  }
  if (/GDP|宏观|统计|ASEANstats|投资|签约|项目|产业链|供应链|园区|企业/iu.test(text)) {
    return '东盟区域产业与宏观数据线索';
  }
  if (/政策|部长|会议|合作中心|标准|路线图|规划|指南/iu.test(text)) {
    return '中国—东盟政策合作线索';
  }
  return '';
}

function normalizedSearchTitle(title: string, summary: string) {
  const normalizedTitle = normalizeFormalTitle(title);
  if (isUsableOriginalTitle(normalizedTitle)) {
    return compactText(normalizedTitle, 68);
  }
  const sentence = summary
    .split(/(?<=[。！？!?])\s*/u)
    .map((part) => part.trim())
    .map(normalizeFormalTitle)
    .find((part) => isUsableOriginalTitle(part) && hasCoreTopicTerms(part));
  if (sentence) return compactText(sentence, 68);
  const derived = derivedFormalTopicTitle(`${title} ${summary}`);
  if (derived) return derived;
  return compactText(normalizedTitle || title, 68);
}

function cleanSearchSummary(value: string) {
  return compactText(value, 900)
    .replace(/图源@[^!。；;]*!?/gu, ' ')
    .replace(/文件下载：?.*$/u, ' ')
    .replace(/当前位置：?.*$/u, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizedSearchSummary(title: string, summary: string) {
  const text = cleanSearchSummary(`${title}。${summary}`);
  if (/国际海缆|国际陆地光缆|国际通信节点|云计算中心|南宁区域性通信业务国际出入口局/iu.test(text)) {
    return '公开信息显示，中国—东盟信息港已形成跨境通信节点和云计算中心等基础设施，为区域数字产业合作提供支撑。';
  }
  if (/AI算力一体化|应用合作中心|东盟市场|人工智能应用合作中心/iu.test(text)) {
    return '公开信息涉及广西与相关企业围绕算力基础设施、人工智能应用合作中心和东盟市场拓展开展对接。';
  }
  if (/第一批40个|展示中心|超级联赛|东盟语料库|可信数据空间/iu.test(text)) {
    return '公开信息显示，南A中心已披露首批人工智能产业项目签约、展示中心试运营及语料库建设等进展。';
  }
  if (/5000PFlops|算力服务体系|算力中心|调度平台|智能算力集群/iu.test(text)) {
    return '公开信息显示，南A中心推进算力服务体系、数据中心和调度平台建设，并披露已部署算力规模。';
  }
  if (/绿色算力|新能源优势|低成本、高能效|储能|上下游企业/iu.test(text)) {
    return '公开信息涉及广西依托新能源条件建设绿色算力中心，并联动芯片、储能等产业链环节服务东盟市场。';
  }
  if (/能源人工智能|智慧电网|跨境电力|清洁能源|绿色能源/iu.test(text)) {
    return '公开信息涉及中国—东盟能源电力合作、智慧电网和清洁能源协同进展。';
  }
  const sentence = text
    .split(/(?<=[。！？!?])\s*/u)
    .map((part) => part.trim())
    .find((part) => hasCoreTopicTerms(part) && part.length >= 18 && !/希望双方|图源|文件下载|当前位置/iu.test(part));
  return compactText(sentence || text, 180);
}

function normalizeCacheItem(item: AseanMetasoCacheItem): AseanMetasoCacheItem {
  const summary = normalizedSearchSummary(item.title, item.summary);
  return {
    ...item,
    title: normalizedSearchTitle(item.title, summary),
    summary,
  };
}

async function readCache(): Promise<AseanMetasoCache | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')) as Partial<AseanMetasoCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    const items = parsed.items
      .filter((item): item is AseanMetasoCacheItem => Boolean(item?.id && item.source_url && item.title))
      .map((item) => normalizeCacheItem({ ...item, axis: item.axis || axisForQuery(item.query || '') }));
    return {
      version: 1,
      refreshed_at: parsed.refreshed_at || new Date(0).toISOString(),
      queries: Array.isArray(parsed.queries) ? parsed.queries.filter(Boolean) : [],
      items,
      latest_run: parsed.latest_run,
    };
  } catch {
    return null;
  }
}

async function writeCache(cache: AseanMetasoCache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

function axisForQuery(query: string) {
  return ASEAN_TARGETED_SEARCHES.find((item) => item.query === query)?.axis || 'general';
}

async function fetchMetasoQuery(search: { axis: string; query: string }, nowIso: string): Promise<AseanMetasoCacheItem[]> {
  if (!API_KEY) return [];
  const { axis, query } = search;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        scope: 'webpage',
        includeSummary: false,
        size: String(QUERY_SIZE),
        includeRawContent: false,
        conciseSnippet: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as MetasoSearchResponse;
    return (payload.webpages || [])
      .map((item) => {
        const link = String(item.link || '').trim();
        const host = hostFromUrl(link);
        if (!link || !host || !isAllowedHost(host)) return null;
        const rawTitle = compactText(String(item.title || ''));
        const rawSummary = compactText(String(item.snippet || rawTitle), 900);
        if (!rawTitle || rawSummary.length < 12 || !hasTopicTerms(`${rawTitle} ${rawSummary}`)) return null;
        const summary = normalizedSearchSummary(rawTitle, rawSummary);
        const title = normalizedSearchTitle(rawTitle, summary);
        return {
          id: stableMetasoId(link),
          title,
          summary,
          source_name: `秘塔搜索 · ${host}`,
          source_url: link,
          published_at: normalizePublishedAt(item.date, nowIso),
          first_seen_at: nowIso,
          query,
          axis,
          host,
        } satisfies AseanMetasoCacheItem;
      })
      .filter((item): item is AseanMetasoCacheItem => Boolean(item));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function mergeCacheItems(previous: AseanMetasoCacheItem[], next: AseanMetasoCacheItem[]) {
  const byUrl = new Map<string, AseanMetasoCacheItem>();
  for (const item of previous) byUrl.set(item.source_url, item);
  for (const item of next) {
    const existing = byUrl.get(item.source_url);
    byUrl.set(item.source_url, existing ? { ...item, first_seen_at: existing.first_seen_at } : item);
  }
  return Array.from(byUrl.values())
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
    .slice(0, MAX_CACHE_ITEMS);
}

function toAseanSignal(item: AseanMetasoCacheItem): AseanSignalLike {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    source_name: item.source_name,
    source_url: item.source_url,
    published_at: item.published_at,
    publishedAt: item.published_at,
    country: '东盟',
    region: 'Southeast Asia',
    scene: 'asean',
    tags: ['asean', 'metaso-search', 'incremental-search', item.host, item.query],
    alignment_tags: ['scene:asean', 'source:metaso', 'source:topic-only', `query:${item.query}`],
    alignmentTags: ['scene:asean', 'source:metaso', 'source:topic-only', `axis:${item.axis}`],
    severity: 3,
    relevance_score: 0.78,
  };
}

export async function readAseanMetasoSignals(options: { force?: boolean } = {}): Promise<AseanSignalLike[]> {
  const cache = await readCache();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cacheAge = cache ? now - new Date(cache.refreshed_at).getTime() : Infinity;
  if (!ENABLED || !API_KEY) return (cache?.items || []).map(toAseanSignal);
  if (!options.force && cache && Number.isFinite(cacheAge) && cacheAge < CACHE_TTL_MS) {
    return cache.items.map(toAseanSignal);
  }

  const fetched = (
    await Promise.all(ASEAN_TARGETED_SEARCHES.map((search) => fetchMetasoQuery(search, nowIso)))
  ).flat();
  const previousUrls = new Set((cache?.items || []).map((item) => item.source_url));
  const newItemCount = fetched.filter((item) => !previousUrls.has(item.source_url)).length;
  const nextItems = mergeCacheItems(cache?.items || [], fetched);
  const nextCache: AseanMetasoCache = {
    version: 1,
    refreshed_at: nowIso,
    queries: ASEAN_TARGETED_SEARCHES.map((item) => item.query),
    items: nextItems,
    latest_run: {
      refreshed_at: nowIso,
      fetched_count: fetched.length,
      new_item_count: newItemCount,
      retained_item_count: Math.max(0, nextItems.length - newItemCount),
      query_count: ASEAN_TARGETED_SEARCHES.length,
    },
  };
  await writeCache(nextCache);
  return nextCache.items.map(toAseanSignal);
}

export async function readAseanMetasoSearchStatus(): Promise<AseanMetasoSearchStatus> {
  const cache = await readCache();
  const axisCounts = Array.from(
    (cache?.items || []).reduce((map, item) => {
      map.set(item.axis, (map.get(item.axis) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([axis, count]) => ({ axis, count }))
    .sort((left, right) => right.count - left.count || left.axis.localeCompare(right.axis));
  return {
    enabled: ENABLED,
    search_ready: Boolean(API_KEY),
    keyword_count: ASEAN_TARGETED_SEARCHES.length,
    signal_count: cache?.items.length || 0,
    axis_counts: axisCounts,
    cache_ttl_minutes: CACHE_TTL_MS / 60_000,
    refreshed_at: cache?.refreshed_at || null,
    latest_run: cache?.latest_run || null,
  };
}
