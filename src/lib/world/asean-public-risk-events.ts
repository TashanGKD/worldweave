import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AseanSignalLike } from './asean-topic';

type PublicRiskCacheItem = {
  id: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  first_seen_at: string;
  country_scope: string[];
  score: number;
};

type PublicRiskCache = {
  version: 1;
  refreshed_at: string;
  items: PublicRiskCacheItem[];
  latest_run?: {
    refreshed_at: string;
    source_count: number;
    fetched_count: number;
    kept_count: number;
    new_item_count: number;
    failed_count: number;
  };
};

type EonetEvent = {
  id?: string;
  title?: string;
  link?: string;
  categories?: Array<{ title?: string }>;
  geometry?: Array<{ date?: string; coordinates?: [number, number] }>;
};

type UsgsFeature = {
  id?: string;
  properties?: {
    mag?: number;
    place?: string;
    time?: number;
    updated?: number;
    url?: string;
    title?: string;
  };
  geometry?: {
    coordinates?: [number, number, number?];
  };
};

const CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-public-risk-cache.json');
const ENABLED = process.env.WORLD_ASEAN_PUBLIC_RISK_EVENTS !== '0';
const CACHE_TTL_MS = Math.max(5, Number(process.env.WORLD_ASEAN_PUBLIC_RISK_TTL_MINUTES || 30)) * 60 * 1000;
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(5000, Number(process.env.WORLD_ASEAN_PUBLIC_RISK_TIMEOUT_MS || 15000)));
const ITEM_LIMIT = Math.min(80, Math.max(10, Number(process.env.WORLD_ASEAN_PUBLIC_RISK_LIMIT || 40)));

const ASEAN_BOUNDS = {
  west: 88,
  east: 142,
  south: -13,
  north: 29,
};

const ASEAN_COUNTRY_PATTERNS: Array<[string, RegExp]> = [
  ['印尼', /(indonesia|sumatra|java|jakarta|sulawesi|west papua|papua barat|bali|maluku|印尼|印度尼西亚)/iu],
  ['马来西亚', /(malaysia|sabah|sarawak|kuala lumpur|马来西亚|吉隆坡)/iu],
  ['新加坡', /(singapore|新加坡)/iu],
  ['泰国', /(thailand|bangkok|thai|泰国|曼谷)/iu],
  ['越南', /(vietnam|viet nam|hanoi|越南|河内)/iu],
  ['菲律宾', /(philippines|luzon|mindanao|manila|菲律宾|马尼拉)/iu],
  ['缅甸', /(myanmar|burma|yangon|缅甸|仰光)/iu],
  ['柬埔寨', /(cambodia|phnom penh|柬埔寨|金边)/iu],
  ['老挝', /(laos|lao pdr|vientiane|老挝|万象)/iu],
  ['文莱', /(brunei|文莱)/iu],
  ['东帝汶', /(timor-leste|east timor|dili|东帝汶|帝力)/iu],
];

const NON_ASEAN_LOCATION_PATTERN = /(papua new guinea|\bpng\b|palau|guam|northern mariana|australia|sri lanka|bangladesh|india|taiwan|china|japan|solomon islands|密克罗尼西亚|巴布亚新几内亚|澳大利亚|斯里兰卡|孟加拉|印度|台湾|中国|日本)/iu;

function stableId(value: string) {
  return `asean-risk:${crypto.createHash('sha1').update(value).digest('hex').slice(0, 18)}`;
}

