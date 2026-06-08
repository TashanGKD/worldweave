import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ASEAN_SOURCE_POOL, type AseanSignalLike, type AseanTopicKey } from './asean-topic';

type AseanFeedCacheItem = {
  id: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  first_seen_at: string;
  source_feed_url: string;
  source_priority: 'p0' | 'p1' | 'p2';
  topic_tags: AseanTopicKey[];
};

type AseanFeedCache = {
  version: 1;
  refreshed_at: string;
  items: AseanFeedCacheItem[];
  latest_run?: {
    refreshed_at: string;
    source_count: number;
    fetched_count: number;
    kept_count: number;
    new_item_count: number;
  };
};

type ParsedFeedItem = {
  title: string;
  link: string;
  summary: string;
  published_at: string;
};

const CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-source-feed-cache.json');
const ENABLED = process.env.WORLD_ASEAN_SOURCE_FEEDS !== '0';
const CACHE_TTL_MS = Math.max(5, Number(process.env.WORLD_ASEAN_SOURCE_FEED_TTL_MINUTES || 60)) * 60 * 1000;
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(5000, Number(process.env.WORLD_ASEAN_SOURCE_FEED_TIMEOUT_MS || 15000)));
const PER_SOURCE_LIMIT = Math.min(6, Math.max(1, Number(process.env.WORLD_ASEAN_SOURCE_FEED_PER_SOURCE_LIMIT || 3)));
const SOURCE_LIMIT = Math.min(24, Math.max(1, Number(process.env.WORLD_ASEAN_SOURCE_FEED_LIMIT || 18)));

