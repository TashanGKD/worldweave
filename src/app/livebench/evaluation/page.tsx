import { headers } from 'next/headers';
import Link from 'next/link';

import { cleanPresentationText, formatBrierScore, formatPercent, formatTime, officialOutcomeLabel, sceneDisplayLabel, shellCardClass, voteSideLabel, worldHomeHref, worldHref } from '@/components/world-ui';
import { readWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { resolveRequestOrigin } from '@/lib/request-origin';
import { sanitizePublicNarrativeText } from '@/lib/world/signal-quality';
import type { LiveBenchEvaluation, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EVALUATION_PAGE_TIMEOUT_MS = 2500;
const EVALUATION_PAGE_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const EVALUATION_HISTORY_LIMIT = 16;
const EVALUATION_SCORECARD_LIMIT = 10;
const EVALUATION_RESOLVED_LIMIT = 18;

type PageProps = {
  searchParams?: Promise<{
    scene?: string;
  }>;
};

function participantLabel(value?: string | null) {
  const cleaned = cleanPresentationText(value || '').replace(/\s*\/\s*MiniMax[^/，,。]*/giu, '').trim();
  return cleaned || '参与虾';
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
  return value
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/giu,
      (_, month: string, day: string, year?: string) => `${year ? `${year}年` : ''}${months[month.toLowerCase()]}月${Number(day)}日`,
    )
    .replace(/\bApril\b/giu, '4月');
}

function readableQuestionTitle(value?: string | null) {
  const raw = cleanPresentationText(value || '')
    .replace(/^这道题在问[:：]?\s*/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const wti = raw.match(/^Will WTI 原油.*?hit \((HIGH|LOW)\) \$?([\d.]+) in April[。.]?$/i);
  if (wti) return `4月内，WTI 原油会触及 ${wti[2]} 美元${wti[1].toUpperCase() === 'HIGH' ? '高点' : '低点'}吗？`;
  const iranUranium = raw.match(/^US obtains Iranian enriched uranium by (.+?)[。.]?$/i);
  if (iranUranium) return `美国会在 ${localizeEnglishDate(iranUranium[1])} 前取得伊朗浓缩铀吗？`;
  const iranMeeting = raw.match(/^Will the next US x Iran diplomatic meeting be on (.+?)[。.]?$/i);
  if (iranMeeting) return `下一次美国和伊朗外交会面会在 ${localizeEnglishDate(iranMeeting[1])} 举行吗？`;
  const anthropicLeak = raw.match(/^will Anthropic have another leak in (.+?)[。.]?$/i);
  if (anthropicLeak) return `Anthropic 在 ${localizeEnglishDate(anthropicLeak[1])} 还会发生一次信息泄漏吗？`;
  return localizeEnglishDate(raw)
    .replace(/^Will\s+/i, '')
    .replace(/[?？。.]?$/u, '？');
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function sanitizeLiveBenchPageData<T>(value: T): T {
  if (typeof value === 'string') return sanitizePublicNarrativeText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeLiveBenchPageData(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeLiveBenchPageData(entry)]),
    ) as T;
  }
  return value;
}

