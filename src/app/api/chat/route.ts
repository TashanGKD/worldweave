import { NextRequest, NextResponse } from 'next/server';

interface ChatRequest {
  message: string;
  signals: Array<{
    title: string;
    summary: string;
    location_name: string;
    country: string;
    severity: number | null;
    published_at: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, signals } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // 构建上下文 - 基于最近的信号数据
    const context = signals.slice(0, 10).map((s, i) => 
      `[${i + 1}] ${s.title} (${s.country || s.location_name || 'Unknown'}, 严重度: ${s.severity || 'N/A'})`
    ).join('\n');

    const systemPrompt = `你是 Digital Twin of the World 智能分析助手。基于以下实时信源数据回答用户问题：

当前活跃信号：
${context || '暂无活跃信号'}

回答要求：
1. 基于提供的信源数据进行分析
2. 如涉及地区，请指明具体位置
3. 如信号有严重程度评级，请说明
4. 保持客观、专业的分析语气
5. 如无法从信源中找到答案，请明确告知`;

    // 调用 LLM API
    const response = await fetch('https://api.coze.cn/v3/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.COZE_API_KEY || ''}`,
      },
      body: JSON.stringify({
        bot_id: process.env.COZE_BOT_ID || '',
        user_id: 'dtw_user',
        additional_messages: [
          {
            role: 'system',
            content: systemPrompt,
            content_type: 'text',
          },
          {
            role: 'user',
            content: message,
            content_type: 'text',
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      // 如果 API 调用失败，返回基于规则的回复
      return NextResponse.json({
        response: generateFallbackResponse(message, signals),
      });
    }

    const result = await response.json();
    
    return NextResponse.json({
      response: result.message?.content || generateFallbackResponse(message, signals),
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 基于规则的备用回复生成
function generateFallbackResponse(message: string, signals: ChatRequest['signals']): string {
  const lowerMsg = message.toLowerCase();
  
  // 统计信息
  const criticalCount = signals.filter(s => (s.severity || 0) >= 4).length;
  const elevatedCount = signals.filter(s => (s.severity || 0) === 3).length;
  
  // 最近的高严重度事件
  const recentCritical = signals
    .filter(s => (s.severity || 0) >= 3)
    .slice(0, 3);

  if (lowerMsg.includes('多少') || lowerMsg.includes('数量') || lowerMsg.includes('统计')) {
    return `当前监控到 ${signals.length} 条活跃信号，其中严重级别(L4+): ${criticalCount} 条，高关注级别(L3): ${elevatedCount} 条。`;
  }

  if (lowerMsg.includes('严重') || lowerMsg.includes('紧急') || lowerMsg.includes('critical')) {
    if (recentCritical.length === 0) {
      return '当前没有检测到严重级别的信号。';
    }
    return `最近的高严重度信号包括：\n${recentCritical.map((s, i) => `${i + 1}. ${s.title} (${s.country || s.location_name})`).join('\n')}`;
  }

  if (lowerMsg.includes('地区') || lowerMsg.includes('哪里') || lowerMsg.includes('位置')) {
    const countries = [...new Set(signals.map(s => s.country).filter(Boolean))];
    return `当前信号涉及的地区包括：${countries.slice(0, 10).join('、')}${countries.length > 10 ? ' 等' : ''}。`;
  }

  // 通用回复
  return `我分析了当前的 ${signals.length} 条实时信号。最近的高关注事件包括：\n${recentCritical.map((s, i) => `${i + 1}. ${s.title}`).join('\n') || '暂无高严重度事件'}\n\n您可以询问具体地区、事件类型或严重程度相关的信息。`;
}
