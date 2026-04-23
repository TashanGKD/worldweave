import { UnifiedSignal, generateId, extractDomain } from './types';

type PositionedSignal = {
  title?: string;
  headline?: string;
  notes?: string;
  source?: string;
  sourceUrl?: string;
  timestamp?: string;
  location?: string;
  country?: string;
  position?: [number?, number?];
  severity?: number | null;
  relevanceScore?: number | null;
  type?: string;
  subEventType?: string;
  actor1?: string;
  actor2?: string;
};

type OutbreakSignal = {
  disease?: string;
  name?: string;
  description?: string;
  notes?: string;
  source?: string;
  sourceUrl?: string;
  reportedAt?: string;
  timestamp?: string;
  location?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  severity?: number | null;
  relevanceScore?: number | null;
  status?: string;
};

type RssSignal = {
  title?: string;
  description?: string;
  summary?: string;
  link?: string;
  pubDate?: string;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function compactStrings(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

/**
 * 数据归一化模块
 * 将不同API的数据统一为相同Schema
 */

// 归一化 events 数据 (从 /api/events)
export function normalizeEvents(data: unknown): UnifiedSignal[] {
  const record = getRecord(data);
  const markers = Array.isArray(record?.markers) ? record.markers : data;
  if (!Array.isArray(markers)) {
    console.warn('[normalizeEvents] Expected array, got:', typeof markers);
    return [];
  }

  return (markers as PositionedSignal[]).map((item) => ({
    id: generateId('event'),
    signal_type: 'event',
    title: item.title || item.headline || 'Unknown Event',
    summary: item.notes || item.headline || '',
    source_name: item.source || 'World Monitor',
    source_url: item.sourceUrl || '',
    published_at: item.timestamp || new Date().toISOString(),
    observed_at: new Date().toISOString(),
    location_name: item.location || item.title || '',
    country: item.country || '',
    latitude: item.position?.[0] ?? null,
    longitude: item.position?.[1] ?? null,
    severity: item.severity ?? null,
    relevance_score: item.relevanceScore ?? null,
    tags: compactStrings([
      item.type,
      item.subEventType,
      item.actor1,
      item.actor2,
    ]),
    raw_payload: item,
  }));
}

// 归一化 outbreaks 数据 (从 /api/outbreaks)
export function normalizeOutbreaks(data: unknown): UnifiedSignal[] {
  const record = getRecord(data);
  const outbreaks = Array.isArray(record?.outbreaks) ? record.outbreaks : data;
  if (!Array.isArray(outbreaks)) {
    console.warn('[normalizeOutbreaks] Expected array, got:', typeof outbreaks);
    return [];
  }

  return (outbreaks as OutbreakSignal[]).map((item) => ({
    id: generateId('outbreak'),
    signal_type: 'outbreak',
    title: item.disease || item.name || 'Unknown Outbreak',
    summary: item.description || item.notes || '',
    source_name: item.source || 'World Monitor',
    source_url: item.sourceUrl || '',
    published_at: item.reportedAt || item.timestamp || new Date().toISOString(),
    observed_at: new Date().toISOString(),
    location_name: item.location || item.country || '',
    country: item.country || '',
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    severity: item.severity ?? null,
    relevance_score: item.relevanceScore ?? null,
    tags: compactStrings([item.status, item.disease]),
    raw_payload: item,
  }));
}

// 归一化 RSS 数据 (从 /api/rss)
export function normalizeRss(data: unknown): UnifiedSignal[] {
  const record = getRecord(data);
  const articles = Array.isArray(record?.articles)
    ? record.articles
    : Array.isArray(record?.items)
      ? record.items
      : data;
  if (!Array.isArray(articles)) {
    console.warn('[normalizeRss] Expected array, got:', typeof articles);
    return [];
  }

  return (articles as RssSignal[]).map((item, index: number) => ({
    id: generateId(`rss-${index}`),
    signal_type: 'rss',
    title: item.title || 'Untitled',
    summary: item.description || item.summary || '',
    source_name: extractDomain(item.link || ''),
    source_url: item.link || '',
    published_at: item.pubDate || new Date().toISOString(),
    observed_at: new Date().toISOString(),
    location_name: '',
    country: '',
    latitude: null,
    longitude: null,
    severity: null,
    relevance_score: null,
    tags: [],
    raw_payload: item,
  }));
}

// 归一化 signal-markers 数据 (从 /api/signal-markers)
export function normalizeSignalMarkers(data: unknown): UnifiedSignal[] {
  const record = getRecord(data);
  const markers = Array.isArray(record?.markers) ? record.markers : data;
  if (!Array.isArray(markers)) {
    console.warn('[normalizeSignalMarkers] Expected array, got:', typeof markers);
    return [];
  }

  return (markers as PositionedSignal[]).map((item) => ({
    id: generateId('marker'),
    signal_type: 'signal-marker',
    title: item.title || item.headline || 'Unknown Signal',
    summary: item.notes || item.headline || '',
    source_name: item.source || 'World Monitor',
    source_url: item.sourceUrl || '',
    published_at: item.timestamp || new Date().toISOString(),
    observed_at: new Date().toISOString(),
    location_name: item.location || item.title || '',
    country: item.country || '',
    latitude: item.position?.[0] ?? null,
    longitude: item.position?.[1] ?? null,
    severity: item.severity ?? null,
    relevance_score: item.relevanceScore ?? null,
    tags: compactStrings([
      item.type,
      item.subEventType,
      item.actor1,
      item.actor2,
    ]),
    raw_payload: item,
  }));
}

// 归一化函数映射
export const normalizers = {
  events: normalizeEvents,
  outbreaks: normalizeOutbreaks,
  rss: normalizeRss,
  signalMarkers: normalizeSignalMarkers,
};
