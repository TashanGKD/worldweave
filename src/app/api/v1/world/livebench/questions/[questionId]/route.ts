import { NextResponse } from 'next/server';

import { readWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { getCachedLiveBenchQuestionDetail } from '@/lib/world/livebench';
import {
  getCachedWorldLiveBenchQuestionPreviews,
  getWorldLiveBenchQuestionDetail,
} from '@/lib/world/runtime';
import type { LiveBenchQuestionPreview, WorldScene } from '@/lib/world/types';

const QUESTION_DETAIL_FAST_TIMEOUT_MS = 3000;
const QUESTION_DETAIL_CACHE_TIMEOUT_MS = 1800;
const QUESTION_DETAIL_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
type LooseRecord = Record<string, unknown>;
type LoosePosition = Record<string, unknown>;

type XiaQuestionDetail = LooseRecord & {
  aggregate_vote?: LooseRecord;
  question?: LooseRecord;
  preview?: LooseRecord;
  moderator_brief?: LooseRecord;
  external_discussion?: LooseRecord;
  xia_positions?: {
    yes?: LoosePosition[];
    no?: LoosePosition[];
    unclear?: LoosePosition[];
  };
  evidence?: unknown;
  settlement?: unknown;
  generated_at?: unknown;
  scene?: unknown;
};

type RecallCard = {
  id?: string;
  title?: string;
  summary?: string;
  url?: string | null;
  published_at?: string | null;
  region_label?: string | null;
  source_name?: string | null;
};

function asOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function questionIdsMatch(left: string | null | undefined, right: string) {
  if (!left) return false;
  try {
    return decodeURIComponent(left) === right || left === right;
  } catch {
    return left === right;
  }
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

function compactXiaText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value : fallback;
  return text.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function buildPeerDigest(positions: LoosePosition[] | undefined) {
  return (positions || [])
    .map((position) => compactXiaText(position.human_readable_why || position.human_readable_prediction))
    .filter(Boolean)
    .slice(0, 3);
}

function stripInternalQuestionFields(question: LooseRecord) {
  const {
    source_platform: _sourcePlatform,
    source_question_id: _sourceQuestionId,
    origin_url: _originUrl,
    discovered_via: _discoveredVia,
    platform_probability_yes: _platformProbabilityYes,
    external_probability_yes: _externalProbabilityYes,
    ...rest
  } = question;
  return rest;
}

function stripInternalPositionFields(position: LoosePosition) {
  const {
    probability_yes: _probabilityYes,
    origin_url: _originUrl,
    source: _source,
    ...rest
  } = position;
  return rest;
}

async function findQuestionPreviewFallback(scene: WorldScene, questionId: string) {
  const snapshot = await readWorldApiSnapshot<LiveBenchQuestionPreview[]>(
    scene,
    'livebench_questions',
    QUESTION_DETAIL_SNAPSHOT_MAX_AGE_MS,
  );
  const snapshotMatch = snapshot?.find((preview) => questionIdsMatch(preview.question_id, questionId));
  if (snapshotMatch) return snapshotMatch;
  const fromRuntime = await Promise.race([
    getCachedWorldLiveBenchQuestionPreviews(scene),
    timeout<LiveBenchQuestionPreview[]>(1000, []),
  ]);
  return fromRuntime.find((preview) => questionIdsMatch(preview.question_id, questionId)) || null;
}

async function readPreviewSourceFeedEvidence(request: Request, scene: WorldScene, preview: LiveBenchQuestionPreview) {
  const query = [
    preview.title,
    preview.background,
    preview.topic_label,
    preview.region_label,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
  const isAiQuestion = /ai|llm|model|agent|openai|anthropic|claude|chatgpt|gemini|codex|人工智能|大模型|智能体|模型/i.test(query);
  try {
    const url = new URL('/api/v1/topiclab/source-feed/articles', request.url);
    url.searchParams.set('scene', isAiQuestion ? 'tech-ai' : scene);
    if (isAiQuestion) {
      url.searchParams.set('source', 'aihot');
    } else if (query.trim()) {
      url.searchParams.set('q', query);
    }
    url.searchParams.set('limit', '6');
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { list?: Array<Record<string, unknown>> };
    return Array.isArray(body.list)
      ? body.list.map((item) => ({
          id: typeof item.id === 'number' || typeof item.id === 'string' ? String(item.id) : undefined,
          title: typeof item.title === 'string' ? item.title : undefined,
          summary: typeof item.description === 'string' ? item.description : undefined,
          url: typeof item.url === 'string' ? item.url : null,
          published_at: typeof item.publish_time === 'string' ? item.publish_time : null,
          source_name: typeof item.source_feed_name === 'string' ? item.source_feed_name : 'source-feed',
        }))
      : [];
  } catch {
    return [];
  }
}

function buildPreviewFallbackDetail(
  scene: WorldScene,
  preview: LiveBenchQuestionPreview,
  sourceFeedSignals: RecallCard[] = [],
): XiaQuestionDetail {
  const aggregateVote = preview.aggregate_vote || {};
  const brief = cleanXiaFacingText(preview.moderator_line || preview.background);
  const references = sourceFeedSignals.slice(0, 6).map((signal, index) => ({
    ref_id: `[${index + 1}]`,
    label: signal.title || `信源线索 ${index + 1}`,
    url: signal.url || '',
    source_name: signal.source_name || 'source-feed',
    source_kind: 'signal' as const,
    recall_role: 'source-feed' as const,
    published_at: signal.published_at || null,
    signal_id: signal.id || null,
    note: signal.summary || signal.region_label || null,
  }));
  const ruleReference = {
    ref_id: '[rule]',
    label: '题面与结算规则',
    url: String(preview.href || ''),
    source_name: '题目规则',
    source_kind: 'question_rule' as const,
    recall_role: 'question-rule' as const,
    published_at: preview.resolve_at || null,
    signal_id: null,
    note: cleanXiaFacingText(preview.background || preview.moderator_line),
  };
  return {
    generated_at: new Date().toISOString(),
    scene,
    question: {
      question_id: preview.question_id,
      href: preview.href,
      status: preview.status,
      settlement_status: preview.settlement_status,
      title: cleanXiaTitle(preview.title),
      background: cleanXiaFacingText(preview.background),
      region_label: preview.region_label,
      topic_label: preview.topic_label,
      resolve_at: preview.resolve_at,
      official_outcome: preview.official_outcome,
      official_resolved_at: preview.official_resolved_at,
    },
    preview: {
      ...preview,
      title: cleanXiaTitle(preview.title),
      background: cleanXiaFacingText(preview.background),
      moderator_line: brief,
      source_label: preview.source_label ? '公开题源' : preview.source_label,
    },
    moderator_brief: {
      summary: brief || '主持人已整理题面、时间窗和结算口径，请按可见信源给出贴题判断。',
      brief: brief || '主持人已整理题面、时间窗和结算口径，请按可见信源给出贴题判断。',
      resolution_rule: '以题目结算口径为准；结算前只提交基于当时可见信息的判断。',
      current_bias: brief || '当前需要先补充信源，再形成判断。',
      watch_for: ['官方结算口径', '时间窗内的新信号', '与题面直接相关的公开更新'],
      key_turning_points: ['官方口径变化', '强信源反向更新', '临近结算时仍缺少直接证据'],
      citation_ids: references.map((reference) => reference.signal_id).filter(Boolean),
    },
    external_discussion: {
      summary: '当前题池只提供摘要上下文；请先查询近 30 天信源，再按题面和结算口径判断。',
      entries: [],
    },
    xia_positions: {
      yes: [],
      no: [],
      unclear: [],
    },
    aggregate_vote: {
      side: aggregateVote.side,
      participant_count: aggregateVote.participant_count || preview.xia_count || 0,
      missing_count: aggregateVote.missing_count || 0,
      dispersion: aggregateVote.stddev || aggregateVote.spread || null,
    },
    evidence: [
      references.length
        ? {
            role: 'source-feed',
            title: 'source-feed 近期信源',
            description: '围绕题面、地区和主题读取的近 30 天信源。先看这些线索，再形成判断。',
            total_count: references.length,
            visible_count: references.length,
            references,
          }
        : {
            role: 'question-rule',
            title: '题面与规则',
            description: 'source-feed 暂时没有命中时，先以题面、时间窗和结算规则作为最低限度依据。',
            total_count: 1,
            visible_count: 1,
            references: [ruleReference],
          },
    ],
    settlement: {
      official_outcome: preview.official_outcome,
      official_resolved_at: preview.official_resolved_at,
      platform_brier_score: null,
      platform_hit: null,
      replay_summary: preview.official_outcome ? '该题已结算，可结合当时信源回看判断是否稳健。' : '该题尚未结算。',
      xia_scores: [],
    },
  };
}

function toXiaFacingQuestionDetail(detail: XiaQuestionDetail) {
  const aggregateVote = detail.aggregate_vote || {};
  const preview = detail.preview || {};
  const moderatorBrief = detail.moderator_brief || {};
  const peerDigest = {
    yes: buildPeerDigest(detail.xia_positions?.yes),
    no: buildPeerDigest(detail.xia_positions?.no),
    unclear: buildPeerDigest(detail.xia_positions?.unclear),
  };
  return {
    generated_at: detail.generated_at,
    scene: detail.scene,
    question: detail.question ? stripInternalQuestionFields(detail.question) : detail.question,
    preview: detail.preview
      ? {
          question_id: preview.question_id,
          status: preview.status,
          settlement_status: preview.settlement_status,
          title: cleanXiaTitle(asOptionalString(preview.title)),
          background: preview.background,
          region_label: preview.region_label,
          topic_label: preview.topic_label,
          resolve_at: preview.resolve_at,
          official_outcome: preview.official_outcome,
          official_resolved_at: preview.official_resolved_at,
          moderator_line: cleanXiaFacingText(asOptionalString(preview.moderator_line)),
          evidence_count: preview.evidence_count,
          rule_count: preview.rule_count,
          discussion_count: preview.discussion_count,
          xia_count: preview.xia_count,
          missing_xia_count: aggregateVote.missing_count || 0,
        }
      : detail.preview,
    moderator_brief: {
      ...moderatorBrief,
      brief: cleanXiaFacingText(asOptionalString(moderatorBrief.brief)),
      current_bias: cleanXiaFacingText(asOptionalString(moderatorBrief.current_bias)),
      key_turning_points: Array.isArray(moderatorBrief.key_turning_points)
        ? moderatorBrief.key_turning_points.map((item) => cleanXiaFacingText(asOptionalString(item)))
        : moderatorBrief.key_turning_points,
    },
    external_discussion: detail.external_discussion,
    xia_positions: {
      yes: (detail.xia_positions?.yes || []).map(stripInternalPositionFields),
      no: (detail.xia_positions?.no || []).map(stripInternalPositionFields),
      unclear: (detail.xia_positions?.unclear || []).map(stripInternalPositionFields),
    },
    aggregate_vote: {
      side: aggregateVote.side,
      participant_count: aggregateVote.participant_count,
      missing_count: aggregateVote.missing_count,
      dispersion: aggregateVote.dispersion,
    },
    learning_context: {
      sequence: [
        '先基于信源和题面写下初判。',
        '再读主持人串讲、背景材料、其他虾分歧和模型总票方向。',
        '最后提交是/不是、理由、改判条件，并在结算后复盘。',
      ],
      host_background: compactXiaText(moderatorBrief.summary),
      platform_background: compactXiaText(detail.external_discussion?.summary),
      peer_digest: peerDigest,
      aggregate_direction: {
        side: aggregateVote.side,
        participant_count: aggregateVote.participant_count,
        missing_count: aggregateVote.missing_count,
        dispersion: aggregateVote.dispersion,
      },
      final_vote_hint: '最终判断可以吸收复核材料，但理由要回到信源、规则、时间窗和改判条件。',
    },
    evidence: detail.evidence,
    settlement: detail.settlement,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const url = new URL(request.url);
    const scene = (url.searchParams.get('scene') as WorldScene | null) || 'global';
    const xiaFacing = url.searchParams.get('audience') === 'xia';
    const { questionId } = await context.params;
    const pathQuestionId = questionId || url.pathname.split('/').filter(Boolean).pop() || '';
    const decodedQuestionId = decodeURIComponent(pathQuestionId);
    if (xiaFacing) {
      const previewFallback = await findQuestionPreviewFallback(scene, decodedQuestionId);
      if (previewFallback) {
        const sourceFeedSignals = await readPreviewSourceFeedEvidence(request, scene, previewFallback);
        const fallbackDetail = buildPreviewFallbackDetail(scene, previewFallback, sourceFeedSignals);
        return NextResponse.json(toXiaFacingQuestionDetail(fallbackDetail), {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-detail-source': sourceFeedSignals.length ? 'preview-source-feed' : 'preview-fallback',
          },
        });
      }
    }
    const cachedDetailPromise = getCachedLiveBenchQuestionDetail(scene, decodedQuestionId).catch(() => null);
    const cachedDetail = await Promise.race([
      cachedDetailPromise,
      timeout<Record<string, unknown> | null>(QUESTION_DETAIL_CACHE_TIMEOUT_MS, null),
    ]);
    if (cachedDetail) {
      return NextResponse.json(xiaFacing ? toXiaFacingQuestionDetail(cachedDetail as unknown as XiaQuestionDetail) : cachedDetail, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'x-world-detail-source': 'cache',
        },
      });
    }
    if (xiaFacing) {
      const previewFallback = await findQuestionPreviewFallback(scene, decodedQuestionId);
      if (previewFallback) {
        const fallbackDetail = buildPreviewFallbackDetail(scene, previewFallback);
        return NextResponse.json(toXiaFacingQuestionDetail(fallbackDetail), {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-detail-source': 'preview-fallback',
          },
        });
      }
    }
    const liveDetail = await Promise.race([
      getWorldLiveBenchQuestionDetail(scene, decodedQuestionId),
      timeout<Record<string, unknown> | null>(QUESTION_DETAIL_FAST_TIMEOUT_MS, null),
    ]);
    const detail = liveDetail || (await cachedDetailPromise);
    if (!detail) {
      const previewFallback = await findQuestionPreviewFallback(scene, decodedQuestionId);
      if (previewFallback) {
        const fallbackDetail = buildPreviewFallbackDetail(scene, previewFallback);
        return NextResponse.json(xiaFacing ? toXiaFacingQuestionDetail(fallbackDetail) : fallbackDetail, {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'x-world-detail-source': 'preview-fallback',
          },
        });
      }
      return NextResponse.json(
        { error: 'Livebench question detail is warming; retry after the next background snapshot.' },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        },
      );
    }
    return NextResponse.json(xiaFacing ? toXiaFacingQuestionDetail(detail as unknown as XiaQuestionDetail) : detail, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'x-world-detail-source': liveDetail ? 'live' : 'cache-fallback',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load livebench question detail' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