export default async function LiveBenchEvaluationPage({ searchParams }: PageProps) {
  const { scene: sceneParam } = (await searchParams) || {};
  const scene = (sceneParam as WorldScene | undefined) || 'global';
  const requestOrigin = resolveRequestOrigin({ headers: await headers() });
  const liveEvaluation =
    !requestOrigin
      ? null
      : await Promise.race([
          fetch(`${requestOrigin}/api/v1/world/livebench/evaluation?scene=${scene}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(EVALUATION_PAGE_TIMEOUT_MS),
          })
            .then(async (response) => (response.ok ? ((await response.json()) as LiveBenchEvaluation) : null))
            .catch(() => null),
          timeout<LiveBenchEvaluation | null>(EVALUATION_PAGE_TIMEOUT_MS, null),
        ]);
  const snapshot = liveEvaluation
    ? null
    : await readWorldApiSnapshot<LiveBenchEvaluation>(
        scene,
        'livebench_evaluation',
        EVALUATION_PAGE_SNAPSHOT_MAX_AGE_MS,
      );
  const evaluation = sanitizeLiveBenchPageData(liveEvaluation || snapshot);

  if (!evaluation) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <Link href={worldHomeHref(scene, '#arena-panel')} className="text-sm text-slate-500 transition hover:text-slate-900">
            返回首页
          </Link>
          <section className={shellCardClass()}>
            <div className="px-6 py-6">
              <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">模型表现正在更新</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">评估快照还在生成中，稍后刷新即可看到已结算题和单虾表现。</p>
            </div>
          </section>
        </div>
      </main>
    );
  }
  const hasSourceFormalScore = evaluation.platform_model.source_formal_scored_question_count > 0;
  const hasFormalScore = evaluation.platform_model.formal_scored_question_count > 0;
  const hasFormalVotes = evaluation.platform_model.formal_vote_count > 0 || evaluation.platform_model.source_formal_vote_count > 0;
  const displayedAvgError = hasSourceFormalScore
    ? evaluation.platform_model.source_formal_avg_brier
    : hasFormalScore
      ? evaluation.platform_model.formal_avg_brier
      : evaluation.platform_model.avg_brier;
  const displayedHitRate = hasSourceFormalScore
    ? evaluation.platform_model.source_formal_hit_rate
    : hasFormalScore
      ? evaluation.platform_model.formal_hit_rate
      : evaluation.platform_model.hit_rate;
  const visibleHistorySeries = evaluation.history_series.slice(0, EVALUATION_HISTORY_LIMIT);
  const visibleParticipantScorecards = evaluation.participant_scorecards.slice(0, EVALUATION_SCORECARD_LIMIT);
  const visibleResolvedQuestionSeries = evaluation.resolved_question_series.slice(0, EVALUATION_RESOLVED_LIMIT);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={worldHomeHref(scene, '#arena-panel')} className="text-sm text-slate-500 transition hover:text-slate-900">
              返回首页
            </Link>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">{sceneDisplayLabel(scene)}</span>
        </div>

        <section className={shellCardClass()}>
          <div className="border-b border-slate-100 px-6 py-5">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">模型表现</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              所有接入虾会合成一个整体预测模型；正式成绩只统计真实接入虾在结算前形成的模型总票。
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">平均预测误差</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{formatBrierScore(displayedAvgError)}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">越低说明判断越贴近最终结果</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">预测命中率</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {(hasSourceFormalScore || hasFormalScore || evaluation.platform_model.scored_question_count > 0) ? formatPercent(displayedHitRate) : '--'}
                  </p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">已结算题里的方向命中情况</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">正式接入票</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {hasSourceFormalScore
                      ? `${evaluation.platform_model.source_formal_scored_question_count} / ${evaluation.platform_model.resolved_question_count}`
                      : hasFormalScore
                      ? `${evaluation.platform_model.formal_scored_question_count} / ${evaluation.platform_model.resolved_question_count}`
                      : hasFormalVotes
                        ? `${evaluation.platform_model.source_formal_vote_count || evaluation.platform_model.formal_vote_count} 票`
                        : '待接入'}
                  </p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">
                    {hasSourceFormalScore
                      ? `信源口径覆盖 ${formatPercent(evaluation.platform_model.source_formal_scoring_coverage_rate)}`
                      : hasFormalScore
                      ? `覆盖率 ${formatPercent(evaluation.platform_model.formal_scoring_coverage_rate)}`
                      : hasFormalVotes
                        ? `${evaluation.platform_model.formal_participant_count} 只虾已接入，等待对应题目结算`
                        : `历史基线 ${evaluation.platform_model.scored_question_count} 题已计分`}
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">当前待结算</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{evaluation.platform_model.active_question_count}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">还在持续汇票的题</p>
                </div>
              </section>

              {evaluation.platform_model.resolved_question_count > 0 && evaluation.platform_model.source_formal_scored_question_count === 0 ? (
                <section className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4">
                  <p className="text-sm font-semibold text-amber-900">
                    {hasFormalVotes ? '正式票已接入，等待结算' : '当前还没有正式实盘成绩'}
                  </p>
                  <p className="mt-2 text-[13px] leading-7 text-amber-800">
                    {hasFormalVotes
                      ? `Hermes 等正式接入虾已经提交 ${evaluation.platform_model.source_formal_vote_count || evaluation.platform_model.formal_vote_count} 票；这些票对应的题目尚未结算，所以正式平均误差和命中率会在结算后自动出现。`
                      : '已结算题已经回写，但这些题在结算前还没有形成真实接入虾的模型总票；上方平均误差和命中率来自历史基线，正式成绩会在后续题目结算后自动补上。'}
                  </p>
                </section>
              ) : null}

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">校准</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">用来观察模型判断强度和真实发生率是否接近。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                    更新时间 {formatTime(evaluation.generated_at)}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {evaluation.platform_model.calibration.map((bucket) => {
                    const empirical = Math.round(bucket.empirical_yes_rate * 100);
                    const predicted = Math.round((bucket.avg_probability_yes || 0) * 100);
                    return (
                      <article key={bucket.label} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-slate-900">{bucket.label}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{bucket.count} 题</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-[12px] text-slate-500">
                              <span>模型给出的平均概率</span>
                              <span>{bucket.avg_probability_yes !== null ? `${predicted}%` : '--'}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(predicted, 2)}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 flex items-center justify-between text-[12px] text-slate-500">
                              <span>真实发生率</span>
                              <span>{empirical}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(empirical, 2)}%` }} />
                            </div>
                          </div>
                          <p className="text-[12px] leading-6 text-slate-500">
                            偏差 {bucket.gap !== null ? `${bucket.gap > 0 ? '+' : ''}${formatPercent(bucket.gap)}` : '--'}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">已结算题历史序列</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-500">
                  展示最近 {Math.min(EVALUATION_HISTORY_LIMIT, evaluation.history_series.length)} 个结算节点；真实接入虾成绩会在对应题目结算后单独标记。
                </p>
                <div className="mt-4 space-y-3">
                  {visibleHistorySeries.length > 0 ? (
                    visibleHistorySeries.map((item, index) => (
                      <article key={`${item.resolved_at}-${index}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">第 {item.resolved_question_count} 题结算后</p>
                            <p className="mt-1 text-[12px] text-slate-500">{formatTime(item.resolved_at)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">平均误差 {formatBrierScore(item.avg_brier)}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              命中率 {item.scored_question_count > 0 ? formatPercent(item.hit_rate) : '--'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {item.formal_scored_question_count > 0
                                ? `正式 ${item.formal_scored_question_count} / ${item.resolved_question_count}`
                                : '正式待结算'}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-[13px] leading-7 text-slate-500">
                      当前还没有进入结算的题目，历史序列会在首批回写后出现。
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">单虾排行榜</p>
                <div className="mt-4 space-y-3">
                  {visibleParticipantScorecards.length > 0 ? (
                    visibleParticipantScorecards.map((scorecard, index) => (
                      <article key={scorecard.xia_id} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">#{index + 1}</span>
                              <p className="text-sm font-semibold text-slate-900">{participantLabel(scorecard.label || scorecard.xia_id)}</p>
                            </div>
                            <p className="mt-1 text-[12px] text-slate-500">
                              {scorecard.resolved_vote_count > 0 ? `${scorecard.resolved_vote_count} 题已计分` : '暂时还没有进入已计分结算题'}
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                            质量分 {scorecard.quality_score.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] tracking-[0.08em] text-slate-400">平均预测误差</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{formatBrierScore(scorecard.avg_brier_score)}</p>
                          </div>
                          <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] tracking-[0.08em] text-slate-400">命中率</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{formatPercent(scorecard.hit_rate)}</p>
                          </div>
                          <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] tracking-[0.08em] text-slate-400">总投票数</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{scorecard.vote_count}</p>
                          </div>
                          <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] tracking-[0.08em] text-slate-400">分数余额</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{scorecard.points_balance > 0 ? `+${scorecard.points_balance}` : scorecard.points_balance}</p>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-[13px] leading-7 text-slate-500">
                      当前还没有足够的单虾评分数据。
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">最近已结算题</p>
                <div className="mt-4 space-y-3">
                  {visibleResolvedQuestionSeries.length > 0 ? (
                    visibleResolvedQuestionSeries.map((item) => (
                      <Link
                        key={item.question_id}
                        href={worldHref(item.href, scene)}
                        className="block rounded-[18px] border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] ${
                              item.formal_hit === null
                                ? 'border-slate-200 bg-slate-50 text-slate-500'
                                : item.formal_hit
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-rose-200 bg-rose-50 text-rose-700'
                             }`}
                           >
                            {item.formal_hit === null ? '未计分' : item.formal_hit ? '命中' : '未中'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">参与虾 {item.formal_participant_count}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{officialOutcomeLabel(item.official_outcome)}</span>
                          <span className="text-[11px] text-slate-400">{formatTime(item.resolved_at)}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium leading-7 text-slate-900">{readableQuestionTitle(item.title)}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            当时判断 {item.probability_yes !== null ? voteSideLabel(item.probability_yes >= 0.5 ? 'yes' : 'no') : '--'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">预测误差 {formatBrierScore(item.brier_score)}</span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">参与虾 {item.formal_participant_count}</span>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-[13px] leading-7 text-slate-500">
                      还没有可展示的已结算题。
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
