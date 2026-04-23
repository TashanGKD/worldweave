import { NextResponse } from 'next/server';

import { syncWorldLiveBenchArena } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const allowModelRefresh =
      url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    return NextResponse.json(await syncWorldLiveBenchArena(scene, { allowModelRefresh }), {
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
