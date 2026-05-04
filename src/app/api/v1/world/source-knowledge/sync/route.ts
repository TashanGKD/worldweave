import { NextResponse } from 'next/server';

import { readWorldApiSnapshot, writeWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { isWorldRuntimeHeavyRefreshEnabled, syncWorldSourceKnowledge } from '@/lib/world/runtime';
import type { WorldScene, WorldSourceKnowledgeState } from '@/lib/world/types';

const SOURCE_SYNC_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const batchRequested = url.searchParams.get('batch') === '1' || request.headers.get('x-world-batch-refresh') === '1';
    const heavyRefreshAllowed = isWorldRuntimeHeavyRefreshEnabled() && batchRequested;
    if (!heavyRefreshAllowed) {
      const snapshot = await readWorldApiSnapshot<WorldSourceKnowledgeState>(
        scene,
        'source_status',
        SOURCE_SYNC_SNAPSHOT_MAX_AGE_MS,
      );
      return NextResponse.json(
        {
          ok: true,
          scene,
          deferred: true,
          reason: batchRequested
            ? 'heavy source sync is disabled for this web process'
            : 'source sync is handled by the background worker',
          source_knowledge: snapshot,
        },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-heavy-sync': 'deferred',
          },
        },
      );
    }
    const allowModelRefresh = true;
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
