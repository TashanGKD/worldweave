import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface TranslateRequest {
  texts: Array<{
    id: string;
    title: string;
    summary?: string;
  }>;
  targetLang?: string; // 默认 'zh'
}

interface TranslateResponse {
  translations: Array<{
    id: string;
    title_zh: string;
    summary_zh?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();
    const { texts } = body;

    if (!texts || texts.length === 0) {
      return NextResponse.json(
        { error: 'Texts array is required' },
        { status: 400 }
      );
    }

    // 限制批量翻译数量
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const allTranslations: TranslateResponse['translations'] = [];

    // 分批翻译
    for (const batch of batches) {
      const prompt = `请将以下新闻/事件标题和摘要翻译成中文。保持简洁、准确，符合新闻语言风格。

${batch.map((item, idx) => `
[${idx + 1}] 标题: ${item.title}
${item.summary ? `摘要: ${item.summary}` : ''}
`).join('\n')}

请按以下格式返回翻译结果：
${batch.map((item, idx) => `
[${idx + 1}] 标题: <中文标题>
${item.summary ? `摘要: <中文摘要>` : ''}
`).join('')}

注意：
1. 保留专有名词（人名、地名、组织名）的原文或通用译名
2. 摘要翻译要简洁，保留关键信息
3. 直接返回翻译结果，不要添加解释`;

      const messages = [
        { role: 'system' as const, content: '你是专业的中英翻译专家，擅长新闻和时事翻译。' },
        { role: 'user' as const, content: prompt },
      ];

      const response = await client.invoke(messages, {
        model: 'doubao-seed-1-6-lite-251015', // 使用轻量模型，快速响应
        temperature: 0.3, // 低温度，更确定性的翻译
      });

      // 解析翻译结果
      const parsed = parseTranslationResponse(response.content, batch);
      allTranslations.push(...parsed);
    }

    return NextResponse.json({ translations: allTranslations });

  } catch (error) {
    console.error('[Translate API] Error:', error);
    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// 解析 LLM 返回的翻译结果
function parseTranslationResponse(
  content: string, 
  originals: TranslateRequest['texts']
): TranslateResponse['translations'] {
  const translations: TranslateResponse['translations'] = [];
  
  for (let i = 0; i < originals.length; i++) {
    const pattern = new RegExp(`\\[${i + 1}\\]\\s*标题:\\s*(.+?)(?:\\n|$)(?:摘要:\\s*(.+?)(?:\\n|$))?`, 'i');
    const match = content.match(pattern);
    
    if (match) {
      translations.push({
        id: originals[i].id,
        title_zh: match[1]?.trim() || originals[i].title,
        summary_zh: match[2]?.trim() || originals[i].summary,
      });
    } else {
      // 解析失败时返回原文
      translations.push({
        id: originals[i].id,
        title_zh: originals[i].title,
        summary_zh: originals[i].summary,
      });
    }
  }
  
  return translations;
}

// 流式翻译（用于单个长文本）
export async function PUT(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages = [
      { role: 'system' as const, content: '你是专业的中英翻译专家。将以下内容翻译成中文，保持简洁准确。' },
      { role: 'user' as const, content: text },
    ];

    const stream = client.stream(messages, {
      model: 'doubao-seed-1-6-lite-251015',
      temperature: 0.3,
    });

    // 创建 ReadableStream
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content && typeof chunk.content === 'string') {
              controller.enqueue(new TextEncoder().encode(chunk.content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('[Translate Stream API] Error:', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    );
  }
}
