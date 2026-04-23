import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils, EmbeddingClient } from 'coze-coding-dev-sdk';
import type { UnifiedSignal } from '@/lib/wm-scraper';

// 声明全局缓存（与 embeddings/sync 共享）
declare global {
  var signalEmbeddingCache: Map<string, { embedding: number[]; text: string; signal: UnifiedSignal }>;
}

if (!global.signalEmbeddingCache) {
  global.signalEmbeddingCache = new Map();
}

const embeddingCache = global.signalEmbeddingCache;
const ALLOW_ON_DEMAND_RAG_EMBEDDING = process.env.WORLD_ALLOW_ON_DEMAND_RAG_EMBEDDING === '1';

function tokenizeForSearch(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  ];
}

function lexicalScore(query: string, text: string) {
  const queryTokens = tokenizeForSearch(query);
  if (queryTokens.length === 0) return 0;
  const haystack = ` ${text.toLowerCase()} `;
  const hits = queryTokens.filter((token) => haystack.includes(token)).length;
  return hits / queryTokens.length;
}

// 余弦相似度计算
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// 检索相关信源
async function retrieveRelevantSignals(
  query: string,
  topK: number = 5,
): Promise<Array<{ signal: UnifiedSignal; score: number }>> {
  if (embeddingCache.size === 0) {
    console.log('[Chat RAG] Cache is empty');
    return [];
  }

  if (!ALLOW_ON_DEMAND_RAG_EMBEDDING) {
    const results = Array.from(embeddingCache.values())
      .map((data) => ({
        signal: data.signal,
        score: lexicalScore(query, data.text),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    console.log(`[Chat RAG] Retrieved ${results.length} lexical matches from ${embeddingCache.size} cached`);
    return results;
  }

  const embeddingClient = new EmbeddingClient();
  
  try {
    const queryEmbedding = await embeddingClient.embedText(query);

    const similarities = Array.from(embeddingCache.values()).map((data) => ({
      signal: data.signal,
      score: cosineSimilarity(queryEmbedding, data.embedding),
    }));

    similarities.sort((a, b) => b.score - a.score);
    const results = similarities.slice(0, topK).filter(s => s.score > 0.3);
    
    console.log(`[Chat RAG] Retrieved ${results.length} relevant signals from ${embeddingCache.size} cached`);
    return results;
  } catch (err) {
    console.error('[Chat RAG] Embedding query failed:', err);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 1. RAG检索相关信源
    const relevantSignals = await retrieveRelevantSignals(message, 5);
    const hasRelevantSignals = relevantSignals.length > 0;

    // 2. 构建上下文
    const context = hasRelevantSignals
      ? relevantSignals.map((s, i) => 
          `[${i + 1}] ${s.signal.title} (${s.signal.country || s.signal.location_name || 'Unknown'}, 严重度L${s.signal.severity || 'N/A'}, 相关度${(s.score * 100).toFixed(1)}%)\n${s.signal.summary || ''}`
        ).join('\n\n')
      : '暂无高度相关的实时信源数据。';

    const systemPrompt = `你是 Digital Twin of the World 智能分析助手，专门基于实时信源数据回答用户问题。

## 当前相关信源
${context}

## 回答要求
1. **必须优先基于提供的信源数据进行分析**，信源是实时采集的全球事件报告
2. 如涉及地区，指明具体位置和国家
3. 如信号有严重程度评级(L1-L4)，说明风险级别含义：
   - L4: 严重 - 需要立即关注的高风险事件
   - L3: 高关注 - 重要事件，建议持续监控
   - L2: 普通 - 一般性事件
   - L1: 低 - 低优先级信息
4. 保持客观、专业的分析语气，避免过度推测
5. 如信源不足以回答问题，明确告知并建议用户询问其他问题

## 引用格式要求（非常重要）
- 在回答中**必须使用 [数字] 标注引用来源**，如：根据最新报告 [1]，该地区风险等级为L4
- 每个关键结论后都要标注引用编号
- 可以同时引用多个信源，如 [1][2][3]
- 引用编号从1开始，对应上方信源列表顺序

## 回答结构建议
1. 先给出简明结论
2. 然后展开分析，包含地理位置、风险等级、事件背景等
3. 最后总结建议`;

    // 3. 使用最佳模型生成回答
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: message },
    ];

    const response = await llmClient.invoke(messages, {
      model: 'kimi-k2-5-260127',
      temperature: 0.6,
    });

    return NextResponse.json({
      response: response.content,
      sources: relevantSignals.map(s => ({
        id: s.signal.id,
        title: s.signal.title_zh || s.signal.title,
        url: s.signal.source_url,
        severity: s.signal.severity,
        location: [s.signal.location_name, s.signal.country].filter(Boolean).join(', '),
        score: s.score,
      })),
      retrieved: relevantSignals.length,
    });

  } catch (error) {
    console.error('[Chat RAG] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