function compactText(value: string, max = 260) {
  const normalized = value
    .replace(/<!\[CDATA\[|\]\]>/gu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stableId(value: string) {
  return `asean-feed:${crypto.createHash('sha1').update(value).digest('hex').slice(0, 18)}`;
}

function parseDate(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const time = new Date(decodeXmlEntities(value)).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function xmlField(item: string, name: string) {
  return decodeXmlEntities((item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').trim());
}

function parseRssItems(xml: string, nowIso: string): ParsedFeedItem[] {
  return Array.from(xml.matchAll(/<(item|entry)\b[\s\S]*?>([\s\S]*?)<\/(item|entry)>/giu))
    .map((match) => match[2] || '')
    .map((item) => {
      const title = compactText(xmlField(item, 'title'), 140);
      const atomLink = decodeXmlEntities((item.match(/<link[^>]*href=['"]([^'"]+)['"]/iu)?.[1] || '').trim());
      const link = compactText(xmlField(item, 'link') || atomLink, 500);
      const summary = compactText(xmlField(item, 'description') || xmlField(item, 'summary') || xmlField(item, 'content:encoded'), 360);
      const publishedAt = parseDate(xmlField(item, 'pubDate') || xmlField(item, 'published') || xmlField(item, 'updated'), nowIso);
      return {
        title,
        link,
        summary,
        published_at: publishedAt,
      };
    })
    .filter((item) => item.title);
}

function hasAseanScope(text: string) {
  return /(asean|southeast asia|south-east asia|mekong|malacca|south china sea|indonesia|malaysia|singapore|thailand|vietnam|philippines|myanmar|cambodia|laos|lao pdr|brunei|timor-leste|east timor|东盟|东南亚|湄公河|马六甲|南海|印尼|印度尼西亚|马来西亚|新加坡|泰国|越南|菲律宾|缅甸|柬埔寨|老挝|文莱|东帝汶)/iu.test(text);
}

function hasAseanTopic(text: string) {
  return /(energy|electricity|power|grid|renewable|solar|lng|fuel|tariff|trade|supply chain|investment|gdp|inflation|market|data center|datacentre|cloud|digital|ai|artificial intelligence|semiconductor|chip|cyber|disaster|flood|typhoon|earthquake|haze|climate|water|maritime|security|south china sea|malacca|strait|port|shipping|vessel|piracy|robbery|coast guard|chokepoint|能源|电力|电网|新能源|燃油|关税|贸易|供应链|投资|宏观|通胀|市场|数据中心|算力|云|数字|人工智能|半导体|芯片|网络安全|灾害|洪水|台风|地震|烟霾|气候|水资源|海上|安全|南海|马六甲|海峡|港口|航运|船只|海盗|海警|通道|พลังงาน|ไฟฟ้า|เชื้อเพลิง|ไตรมาส)/iu.test(text);
}

function sourceAllowsRegionalItems(sourceName: string) {
  return /ASEANstats|AMRO|AHA Centre|Mekong River Commission|ASEAN Centre for Biodiversity|GDACS|Thailand EPPO|World Bank/i.test(sourceName);
}

function isRelevantFeedItem(sourceName: string, item: ParsedFeedItem) {
  const text = `${sourceName} ${item.title} ${item.summary}`;
  if (sourceAllowsRegionalItems(sourceName) && hasAseanTopic(text)) return true;
  return hasAseanScope(text) && hasAseanTopic(text);
}

function normalizeFeedTitle(sourceName: string, item: ParsedFeedItem) {
  const text = `${sourceName} ${item.title} ${item.summary}`;
  const displayName = sourceName.replace(/\s+RSS$/iu, '');
  const originalTitle = compactText(item.title, 96);
  if (
    originalTitle.length >= 12
    && !/^(news|update|rss|home)$/iu.test(originalTitle)
    && !/^[\w\s-]*RSS$/iu.test(originalTitle)
  ) {
    return originalTitle;
  }
  if (/disaster|flood|typhoon|earthquake|haze|climate|water|灾害|洪水|台风|地震|烟霾|气候|水资源/iu.test(text)) return `${displayName}公共风险线索`;
  if (/energy|electricity|power|grid|renewable|solar|lng|fuel|能源|电力|电网|新能源|燃油|พลังงาน|ไฟฟ้า|เชื้อเพลิง/iu.test(text)) return `${displayName}能源电力线索`;
  if (/data center|datacentre|cloud|digital|ai|artificial intelligence|cyber|数据中心|算力|云|数字|人工智能|网络安全/iu.test(text)) return `${displayName}数字基础设施线索`;
  if (/trade|supply chain|investment|gdp|inflation|market|关税|贸易|供应链|投资|宏观|通胀|市场/iu.test(text)) return `${displayName}产业与宏观线索`;
  if (/maritime|security|south china sea|malacca|strait|port|shipping|vessel|piracy|robbery|coast guard|chokepoint|海上|安全|南海|马六甲|海峡|港口|航运|船只|海盗|海警|通道/iu.test(text)) return `${displayName}海上通道与安全线索`;
  return compactText(item.title, 56);
}

function normalizeFeedSummary(sourceName: string, item: ParsedFeedItem) {
  const summary = compactText(item.summary || item.title, 180);
  if (summary && summary !== item.title) return summary;
  return `${sourceName.replace(/\s+RSS$/iu, '')}发布相关公开信息，涉及东盟专题监测范围。`;
}

async function readCache(): Promise<AseanFeedCache | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')) as Partial<AseanFeedCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    return {
      version: 1,
      refreshed_at: parsed.refreshed_at || new Date(0).toISOString(),
      items: parsed.items.filter((item): item is AseanFeedCacheItem => Boolean(item?.id && item.title && item.source_url)),
      latest_run: parsed.latest_run,
    };
  } catch {
    return null;
  }
}

async function writeCache(cache: AseanFeedCache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

function selectedSources() {
  return ASEAN_SOURCE_POOL
    .filter((source) => source.status === 'active' && source.ingestion === 'polling' && source.source_type === 'rss')
    .filter((source) => source.priority === 'p0' || source.priority === 'p1')
    .slice(0, SOURCE_LIMIT);
}

async function fetchSource(source: ReturnType<typeof selectedSources>[number], nowIso: string): Promise<AseanFeedCacheItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'WorldWeaveAseanFeed/0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRssItems(xml, nowIso)
      .slice(0, PER_SOURCE_LIMIT * 2)
      .filter((item) => isRelevantFeedItem(source.name, item))
      .slice(0, PER_SOURCE_LIMIT)
      .map((item) => {
        const sourceUrl = item.link || source.url;
        return {
          id: stableId(`${source.name}|${sourceUrl}|${item.published_at}|${item.title}`),
          title: normalizeFeedTitle(source.name, item),
          summary: normalizeFeedSummary(source.name, item),
          source_name: source.name,
          source_url: sourceUrl,
          published_at: item.published_at,
          first_seen_at: nowIso,
          source_feed_url: source.url,
          source_priority: source.priority || 'p1',
          topic_tags: source.topic_tags || [],
        } satisfies AseanFeedCacheItem;
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function mergeItems(previous: AseanFeedCacheItem[], next: AseanFeedCacheItem[]) {
  const byId = new Map<string, AseanFeedCacheItem>();
  for (const item of previous) byId.set(item.id, item);
  for (const item of next) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...item, first_seen_at: existing.first_seen_at } : item);
  }
  const bySource = new Map<string, AseanFeedCacheItem[]>();
  for (const item of byId.values()) {
    bySource.set(item.source_name, [...(bySource.get(item.source_name) || []), item]);
  }
  return Array.from(bySource.values())
    .flatMap((items) =>
      items
        .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
        .slice(0, 8),
    )
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
    .slice(0, 160);
}

function toSignal(item: AseanFeedCacheItem): AseanSignalLike {
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
    tags: ['asean', 'rss', 'source-feed', item.source_name, item.source_priority, ...item.topic_tags],
    alignment_tags: ['scene:asean', 'source:asean-feed', `feed:${item.source_name}`, `priority:${item.source_priority}`],
    severity: item.source_priority === 'p0' ? 4 : 3,
    relevance_score: item.source_priority === 'p0' ? 0.84 : 0.76,
  };
}

export async function readAseanSourceFeedSignals(options: { force?: boolean } = {}): Promise<AseanSignalLike[]> {
  const cache = await readCache();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cacheAge = cache ? now - new Date(cache.refreshed_at).getTime() : Infinity;
  if (!ENABLED) return (cache?.items || []).map(toSignal);
  if (!options.force && cache && Number.isFinite(cacheAge) && cacheAge < CACHE_TTL_MS) {
    return cache.items.map(toSignal);
  }

  const sources = selectedSources();
  const fetched = (await Promise.all(sources.map((source) => fetchSource(source, nowIso)))).flat();
  const previousIds = new Set((cache?.items || []).map((item) => item.id));
  const nextItems = mergeItems(cache?.items || [], fetched);
  const nextCache: AseanFeedCache = {
    version: 1,
    refreshed_at: nowIso,
    items: nextItems,
    latest_run: {
      refreshed_at: nowIso,
      source_count: sources.length,
      fetched_count: fetched.length,
      kept_count: nextItems.length,
      new_item_count: fetched.filter((item) => !previousIds.has(item.id)).length,
    },
  };
  await writeCache(nextCache);
  return nextItems.map(toSignal);
}
