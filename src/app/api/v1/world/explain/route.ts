import { NextResponse } from 'next/server';

import { explainWorldPolicy } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    return NextResponse.json(await explainWorldPolicy(scene));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to explain world policy' },
      { status: 500 },
    );
  }
}
