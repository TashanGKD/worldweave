import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bot, FileText, Globe2 } from 'lucide-react';

import {
  asArray,
  cleanNarrativeText,
  compactText,
  formatTime,
  regionDisplayLabel,
  severityLabel,
  severitySoftTone,
  signalDetailHref,
  worldHref,
} from '@/components/world-ui';
import {
  dashboardSignalMatchesScene,
  isTrustedTechAiDashboardSignal,
  mainWorldSignalPriority,
  mainWorldSignalRank,
  readableSignalSourceLine,
  readableSignalSummary,
  readableSignalTags,
  readableSignalTitle,
  techAiRelevanceScore,
  techAiSignalRank,
} from '@/lib/world/dashboard-presentation';
import { getCachedWorldDashboardState } from '@/lib/world/runtime';
import type { LiveBenchQuestionPreview, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DailyKind = 'geo' | 'ai' | 'livebench';
type CachedDashboard = NonNullable<Awaited<ReturnType<typeof getCachedWorldDashboardState>>>;
type DailySignal = CachedDashboard['top_signals'][number];

const DAILY_META: Record<
  DailyKind,
  {
    scene: WorldScene;
    title: string;
    eyebrow: string;
    subtitle: string;
    empty: string;
    href: string;
    tone: string;
    softTone: string;
    iconTone: string;
  }
> = {
  geo: {
    scene: 'geo-politics-daily',
    title: '主世界日报',
    eyebrow: '地缘与公共风险',
    subtitle: '把今天最值得先看的地缘、冲突、外交和公共安全线索整理在一页。',
    empty: '当前还没有可展示的地缘日报线索。',
    href: '../?scene=geo-politics-daily',
    tone: 'border-teal-200 bg-[linear-gradient(135deg,#f0faf4,#fbfdf8)] text-[#08201c]',
    softTone: 'border-[#d4ded8] bg-white/90',
    iconTone: 'border-teal-200 bg-white text-[#087265]',
  },
  ai: {
    scene: 'tech-ai',
    title: 'AI 日报',
    eyebrow: 'AI Hot、模型与产品',
    subtitle: '围绕 AI Hot、模型、Agent、论文、开源和产业动态整理今日重点。',
    empty: '当前还没有可展示的 AI 日报线索。',
    href: '../?scene=tech-ai',
    tone: 'border-teal-200 bg-[linear-gradient(135deg,#f0faf4,#fbfdf8)] text-[#08201c]',
    softTone: 'border-[#d4ded8] bg-white/90',
    iconTone: 'border-teal-200 bg-white text-[#087265]',
  },
  livebench: {
    scene: 'global',
    title: '演绎日报',
    eyebrow: '题池与结算',
    subtitle: '把正在跟踪和已经结算的问题集中成一页，便于看判断是否经得起后续结果检验。',
    empty: '当前还没有可展示的演绎题目。',
    href: '../',
    tone: 'border-teal-200 bg-[linear-gradient(135deg,#f0faf4,#fbfdf8)] text-[#08201c]',
    softTone: 'border-[#d4ded8] bg-white/90',
    iconTone: 'border-teal-200 bg-white text-[#087265]',
  },
};

function resolveKind(raw?: string): DailyKind {
  if (raw === 'ai') return 'ai';
  if (raw === 'livebench') return 'livebench';
  return 'geo';
}

function uniqueSignals(...sources: Array<DailySignal[] | null | undefined>) {
  return Array.from(
    new Map(
      sources
        .flatMap((source) => source || [])
        .filter((signal) => signal?.id)
        .map((signal) => [signal.id, signal]),
    ).values(),
  );
}

function selectDailySignals(kind: DailyKind, state: CachedDashboard | null) {
  if (!state || kind === 'livebench') return [];
  const scene = DAILY_META[kind].scene;
  return uniqueSignals(state.top_signals, state.graph_signals, state.knowledge_signals)
    .filter((signal) => (kind === 'ai' ? isTrustedTechAiDashboardSignal(signal) : dashboardSignalMatchesScene(signal, scene)))
    .sort((left, right) => {
      if (kind === 'ai') {
        return (
          techAiSignalRank(left) - techAiSignalRank(right) ||
          techAiRelevanceScore(right) - techAiRelevanceScore(left) ||
          new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
        );
      }
      return (
        mainWorldSignalRank(left) - mainWorldSignalRank(right) ||
        mainWorldSignalPriority(right) - mainWorldSignalPriority(left) ||
        new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
      );
    })
    .slice(0, 6);
}

function dailyDigest(signals: DailySignal[], fallback: string) {
  const titles = signals.map((signal) => readableSignalTitle(signal)).filter(Boolean).slice(0, 3);
  if (titles.length === 0) return fallback;
  return `今日重点：${titles.join('；')}。`;
}

function questionTime(preview: LiveBenchQuestionPreview) {
  return preview.official_resolved_at || preview.resolve_at || preview.aggregate_vote.updated_at || '';
}

function questionLine(preview: LiveBenchQuestionPreview) {
  return cleanNarrativeText(preview.moderator_line || preview.background || preview.title);
}

function questionLabel(preview: LiveBenchQuestionPreview) {
  if (preview.settlement_status === 'resolved') return '已结算';
  if (preview.settlement_status === 'pending_official') return '待核票';
  return '跟踪中';
}

function dailySignalHref(id: string | undefined, scene: WorldScene) {
  const href = worldHref(signalDetailHref(id), scene);
  return href.startsWith('/') ? `..${href}` : href;
}

type PageProps = {
  params?: Promise<{ kind?: string }>;
};

export default async function DailyPage({ params }: PageProps) {
  const kind = resolveKind((await params)?.kind);
  const meta = DAILY_META[kind];
  const state = await getCachedWorldDashboardState(meta.scene);
  const signals = selectDailySignals(kind, state);
  const questions =
    kind === 'livebench'
      ? [...asArray(state?.pending_question_previews), ...asArray(state?.resolved_question_previews)].slice(0, 6)
      : [];
  const lead = signals[0] || null;
  const Icon = kind === 'geo' ? Globe2 : kind === 'ai' ? Bot : FileText;
  const digest =
    kind === 'livebench'
      ? questions.length > 0
        ? `今日重点：${questions.slice(0, 4).map((item) => cleanNarrativeText(item.title)).join('；')}。`
        : meta.empty
      : dailyDigest(signals, meta.empty);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f7f4_0%,#fbfcf8_44%,#eef5f1_100%)] text-slate-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(20,184,166,0.58),rgba(217,159,72,0.45),transparent)]" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={meta.href}
            className="inline-flex items-center gap-2 rounded-full border border-[#d3ddd7] bg-white/85 px-3 py-1.5 text-xs text-slate-600 transition hover:border-teal-300 hover:text-[#08201c]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回世界脉络
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="./geo" className={`rounded-full border px-3 py-1.5 transition ${kind === 'geo' ? 'border-teal-300 bg-[#eefaf4] text-[#087265]' : 'border-[#d3ddd7] bg-white/85 text-slate-500 hover:border-teal-300 hover:text-[#08201c]'}`}>
              主世界日报
            </Link>
            <Link href="./ai" className={`rounded-full border px-3 py-1.5 transition ${kind === 'ai' ? 'border-teal-300 bg-[#eefaf4] text-[#087265]' : 'border-[#d3ddd7] bg-white/85 text-slate-500 hover:border-teal-300 hover:text-[#08201c]'}`}>
              AI 日报
            </Link>
            <Link href="./livebench" className={`rounded-full border px-3 py-1.5 transition ${kind === 'livebench' ? 'border-teal-300 bg-[#eefaf4] text-[#087265]' : 'border-[#d3ddd7] bg-white/85 text-slate-500 hover:border-teal-300 hover:text-[#08201c]'}`}>
              演绎日报
            </Link>
          </div>
        </div>

        <section className={`animate-fade-in-soft relative overflow-hidden rounded-[30px] border ${meta.tone} px-5 py-5 shadow-[0_16px_42px_rgba(20,43,39,0.065)] sm:px-6`}>
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px animate-tashan-scan bg-[linear-gradient(90deg,transparent,rgba(20,184,166,0.62),rgba(217,159,72,0.52),transparent)]" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.iconTone}`}>
                <Icon className="h-4 w-4" />
                {meta.eyebrow}
              </span>
              <h1 className="mt-4 font-serif text-4xl font-semibold sm:text-5xl">{meta.title}</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">{meta.subtitle}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/72 px-4 py-3 text-sm text-slate-600 shadow-[0_10px_24px_rgba(20,43,39,0.045)]">
              最近更新 {state ? formatTime(state.generated_at) : '--'}
            </div>
          </div>
          <p className="mt-5 max-w-4xl text-[15px] leading-8 text-slate-800">{digest}</p>
        </section>

        {kind !== 'livebench' ? (
          <section className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className={`animate-rise-in rounded-[28px] border ${meta.softTone} px-5 py-5 shadow-[0_12px_30px_rgba(20,43,39,0.045)]`}>
              <p className="text-xs font-semibold tracking-[0.12em] text-slate-400">今日主线</p>
              <h2 className="mt-3 text-2xl font-semibold leading-9">{lead ? readableSignalTitle(lead) : meta.empty}</h2>
              {lead ? <p className="mt-3 text-sm leading-7 text-slate-600">{readableSignalSummary(lead, 260)}</p> : null}
              {lead ? (
                <Link
                  href={dailySignalHref(lead.id, meta.scene)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d3ddd7] bg-white px-4 py-2 text-sm font-medium text-[#08201c] transition hover:border-teal-300"
                >
                  阅读原线索
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
              {signals.length > 1 ? (
                <div className="mt-6 rounded-[22px] border border-slate-200/70 bg-white/75 px-4 py-4">
                  <p className="text-[12px] font-semibold text-slate-500">另外值得留意</p>
                  <div className="mt-3 space-y-3">
                    {signals.slice(1, 4).map((signal) => (
                      <Link
                        key={`side-${signal.id}`}
                        href={dailySignalHref(signal.id, meta.scene)}
                      className="block border-l-2 border-[#d3ddd7] pl-3 text-[13px] font-medium leading-6 text-slate-800 transition hover:border-teal-400 hover:text-slate-950"
                      >
                        {readableSignalTitle(signal)}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-[#d4ded8] bg-white/78 px-4 py-3">
                <p className="text-[12px] font-semibold text-slate-700">精选线索</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">只展示今天最值得进入阅读的少量条目，完整线索回到时间线。</p>
              </div>
              {signals.length > 0 ? (
                signals.slice(0, 5).map((signal, index) => (
                  <Link
                    key={signal.id}
                    href={dailySignalHref(signal.id, meta.scene)}
                    className="group animate-rise-in block rounded-[24px] border border-[#d4ded8] bg-white/88 px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_32px_rgba(20,43,39,0.08)]"
                    style={{ animationDelay: `${80 + index * 45}ms` }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${severitySoftTone(signal.severity)}`}>
                        {severityLabel(signal.severity)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                        {readableSignalSourceLine(signal)}
                      </span>
                      <span className="ml-auto text-[11px] text-slate-400">{formatTime(signal.published_at)}</span>
                    </div>
                    <h3 className="mt-3 text-[15px] font-semibold leading-7 text-slate-950 group-hover:text-slate-700">
                      {readableSignalTitle(signal)}
                    </h3>
                    <p className="mt-2 text-[13px] leading-7 text-slate-600">{readableSignalSummary(signal, 210)}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      {readableSignalTags(signal.tags, 4).map((tag) => (
                        <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-sm text-slate-500">
                  {meta.empty}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2">
            {questions.length > 0 ? (
              questions.map((preview) => (
                <Link
                  key={preview.question_id}
                  href={worldHref(preview.href, 'global')}
                className="group animate-rise-in block rounded-[24px] border border-[#d4ded8] bg-white/88 px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_32px_rgba(20,43,39,0.08)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-teal-200 bg-[#eefaf4] px-2.5 py-1 text-[11px] text-[#087265]">
                      {questionLabel(preview)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                      {preview.topic_label}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                      {regionDisplayLabel(preview.region_label)}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-400">{questionTime(preview) ? formatTime(questionTime(preview)) : '--'}</span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold leading-7 text-slate-950 group-hover:text-slate-700">
                    {cleanNarrativeText(preview.title)}
                  </h3>
                  <p className="mt-2 text-[13px] leading-7 text-slate-600">{compactText(questionLine(preview), 220)}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-sm text-slate-500">
                {meta.empty}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
