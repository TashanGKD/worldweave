import { NextResponse } from 'next/server';

import { readAseanTopic } from '@/lib/world/asean-page-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 40, 100);
    const topic = await readAseanTopic({
      request,
      limit,
      force: url.searchParams.get('fresh') === '1',
    });

    return NextResponse.json(
      {
        ...topic,
        note: 'questions 为东盟专题独立的量化区间研判问题，供专题复核和后续结算规则设计使用。',
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ASEAN topic' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
