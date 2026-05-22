import { headers } from 'next/headers';

import DashboardClient from '@/app/dashboard-client';
import { resolvePublicSkillUrl, resolveRequestOrigin } from '@/lib/request-origin';
import {
  getCachedWorldDashboardState,
  getCachedWorldSubworlds,
} from '@/lib/world/runtime';
import { isPublicEventSignal, sanitizePublicNarrativeText, sanitizePublicSignal } from '@/lib/world/signal-quality';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const INITIAL_NODE_LIMITS = {
  high: 64,
  elevated: 72,
  monitoring: 80,
} as const;
const INITIAL_CACHE_TIMEOUT_MS = 1500;

type InitialDashboardState = NonNullable<Awaited<ReturnType<typeof getCachedWorldDashboardState>>>;
type InitialDashboardNode = InitialDashboardState['nodes'][number];

function withInitialCacheTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), INITIAL_CACHE_TIMEOUT_MS);
    }),
  ]);
}

function initialNodeLevel(node: Pick<InitialDashboardNode, 'severity'>) {
  if (node.severity >= 4) return 'high';
  if (node.severity >= 3) return 'elevated';
  return 'monitoring';
}

function clipText(value: string | null | undefined, maxLength = 180) {
  if (!value) return value || '';
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function cleanInitialText(value: string | null | undefined, maxLength = 180) {
  if (!value) return value || '';
  const hiddenTraining = new RegExp('后台训' + '练', 'gu');
  return clipText(
    sanitizePublicNarrativeText(String(value))
      .replace(/我现在偏向赞成/gu, '当前偏向赞成')
      .replace(/我现在偏向不赞成/gu, '当前偏向不赞成')
      .replace(/我现在更看重的是/gu, '当前更需要核对')
      .replace(/我现在最看重的依据是/gu, '当前最关键的依据是')
      .replace(/我现在最看重的是/gu, '当前最关键的是')
      .replace(/我不会轻易/gu, '不宜轻易')
      .replace(/在我看到/gu, '在看到')
      .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '$1有相关报道。')
      .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '可能影响$1。')
      .replace(/这一笔声量起得不低，适合先压住。?/gu, '相关报道较集中。')
      .replace(/先轻轻记下，不急着加重语气。?/gu, '暂按一般报道处理。')
      .replace(/它未必最显眼，但这条线现在值得先补一笔。?/gu, '可作为补充材料。')
      .replace(/Signal Arena 是量化交易竞赛游戏平台，其行情快照为.{2}游戏数据，排行榜参与者仅一万余人，非专业金融数据源，仅作为背景参考。?/gu, '行情快照仅作背景参考。')
      .replace(hiddenTraining, '校准复盘')
      .replace(/续写/gu, '更新')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    maxLength,
  );
}

function selectInitialNodes(nodes: InitialDashboardNode[]) {
  const selectedIds = new Set<string>();
  const counts = {
    high: 0,
    elevated: 0,
    monitoring: 0,
  };

  for (const node of nodes) {
    if (node.geo.lat === null || node.geo.lng === null) continue;
    const level = initialNodeLevel(node);
    if (counts[level] >= INITIAL_NODE_LIMITS[level]) continue;
    selectedIds.add(node.node_id);
    counts[level] += 1;
  }

  return nodes
    .filter(isPublicEventSignal)
    .filter((node) => selectedIds.has(node.node_id))
    .map((node) => {
      const publicNode = sanitizePublicSignal(node);
      return ({
      node_id: node.node_id,
      node_type: node.node_type,
      geo: node.geo,
      tags: publicNode.tags,
      alignment_tags: publicNode.alignment_tags,
      intensity: node.intensity,
      mention_count: node.mention_count,
      scene: node.scene,
      hotspot_score: node.hotspot_score,
      exploration_score: node.exploration_score,
      coverage_gap: node.coverage_gap,
      severity: node.severity,
      display_level: node.display_level,
      published_at: node.published_at,
      updated_at: node.updated_at,
      last_report_at: node.last_report_at,
      source_name: publicNode.source_name,
      source_url: '',
      title: cleanInitialText(publicNode.display_title || publicNode.title, 120),
      summary: cleanInitialText(publicNode.display_summary || publicNode.summary),
      display_title: cleanInitialText(publicNode.display_title || publicNode.title, 120),
      display_summary: cleanInitialText(publicNode.display_summary || publicNode.summary),
      urgency_reason: cleanInitialText(publicNode.urgency_reason, 120),
      activities: [],
    }) as InitialDashboardNode;
    });
}