function compactText(value: unknown, max = 260) {
  const normalized = String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/gu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
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

function xmlField(item: string, name: string) {
  return decodeXmlEntities((item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').trim());
}

function parseDate(value: unknown, fallback: string) {
  const time = typeof value === 'number' ? value : new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function withinAsean(lon: number | null, lat: number | null) {
  if (lon === null || lat === null || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  return lon >= ASEAN_BOUNDS.west && lon <= ASEAN_BOUNDS.east && lat >= ASEAN_BOUNDS.south && lat <= ASEAN_BOUNDS.north;
}

function countryScope(text: string, lon?: number | null, lat?: number | null) {
  if (NON_ASEAN_LOCATION_PATTERN.test(text)) return [];
  const countries = ASEAN_COUNTRY_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
  if (countries.length) return Array.from(new Set(countries));
  return withinAsean(lon ?? null, lat ?? null) ? ['东盟'] : [];
}

function isValidPublicRiskItem(item: PublicRiskCacheItem) {
  if (NON_ASEAN_LOCATION_PATTERN.test(`${item.title} ${item.summary} ${item.source_url}`)) return false;
  return item.country_scope.some((country) => country === '东盟' || ASEAN_COUNTRY_PATTERNS.some(([label]) => label === country));
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/xml, text/xml, application/rss+xml, */*',
        'User-Agent': 'WorldWeaveAseanPublicRisk/0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, */*',
        'User-Agent': 'WorldWeaveAseanPublicRisk/0.1',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function scoreForText(text: string, fallback = 4) {
  if (/(red|critical|major|magnitude [6-9]|m [6-9]|cyclone|typhoon|flood|earthquake|tsunami|volcano|红色|重大|台风|洪水|地震|海啸|火山)/iu.test(text)) return 6;
  if (/(orange|moderate|wildfire|storm|drought|橙色|风暴|野火|干旱)/iu.test(text)) return 5;
  return fallback;
}

async function readCache(): Promise<PublicRiskCache | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')) as Partial<PublicRiskCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    return {
      version: 1,
      refreshed_at: parsed.refreshed_at || new Date(0).toISOString(),
      items: parsed.items.filter((item): item is PublicRiskCacheItem => Boolean(item?.id && item.title && item.source_url)),
      latest_run: parsed.latest_run,
    };
  } catch {
    return null;
  }
}

async function writeCache(cache: PublicRiskCache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

async function fetchGdacs(nowIso: string): Promise<PublicRiskCacheItem[] | null> {
  const url = 'https://www.gdacs.org/xml/rss.xml';
  const xml = await fetchText(url);
  if (!xml) return null;
  return Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/giu))
    .map((match) => match[0])
    .map((item) => {
      const title = compactText(xmlField(item, 'title'), 160);
      const summary = compactText(xmlField(item, 'description'), 260);
      const link = compactText(xmlField(item, 'link') || url, 500);
      const publishedAt = parseDate(xmlField(item, 'pubDate'), nowIso);
      const lat = Number(xmlField(item, 'geo:lat') || xmlField(item, 'lat'));
      const lon = Number(xmlField(item, 'geo:long') || xmlField(item, 'long'));
      const scope = countryScope(`${title} ${summary}`, Number.isFinite(lon) ? lon : null, Number.isFinite(lat) ? lat : null);
      if (!scope.length) return null;
      const text = `${title} ${summary}`;
      return {
        id: stableId(`gdacs|${link}|${publishedAt}|${title}`),
        title: 'GDACS东盟公共风险线索',
        summary: summary || title,
        source_name: 'GDACS Disaster Alerts RSS',
        source_url: link,
        published_at: publishedAt,
        first_seen_at: nowIso,
        country_scope: scope,
        score: scoreForText(text, 5),
      } satisfies PublicRiskCacheItem;
    })
    .filter((item): item is PublicRiskCacheItem => Boolean(item))
    .slice(0, 12);
}

async function fetchUsgs(nowIso: string): Promise<PublicRiskCacheItem[] | null> {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
  const json = await fetchJson(url) as { features?: UsgsFeature[] } | null;
  if (!json?.features) return null;
  return json.features
    .map((feature) => {
      const [lon, lat] = feature.geometry?.coordinates || [];
      const place = compactText(feature.properties?.place || feature.properties?.title, 160);
      const scope = countryScope(place, lon, lat);
      if (!scope.length) return null;
      const mag = feature.properties?.mag;
      const publishedAt = parseDate(feature.properties?.time || feature.properties?.updated, nowIso);
      return {
        id: stableId(`usgs|${feature.id || place}|${feature.properties?.time || publishedAt}`),
        title: 'USGS东盟地震风险线索',
        summary: `USGS记录东盟范围内地震事件：${place}${typeof mag === 'number' ? `，震级 ${mag.toFixed(1)}` : ''}。`,
        source_name: 'USGS Earthquake GeoJSON M4.5+',
        source_url: feature.properties?.url || url,
        published_at: publishedAt,
        first_seen_at: nowIso,
        country_scope: scope,
        score: typeof mag === 'number' && mag >= 6 ? 6 : 5,
      } satisfies PublicRiskCacheItem;
    })
    .filter((item): item is PublicRiskCacheItem => Boolean(item))
    .slice(0, 16);
}

async function fetchEonet(nowIso: string): Promise<PublicRiskCacheItem[] | null> {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';
  const json = await fetchJson(url) as { events?: EonetEvent[] } | null;
  if (!json?.events) return null;
  return json.events
    .map((event) => {
      const latestGeometry = [...(event.geometry || [])].reverse().find((geometry) => Array.isArray(geometry.coordinates));
      const [lon, lat] = latestGeometry?.coordinates || [];
      const title = compactText(event.title, 160);
      const category = compactText(event.categories?.map((item) => item.title).filter(Boolean).join('、'), 80);
      const scope = countryScope(`${title} ${category}`, lon, lat);
      if (!scope.length) return null;
      const publishedAt = parseDate(latestGeometry?.date, nowIso);
      return {
        id: stableId(`eonet|${event.id || title}|${publishedAt}`),
        title: 'NASA EONET东盟自然事件线索',
        summary: `NASA EONET开放事件显示东盟范围内存在${category || '自然事件'}：${title}。`,
        source_name: 'NASA EONET Open Events',
        source_url: event.link || url,
        published_at: publishedAt,
        first_seen_at: nowIso,
        country_scope: scope,
        score: scoreForText(`${title} ${category}`, 4),
      } satisfies PublicRiskCacheItem;
    })
    .filter((item): item is PublicRiskCacheItem => Boolean(item))
    .slice(0, 16);
}

function mergeItems(previous: PublicRiskCacheItem[], next: PublicRiskCacheItem[]) {
  const byId = new Map<string, PublicRiskCacheItem>();
  for (const item of previous.filter(isValidPublicRiskItem)) byId.set(item.id, item);
  for (const item of next.filter(isValidPublicRiskItem)) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...item, first_seen_at: existing.first_seen_at } : item);
  }
  return Array.from(byId.values())
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
    .slice(0, ITEM_LIMIT);
}

