import { NextResponse } from 'next/server';

import { resolveRequestOrigin } from '@/lib/request-origin';
import { dashboardSignalMatchesScene } from '@/lib/world/dashboard-presentation';
import { getCachedWorldDashboardState, getWorldDashboardState } from '@/lib/world/runtime';
import type { WorldEvidenceSignal, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function dedupeSignals(signals: WorldEvidenceSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.id || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

async function readDashboard(scene: WorldScene, request: Request) {
  const cached = await getCachedWorldDashboardState(scene);
  if (cached) return cached;
  return getWorldDashboardState(scene, {
    requestOrigin: resolveRequestOrigin({ headers: request.headers, requestUrl: request.url }),
    allowModelRefresh: false,
  });
}

function toSignalCard(signal: WorldEvidenceSignal) {
  return {
    id: signal.id,
    title: signal.display_title || signal.title,
    summary: signal.summary || signal.display_summary || signal.urgency_reason || '',
    scene: signal.scene,
    display_level: signal.display_level,
    severity: signal.severity,
    region_label: signal.location_name || signal.region || signal.country || signal.scene,
    published_at: signal.published_at,
    updated_at: signal.published_at,
    tags: signal.tags || [],
    source_name: signal.source_name || null,
    url: signal.source_url || null,
    source_url: signal.source_url || null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const limit = parsePositiveInt(url.searchParams.get('limit'), 20, 100);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
    const dashboard = await readDashboard(scene, request);
    const signals = dedupeSignals([
      ...(dashboard.top_signals || []),
      ...(dashboard.graph_signals || []),
      ...(dashboard.knowledge_signals || []),
    ])
      .filter((signal) => scene === 'global' || dashboardSignalMatchesScene(signal, scene))
      .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime());

    return NextResponse.json(
      {
        generated_at: dashboard.generated_at,
        scene,
        limit,
        offset,
        total: signals.length,
        signals: signals.slice(offset, offset + limit).map(toSignalCard),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load world signals' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
