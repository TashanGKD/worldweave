import Link from 'next/link';

import { compactText, formatTime, sceneDisplayLabel, shellCardClass, worldHref } from '@/components/world-ui';
import { readWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { getWorldSourceKnowledge } from '@/lib/world/runtime';
import type { WorldScene, WorldSourceKnowledgeState } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SOURCE_KNOWLEDGE_PAGE_TIMEOUT_MS = 2500;
const SOURCE_NEXT_BATCH_LIMIT = 4;
const SOURCE_FAILURE_LIMIT = 4;
const SOURCE_RECOMMENDED_LIMIT = 4;

type PageProps = {
  searchParams?: Promise<{
    scene?: string;
  }>;
};

function statusTone(count: number) {
  if (count > 0) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export default async function SourceKnowledgePage({ searchParams }: PageProps) {
  const { scene: sceneParam } = (await searchParams) || {};
  const scene = (sceneParam as WorldScene | undefined) || 'global';
  let detail = await readWorldApiSnapshot<WorldSourceKnowledgeState>(scene, 'source_status', 24 * 60 * 60 * 1000);
  if (!detail) {
    detail = await Promise.race([
      getWorldSourceKnowledge(scene),
      new Promise<WorldSourceKnowledgeState | null>((resolve) => {
        setTimeout(() => resolve(null), SOURCE_KNOWLEDGE_PAGE_TIMEOUT_MS);
      }),
    ]);
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={worldHref('/', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              返回首页
            </Link>
          </div>
          <section className={shellCardClass()}>
            <div className="px-6 py-6">
              <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">信源情况正在更新</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                最近一版信源简报还在同步中。通常下一轮后台刷新完成后就会恢复完整展示。
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={worldHref('/', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
              返回首页
            </Link>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            {sceneDisplayLabel(scene)}
          </span>
        </div>

        <section className={shellCardClass()}>
          <div className="border-b border-slate-100 px-6 py-5">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">信源情况</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              近 30 天信源底座、向量召回状态、运行治理和下一批可接入信源。
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.08fr)_360px]">
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">知识库信号</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{detail.signal_count}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">已进入向量索引，最新 {formatTime(detail.latest_signal_published_at)}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">召回分块</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{detail.chunk_count}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">zvec 分组 {detail.zvec_group_count}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">稳定信源</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{detail.source_health?.stable_source_count ?? '--'}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">待核实 {detail.source_health?.watchlist_source_count ?? '--'}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">最近同步</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{formatTime(detail.last_synced_at)}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">{compactText(detail.source_status.embeddings, 42)}</p>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">向量召回与底座状态</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">Embedding 状态</p>
                    <p className="mt-2 text-[13px] leading-7 text-slate-700">{detail.source_status.embeddings}</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">接入池说明</p>
                    <p className="mt-2 text-[13px] leading-7 text-slate-700">
                      {detail.source_health?.note || '当前还没有稳定的信源池说明。'}
                    </p>
                  </div>
                </div>
                {detail.embedding_groups.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {detail.embedding_groups.map((group) => (
                      <article key={`${group.backend}-${group.model}-${group.dimension}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">{group.model}</p>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            {group.count} 条
                          </span>
                        </div>
                        <p className="mt-2 text-[12px] leading-6 text-slate-500">
                          backend: {group.backend} · 维度 {group.dimension}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">下一批可接入信源</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">这些入口已经过一轮筛选，首屏只展示最近值得处理的几条。</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                    {detail.source_health?.next_batch.length ?? 0} 条
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {(detail.source_health?.next_batch || []).slice(0, SOURCE_NEXT_BATCH_LIMIT).map((item) => (
                    <article key={`${item.name}-${item.source_platform}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{compactText(item.name, 42)}</p>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{item.recommended_scene}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{item.admission_tier}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{item.validation_status}</span>
                      </div>
                      <p className="mt-2 text-[12px] leading-6 text-slate-600">
                        {item.source_platform} · 可用 {item.usable_source_count} 条 · 可运行 {item.runnable_source_count} 条
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">运行治理</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">最近轮询</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatTime(detail.governance?.latest_poll_finished_at)}</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">监测池 {detail.governance?.monitor_source_count ?? '--'} 条</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">最近一轮变化</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{detail.governance?.changed_source_count ?? '--'} 条</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">高质量 {detail.governance?.high_quality_source_count ?? '--'} 条</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">冷却中</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{detail.governance?.cooling_down_count ?? 0}</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">正在暂时降权的信源</p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[11px] tracking-[0.08em] text-slate-400">运行失败</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{detail.governance?.runtime_failure_count ?? 0}</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">需要回头排查的入口</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">近期失败与冷却</p>
                  <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(detail.governance?.runtime_failure_count ?? 0)}`}>
                    {detail.governance?.runtime_failure_count ?? 0} 条
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {(detail.governance?.recent_runtime_failures || []).slice(0, SOURCE_FAILURE_LIMIT).map((item) => (
                    <article key={`${item.key}-${item.last_failed_at}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{compactText(item.label, 42)}</p>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">{item.source_kind}</span>
                      </div>
                      <p className="mt-2 text-[12px] leading-6 text-slate-600">{compactText(item.last_error, 120)}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">失败时间 {formatTime(item.last_failed_at)}{item.cooldown_until ? ` · 冷却到 ${formatTime(item.cooldown_until)}` : ''}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">推荐接入</p>
                <div className="mt-4 space-y-3">
                  {(detail.governance?.recommended_sources || []).slice(0, SOURCE_RECOMMENDED_LIMIT).map((item) => (
                    <article key={`${item.skill}-${item.source_name}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm font-medium text-slate-900">{compactText(item.source_name, 42)}</p>
                      <p className="mt-1 text-[12px] leading-6 text-slate-600">
                        {compactText(item.skill, 20)} · {item.scene} · {compactText(item.recommendation, 56)}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">
                        成功率 {Math.round(item.success_rate * 100)}% · 质量分 {item.quality_score} · 平均延迟 {Math.round(item.avg_latency_ms)}ms
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
