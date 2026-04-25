import { NextResponse } from 'next/server';

import {
  getCachedWorldDashboardState,
  getCachedWorldLiveBenchQuestionPreviews,
  getWorldLiveBenchQuestionPreviews,
} from '@/lib/world/runtime';
import { readWorldApiSnapshot, writeWorldApiSnapshot } from '@/lib/world/api-snapshot';
import type { LiveBenchQuestionPreview, LiveQuestionStatus, WorldScene } from '@/lib/world/types';

const QUESTIONS_FAST_TIMEOUT_MS = 10000;
const QUESTIONS_USER_FRESH_TIMEOUT_MS = 5000;
const QUESTIONS_FRESH_TIMEOUT_MS = 45000;
const QUESTIONS_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function cleanXiaFacingText(value: string | null | undefined) {
  const text = softenPlatformNames(value)
    .replace(/我现在偏向赞成/gu, '当前倾向赞成')
    .replace(/我现在偏向不赞成/gu, '当前倾向不赞成')
    .replace(/我现在更看重的是/gu, '关键在于')
    .replace(/我现在/gu, '当前')
    .replace(/我不会轻易/gu, '暂不宜')
    .replace(/在我看到/gu, '在看到')
    .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '出现新的$1信号。')
    .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '后续重点看是否影响$1。')
    .replace(/它未必最显眼，但这条线现在值得先补一笔?。?/gu, '这条线索值得补充观察。')
    .replace(/续写/gu, '更新')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/Manifold|Polymarket|Metaculus|Metaforecast|source_platform|origin_url|probability|概率|参与人数|成交量|流动性/i.test(text)) {
    return '主持人已整理题面、时间窗和结算口径，请按可见信源给出贴题判断。';
  }
  return text;
}

function softenPlatformNames(value: string | null | undefined) {
  return String(value || '')
    .replace(/\bMetaculus\b\s*社区?/giu, '预测社区')
    .replace(/\b(?:Manifold|Polymarket|Metaforecast)\b/giu, '公开题源');
}

function localizeEnglishDate(value: string) {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return value.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/giu,
    (_, month: string, day: string, year: string) => `${year}年${months[month.toLowerCase()]}月${Number(day)}日`,
  );
}

