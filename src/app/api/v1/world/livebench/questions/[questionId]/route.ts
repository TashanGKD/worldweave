import { NextResponse } from 'next/server';

import { getWorldLiveBenchQuestionDetail } from '@/lib/world/runtime';
import { getCachedLiveBenchQuestionDetail } from '@/lib/world/livebench';
import type { WorldScene } from '@/lib/world/types';

const QUESTION_DETAIL_FAST_TIMEOUT_MS = 3000;

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

function compactXiaText(value: unknown, fallback = '') {
  const text = typeof value === 'string' ? value : fallback;
  return text.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function buildPeerDigest(positions: Array<Record<string, unknown>> | undefined) {
  return (positions || [])
    .map((position) => compactXiaText(position.human_readable_why || position.human_readable_prediction))
    .filter(Boolean)
    .slice(0, 3);
}

function stripInternalQuestionFields(question: Record<string, unknown>) {
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

function stripInternalPositionFields(position: Record<string, unknown>) {
  const {
    probability_yes: _probabilityYes,
    origin_url: _originUrl,
    source: _source,
    ...rest
  } = position;
  return rest;
}

function toXiaFacingQuestionDetail(detail: Record<string, any>) {
  const aggregateVote = detail.aggregate_vote || {};
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
          question_id: detail.preview.question_id,
          status: detail.preview.status,
          settlement_status: detail.preview.settlement_status,
          title: cleanXiaTitle(detail.preview.title),
          background: detail.preview.background,
          region_label: detail.preview.region_label,
          topic_label: detail.preview.topic_label,
          resolve_at: detail.preview.resolve_at,
          official_outcome: detail.preview.official_outcome,
          official_resolved_at: detail.preview.official_resolved_at,
          moderator_line: cleanXiaFacingText(detail.preview.moderator_line),
          evidence_count: detail.preview.evidence_count,
          rule_count: detail.preview.rule_count,
          discussion_count: detail.preview.discussion_count,
          xia_count: detail.preview.xia_count,
          missing_xia_count: aggregateVote.missing_count || 0,
        }
      : detail.preview,
    moderator_brief: {
      ...(detail.moderator_brief || {}),
      brief: cleanXiaFacingText(detail.moderator_brief?.brief),
      current_bias: cleanXiaFacingText(detail.moderator_brief?.current_bias),
      key_turning_points: Array.isArray(detail.moderator_brief?.key_turning_points)
        ? detail.moderator_brief.key_turning_points.map(cleanXiaFacingText)
        : detail.moderator_brief?.key_turning_points,
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
      host_background: compactXiaText(detail.moderator_brief?.summary),
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
    const pathQuestionId = url.pathname.split('/').filter(Boolean).pop() || questionId;
    const decodedQuestionId = decodeURIComponent(pathQuestionId);
    const cachedDetail = await getCachedLiveBenchQuestionDetail(scene, decodedQuestionId);
    if (cachedDetail) {
      return NextResponse.json(xiaFacing ? toXiaFacingQuestionDetail(cachedDetail as Record<string, any>) : cachedDetail, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'x-world-detail-source': 'cache',
        },
      });
    }
    const liveDetail = await Promise.race([
      getWorldLiveBenchQuestionDetail(scene, decodedQuestionId),
      timeout<Record<string, unknown> | null>(QUESTION_DETAIL_FAST_TIMEOUT_MS, null),
    ]);
    const detail = liveDetail || (await getCachedLiveBenchQuestionDetail(scene, decodedQuestionId));
    if (!detail) {
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
    return NextResponse.json(xiaFacing ? toXiaFacingQuestionDetail(detail as Record<string, any>) : detail, {
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
