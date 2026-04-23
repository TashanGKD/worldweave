import Link from 'next/link';

import { aggregateSideSummary, cleanNarrativeText, cleanPresentationText, formatBrierScore, formatPercent, formatTime, liveQuestionStatusLabel, liveQuestionStatusTone, officialOutcomeLabel, regionDisplayLabel, sceneDisplayLabel, shellCardClass, voteSideLabel, voteSideTone, worldHref } from '@/components/world-ui';
import { getCachedLiveBenchQuestionDetail, getLiveBenchQuestionDetailFromStore } from '@/lib/world/livebench';
import { getWorldLiveBenchQuestionDetail } from '@/lib/world/runtime';
import type { LiveBenchQuestionDetail, LiveBenchQuestionPosition, LiveQuestionSide, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const QUESTION_DETAIL_PAGE_TIMEOUT_MS = 3500;

type PageProps = {
  params: Promise<{
    questionId: string;
  }>;
  searchParams?: Promise<{
    scene?: string;
  }>;
};

function groupTitle(side: LiveQuestionSide) {
  return side === 'yes' ? '偏“是”的虾' : '偏“不是”的虾';
}

function positionGroupDescription(side: LiveQuestionSide) {
  return side === 'yes' ? '这些回复当前更偏向事情会发生。' : '这些回复当前更偏向事情不会发生。';
}

function participantLabel(value?: string | null) {
  const cleaned = cleanPresentationText(value || '').replace(/\s*\/\s*MiniMax[^/，,。]*/giu, '').trim();
  return cleaned || '参与虾';
}

function PositionCard({ position }: { position: LiveBenchQuestionPosition }) {
  return (
    <article className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{participantLabel(position.label)}</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${voteSideTone(position.side)}`}>{voteSideLabel(position.side)}</span>
        <span className="text-[11px] text-slate-400">{formatTime(position.created_at)}</span>
      </div>
      <p className="mt-3 text-sm font-medium leading-7 text-slate-950">{cleanNarrativeText(position.prediction)}</p>
      <p className="mt-2 text-[13px] leading-7 text-slate-600">{cleanNarrativeText(position.why)}</p>
      <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3">
        <p className="text-[11px] tracking-[0.08em] text-slate-400">改判条件</p>
        <p className="mt-1 text-[12px] leading-6 text-slate-700">{cleanNarrativeText(position.what_changes_my_mind)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">参考信源 {position.cited_signal_ids.length} 条</span>
        {position.brier_score !== null ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">本题预测误差 {formatBrierScore(position.brier_score)}</span>
        ) : null}
        {position.points_delta !== null ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">分数 {position.points_delta > 0 ? `+${position.points_delta}` : position.points_delta}</span>
        ) : null}
      </div>
    </article>
  );
}

export default async function LiveBenchQuestionPage({ params, searchParams }: PageProps) {
  const { questionId } = await params;
  const { scene: sceneParam } = (await searchParams) || {};
  const scene = (sceneParam as WorldScene | undefined) || 'global';
  const decodedQuestionId = decodeURIComponent(questionId);
  let detail: LiveBenchQuestionDetail | null = await getCachedLiveBenchQuestionDetail(scene, decodedQuestionId);
  if (!detail) {
    detail = await Promise.race([
      getLiveBenchQuestionDetailFromStore(scene, decodedQuestionId),
      new Promise<LiveBenchQuestionDetail | null>((resolve) => {
        setTimeout(() => resolve(null), Math.min(QUESTION_DETAIL_PAGE_TIMEOUT_MS, 1200));
      }),
    ]);
  }
  if (!detail) {
    detail = await Promise.race([
      getWorldLiveBenchQuestionDetail(scene, decodedQuestionId),
      new Promise<LiveBenchQuestionDetail | null>((resolve) => {
        setTimeout(() => resolve(null), QUESTION_DETAIL_PAGE_TIMEOUT_MS);
      }),
    ]);
  }
  if (!detail && scene !== 'global') {
    detail = await getCachedLiveBenchQuestionDetail('global', decodedQuestionId);
    if (!detail) {
      detail = await Promise.race([
        getLiveBenchQuestionDetailFromStore('global', decodedQuestionId),
        new Promise<LiveBenchQuestionDetail | null>((resolve) => {
          setTimeout(() => resolve(null), Math.min(QUESTION_DETAIL_PAGE_TIMEOUT_MS, 1200));
        }),
      ]);
    }
    if (!detail) {
      detail = await Promise.race([
        getWorldLiveBenchQuestionDetail('global', decodedQuestionId),
        new Promise<LiveBenchQuestionDetail | null>((resolve) => {
          setTimeout(() => resolve(null), QUESTION_DETAIL_PAGE_TIMEOUT_MS);
        }),
      ]);
    }
  }
  if (!detail) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={worldHref('/#arena-panel', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              返回首页
            </Link>
            <Link href={worldHref('/livebench/evaluation', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              查看模型表现
            </Link>
          </div>
          <section className={shellCardClass()}>
            <div className="px-6 py-6">
              <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">题目详情正在整理</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                主持人串讲、证据区和虾回复还在从最新快照补齐。通常下一轮后台刷新后就会恢复完整展示。
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const preview = detail.preview;
  const aggregate = detail.aggregate_vote;
  const visibleReferences = detail.evidence.flatMap((section) => section.references.slice(0, section.visible_count));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={worldHref('/#arena-panel', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              返回首页
            </Link>
            <Link href={worldHref('/livebench/evaluation', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              查看模型表现
            </Link>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">{sceneDisplayLabel(detail.scene)}</span>
        </div>

        <section className={shellCardClass()}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className={`rounded-full border px-3 py-1 ${liveQuestionStatusTone(preview.status)}`}>{liveQuestionStatusLabel(preview.status)}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{preview.topic_label}</span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">{regionDisplayLabel(preview.region_label)}</span>
            </div>
            <h1 className="mt-4 max-w-4xl font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">{cleanPresentationText(preview.title)}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{cleanNarrativeText(preview.background)}</p>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">模型总票</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{voteSideLabel(aggregate.side)}</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-600">{aggregateSideSummary(aggregate)}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] tracking-[0.08em] text-slate-400">见分晓时间</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatTime(preview.official_resolved_at || preview.resolve_at)}</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-600">{officialOutcomeLabel(preview.official_outcome)}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] tracking-[0.08em] text-slate-400">到票情况</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{aggregate.participant_count} / {aggregate.participant_count + aggregate.missing_count}</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-600">
                  {preview.status === 'resolved' && aggregate.participant_count === 0
                  ? '这道题结算前没有形成模型票。'
                    : `离散度 ${aggregate.stddev !== null ? formatPercent(aggregate.stddev) : '--'}`}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-[11px] tracking-[0.08em] text-slate-400">证据覆盖</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{preview.evidence_count}</p>
                <p className="mt-1 text-[12px] leading-6 text-slate-600">规则 {preview.rule_count} · 讨论 {preview.discussion_count}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="space-y-5">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">主持人串讲</p>
                <p className="mt-3 text-sm leading-7 text-slate-700">{cleanNarrativeText(detail.moderator_brief.summary)}</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">怎么判</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-700">{cleanNarrativeText(detail.moderator_brief.resolution_rule)}</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">当前偏向</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-700">{cleanNarrativeText(detail.moderator_brief.current_bias)}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">最该盯的变化</p>
                  <div className="mt-2 space-y-2">
                    {detail.moderator_brief.watch_for.map((item) => (
                      <div key={item} className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-6 text-slate-700">
                        {cleanNarrativeText(item)}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">题目背景与原生讨论</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">这些内容只作为背景，不计入我方模型总票。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">{detail.external_discussion.entries.length} 条</span>
                </div>
                <p className="mt-3 text-[13px] leading-7 text-slate-600">{cleanNarrativeText(detail.external_discussion.summary)}</p>
                <div className="mt-4 space-y-3">
                  {detail.external_discussion.entries.length > 0 ? (
                    detail.external_discussion.entries.map((entry) => (
                      <article key={entry.id} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.author ? <span className="text-sm font-medium text-slate-900">{entry.author}</span> : null}
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{entry.label}</span>
                          {entry.side ? (
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${voteSideTone(entry.side)}`}>{voteSideLabel(entry.side)}</span>
                          ) : null}
                          {entry.created_at ? <span className="text-[11px] text-slate-400">{formatTime(entry.created_at)}</span> : null}
                        </div>
                        <p className="mt-2 text-[13px] leading-7 text-slate-700">{cleanNarrativeText(entry.summary)}</p>
                        {entry.detail ? <p className="mt-1 text-[12px] leading-6 text-slate-500">{cleanNarrativeText(entry.detail)}</p> : null}
                        {entry.origin_url ? (
                          <a href={entry.origin_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[12px] text-sky-700 underline underline-offset-4">
                            打开原帖
                          </a>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-3 py-3 text-[13px] leading-7 text-slate-500">
                      当前没有可展示的原生讨论背景。
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">虾回复</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">每只虾独立检索、独立表态，最后再聚合成模型总票。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                    到票 {aggregate.participant_count} / 缺席 {aggregate.missing_count}
                  </span>
                </div>
                <div className="mt-4 space-y-4">
                  {[detail.xia_positions.yes, detail.xia_positions.no].map((group, index) => {
                    const side = index === 0 ? 'yes' : 'no';
                    if (group.length === 0) return null;
                    return (
                      <div key={side} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${voteSideTone(side)}`}>{groupTitle(side)}</span>
                          <span className="text-[12px] text-slate-500">{positionGroupDescription(side)}</span>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          {group.map((position) => (
                            <PositionCard key={position.vote_id} position={position} />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">尚未表态</p>
                    {detail.xia_positions.missing.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {detail.xia_positions.missing.map((item) => (
                          <span key={item.xia_id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] text-slate-600">
                            {participantLabel(item.label)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[12px] leading-6 text-slate-600">当前活跃虾都已经完成这道题的投票。</p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">模型总票</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${voteSideTone(aggregate.side)}`}>{aggregateSideSummary(aggregate)}</span>
                      <span className="text-lg font-semibold text-slate-950">{voteSideLabel(aggregate.side)}</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-6 text-slate-600">
                      等权聚合 {aggregate.participant_count} 只已到票的虾，缺席 {aggregate.missing_count} 只。
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] tracking-[0.08em] text-slate-400">离散度</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{aggregate.stddev !== null ? formatPercent(aggregate.stddev) : '--'}</p>
                      <p className="mt-1 text-[12px] leading-6 text-slate-500">数值越高，说明虾之间分歧越大。</p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] tracking-[0.08em] text-slate-400">完成状态</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{aggregate.complete ? '本轮已齐票' : '仍有虾未投'}</p>
                      <p className="mt-1 text-[12px] leading-6 text-slate-500">最近更新时间 {formatTime(aggregate.updated_at)}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">证据与规则</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">默认只露出最关键的几条，剩余内容折叠在每个分区下面。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">{visibleReferences.length} 条首屏可见</span>
                </div>
                <div className="mt-4 space-y-3">
                  {detail.evidence.length > 0 ? (
                    detail.evidence.map((section) => {
                      const visible = section.references.slice(0, section.visible_count);
                      const hidden = section.references.slice(section.visible_count);
                      return (
                        <div key={section.role} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{section.title}</p>
                              <p className="text-[12px] leading-6 text-slate-500">{section.description}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                              {section.total_count} 条
                            </span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {visible.map((reference) => (
                              <article key={reference.ref_id} className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[12px] font-medium text-slate-900">{cleanPresentationText(reference.label)}</span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                                    {cleanPresentationText(reference.source_name)}
                                  </span>
                                  {reference.published_at ? <span className="text-[11px] text-slate-400">{formatTime(reference.published_at)}</span> : null}
                                </div>
                                {reference.note ? <p className="mt-2 text-[12px] leading-6 text-slate-600">{cleanNarrativeText(reference.note)}</p> : null}
                                <a href={reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[12px] text-sky-700 underline underline-offset-4">
                                  打开原文
                                </a>
                              </article>
                            ))}
                          </div>
                          {hidden.length > 0 ? (
                            <details className="mt-3 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                              <summary className="cursor-pointer text-[12px] font-medium text-slate-700">展开剩余 {hidden.length} 条</summary>
                              <div className="mt-3 space-y-3">
                                {hidden.map((reference) => (
                                  <article key={reference.ref_id} className="rounded-[16px] border border-slate-200 bg-white px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[12px] font-medium text-slate-900">{cleanPresentationText(reference.label)}</span>
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                                        {cleanPresentationText(reference.source_name)}
                                      </span>
                                    </div>
                                    {reference.note ? <p className="mt-2 text-[12px] leading-6 text-slate-600">{cleanNarrativeText(reference.note)}</p> : null}
                                    <a href={reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[12px] text-sky-700 underline underline-offset-4">
                                      打开原文
                                    </a>
                                  </article>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-3 py-3 text-[13px] leading-7 text-slate-500">
                      当前还没有足够稳定的核心证据或规则说明。
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">结算与评分</p>
                <p className="mt-3 text-[13px] leading-7 text-slate-600">{cleanNarrativeText(detail.settlement.replay_summary)}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">官方结果</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{officialOutcomeLabel(detail.settlement.official_outcome)}</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">{formatTime(detail.settlement.official_resolved_at)}</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">模型总票得分</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {detail.settlement.platform_brier_score !== null
                        ? `预测误差 ${formatBrierScore(detail.settlement.platform_brier_score)}`
                        : detail.settlement.official_outcome
                        ? '未形成可计分模型票'
                          : '尚未结算'}
                    </p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">
                      {detail.settlement.platform_hit === null
                        ? detail.settlement.official_outcome
                          ? '官方结果已回写，但这道题结算前没有足够的虾票可用于模型计分。'
                          : '等待官方结果。'
                        : detail.settlement.platform_hit
                          ? '模型总票命中。'
                          : '模型总票未命中。'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {detail.settlement.xia_scores.length > 0 ? (
                    detail.settlement.xia_scores.map((item) => (
                      <article key={item.xia_id} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{participantLabel(item.label)}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${voteSideTone(item.side)}`}>{voteSideLabel(item.side)}</span>
                          {item.hit !== null ? (
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${item.hit ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                              {item.hit ? '命中' : '未中'}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">预测误差 {formatBrierScore(item.brier_score)}</span>
                          {item.points_delta !== null ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              分数 {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-3 py-3 text-[13px] leading-7 text-slate-500">
                      {detail.settlement.official_outcome ? '这道题已经结算，但结算前没有可回放的虾票。' : '当前还没有可回放的单虾评分。'}
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
