import { headers } from 'next/headers';
import Link from 'next/link';

import { compactText, formatTime, shellCardClass, worldHref } from '@/components/world-ui';
import { resolveRequestOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CATEGORY_TABS = [
  { label: '全部', value: 'all' },
  { label: '全球情报', value: '全球情报' },
  { label: 'AI 技术', value: 'AI 技术' },
  { label: '市场', value: '市场' },
  { label: '公共卫生', value: '公共卫生' },
  { label: '供应链', value: '供应链' },
];

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    page?: string;
    page_size?: string;
    scene?: string;
  }>;
};

interface TopicLabArticle {
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

interface TopicLabFeedResponse {
  list: TopicLabArticle[];
  limit: number;
  offset: number;
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  filters: {
    q: string;
    category: string;
    scene: string;
    source_type: string;
    source_feed_name: string;
  };
}

function normalizePage(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function categoryHref(input: { q: string; category: string; scene: string }) {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.category !== 'all') params.set('category', input.category);
  if (input.scene && input.scene !== 'global') params.set('scene', input.scene);
  params.set('page', '1');
  return `/topiclab-preview?${params.toString()}`;
}

function pageHref(input: { q: string; category: string; scene: string; page: number; pageSize: number }) {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.category !== 'all') params.set('category', input.category);
  if (input.scene && input.scene !== 'global') params.set('scene', input.scene);
  params.set('page', String(Math.max(1, input.page)));
  params.set('page_size', String(input.pageSize));
  return `/topiclab-preview?${params.toString()}`;
}

function articleInitial(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'W';
}

async function readFeed(input: {
  origin: string;
  q: string;
  category: string;
  page: number;
  pageSize: number;
  scene: string;
}): Promise<{ data: TopicLabFeedResponse | null; error: string | null }> {
  const params = new URLSearchParams({
    page: String(input.page),
    page_size: String(input.pageSize),
    scene: input.scene,
  });
  if (input.q) params.set('q', input.q);
  if (input.category !== 'all') params.set('category', input.category);

  try {
    const response = await fetch(`${input.origin}/api/v1/topiclab/source-feed/articles?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return { data: null, error: `信源桥接接口返回 ${response.status}` };
    return { data: (await response.json()) as TopicLabFeedResponse, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : '信源桥接接口暂时不可用',
    };
  }
}

export default async function TopicLabPreviewPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const headerList = await headers();
  const origin = resolveRequestOrigin({ headers: headerList, fallbackOrigin: 'http://127.0.0.1:5000' }) || 'http://127.0.0.1:5000';
  const q = (params.q || '').trim();
  const category = (params.category || 'all').trim() || 'all';
  const scene = (params.scene || 'global').trim() || 'global';
  const page = normalizePage(params.page);
  const pageSize = params.page_size ? Math.min(normalizePage(params.page_size), 24) : 12;
  const { data, error } = await readFeed({ origin, q, category, page, pageSize, scene });
  const articles = data?.list || [];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f3f7fb_0%,#f8fbff_42%,#f5f8fc_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={worldHref('/', scene)} className="text-sm text-slate-500 transition hover:text-slate-900">
            返回世界脉络
          </Link>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            TopicLab 信息页预览
          </span>
        </div>

        <section className={`${shellCardClass()} px-6 py-7 sm:px-8`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)] lg:items-end">
            <div>
              <p className="text-xs tracking-[0.18em] text-slate-400">WORLDWEAVE SOURCE FEED</p>
              <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl">信息</h1>
              <p className="mt-4 max-w-3xl text-[15px] leading-8 text-slate-600">
                集中查看世界脉络沉淀的近 30 天信源，支持搜索、分类筛选，并能从一条信号进入原始材料或后续话题讨论。
              </p>
            </div>

            <form action="/topiclab-preview" className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <input type="hidden" name="category" value={category === 'all' ? '' : category} />
              <input type="hidden" name="scene" value={scene} />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索标题、来源或信息类型"
                className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
                搜索
              </button>
            </form>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {CATEGORY_TABS.map((tab) => {
              const active = tab.value === category || (!category && tab.value === 'all');
              return (
                <Link
                  key={tab.value}
                  href={categoryHref({ q, category: tab.value, scene })}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">共 {data?.total ?? 0} 条</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">第 {data?.page ?? page} 页</span>
            {q ? <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-700">搜索：{q}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={pageHref({ q, category, scene, page: page - 1, pageSize })}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                page <= 1 ? 'pointer-events-none border-slate-100 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-950'
              }`}
            >
              上一页
            </Link>
            <Link
              href={pageHref({ q, category, scene, page: page + 1, pageSize })}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                !data?.has_more ? 'pointer-events-none border-slate-100 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-950'
              }`}
            >
              下一页
            </Link>
          </div>
        </section>

        {error ? (
          <section className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-5 text-sm text-rose-700">{error}</section>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article, index) => (
            <article
              key={article.id}
              className="group flex min-h-[360px] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_46px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_24px_60px_rgba(15,23,42,0.09)]"
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {articleInitial(article.source_feed_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{article.source_feed_name}</p>
                    <p className="text-xs text-slate-400">{formatTime(article.publish_time)}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{article.category}</span>
              </div>

              <div className="mt-4 grid h-36 place-items-center overflow-hidden rounded-[22px] border border-slate-200 bg-[radial-gradient(circle_at_30%_20%,#dff7ff_0%,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#e7eef7_100%)]">
                {article.pic_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={article.pic_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="px-6 text-center">
                    <p className="font-serif text-4xl font-semibold text-slate-200">{articleInitial(article.category)}</p>
                    <p className="mt-2 text-xs tracking-[0.18em] text-slate-400">WORLDWEAVE</p>
                  </div>
                )}
              </div>

              <h2 className="mt-5 text-clamp-3 text-[22px] font-semibold leading-[1.35] tracking-[-0.035em] text-slate-950">
                {compactText(article.title, 74)}
              </h2>
              <p className="mt-3 text-clamp-3 text-sm leading-7 text-slate-600">{compactText(article.description, 130)}</p>

              <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-slate-400">
                <div className="flex items-center gap-4">
                  <span>收藏 0</span>
                  <span>讨论 {article.linked_topic_posts_count}</span>
                </div>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
                >
                  查看
                </a>
              </div>
            </article>
          ))}
        </section>

        {!articles.length && !error ? (
          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            当前条件下没有匹配信源，可以换一个关键词或回到全部分类。
          </section>
        ) : null}
      </div>
    </main>
  );
}
