import Link from 'next/link';
import { notFound } from 'next/navigation';

import { readableSignalTags } from '@/lib/world/dashboard-presentation';
import { getCachedWorldDashboardState, getWorldDashboardState } from '@/lib/world/runtime';
import type { WorldScene } from '@/lib/world/types';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    scene?: string;
  }>;
};

function formatTime(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function signalSceneLabel(scene: string) {
  const labels: Record<string, string> = {
    global: '全部信号',
    war: '冲突',
    technology: '科技',
    capacity: '产能与供应链',
    finance: '市场',
    health: '公共卫生',
    'weak-signal': '弱信号',
    'geo-politics-daily': '国际时政日报',
    'technology-daily': '科技日报',
    'ai-daily': 'AI 日报',
    'tech-ai': 'AI 日报',
  };

  return labels[scene] || scene;
}

function validationStatusLabel(value: string) {
  if (value === 'confirmed') return '已验证';
  if (value === 'falsified') return '已证伪';
  return '待确认';
}

function normalizeDetailScene(value?: string | null): WorldScene {
  if (value === 'tech-ai' || value === 'geo-politics-daily' || value === 'finance' || value === 'global') return value;
  return 'geo-politics-daily';
}

async function loadDetailState(scene: WorldScene) {
  return (await getCachedWorldDashboardState(scene)) || getWorldDashboardState(scene);
}

type DetailState = Awaited<ReturnType<typeof loadDetailState>>;

function detailSceneSearchOrder(scene: WorldScene): WorldScene[] {
  const alternates: WorldScene[] = scene === 'tech-ai' ? ['geo-politics-daily', 'global'] : ['tech-ai', 'global'];
  return [scene, ...alternates.filter((item) => item !== scene)];
}

function findSignalDetail(state: DetailState, id: string) {
  return {
    node: state.nodes.find((item) => item.node_id === id) || null,
    signal:
      state.top_signals.find((item) => item.id === id) ||
      state.knowledge_signals.find((item) => item.id === id) ||
      state.graph_signals.find((item) => item.id === id) ||
      null,
  };
}

export default async function SignalDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const scene = normalizeDetailScene(query?.scene);
  let state: DetailState | null = null;
  let node: ReturnType<typeof findSignalDetail>['node'] = null;
  let signal: ReturnType<typeof findSignalDetail>['signal'] = null;

  for (const candidateScene of detailSceneSearchOrder(scene)) {
    state = await loadDetailState(candidateScene);
    ({ node, signal } = findSignalDetail(state, id));
    if (node || signal) break;
  }

  if (!state || (!node && !signal)) {
    notFound();
  }

  const title = signal?.display_title || node?.display_title || signal?.title || node?.title || id;
  const summary = signal?.display_summary || node?.display_summary || signal?.summary || node?.summary || '这条线索暂时只有结构化信息，等待后续来源补充。';
  const sourceName = signal?.source_name || node?.source_name || '未标注来源';
  const sourceUrl = signal?.source_url || node?.source_url || '';
  const region = signal?.region || node?.geo?.region || '--';
  const location = signal?.location_name || node?.geo?.label || '--';
  const country = signal?.country || node?.geo?.country || '--';
  const publishedAt = signal?.published_at || node?.published_at || null;
  const updatedAt = node?.updated_at || node?.last_report_at || publishedAt;
  const tags = signal?.tags || node?.tags || [];
  const alignmentTags = signal?.alignment_tags || node?.alignment_tags || [];
  const displayTags = readableSignalTags([...tags, ...alignmentTags], 10);
  const reliability = signal?.source_reliability;
  const relatedQuestions = [
    ...(state.pending_question_previews || []),
    ...(state.resolved_question_previews || []),
  ].slice(0, 4);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_40%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <Link href="/" className="text-sm text-slate-500 transition hover:text-slate-900">
            返回世界脉络
          </Link>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{signalSceneLabel(signal?.scene || node?.scene || 'global')}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{region}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{sourceName}</span>
              {reliability ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  信源状态 {reliability.tier}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{summary}</p>
          </div>

          <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">信号信息</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>地点：{location}</p>
                  <p>国家：{country}</p>
                  <p>发布时间：{formatTime(publishedAt)}</p>
                  <p>最近更新时间：{formatTime(updatedAt)}</p>
                  {sourceUrl ? (
                    <p>
                      原始链接：
                      <a href={sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-sky-700 underline underline-offset-4">
                        打开外部信源
                      </a>
                    </p>
                  ) : (
                    <p>原始链接：当前上游没有提供可直达链接，页面显示结构化详情。</p>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">标签</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {displayTags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">相关题目</p>
                {relatedQuestions.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {relatedQuestions.map((snapshot) => (
                      <article key={snapshot.question_id} className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {snapshot.topic_label || 'world'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                            {validationStatusLabel(snapshot.status === 'resolved' ? 'confirmed' : 'pending')}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-700">
                          {snapshot.title}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-slate-500">
                          这道题与当前场景同池展示，可作为后续校准和复盘参考。
                        </p>
                        <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                          <p>结算时间：{formatTime(snapshot.resolve_at || snapshot.official_resolved_at)}</p>
                          {snapshot.platform_question_url ? (
                            <p>
                              <a
                                href={snapshot.platform_question_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-700 underline underline-offset-4"
                              >
                                打开原题链接
                              </a>
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">这条信源当前还没有被题池里的问题显式引用。</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">信源状态</p>
                {reliability ? (
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>等级：{reliability.tier}</p>
                    <p>{reliability.reason}</p>
                    {reliability.matched_skill_name ? <p>映射 skill：{reliability.matched_skill_name}</p> : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">当前这条信号还没有单独的信源稳定性说明。</p>
                )}
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">说明</p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  这里保留单条线索的中文摘要、来源、标签和信源状态；后续题池复盘会优先引用这类已经整理过的线索。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
