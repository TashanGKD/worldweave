import { NextResponse } from 'next/server';

import { readAseanTopic } from '@/lib/world/asean-page-data';
import { buildAseanDecisionModel } from '@/lib/world/asean-decision-model';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadDecisionModel(request: Request) {
  const url = new URL(request.url);
  const topic = await readAseanTopic({
    request,
    limit: 80,
    force: url.searchParams.get('fresh') === '1',
  });
  const result = await buildAseanDecisionModel(topic, {
    force: url.searchParams.get('refresh') === '1',
  });
  const publicResult = { ...result } as Record<string, unknown>;
  delete publicResult.configured;
  delete publicResult.model;
  delete publicResult.mode;
  delete publicResult.fallback;

  return NextResponse.json(publicResult, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export async function GET(request: Request) {
  try {
    return await loadDecisionModel(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ASEAN decision model' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    return await loadDecisionModel(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh ASEAN decision model' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