function toSignal(item: PublicRiskCacheItem): AseanSignalLike {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    source_name: item.source_name,
    source_url: item.source_url,
    published_at: item.published_at,
    publishedAt: item.published_at,
    country: item.country_scope[0] || '东盟',
    region: 'Southeast Asia',
    scene: 'asean',
    tags: ['asean', 'public-risk', 'disaster', 'source:asean-public-risk', ...item.country_scope],
    alignment_tags: ['scene:asean', 'source:asean-public-risk', `feed:${item.source_name}`],
    severity: item.score,
    relevance_score: Math.min(0.92, 0.72 + item.score / 40),
  };
}

async function refreshPublicRisk(cache: PublicRiskCache | null, nowIso: string) {
  const results = await Promise.all([fetchGdacs(nowIso), fetchUsgs(nowIso), fetchEonet(nowIso)]);
  const failedCount = results.filter((items) => items === null).length;
  const fetched = results.flatMap((items) => items || []);
  const previousIds = new Set((cache?.items || []).map((item) => item.id));
  const nextItems = mergeItems(cache?.items || [], fetched);
  const nextCache: PublicRiskCache = {
    version: 1,
    refreshed_at: nowIso,
    items: nextItems,
    latest_run: {
      refreshed_at: nowIso,
      source_count: 3,
      fetched_count: fetched.length,
      kept_count: nextItems.length,
      new_item_count: fetched.filter((item) => !previousIds.has(item.id)).length,
      failed_count: failedCount,
    },
  };
  await writeCache(nextCache);
  return nextCache;
}

export async function readAseanPublicRiskSignals(options: { force?: boolean } = {}): Promise<AseanSignalLike[]> {
  const cache = await readCache();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cacheAge = cache ? now - new Date(cache.refreshed_at).getTime() : Infinity;
  const nextCache =
    ENABLED && (options.force || !cache || !Number.isFinite(cacheAge) || cacheAge >= CACHE_TTL_MS)
      ? await refreshPublicRisk(cache, nowIso)
      : cache || {
          version: 1 as const,
          refreshed_at: nowIso,
          items: [],
          latest_run: {
            refreshed_at: nowIso,
            source_count: 0,
            fetched_count: 0,
            kept_count: 0,
            new_item_count: 0,
            failed_count: 0,
          },
        };
  return nextCache.items.filter(isValidPublicRiskItem).map(toSignal);
}
