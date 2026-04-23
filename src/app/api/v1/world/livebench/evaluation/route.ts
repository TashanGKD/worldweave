import { NextResponse } from 'next/server';

import { getWorldLiveBenchEvaluation } from '@/lib/world/runtime';
import { readWorldApiSnapshot, writeWorldApiSnapshot } from '@/lib/world/api-snapshot';
import type { LiveBenchEvaluation, WorldScene } from '@/lib/world/types';

const EVALUATION_FAST_TIMEOUT_MS = 12000;
const EVALUATION_USER_FRESH_TIMEOUT_MS = 5000;
const EVALUATION_FRESH_TIMEOUT_MS = 45000;
const EVALUATION_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const freshRequested = url.searchParams.get('fresh') === '1';
    const batchRefresh = request.headers.get('x-world-batch-refresh') === '1';
    const bypassSnapshot = freshRequested || batchRefresh;
    const snapshot = await readWorldApiSnapshot<LiveBenchEvaluation>(
      scene,
      'livebench_evaluation',
      EVALUATION_SNAPSHOT_MAX_AGE_MS,
    );
    if (!bypassSnapshot) {
      if (snapshot) {
        return NextResponse.json(snapshot, {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-snapshot': '1',
          },
        });
      }
    }

    const timeoutMs = batchRefresh
      ? EVALUATION_FRESH_TIMEOUT_MS
      : freshRequested
        ? EVALUATION_USER_FRESH_TIMEOUT_MS
        : EVALUATION_FAST_TIMEOUT_MS;
    const evaluation = await Promise.race([
      getWorldLiveBenchEvaluation(scene),
      timeout<LiveBenchEvaluation | null>(timeoutMs, null),
    ]);
    if (!evaluation) {
      if (snapshot) {
        return NextResponse.json(snapshot, {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-snapshot': '1',
            'x-world-fresh-fallback': 'cached-timeout',
          },
        });
      }
      return NextResponse.json(
        { error: 'LiveBench evaluation is warming; retry after the next background snapshot.' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }
    void writeWorldApiSnapshot(scene, 'livebench_evaluation', evaluation);
    return NextResponse.json(evaluation, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'x-world-snapshot': '0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load livebench evaluation' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
