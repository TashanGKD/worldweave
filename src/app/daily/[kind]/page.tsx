import Link from 'next/link';
import { ArrowLeft, Bot, FileText, Globe2 } from 'lucide-react';
import { headers } from 'next/headers';

import { DailySharePoster } from '@/app/daily/daily-share-poster';
import {
  asArray,
  cleanNarrativeText,
  compactText,
  formatTime,
  regionDisplayLabel,
  severityLabel,
  severitySoftTone,
  shellCardClass,
  signalDetailHref,
  worldHomeHref,
  worldHref,
  worldChipClass,
  worldPageClass,
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
import { curateWorldDailySignals, getCachedWorldDashboardState, type WorldDailyCurationItem } from '@/lib/world/runtime';
import { resolveRequestOrigin } from '@/lib/request-origin';
import { isPublicEventSignal, sanitizePublicNarrativeText, sanitizePublicSignal } from '@/lib/world/signal-quality';
import type { LiveBenchQuestionPreview, WorldScene } from '@/lib/world/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DailyKind = 'geo' | 'ai' | 'livebench';
type CachedDashboard = NonNullable<Awaited<ReturnType<typeof getCachedWorldDashboardState>>>;
type DailySignal = CachedDashboard['top_signals'][number];
type CuratedDailySignal = DailySignal & {
  daily_display_title?: string;
  daily_display_summary?: string;
};

const DAILY_TOP_LIMIT = 10;
const DAILY_CANDIDATE_LIMIT = 24;
const DAILY_STATE_TIMEOUT_MS = 2500;

const DAILY_META: Record<
  DailyKind,
  {
    scene: WorldScene;
    title: string;
    eyebrow: string;
    subtitle: string;
    empty: string;
    href: string;
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
    href: worldHomeHref('geo-politics-daily'),
    softTone: 'border-[#d4ded8] bg-white/90',
    iconTone: 'border-teal-200 bg-white text-[#087265]',
  },
  ai: {
    scene: 'tech-ai',
    title: 'AI 日报',
    eyebrow: '模型与产品',
    subtitle: '把今天值得看的模型、Agent、论文、开源和产业动态整理在一页。',
    empty: '当前还没有可展示的 AI 日报线索。',
    href: worldHomeHref('tech-ai'),
    softTone: 'border-[#d4ded8] bg-white/90',
    iconTone: 'border-teal-200 bg-white text-[#087265]',
  },
  livebench: {
    scene: 'global',
    title: '演绎日报',
    eyebrow: '题池与结算',
    subtitle: '把正在跟踪和已经结算的问题集中成一页，便于看判断是否经得起后续结果检验。',
    empty: '当前还没有可展示的演绎题目。',
    href: worldHomeHref('global'),
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

function normalizeDailyTitleKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ')
    .trim();
}

function dailySignalTitle(signal: CuratedDailySignal) {
  return compactText(cleanNarrativeText(signal.daily_display_title || readableSignalTitle(signal)), 90);
}

function applyDailyCuration(signal: DailySignal, item: WorldDailyCurationItem | undefined): CuratedDailySignal {
  if (!item) return signal;
  return {
    ...signal,
    daily_display_title: sanitizePublicNarrativeText(item.displayTitle),
    daily_display_summary: sanitizePublicNarrativeText(item.displaySummary),
  };
}

function dedupeDailyVisibleTitles(signals: CuratedDailySignal[]) {
  const byKey = new Map<string, CuratedDailySignal>();
  for (const signal of signals) {
    const key = normalizeDailyTitleKey(dailySignalTitle(signal)) || signal.id;
    if (!byKey.has(key)) {
      byKey.set(key, signal);
    }
  }
  return [...byKey.values()];
}

function dailySignalScore(kind: DailyKind, signal: DailySignal) {
  if (kind === 'ai') {
    return techAiRelevanceScore(signal) + (signal.relevance_score || 0) * 0.5 + signal.hotspot_score * 0.25;
  }
  return mainWorldSignalPriority(signal);
}

async function selectDailySignals(kind: DailyKind, state: CachedDashboard | null): Promise<CuratedDailySignal[]> {
  if (!state || kind === 'livebench') return [];
  const scene = DAILY_META[kind].scene;
  const sortedSignals = uniqueSignals(state.top_signals, state.graph_signals, state.knowledge_signals)
    .filter(isPublicEventSignal)
    .map(sanitizePublicSignal)
    .filter((signal) => (kind === 'ai' ? isTrustedTechAiDashboardSignal(signal) : dashboardSignalMatchesScene(signal, scene)))
    .sort((left, right) => {
      return (
        dailySignalScore(kind, right) - dailySignalScore(kind, left) ||
        (kind === 'ai' ? techAiSignalRank(left) - techAiSignalRank(right) : mainWorldSignalRank(left) - mainWorldSignalRank(right)) ||
        new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
      );
    });
  const candidates = sortedSignals.slice(0, DAILY_CANDIDATE_LIMIT);
  const modelItems = await curateWorldDailySignals({
    kind: kind === 'ai' ? 'ai' : 'geo',
    generatedAt: state.generated_at,
    limit: DAILY_TOP_LIMIT,
    candidates: candidates.map((signal, index) => ({
      id: signal.id,
      rank: index + 1,
      title: readableSignalTitle(signal),
      summary: dailyReadableSummary(signal, kind, 220),
      source: dailySourceLine(signal, kind),
      publishedAt: signal.published_at,
      score: dailySignalScore(kind, signal),
      tags: [...(signal.tags || []), ...(signal.alignment_tags || [])],
    })),
  });
  const byId = new Map(candidates.map((signal) => [signal.id, signal]));
  const itemById = new Map(modelItems.map((item) => [item.id, item]));
  const selected = modelItems
    .map((item) => {
      const signal = byId.get(item.id);
      return signal ? applyDailyCuration(signal, item) : null;
    })
    .filter((signal): signal is CuratedDailySignal => Boolean(signal));
  const filled = [...selected, ...candidates.filter((signal) => !selected.some((item) => item.id === signal.id))];
  return dedupeDailyVisibleTitles(filled.map((signal) => applyDailyCuration(signal, itemById.get(signal.id)))).slice(0, DAILY_TOP_LIMIT);
}

function dailyDigest(kind: DailyKind, signals: DailySignal[], fallback: string) {
  if (signals.length === 0) return fallback;
  if (kind === 'ai') {
    return `今天先看这 ${signals.length} 条 AI 动态，早午晚各换一版。`;
  }
  return `今天先看这 ${signals.length} 条公共风险消息，早午晚各换一版。`;
}

function dailyEditionLabel(value?: string | null) {
  if (!value) return '早 / 午 / 晚滚动';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '早 / 午 / 晚滚动';
  const hourText = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const hour = Number(hourText);
  if (hour >= 20) return '晚版';
  if (hour >= 12) return '午版';
  return '早版';
}

function dailySourceLine(signal: DailySignal, kind: DailyKind) {
  const line = readableSignalSourceLine(signal);
  const dropped = new Set(kind === 'ai' ? ['AI HOT', 'AI 前沿', 'AI', '科技'] : kind === 'geo' ? ['地缘'] : []);
  const parts = line
    .split(' · ')
    .map((part) => part.trim())
    .filter((part, index, array) => part && array.indexOf(part) === index && !dropped.has(part));
  return compactText(parts.join(' · ') || line || '来源', 46);
}

function dailySignalTags(signal: DailySignal, kind: DailyKind) {
  const allowed =
    kind === 'ai'
      ? new Set(['论文', '产业', 'AI 产品', 'Agent', '研究', '开源'])
      : new Set(['冲突', '外交', '制裁', '军事', '公共卫生', '安全', '市场', '航运', '能源']);
  return readableSignalTags([...(signal.tags || []), ...(signal.alignment_tags || [])], 8)
    .filter((tag) => allowed.has(tag))
    .slice(0, 3);
}

function dailyFallbackSummary(signal: DailySignal, kind: DailyKind, max: number) {
  const title = readableSignalTitle(signal);
  const sourceParts = dailySourceLine(signal, kind).split(' · ').map((part) => part.trim()).filter(Boolean);
  const location = sourceParts.find((part) => part !== '冲突' && part !== '科技' && !part.includes('.')) || '';
  const topic = dailySignalTags(signal, kind)[0] || (kind === 'ai' ? 'AI' : '公共风险');

  if (kind === 'ai') {
    return compactText(`这条消息落在${topic}方向，影响会先体现在模型能力、产品节奏和开源生态的变化里。`, max);
  }

  if (/反恐|军官|训练学校/u.test(title)) {
    return compactText(`反恐训练设施遇袭，会直接牵动当地安全力量和周边防务安排。`, max);
  }
  if (/学校|儿童|绑架|失踪/u.test(title)) {
    return compactText(`学校和儿童相关事件最容易牵动公众情绪，也会把地方安全压力迅速推到台前。`, max);
  }
  if (/加强.*军事行动|军事行动|约旦河西岸/u.test(title)) {
    return compactText(`军事行动范围继续外扩，加沙与约旦河西岸的紧张感也会一起被放大。`, max);
  }
  if (/公共厨房|平民|加沙/u.test(title)) {
    return compactText(`公共设施和平民伤亡会继续推高人道压力，也让外部外交表态更难回避。`, max);
  }
  if (/防空|拦截|莫斯科/u.test(title)) {
    return compactText(`莫斯科防空拦截说明风险仍在向后方城市传导，机场和城市安全感都会受到影响。`, max);
  }
  if (/无人机|乌克兰|俄罗斯/u.test(title)) {
    return compactText(`无人机袭击把俄乌冲突的后方城市和交通节点重新拉回风险中心。`, max);
  }
  if (/加沙|约旦河西岸|以色列/u.test(title)) {
    return compactText(`这条消息继续牵动加沙与约旦河西岸局势，平民安全和外交压力都会被一起推高。`, max);
  }
  if (/死亡|伤亡|遇袭|冲突/u.test(title)) {
    return compactText(`这起事件已经进入今天最需要留意的公共风险消息，影响会沿着安全和舆论两条线扩散。`, max);
  }

  return compactText(
    location
      ? `${location} 的${topic}消息值得放在今天的风险脉络里一起看。`
      : `这条${topic}消息值得放在今天的风险脉络里一起看。`,
    max,
  );
}

function dailyReadableSummary(signal: CuratedDailySignal, kind: DailyKind, max: number) {
  const title = dailySignalTitle(signal);
  if (signal.daily_display_summary) {
    return compactText(cleanNarrativeText(signal.daily_display_summary), max);
  }
  const summary = readableSignalSummary(signal, max);
  if (!summary || summary === title || summary.startsWith(title.slice(0, Math.min(18, title.length)))) {
    return dailyFallbackSummary(signal, kind, max);
  }
  return summary;
}

function questionTime(preview: LiveBenchQuestionPreview) {
  return preview.official_resolved_at || preview.resolve_at || preview.aggregate_vote.updated_at || '';
}

function sanitizeQuestionPreviewForPage(preview: LiveBenchQuestionPreview): LiveBenchQuestionPreview {
  return {
    ...preview,
    title: sanitizePublicNarrativeText(preview.title),
    background: sanitizePublicNarrativeText(preview.background),
    moderator_line: sanitizePublicNarrativeText(preview.moderator_line),
  };
}

function questionLine(preview: LiveBenchQuestionPreview) {
  return cleanNarrativeText(sanitizePublicNarrativeText(preview.moderator_line || preview.background || preview.title));
}

function questionTitle(preview: LiveBenchQuestionPreview) {
  return cleanNarrativeText(preview.title)
    .replace(/^Anthropic's next ARR figure show an accelerating % growth rate会发生吗？$/u, 'Anthropic 下一次 ARR 增速是否继续加快？')
    .replace(/^谷歌 announce Gemini 4 at I\/O 2026 \(May 19-20\)会发生吗？$/u, '谷歌是否会在 I/O 2026 发布 Gemini 4？')
    .replace(/^在 5月22日之前，伊朗 \/ 美国 war resume 会发生吗？$/u, '5月22日前，伊朗与美国冲突是否会恢复？')
    .replace(/会发生吗？$/u, '是否会发生？');
}

function questionSummary(preview: LiveBenchQuestionPreview) {
  const raw = questionLine(preview);
  const stance = raw.match(/^当前偏向(赞成|不赞成)。/u)?.[1];
  const evidence = raw
    .replace(/^当前偏向(?:赞成|不赞成)。/u, '')
    .replace(/^当前更需要核对[^。]*。/u, '')
    .replace(/^当前最关键的依据是：/u, '依据：')
    .replace(/^眼前能抓住的依据是：/u, '依据：');
  return compactText(stance ? `判断：${stance}。${evidence}` : evidence, 150);
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

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function getDailyState(kind: DailyKind, scene: WorldScene): Promise<CachedDashboard | null> {
  if (kind !== 'livebench') return getCachedWorldDashboardState(scene);
  const requestOrigin = resolveRequestOrigin({ headers: await headers() });
  if (!requestOrigin) return getCachedWorldDashboardState(scene);
  const apiState = await Promise.race([
    fetch(`${requestOrigin}/api/v1/world/state?scene=${scene}&limit=80`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(DAILY_STATE_TIMEOUT_MS),
    })
      .then(async (response) => (response.ok ? ((await response.json()) as CachedDashboard) : null))
      .catch(() => null),
    timeout<CachedDashboard | null>(DAILY_STATE_TIMEOUT_MS, null),
  ]);
  return apiState || getCachedWorldDashboardState(scene);
}

type PageProps = {
  params?: Promise<{ kind?: string }>;
};

export default async function DailyPage({ params }: PageProps) {
  const kind = resolveKind((await params)?.kind);
  const meta = DAILY_META[kind];
  const state = await getDailyState(kind, meta.scene);
  const signals = await selectDailySignals(kind, state);
  const questions =
    kind === 'livebench'
      ? [...asArray(state?.pending_question_previews), ...asArray(state?.resolved_question_previews)].map(sanitizeQuestionPreviewForPage).slice(0, 6)
      : [];
  const lead = signals[0] || null;
  const leadSummary = lead ? dailyReadableSummary(lead, kind, 320) : '';
  const posterLead = lead
    ? {
        rank: '01',
        title: dailySignalTitle(lead),
        summary: leadSummary,
        source: dailySourceLine(lead, kind),
        time: formatTime(lead.published_at),
      }
    : null;
  const posterItems = signals.slice(1, DAILY_TOP_LIMIT).map((signal, index) => ({
    rank: String(index + 2).padStart(2, '0'),
    title: dailySignalTitle(signal),
    summary: dailyReadableSummary(signal, kind, 260),
    source: dailySourceLine(signal, kind),
    time: formatTime(signal.published_at),
  }));
  const Icon = kind === 'geo' ? Globe2 : kind === 'ai' ? Bot : FileText;
  const digest =
    kind === 'livebench'
      ? questions.length > 0
        ? `共整理 ${questions.length} 道题：优先看仍在跟踪和刚刚结算的判断。`
        : meta.empty
      : dailyDigest(kind, signals, meta.empty);

  return (
    <main className={worldPageClass('py-0')}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={meta.href}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-container)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回世界脉络
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="./geo" className={worldChipClass(kind === 'geo', 'py-1.5')}>
              主世界日报
            </Link>
            <Link href="./ai" className={worldChipClass(kind === 'ai', 'py-1.5')}>
              AI 日报
            </Link>
            <Link href="./livebench" className={worldChipClass(kind === 'livebench', 'py-1.5')}>
              演绎日报
            </Link>
          </div>
        </div>

        <section className={shellCardClass('animate-fade-in-soft relative px-5 py-5 sm:px-6')}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.iconTone}`}>
                <Icon className="h-4 w-4" />
                {meta.eyebrow}
              </span>
              <h1 className="mt-4 font-serif text-4xl font-semibold sm:text-5xl">{meta.title}</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">{meta.subtitle}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              {dailyEditionLabel(state?.generated_at)} · 最近更新 {state ? formatTime(state.generated_at) : '--'}
            </div>
          </div>
          <p className="mt-5 max-w-4xl text-[15px] leading-8 text-slate-800">{compactText(digest, 150)}</p>
        </section>

        {kind !== 'livebench' ? (
          <section className="grid gap-5 lg:grid-cols-[0.98fr_1.02fr] lg:items-start">
            <div>
              <DailySharePoster
                kind={kind}
                title={meta.title}
                eyebrow={meta.eyebrow}
                dateLabel={state ? formatTime(state.generated_at) : '--'}
                digest={compactText(digest, 96)}
                lead={posterLead}
                items={posterItems}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-[#d4ded8] bg-white/78 px-4 py-3">
                <p className="text-[12px] font-semibold text-slate-700">今日 10 条</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">早午晚各换一版，只保留今天最值得先看的内容。</p>
              </div>
              {signals.length > 0 ? (
                <div className="space-y-3 lg:max-h-[860px] lg:overflow-y-auto lg:pr-1">
                  {signals.slice(0, DAILY_TOP_LIMIT).map((signal, index) => {
                    const tags = dailySignalTags(signal, kind);
                    const summary = dailyReadableSummary(signal, kind, 320);
                    return (
                      <Link
                        key={signal.id}
                        href={dailySignalHref(signal.id, meta.scene)}
                        className="group animate-rise-in block rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-sm"
                        style={{ animationDelay: `${80 + index * 45}ms` }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          {signal.severity >= 3 ? (
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${severitySoftTone(signal.severity)}`}>
                              {severityLabel(signal.severity)}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                            {dailySourceLine(signal, kind)}
                          </span>
                          <span className="ml-auto text-[11px] text-slate-400">{formatTime(signal.published_at)}</span>
                        </div>
                        <h3 className="mt-3 text-[15px] font-semibold leading-7 text-slate-950 group-hover:text-slate-700">
                          {dailySignalTitle(signal)}
                        </h3>
                        {summary ? <p className="mt-2 text-[13px] leading-7 text-slate-600">{summary}</p> : null}
                        {tags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-container)] px-4 py-8 text-sm text-[var(--text-secondary)]">
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
                className="group animate-rise-in block rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-container)] px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-sm"
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
                    {questionTitle(preview)}
                  </h3>
                  <p className="mt-2 text-[13px] leading-7 text-slate-600">{questionSummary(preview)}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-container)] px-4 py-8 text-sm text-[var(--text-secondary)]">
                {meta.empty}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
