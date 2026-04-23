import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingClient } from 'coze-coding-dev-sdk';
import type { UnifiedSignal } from '@/lib/wm-scraper';

// 全局向量缓存（服务端内存）
declare global {
  var signalEmbeddingCache: Map<string, { embedding: number[]; text: string; signal: UnifiedSignal }>;
}

if (!global.signalEmbeddingCache) {
  global.signalEmbeddingCache = new Map();
}

const embeddingCache = global.signalEmbeddingCache;

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const allowBatchEmbedding =
      url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    if (!allowBatchEmbedding) {
      return NextResponse.json(
        {
          success: true,
          queued: true,
          cached: embeddingCache.size,
          message: 'Embedding refresh is handled by the batch refresh loop.',
        },
        { status: 202 },
      );
    }

    const { signals } = (await request.json()) as { signals?: UnifiedSignal[] };
    
    if (!signals || !Array.isArray(signals) || signals.length === 0) {
      return NextResponse.json({ error: 'Signals array is required' }, { status: 400 });
    }

    const embeddingClient = new EmbeddingClient();

    // 找出需要生成向量的信号
    const signalsNeedingEmbedding = signals.filter((s) => !embeddingCache.has(s.id));
    
    if (signalsNeedingEmbedding.length > 0) {
      // 分批处理，每批5个避免超时
      const batchSize = 5;
      for (let i = 0; i < signalsNeedingEmbedding.length; i += batchSize) {
        const batchSignals = signalsNeedingEmbedding.slice(i, i + batchSize);
        const texts = batchSignals.map(s => 
          `${s.title || ''} ${s.summary || ''} ${s.country || ''} ${s.location_name || ''}`.trim()
        );
        
        try {
          // 使用单条嵌入（更稳定）
          for (let j = 0; j < batchSignals.length; j++) {
            try {
              const embedding = await embeddingClient.embedText(texts[j]);
              embeddingCache.set(batchSignals[j].id, {
                embedding,
                text: texts[j],
                signal: batchSignals[j],
              });
            } catch (err) {
              console.error(`Embedding failed for signal ${batchSignals[j].id}:`, err);
            }
          }
        } catch (err) {
          console.error(`Batch ${i / batchSize} embedding failed:`, err);
        }
      }
    }

    // 清理过期缓存（保留最新的100条）
    if (embeddingCache.size > 150) {
      const entries = Array.from(embeddingCache.entries());
      const toDelete = entries.slice(0, entries.length - 100);
      toDelete.forEach(([key]) => embeddingCache.delete(key));
    }

    return NextResponse.json({
      success: true,
      cached: embeddingCache.size,
      newlyAdded: signalsNeedingEmbedding.length,
    });

  } catch (error) {
    console.error('[Embeddings Sync] Error:', error);
    return NextResponse.json(
      { error: 'Failed to sync embeddings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// 获取缓存状态
export async function GET() {
  return NextResponse.json({
    cachedCount: embeddingCache.size,
    batchOnly: true,
    ids: Array.from(embeddingCache.keys()).slice(0, 10),
  });
}
