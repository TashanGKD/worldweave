/**
 * World Monitor Scraper Core
 * 模块化爬虫系统核心
 */

// API端点配置
export const WM_CONFIG = {
  baseUrl: 'https://world-monitor.com',
  endpoints: {
    events: '/api/events',
    outbreaks: '/api/outbreaks',
    rss: '/api/rss',
    signalMarkers: '/api/signal-markers',
  },
  defaultHeaders: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; WorldMonitorBot/2.0)',
  },
};

// 请求配置
export interface RequestConfig {
  timeoutMs: number;
  retries: number;
  delayMs: number;
  concurrency: number;
}

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  timeoutMs: 15000,
  retries: 3,
  delayMs: 250,
  concurrency: 4,
};

// 统一信号Schema
export interface UnifiedSignal {
  id: string;
  signal_type: 'event' | 'outbreak' | 'rss' | 'signal-marker';
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  observed_at: string;
  location_name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  severity: number | null;
  relevance_score: number | null;
  tags: string[];
  raw_payload: unknown;
  title_zh?: string;
  summary_zh?: string;
  dedupe_key?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  seen_count?: number;
}

// API结果
export interface ApiResult<T> {
  success: boolean;
  data: T;
  error?: string;
  durationMs: number;
  attemptCount: number;
}

// 爬取结果
export interface ScrapeResult {
  crawledAt: string;
  durationMs: number;
  results: {
    events: ApiResult<UnifiedSignal[]>;
    outbreaks: ApiResult<UnifiedSignal[]>;
    rss: ApiResult<UnifiedSignal[]>;
    signalMarkers: ApiResult<UnifiedSignal[]>;
  };
  stats: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byCountry: Record<string, number>;
    newSignals: number;
    updatedSignals: number;
  };
  signals: UnifiedSignal[];
}

// 延迟函数
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 生成唯一ID
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 提取域名
export function extractDomain(url: string): string {
  if (!url) return 'Unknown';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

// 生成去重键
export function generateDedupeKey(signal: UnifiedSignal): string {
  // 优先使用source_url
  if (signal.source_url) {
    return `${signal.signal_type}:${signal.source_url}`;
  }
  // 否则使用title + location + time的组合
  const timeKey = signal.published_at?.slice(0, 10) || '';
  return `${signal.signal_type}:${signal.title}:${signal.location_name}:${timeKey}`;
}

// 获取严重程度标签
export function getSeverityLabel(severity: number | null): string {
  if (severity === null) return 'UNKNOWN';
  if (severity >= 4) return 'CRITICAL';
  if (severity >= 3) return 'ELEVATED';
  return 'NORMAL';
}

// 获取类型配置
export function getTypeConfig(type: string) {
  const configs: Record<string, { label: string; icon: string; color: string }> = {
    event: { label: '冲突事件', icon: 'Activity', color: '#C41E3A' },
    outbreak: { label: '疫情', icon: 'AlertCircle', color: '#1E3A5F' },
    rss: { label: '新闻', icon: 'Newspaper', color: '#5A5A5A' },
    'signal-marker': { label: '信号标记', icon: 'Radio', color: '#8B7355' },
  };
  return configs[type] || { label: type, icon: 'Globe', color: '#5A5A5A' };
}