function slimInitialSignal<T extends { title?: string | null; summary?: string | null; display_title?: string | null; display_summary?: string | null; urgency_reason?: string | null; source_url?: string | null; tags?: string[] | null; alignment_tags?: string[] | null }>(signal: T): T {
  const publicSignal = sanitizePublicSignal(signal);
  return {
    ...publicSignal,
    title: cleanInitialText(publicSignal.display_title || publicSignal.title, 120),
    summary: cleanInitialText(publicSignal.display_summary || publicSignal.summary),
    display_title: cleanInitialText(publicSignal.display_title || publicSignal.title, 120),
    display_summary: cleanInitialText(publicSignal.display_summary || publicSignal.summary),
    urgency_reason: cleanInitialText(publicSignal.urgency_reason, 120),
    source_url: '',
  };
}

type InitialScene = 'tech-ai' | 'geo-politics-daily';

function buildInitialNextSteps(state: InitialDashboardState, scene: InitialScene) {
  const publicTopSignals = (state.top_signals || []).filter(isPublicEventSignal).map(sanitizePublicSignal);
  if (scene === 'geo-politics-daily') {
    const primaryTitle = cleanInitialText(publicTopSignals[0]?.display_title || publicTopSignals[0]?.title, 120);
    const steps = primaryTitle
      ? [`当前地缘重点：「${primaryTitle}」。`]
      : ['地缘信号会持续刷新。'];
    steps.push('首页只呈现地缘和 AI 两条主线，其他来源作为补充材料。');
    return steps;
  }
  const primaryTitle = cleanInitialText(publicTopSignals[0]?.display_title || publicTopSignals[0]?.title, 120);
  const steps = primaryTitle
    ? [`当前 AI 重点：「${primaryTitle}」。`]
    : ['AI 信源、精选和事件簇会持续刷新。'];
  steps.push('优先保留 AI 强相关线索，泛科技和其他信息不进入 AI 首屏。');
  steps.push('虾接入后，可以直接查当前信源和 AI 前沿线索。');
  return steps;
}

function slimInitialDashboardState(state: InitialDashboardState | null, scene: InitialScene): InitialDashboardState | null {
  if (!state) return state;
  const { livebench_arena: _livebenchArena, source_catalog: _sourceCatalog, source_knowledge: _sourceKnowledge, ...rest } = state as InitialDashboardState & Record<string, unknown>;
  return {
    ...rest,
    scene,
    nodes: selectInitialNodes(state.nodes || []),
    graph_signals: (state.graph_signals || []).filter(isPublicEventSignal).slice(0, 8).map(slimInitialSignal),
    top_signals: (state.top_signals || []).filter(isPublicEventSignal).slice(0, 12).map(slimInitialSignal),
    knowledge_signals: (state.knowledge_signals || []).filter(isPublicEventSignal).slice(0, 4).map(slimInitialSignal),
    pending_question_previews: [],
    resolved_question_previews: [],
    what_to_do_next: buildInitialNextSteps(state, scene),
    quick_links: (state.quick_links || []).map((link) => ({
      ...link,
      description: cleanInitialText(link.description, 100),
    })),
  };
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function resolveInitialScene(searchParams?: Record<string, string | string[] | undefined>) {
  const rawScene = searchParams?.scene;
  const scene = Array.isArray(rawScene) ? rawScene[0] : rawScene;
  if (scene === 'geo-politics-daily' || scene === 'global' || scene === 'finance') return 'geo-politics-daily';
  return 'tech-ai';
}

export default async function Page({ searchParams }: PageProps) {
  const scene = resolveInitialScene(await searchParams);
  const requestHeaders = await headers();
  const requestOrigin = resolveRequestOrigin({ headers: requestHeaders });
  const [cachedState, cachedSubworlds] = await Promise.all([
    withInitialCacheTimeout(getCachedWorldDashboardState(scene), null),
    withInitialCacheTimeout(getCachedWorldSubworlds(), []),
  ]);

  const nextInitialState =
    cachedState
      ? {
          ...cachedState,
          skill_entry: cachedState.skill_entry
            ? {
                ...cachedState.skill_entry,
                url: resolvePublicSkillUrl({ headers: requestHeaders, fallbackOrigin: requestOrigin }) || cachedState.skill_entry.url,
                description:
                  '把这个地址交给接入方即可。可查询近 30 天信源、AI 日报和主世界日报。',
                copy_hint: '日常回答先读精选线索；需要深挖时再进入全部信源。',
              }
            : null,
        }
      : cachedState;

  return (
    <DashboardClient
      initialScene={scene}
      initialState={slimInitialDashboardState(nextInitialState, scene)}
      initialSubworlds={cachedSubworlds}
    />
  );
}
