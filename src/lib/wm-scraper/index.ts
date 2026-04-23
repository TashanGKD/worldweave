/**
 * World Monitor Scraper 主入口
 * 整合所有模块的完整爬虫系统
 */

import { 
  RequestConfig, 
  DEFAULT_REQUEST_CONFIG,
  ScrapeResult, 
  UnifiedSignal,
  WM_CONFIG 
} from './types';
import { 
  normalizers 
} from './normalizer';
import { 
  fetchMultipleEndpoints 
} from './fetcher';
import { 
  signalStore,
  StoredSignal 
} from './store';

// 重新导出类型
export * from './types';
export * from './normalizer';
export * from './fetcher';
export * from './store';

/**
 * 执行完整爬取流程
 */
export async function scrapeWorldMonitor(
  config: Partial<RequestConfig> = {},
  loadExistingSignals?: () => Promise<UnifiedSignal[]>
): Promise<ScrapeResult> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_REQUEST_CONFIG, ...config };

  console.log('[Scraper] Starting scrape with config:', mergedConfig);

  // 1. 加载已有信号（如果有）
  if (loadExistingSignals && !signalStore.isInitialized()) {
    await signalStore.loadFromDatabase(loadExistingSignals);
  }

  // 2. 定义端点
  const endpoints = {
    events: {
      url: `${WM_CONFIG.baseUrl}${WM_CONFIG.endpoints.events}`,
      parser: normalizers.events,
    },
    outbreaks: {
      url: `${WM_CONFIG.baseUrl}${WM_CONFIG.endpoints.outbreaks}`,
      parser: normalizers.outbreaks,
    },
    rss: {
      url: `${WM_CONFIG.baseUrl}${WM_CONFIG.endpoints.rss}`,
      parser: normalizers.rss,
    },
    signalMarkers: {
      url: `${WM_CONFIG.baseUrl}${WM_CONFIG.endpoints.signalMarkers}`,
      parser: normalizers.signalMarkers,
    },
  };

  // 3. 并发获取所有端点
  const results = await fetchMultipleEndpoints(endpoints, mergedConfig);

  // 4. 合并所有信号
  const allNewSignals: UnifiedSignal[] = [
    ...results.events.data,
    ...results.outbreaks.data,
    ...results.rss.data,
    ...results.signalMarkers.data,
  ];

  console.log(`[Scraper] Fetched ${allNewSignals.length} new signals`);

  // 5. 去重合并
  const { newCount, updatedCount } = signalStore.mergeSignals(allNewSignals);

  console.log(`[Scraper] Merge result: ${newCount} new, ${updatedCount} updated`);

  // 6. 生成统计
  const stats = signalStore.getStats();

  // 7. 构建结果
  const scrapeResult: ScrapeResult = {
    crawledAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    results: {
      events: results.events,
      outbreaks: results.outbreaks,
      rss: results.rss,
      signalMarkers: results.signalMarkers,
    },
    stats: {
      total: stats.total,
      byType: stats.byType,
      bySeverity: stats.bySeverity,
      byCountry: stats.byCountry,
      newSignals: newCount,
      updatedSignals: updatedCount,
    },
    signals: signalStore.toUnifiedSignals(),
  };

  console.log('[Scraper] Completed in', scrapeResult.durationMs, 'ms');
  return scrapeResult;
}

/**
 * 快速爬取（仅指定端点）
 */
export async function scrapePartial(
  endpointKeys: ('events' | 'outbreaks' | 'rss' | 'signalMarkers')[],
  config: Partial<RequestConfig> = {}
): Promise<{
  signals: UnifiedSignal[];
  results: Record<string, { success: boolean; count: number; error?: string }>;
}> {
  const mergedConfig = { ...DEFAULT_REQUEST_CONFIG, ...config };
  const results: Record<string, { success: boolean; count: number; error?: string }> = {};
  const allSignals: UnifiedSignal[] = [];

  for (const key of endpointKeys) {
    const url = `${WM_CONFIG.baseUrl}${WM_CONFIG.endpoints[key]}`;
    const parser = normalizers[key];

    try {
      const { fetchWithRetry } = await import('./fetcher');
      const result = await fetchWithRetry(url, mergedConfig, parser);
      
      results[key] = {
        success: result.success,
        count: Array.isArray(result.data) ? result.data.length : 0,
        error: result.error,
      };

      if (result.success && Array.isArray(result.data)) {
        allSignals.push(...result.data);
      }
    } catch (error) {
      results[key] = {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { signals: allSignals, results };
}

/**
 * 获取当前存储的统计信息
 */
export function getCurrentStats() {
  return signalStore.getStats();
}

/**
 * 获取所有存储的信号
 */
export function getAllStoredSignals(): StoredSignal[] {
  return signalStore.getAllSignals();
}
