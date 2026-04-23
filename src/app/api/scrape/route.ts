import { NextRequest, NextResponse } from 'next/server';
import { 
  scrapeWorldMonitor,
  getCurrentStats,
  getAllStoredSignals,
  RequestConfig,
  UnifiedSignal,
} from '@/lib/wm-scraper';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 从数据库加载已有信号
async function loadExistingSignalsFromDB() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('signals')
    .select('*')
    .eq('is_active', true)
    .order('last_seen_at', { ascending: false });

  if (error) {
    console.error('[API] Failed to load existing signals:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    signal_type: row.category,
    title: row.title,
    summary: row.description,
    source_name: row.source_name,
    source_url: row.source_url,
    published_at: row.event_time,
    observed_at: row.created_at,
    location_name: row.location,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    severity: row.severity,
    relevance_score: row.relevance_score,
    tags: row.tags || [],
    raw_payload: row.raw_data,
    dedupe_key: row.dedupe_key,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    seen_count: row.seen_count || 1,
  }));
}

// 保存信号到数据库
async function saveSignalsToDB(signals: UnifiedSignal[]) {
  const client = getSupabaseClient();
  
  // 准备批量插入/更新数据
  const signalsToUpsert = signals.map(signal => ({
    id: signal.id,
    title: signal.title,
    description: signal.summary,
    location: signal.location_name,
    country: signal.country,
    priority: signal.severity ? (signal.severity >= 4 ? 'CRITICAL' : signal.severity >= 3 ? 'ELEVATED' : 'NORMAL') : 'NORMAL',
    severity: signal.severity,
    event_time: signal.published_at,
    category: signal.signal_type,
    is_active: true,
    latitude: signal.latitude,
    longitude: signal.longitude,
    source_name: signal.source_name,
    source_url: signal.source_url,
    relevance_score: signal.relevance_score,
    tags: signal.tags,
    raw_data: signal.raw_payload,
    dedupe_key: signal.dedupe_key,
    first_seen_at: signal.first_seen_at,
    last_seen_at: signal.last_seen_at,
    seen_count: signal.seen_count,
  }));

  // 分批upsert避免超出限制
  const batchSize = 50;
  let upsertedCount = 0;
  
  for (let i = 0; i < signalsToUpsert.length; i += batchSize) {
    const batch = signalsToUpsert.slice(i, i + batchSize);
    const { error } = await client
      .from('signals')
      .upsert(batch, { onConflict: 'dedupe_key' });
    
    if (error) {
      console.error(`[API] Batch upsert error at ${i}:`, error);
    } else {
      upsertedCount += batch.length;
    }
  }

  return upsertedCount;
}

// 记录爬取历史
async function recordCrawlHistory(
  status: string, 
  itemCount: number, 
  newCount: number,
  updatedCount: number,
  durationMs: number,
  errorMessage?: string
) {
  const client = getSupabaseClient();
  await client.from('crawl_history').insert({
    status,
    item_count: itemCount,
    new_count: newCount,
    updated_count: updatedCount,
    duration_ms: durationMs,
    error_message: errorMessage,
  });
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // 解析请求参数
  const { searchParams } = new URL(request.url);
  const timeoutMs = parseInt(searchParams.get('timeout') || '15000');
  const retries = parseInt(searchParams.get('retries') || '3');
  const concurrency = parseInt(searchParams.get('concurrency') || '4');

  const config: Partial<RequestConfig> = {
    timeoutMs,
    retries,
    concurrency,
  };

  try {
    console.log('[API] Starting scrape with config:', config);

    // 执行爬取
    const result = await scrapeWorldMonitor(
      config,
      loadExistingSignalsFromDB
    );

    // 保存到数据库
    const savedCount = await saveSignalsToDB(result.signals);
    console.log(`[API] Saved ${savedCount} signals to database`);

    // 记录历史
    await recordCrawlHistory(
      'success',
      result.signals.length,
      result.stats.newSignals,
      result.stats.updatedSignals,
      result.durationMs
    );

    return NextResponse.json({
      success: true,
      crawledAt: result.crawledAt,
      durationMs: result.durationMs,
      results: {
        events: {
          success: result.results.events.success,
          count: result.results.events.data.length,
          error: result.results.events.error,
          durationMs: result.results.events.durationMs,
          attempts: result.results.events.attemptCount,
        },
        outbreaks: {
          success: result.results.outbreaks.success,
          count: result.results.outbreaks.data.length,
          error: result.results.outbreaks.error,
          durationMs: result.results.outbreaks.durationMs,
          attempts: result.results.outbreaks.attemptCount,
        },
        rss: {
          success: result.results.rss.success,
          count: result.results.rss.data.length,
          error: result.results.rss.error,
          durationMs: result.results.rss.durationMs,
          attempts: result.results.rss.attemptCount,
        },
        signalMarkers: {
          success: result.results.signalMarkers.success,
          count: result.results.signalMarkers.data.length,
          error: result.results.signalMarkers.error,
          durationMs: result.results.signalMarkers.durationMs,
          attempts: result.results.signalMarkers.attemptCount,
        },
      },
      stats: result.stats,
      items: result.signals.slice(0, 100), // 限制返回数量避免响应过大
      meta: {
        apiDurationMs: Date.now() - startTime,
        savedToDb: savedCount,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API] Scrape failed:', error);

    await recordCrawlHistory(
      'error',
      0,
      0,
      0,
      Date.now() - startTime,
      errorMessage
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Scrape failed',
        details: errorMessage,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// 获取当前统计信息（不执行爬取）
export async function HEAD() {
  const stats = getCurrentStats();
  const signals = getAllStoredSignals().slice(0, 10);

  return NextResponse.json({
    stats,
    recentSignals: signals,
  });
}