function cleanDateTarget(value: string) {
  return localizeEnglishDate(value)
    .replace(/\s*是否会发生[？?.。]?\s*$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanXiaTitle(value: string | null | undefined) {
  const stripped = softenPlatformNames(value)
    .replace(/^这道题在问[:：]?\s*/u, '')
    .replace(/\s*[（(]Style Control On[）)]/giu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const topAi = stripped.match(/^Will (.+?) be the top AI model on (.+?)(?: \((.+)\))?[。.]?$/i);
  if (topAi) return `${cleanDateTarget(topAi[2])}，${topAi[1]} 会登上 AI 模型榜首吗？`;
  const wti = stripped.match(/^Will WTI 原油.*?hit \((HIGH|LOW)\) \$?([\d.]+) in April[。.]?$/i);
  if (wti) return `4月内，WTI 原油会触及 ${wti[2]} 美元${wti[1].toUpperCase() === 'HIGH' ? '高点' : '低点'}吗？`;
  const iranMeeting = stripped.match(/^US x Iran diplomatic meeting by (.+?)[。.]?$/i);
  if (iranMeeting) return `美国和伊朗会在 ${cleanDateTarget(iranMeeting[1])} 前举行外交会面吗？`;
  const iranPeace = stripped.match(/^US x Iran permanent peace deal by (.+?)[。.]?$/i);
  if (iranPeace) return `美国和伊朗会在 ${cleanDateTarget(iranPeace[1])} 前达成永久和平协议吗？`;
  const iranUranium = stripped.match(/^US obtains Iranian enriched uranium by (.+?)[。.]?$/i);
  if (iranUranium) return `美国会在 ${cleanDateTarget(iranUranium[1])} 前取得伊朗浓缩铀吗？`;
  const nextIranMeeting = stripped.match(/^Will the next US x Iran diplomatic meeting be on (.+?)[。.]?$/i);
  if (nextIranMeeting) return `下一次美国和伊朗外交会面会在 ${cleanDateTarget(nextIranMeeting[1])} 举行吗？`;
  const anthropicLeak = stripped.match(/^will Anthropic have another leak in (.+?)[。.]?$/i);
  if (anthropicLeak) return `Anthropic 在 ${cleanDateTarget(anthropicLeak[1])} 还会发生一次信息泄漏吗？`;
  return localizeEnglishDate(stripped).replace(/\s*是否会发生[？?.。]?\s*(?=前)/gu, '');
}

function sanitizeQuestionPreview(preview: LiveBenchQuestionPreview): LiveBenchQuestionPreview {
  return {
    ...preview,
    title: cleanXiaTitle(preview.title),
    background: cleanXiaFacingText(preview.background),
    moderator_line: cleanXiaFacingText(preview.moderator_line),
    source_label: preview.source_label ? '公开题源' : preview.source_label,
  };
}

function toXiaFacingQuestionPreview(preview: LiveBenchQuestionPreview) {
  const safePreview = sanitizeQuestionPreview(preview);
  return {
    question_id: safePreview.question_id,
    status: safePreview.status,
    settlement_status: safePreview.settlement_status,
    title: cleanXiaTitle(safePreview.title),
    background: safePreview.background,
    region_label: safePreview.region_label,
    topic_label: safePreview.topic_label,
    resolve_at: safePreview.resolve_at,
    official_outcome: safePreview.official_outcome,
    official_resolved_at: safePreview.official_resolved_at,
    moderator_line: safePreview.moderator_line,
    evidence_count: safePreview.evidence_count,
    rule_count: safePreview.rule_count,
    discussion_count: safePreview.discussion_count,
    xia_count: safePreview.xia_count,
    missing_xia_count: safePreview.aggregate_vote?.missing_count || 0,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const status = (url.searchParams.get('status') as LiveQuestionStatus | null) || null;
    const xiaFacing = url.searchParams.get('audience') === 'xia';
    const questionId = url.searchParams.get('question_id');
    const freshRequested = url.searchParams.get('fresh') === '1';
    const batchRefresh = request.headers.get('x-world-batch-refresh') === '1';
    const bypassSnapshot = freshRequested || batchRefresh;
    const limitValue = Number(url.searchParams.get('limit') || 0);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 500) : 0;
    const normalizedStatus =
      status === 'active' || status === 'resolved' || status === 'watchlist' ? status : undefined;

    if (questionId) {
      const detailUrl = new URL(`/api/v1/world/livebench/questions/${encodeURIComponent(questionId)}`, url.origin);
      detailUrl.searchParams.set('scene', scene);
      if (xiaFacing) detailUrl.searchParams.set('audience', 'xia');
      const detailResponse = await fetch(detailUrl, { cache: 'no-store' });
      const detailBody = await detailResponse.text();
      return new NextResponse(detailBody, {
        status: detailResponse.status,
        headers: {
          'Content-Type': detailResponse.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-store, max-age=0',
          'x-world-detail-alias': 'query',
        },
      });
    }

    const dashboardFallback = async () => {
      const dashboard = await getCachedWorldDashboardState(scene);
      const pending = dashboard?.pending_question_previews || [];
      const resolved = dashboard?.resolved_question_previews || [];
      const fallback =
        normalizedStatus === 'active' || normalizedStatus === 'watchlist'
          ? pending.filter((question) => question.status === normalizedStatus)
          : normalizedStatus === 'resolved'
            ? resolved
            : [...pending, ...resolved];
      return limit ? fallback.slice(0, limit) : fallback;
    };
    const readSnapshotPreviews = async () => {
      const snapshotPreviews = await readWorldApiSnapshot<LiveBenchQuestionPreview[]>(
        scene,
        'livebench_questions',
        QUESTIONS_SNAPSHOT_MAX_AGE_MS,
      );
      if (!snapshotPreviews?.length) return [];
      return normalizedStatus
        ? snapshotPreviews.filter((question) => question.status === normalizedStatus)
        : snapshotPreviews;
    };
    const returnPreviews = (
      previews: LiveBenchQuestionPreview[],
      headers: Record<string, string>,
    ) => {
      const responsePreviews = (limit ? previews.slice(0, limit) : previews).map(sanitizeQuestionPreview);
      return NextResponse.json(xiaFacing ? responsePreviews.map(toXiaFacingQuestionPreview) : responsePreviews, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          ...headers,
        },
      });
    };

    if (!bypassSnapshot) {
      const snapshotPreviews = await readSnapshotPreviews();
      if (snapshotPreviews.length) return returnPreviews(snapshotPreviews, { 'x-world-snapshot': '1' });
    }

    const snapshotFallback = await readSnapshotPreviews();
    const timeoutMs = batchRefresh
      ? QUESTIONS_FRESH_TIMEOUT_MS
      : freshRequested
        ? QUESTIONS_USER_FRESH_TIMEOUT_MS
        : QUESTIONS_FAST_TIMEOUT_MS;
    const cachedPreviews = await Promise.race([
      getCachedWorldLiveBenchQuestionPreviews(scene, normalizedStatus),
      timeout(timeoutMs, []),
    ]);
    if (cachedPreviews.length > 0) {
      if (snapshotFallback.length > cachedPreviews.length) {
        return returnPreviews(snapshotFallback, {
          'x-world-snapshot': '1',
          'x-world-fresh-fallback': 'fuller-snapshot',
        });
      }
      void writeWorldApiSnapshot(scene, 'livebench_questions', cachedPreviews);
      return returnPreviews(cachedPreviews, { 'x-world-snapshot': '0' });
    }
    if (snapshotFallback.length) {
      return returnPreviews(snapshotFallback, {
        'x-world-snapshot': '1',
        'x-world-fresh-fallback': 'cached-timeout',
      });
    }
    const previews = await Promise.race([
      getWorldLiveBenchQuestionPreviews(scene, normalizedStatus),
      timeout(timeoutMs, []),
    ]);
    if (previews.length) {
      void writeWorldApiSnapshot(scene, 'livebench_questions', previews);
      return returnPreviews(previews, { 'x-world-snapshot': '0' });
    }
    return returnPreviews(await dashboardFallback(), { 'x-world-snapshot': '1', 'x-world-fresh-fallback': 'dashboard' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load livebench questions' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
