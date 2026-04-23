import { NextResponse } from 'next/server';

import { writeWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { syncWorldSourceKnowledge } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const allowModelRefresh =
      url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    const result = await syncWorldSourceKnowledge(scene, { allowModelRefresh });
    void writeWorldApiSnapshot(scene, 'source_status', result.source_knowledge);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync source knowledge state' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
