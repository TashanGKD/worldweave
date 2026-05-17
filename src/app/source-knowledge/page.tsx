import Link from 'next/link';

import { compactText, formatTime, sceneDisplayLabel, shellCardClass, worldHref } from '@/components/world-ui';
import { readWorldApiSnapshot } from '@/lib/world/api-snapshot';
import { getWorldSourceKnowledge } from '@/lib/world/runtime';
import { loadRuntimeCatalogSources, type RuntimeCatalogSource } from '@/lib/world/source-catalog';
import type { WorldScene, WorldSourceKnowledgeState } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SOURCE_KNOWLEDGE_PAGE_TIMEOUT_MS = 2500;

type PageProps = {
  searchParams?: Promise<{
    scene?: string;
  }>;
};

function sourceSceneLabel(value: string | null | undefined) {
  const key = String(value || '').toLowerCase();
  if (key.includes('tech') || key.includes('ai')) return 'AI/科技';
  if (key.includes('war') || key.includes('geo')) return '地缘';
  if (key.includes('finance') || key.includes('market')) return '市场';
  if (key.includes('health')) return '公共卫生';
  if (key.includes('global')) return '主世界';
  return value || '未分区';
}

function admissionTierLabel(value: string | null | undefined) {
  const key = String(value || '').toLowerCase();
  if (key === 'anchor') return '核心';
  if (key === 'context') return '背景';
  return value || '运行源';
}

function sourceTypeLabel(value: string | null | undefined) {
  const key = String(value || '').toLowerCase();
  if (key === 'rss') return 'RSS';
  if (key === 'api') return 'API';
  if (key === 'api-json') return 'API JSON';
  if (key === 'dataset') return '数据集';
  return value || '信源';
}

function embeddingBackendLabel(value: string | null | undefined) {
  const key = String(value || '').toLowerCase();
  if (key.includes('local-hash')) return '本地备用索引';
  if (key.includes('qwen')) return 'Qwen 向量索引';
  return value || '索引后端';
}

function embeddingModelLabel(value: string | null | undefined) {
  const key = String(value || '').toLowerCase();
  if (key.includes('local-hash')) return '本地备用索引';
  return value || '向量模型';
}

function readableSourceText(value: string | null | undefined, max = 140) {
  const text = String(value || '')
    .replace(/\bsource catalog\b/giu, '信源目录')
    .replace(/\bskill\b/giu, 'Skill')
    .replace(/\bzvec\b/giu, '向量分组')
    .replace(/\bbackend\b/giu, '后端')
    .replace(/\blocal hash\b/giu, '本地备用索引')
    .replace(/本地\s*hash/giu, '本地备用索引')
    .replace(/\bANN\b/giu, '近邻')
    .replace(/\s+/g, ' ')
    .trim();
  return compactText(text, max);
}

function countBy<T>(items: T[], keyOf: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function sourceKey(source: RuntimeCatalogSource) {
  return `${source.skill_name}-${source.source_name}-${source.url}`;
}

export default async function SourceKnowledgePage({ searchParams }: PageProps) {
  const { scene: sceneParam } = (await searchParams) || {};
  const scene = (sceneParam as WorldScene | undefined) || 'global';
  const [snapshot, runtimeSources] = await Promise.all([
    readWorldApiSnapshot<WorldSourceKnowledgeState>(scene, 'source_status', 24 * 60 * 60 * 1000),
    loadRuntimeCatalogSources().catch(() => [] as RuntimeCatalogSource[]),
  ]);
  let detail = snapshot;
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
              <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">运行信源正在读取</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                最近一版信源状态还在读取中。当前页面只展示已经进入采集和日报链路的源。
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const typeCounts = countBy(runtimeSources, (source) => source.source_type);
  const sceneCounts = countBy(runtimeSources, (source) => source.recommended_scene);
  const tierCounts = countBy(runtimeSources, (source) => source.admission_tier);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={worldHref('/', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
            返回首页
          </Link>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            {sceneDisplayLabel(scene)}
          </span>
        </div>

        <section className={shellCardClass()}>
          <div className="border-b border-slate-100 px-6 py-5">
            <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">当前运行信源</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              这里只看已经进入采集、索引和日报链路的源。历史目录和未验证入口不作为当前业务展示。
            </p>
          </div>

          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_340px]">
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">运行源</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{runtimeSources.length}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">实际进入采集链路</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">知识库信号</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{detail.signal_count}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">最新 {formatTime(detail.latest_signal_published_at)}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">召回分块</p>
                  <p className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em] text-slate-950">{detail.chunk_count}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">向量分组 {detail.zvec_group_count}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] tracking-[0.08em] text-slate-400">最近同步</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{formatTime(detail.last_synced_at)}</p>
                  <p className="mt-1 text-[12px] leading-6 text-slate-500">{detail.source_health?.freshness_status || 'unknown'}</p>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">实际采集清单</p>
                    <p className="mt-1 text-[12px] leading-6 text-slate-500">这些源现在会直接影响日报和信号索引。</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                    {runtimeSources.length} 条
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {runtimeSources.map((source) => (
                    <article key={sourceKey(source)} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{compactText(source.source_name, 46)}</p>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                          {sourceTypeLabel(source.source_type)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                          {admissionTierLabel(source.admission_tier)}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-6 text-slate-600">
                        {compactText(source.skill_name, 24)} · {sourceSceneLabel(source.recommended_scene)}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-400">{compactText(source.url, 92)}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">索引状态</p>
                <p className="mt-2 text-[13px] leading-7 text-slate-700">{readableSourceText(detail.source_status.embeddings, 180)}</p>
                {detail.embedding_groups.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {detail.embedding_groups.map((group) => (
                      <article key={`${group.backend}-${group.model}-${group.dimension}`} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">{embeddingModelLabel(group.model)}</p>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            {group.count} 条
                          </span>
                        </div>
                        <p className="mt-2 text-[12px] leading-6 text-slate-500">
                          索引后端：{embeddingBackendLabel(group.backend)} · 维度 {group.dimension}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">按类型</p>
                <div className="mt-4 space-y-2">
                  {typeCounts.map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="text-slate-600">{sourceTypeLabel(type)}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">按业务线</p>
                <div className="mt-4 space-y-2">
                  {sceneCounts.map(([sourceScene, count]) => (
                    <div key={sourceScene} className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="text-slate-600">{sourceSceneLabel(sourceScene)}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">按角色</p>
                <div className="mt-4 space-y-2">
                  {tierCounts.map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="text-slate-600">{admissionTierLabel(tier)}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">当前原则</p>
                <p className="mt-3 text-[13px] leading-7 text-slate-600">
                  先把这批源的采集、去噪、入库、日报组织做好。未验证目录不进入日报，也不在这里作为增长指标展示。
                </p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
