import { NextResponse } from 'next/server';

import { getWorldLiveBenchArena } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const arena = await getWorldLiveBenchArena(scene);
    return NextResponse.json({
      generated_at: arena.generated_at,
      odds_board: arena.odds_board,
      quality_board: arena.quality_board,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load livebench leaderboard' },
      { status: 500 },
    );
  }
}
