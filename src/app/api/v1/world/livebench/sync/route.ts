import { NextResponse } from 'next/server';

import { deleteWorldApiSnapshots } from '@/lib/world/api-snapshot';
import { syncWorldLiveBenchArena } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const allowModelRefresh =
      url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    const result = await syncWorldLiveBenchArena(scene, { allowModelRefresh });
    await deleteWorldApiSnapshots(scene, ['livebench_questions', 'livebench_evaluation']);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync livebench arena' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
