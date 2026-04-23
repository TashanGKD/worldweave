import { NextResponse } from 'next/server';
import { getSupabaseClient, hasSupabaseCredentials } from '@/storage/database/supabase-client';

interface SignalData {
  id: string;
  title: string;
  description: string;
  location: string;
  country: string;
  priority: 'CRITICAL' | 'ELEVATED' | 'NORMAL';
  eventTime: string;
  updatedAt: string;
  category: string;
  crawledAt: string;
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseCredentials()) {
      return NextResponse.json(
        {
          success: false,
          disabled: true,
          error: 'Signals database is not configured',
          details: 'COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY are not set',
        },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { signals }: { signals: SignalData[] } = body;
    
    if (!signals || !Array.isArray(signals)) {
      return NextResponse.json(
        { error: 'Invalid signals data' },
        { status: 400 }
      );
    }

    // 保存到数据库
    const client = getSupabaseClient();
    
    // 标记旧数据为非活跃
    await client.from('signals').update({ is_active: false }).neq('id', 'placeholder');
    
    // 插入新数据
    const signalsToInsert = signals.map(signal => ({
      title: signal.title,
      description: signal.description,
      location: signal.location,
      country: signal.country,
      priority: signal.priority,
      event_time: signal.eventTime,
      updated_at: signal.updatedAt,
      category: signal.category,
      is_active: true,
    }));
    
    const { error } = await client.from('signals').insert(signalsToInsert);
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      saved: signals.length,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET 端点 - 返回当前存储的信号数据
export async function GET() {
  try {
    if (!hasSupabaseCredentials()) {
      return NextResponse.json(
        {
          success: false,
          disabled: true,
          signals: [],
          stats: {
            total: 0,
            byPriority: {},
          },
          error: 'Signals database is not configured',
          details: 'COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY are not set',
        },
        { status: 503 },
      );
    }

    const client = getSupabaseClient();
    
    const { data: signals, error } = await client
      .from('signals')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }

    // 统计
    const priorityStats = signals?.reduce((acc, signal) => {
      acc[signal.priority] = (acc[signal.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      signals: signals || [],
      stats: {
        total: signals?.length || 0,
        byPriority: priorityStats || {},
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
