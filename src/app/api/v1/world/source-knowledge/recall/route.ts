import { NextResponse } from 'next/server';

import { resolveRequestOrigin } from '@/lib/request-origin';
import { getCachedWorldDashboardState, getWorldDashboardState } from '@/lib/world/runtime';
import type { WorldEvidenceSignal, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

async function readDashboard(scene: WorldScene, request: Request) {
  const cached = await getCachedWorldDashboardState(scene);
  if (cached) return cached;
  return getWorldDashboardState(scene, {
    requestOrigin: resolveRequestOrigin({ headers: request.headers, requestUrl: request.url }),
    allowModelRefresh: false,
  });
}

function dedupeSignals(signals: WorldEvidenceSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.id || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function tokenize(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}\u4e00-\u9fff]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function scoreSignal(signal: WorldEvidenceSignal, tokens: string[]) {
  const haystack = [
    signal.title,
    signal.display_title,
    signal.summary,
    signal.display_summary,
    signal.location_name,
    signal.country,
    signal.region,
    ...(signal.tags || []),
    ...(signal.alignment_tags || []),
  ]
    .join(' ')
    .toLowerCase();
  const lexicalScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
  const recencyScore = Number.isFinite(new Date(signal.published_at).getTime())
    ? Math.max(0, 1 - (Date.now() - new Date(signal.published_at).getTime()) / (30 * 24 * 60 * 60 * 1000))
    : 0;
  return lexicalScore * 10 + (signal.severity || 0) + recencyScore;
}

function toRecallCard(signal: WorldEvidenceSignal, score: number) {
  return {
    id: signal.id,
    title: signal.display_title || signal.title,
    summary: signal.display_summary || signal.summary || signal.urgency_reason || '',
    scene: signal.scene,
    display_level: signal.display_level,
    severity: signal.severity,
    region_label: signal.location_name || signal.region || signal.country || signal.scene,
    published_at: signal.published_at,
    tags: signal.tags || [],
    url: signal.source_url || null,
    recall_score: Number(score.toFixed(3)),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const query = (url.searchParams.get('query') || url.searchParams.get('q') || '').trim();
    const limit = parsePositiveInt(url.searchParams.get('limit'), 8, 50);
    const dashboard = await readDashboard(scene, request);
    const tokens = tokenize(query);
    const signals = dedupeSignals([
      ...(dashboard.knowledge_signals || []),
      ...(dashboard.top_signals || []),
      ...(dashboard.graph_signals || []),
    ]);
    const scored = signals
      .map((signal) => ({ signal, score: scoreSignal(signal, tokens) }))
      .filter((entry) => (tokens.length > 0 ? entry.score > 0 : true))
      .sort((left, right) => right.score - left.score || new Date(right.signal.published_at).getTime() - new Date(left.signal.published_at).getTime())
      .slice(0, limit);

    return NextResponse.json(
      {
        generated_at: dashboard.generated_at,
        scene,
        query,
        limit,
        token_count: tokens.length,
        total_considered: signals.length,
        recalled_count: scored.length,
        signals: scored.map((entry) => toRecallCard(entry.signal, entry.score)),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recall source signals' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
