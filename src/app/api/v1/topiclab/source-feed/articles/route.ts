import { NextResponse } from 'next/server';

import { resolveRequestOrigin } from '@/lib/request-origin';
import { getCachedWorldDashboardState, getWorldDashboardState } from '@/lib/world/runtime';
import type { WorldEvidenceSignal, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TopicLabSourceFeedArticle {
  id: number;
  title: string;
  source_feed_name: string;
  source_type: string;
  category: string;
  url: string;
  pic_url: string | null;
  description: string;
  publish_time: string;
  created_at: string;
  linked_topic_id: string | null;
  linked_topic_posts_count: number;
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function parseOffset(url: URL, limit: number) {
  const explicitOffset = Number(url.searchParams.get('offset') || NaN);
  if (Number.isFinite(explicitOffset) && explicitOffset >= 0) return Math.floor(explicitOffset);
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 10000);
  return (page - 1) * limit;
}

function stableNumericId(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function dedupeSignals(signals: WorldEvidenceSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.id || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function topicLabCategory(signal: WorldEvidenceSignal) {
  const scene = signal.scene || 'global';
  if (scene === 'technology') return 'AI 技术';
  if (scene === 'finance') return '市场';
  if (scene === 'health') return '公共卫生';
  if (scene === 'war') return '全球情报';
  if (scene === 'capacity') return '供应链';
  return '全球情报';
}

function normalizeSearchText(value: string | null) {
  return (value || '').trim().toLowerCase();
}

function signalMatchesQuery(signal: WorldEvidenceSignal, query: string) {
  if (!query) return true;
  const haystack = [
    signal.display_title,
    signal.title,
    signal.display_summary,
    signal.summary,
    signal.urgency_reason,
    signal.location_name,
    signal.region,
    signal.country,
    signal.scene,
    ...(signal.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function signalMatchesCategory(signal: WorldEvidenceSignal, category: string) {
  if (!category || category === 'all') return true;
  const normalized = category.toLowerCase();
  return (
    signal.scene?.toLowerCase() === normalized ||
    topicLabCategory(signal).toLowerCase() === normalized ||
    signal.tags?.some((tag) => tag.toLowerCase() === normalized)
  );
}

function signalMatchesSource(signal: WorldEvidenceSignal, source: string) {
  if (!source || source === 'all') return true;
  const normalized = source.toLowerCase();
  const haystack = [
    signal.source_name,
    signal.source_url,
    ...(signal.tags || []),
    ...(signal.alignment_tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

function toTopicLabArticle(input: {
  signal: WorldEvidenceSignal;
  origin: string | null;
  sourceType: string;
  sourceFeedName: string;
}): TopicLabSourceFeedArticle {
  const title = input.signal.display_title || input.signal.title || '世界脉络信号';
  const description = input.signal.summary || input.signal.display_summary || input.signal.urgency_reason || '';
  const url =
    input.signal.source_url ||
    (input.origin ? `${input.origin}/?scene=${encodeURIComponent(input.signal.scene || 'global')}` : '');
  return {
    id: stableNumericId(input.signal.id),
    title,
    source_feed_name: input.signal.source_name || input.sourceFeedName,
    source_type: input.sourceType,
    category: topicLabCategory(input.signal),
    url,
    pic_url: null,
    description,
    publish_time: input.signal.published_at,
    created_at: input.signal.published_at,
    linked_topic_id: null,
    linked_topic_posts_count: 0,
  };
}

async function readDashboardForTopicLab(scene: WorldScene, request: Request) {
  const cached = await getCachedWorldDashboardState(scene);
  if (cached) return cached;
  return getWorldDashboardState(scene, {
    requestOrigin: resolveRequestOrigin({ headers: request.headers, requestUrl: request.url }),
    allowModelRefresh: false,
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const limit = parsePositiveInt(url.searchParams.get('limit') || url.searchParams.get('page_size'), 20, 100);
    const offset = parseOffset(url, limit);
    const page = Math.floor(offset / limit) + 1;
    const query = normalizeSearchText(url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('search'));
    const category = normalizeSearchText(url.searchParams.get('category') || url.searchParams.get('tab'));
    const source = normalizeSearchText(url.searchParams.get('source') || url.searchParams.get('source_name'));
    const sourceType = url.searchParams.get('source_type') || 'worldweave-signal';
    const sourceFeedName = url.searchParams.get('source_feed_name') || '世界脉络';
    const origin = resolveRequestOrigin({ headers: request.headers, requestUrl: request.url });
    const dashboard = await readDashboardForTopicLab(scene, request);
    const signals = dedupeSignals([
      ...(dashboard.top_signals || []),
      ...(dashboard.graph_signals || []),
      ...(dashboard.knowledge_signals || []),
    ]).sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime());
    const filteredSignals = signals.filter(
      (signal) => signalMatchesQuery(signal, query) && signalMatchesCategory(signal, category) && signalMatchesSource(signal, source),
    );
    const list = filteredSignals
      .map((signal) => toTopicLabArticle({ signal, origin, sourceType, sourceFeedName }))
      .slice(offset, offset + limit);

    return NextResponse.json(
      {
        list,
        limit,
        offset,
        page,
        page_size: limit,
        total: filteredSignals.length,
        has_more: offset + list.length < filteredSignals.length,
        filters: {
          q: query,
          category,
          source,
          scene,
          source_type: sourceType,
          source_feed_name: sourceFeedName,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load TopicLab source-feed bridge' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
