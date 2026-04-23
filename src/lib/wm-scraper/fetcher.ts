import { 
  RequestConfig, 
  ApiResult, 
  sleep, 
  WM_CONFIG,
} from './types';

/**
 * HTTP请求模块
 * 支持超时、重试、并发控制
 */

// 带超时的fetch
async function fetchWithTimeout(
  url: string, 
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 单请求带重试
export async function fetchWithRetry<T>(
  url: string,
  config: RequestConfig,
  parser: (data: unknown) => T
): Promise<ApiResult<T>> {
  const startTime = Date.now();
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        { headers: WM_CONFIG.defaultHeaders },
        config.timeoutMs
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const rawData = await response.json();
      const parsedData = parser(rawData);
      
      return {
        success: true,
        data: parsedData,
        durationMs: Date.now() - startTime,
        attemptCount: attempt + 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < config.retries) {
        // 指数退避 + 随机抖动
        const delay = config.delayMs * Math.pow(2, attempt) + Math.random() * 200;
        await sleep(delay);
      }
    }
  }
  
  return {
    success: false,
    data: [] as unknown as T,
    error: lastError?.message || 'Unknown error',
    durationMs: Date.now() - startTime,
    attemptCount: config.retries + 1,
  };
}

// 并发控制执行器
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let activeCount = 0;
  let resolvePromise: () => void;
  
  const allDone = new Promise<void>(resolve => {
    resolvePromise = resolve;
  });
  
  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      activeCount++;
      
      try {
        results[currentIndex] = await processor(items[currentIndex], currentIndex);
      } catch (error) {
        results[currentIndex] = error as R;
      }
      
      activeCount--;
      if (activeCount === 0 && nextIndex >= items.length) {
        resolvePromise();
      }
    }
  }
  
  // 启动worker
  const workers = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    () => worker()
  );
  
  await Promise.all(workers);
  await allDone;
  
  return results;
}

// 批量并行获取多个端点
export async function fetchMultipleEndpoints<T extends Record<string, unknown>>(
  endpoints: { [K in keyof T]: { url: string; parser: (data: unknown) => T[K] } },
  config: RequestConfig
): Promise<{ [K in keyof T]: ApiResult<T[K]> }> {
  const entries = Object.entries(endpoints) as [keyof T, { url: string; parser: (data: unknown) => T[keyof T] }][];
  
  const results = await runWithConcurrency(
    entries,
    config.concurrency,
    async ([key, { url, parser }]) => {
      const result = await fetchWithRetry(url, config, parser);
      return [key, result] as const;
    }
  );
  
  return Object.fromEntries(results) as { [K in keyof T]: ApiResult<T[K]> };
}
