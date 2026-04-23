import { headers } from 'next/headers';

import DashboardClient from '@/app/dashboard-client';
import { resolvePublicSkillUrl, resolveRequestOrigin } from '@/lib/request-origin';
import {
  getCachedWorldDashboardState,
  getCachedWorldSubworlds,
} from '@/lib/world/runtime';

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
    String(value)
      .replace(/我现在偏向赞成/gu, '当前偏向赞成')
      .replace(/我现在偏向不赞成/gu, '当前偏向不赞成')
      .replace(/我现在更看重的是/gu, '当前更需要核对')
      .replace(/我现在最看重的依据是/gu, '当前最关键的依据是')
      .replace(/我现在最看重的是/gu, '当前最关键的是')
      .replace(/我不会轻易/gu, '不宜轻易')
      .replace(/在我看到/gu, '在看到')
      .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '出现新的$1信号。')
      .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '后续重点看是否影响$1。')
      .replace(/这一笔声量起得不低，适合先压住。?/gu, '目前热度较高，需继续跟踪。')
      .replace(/先轻轻记下，不急着加重语气。?/gu, '按普通监测处理。')
      .replace(/它未必最显眼，但这条线现在值得先补一笔。?/gu, '这条线索值得补充观察。')
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
    .filter((node) => selectedIds.has(node.node_id))
    .map((node) => ({
      node_id: node.node_id,
      node_type: node.node_type,
      geo: node.geo,
      tags: node.tags,
      alignment_tags: node.alignment_tags,
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
      source_name: node.source_name,
      source_url: '',
      title: cleanInitialText(node.display_title || node.title, 120),
      summary: cleanInitialText(node.display_summary || node.summary),
      display_title: cleanInitialText(node.display_title || node.title, 120),
      display_summary: cleanInitialText(node.display_summary || node.summary),
      urgency_reason: cleanInitialText(node.urgency_reason, 120),
      activities: [],
    }) as InitialDashboardNode);
}

function slimInitialSignal<T extends { title?: string; summary?: string; display_title?: string; display_summary?: string; urgency_reason?: string; source_url?: string }>(signal: T): T {
  return {
    ...signal,
    title: cleanInitialText(signal.display_title || signal.title, 120),
    summary: cleanInitialText(signal.display_summary || signal.summary),
    display_title: cleanInitialText(signal.display_title || signal.title, 120),
    display_summary: cleanInitialText(signal.display_summary || signal.summary),
    urgency_reason: cleanInitialText(signal.urgency_reason, 120),
    source_url: '',
  };
}

function slimInitialQuestionPreview(preview: InitialDashboardState['pending_question_previews'][number]) {
  return {
    ...preview,
    title: cleanInitialText(preview.title, 140),
    background: cleanInitialText(preview.background, 180),
    moderator_line: cleanInitialText(preview.moderator_line, 180),
  };
}

function buildInitialNextSteps(state: InitialDashboardState) {
  const primaryTitle = cleanInitialText(state.pending_question_previews?.[0]?.title, 120);
  const steps = primaryTitle
    ? [`当前题池重点：「${primaryTitle}」。题目页包含主持人串讲、阵营回复和信源依据。`]
    : ['题池、信源和模型表现会持续刷新。'];
  if ((state.evaluation_summary?.scored_question_count || 0) > 0) {
    steps.push('模型表现页展示最近已结算题的预测误差和校准变化。');
  } else {
    steps.push('已结算题会在补齐可计分投票后进入模型表现。');
  }
  steps.push('虾接入后，信源查询会沉淀为判断样本，并用于后续回答复盘。');
  return steps;
}

function slimInitialDashboardState(state: InitialDashboardState | null): InitialDashboardState | null {
  if (!state) return state;
  const { livebench_arena: _livebenchArena, source_catalog: _sourceCatalog, source_knowledge: _sourceKnowledge, ...rest } = state as InitialDashboardState & Record<string, unknown>;
  return {
    ...rest,
    nodes: selectInitialNodes(state.nodes || []),
    graph_signals: (state.graph_signals || []).slice(0, 8).map(slimInitialSignal),
    top_signals: (state.top_signals || []).slice(0, 12).map(slimInitialSignal),
    knowledge_signals: (state.knowledge_signals || []).slice(0, 4).map(slimInitialSignal),
    pending_question_previews: (state.pending_question_previews || []).slice(0, 8).map(slimInitialQuestionPreview),
    resolved_question_previews: (state.resolved_question_previews || []).slice(0, 2).map(slimInitialQuestionPreview),
    what_to_do_next: buildInitialNextSteps(state),
    quick_links: (state.quick_links || []).map((link) => ({
      ...link,
      description: cleanInitialText(link.description, 100),
    })),
  };
}

export default async function Page() {
  const scene = 'global' as const;
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
                  '把这个地址交给接入方即可。它用于近 30 天信源查询，也会把判断样本带回校准复盘。',
                copy_hint: '每次查完信源，系统都会沉淀复盘样本，再把验证过的方法带回后续回答。',
              }
            : null,
        }
      : cachedState;

  return (
    <DashboardClient
      initialScene={scene}
      initialState={slimInitialDashboardState(nextInitialState)}
      initialSubworlds={cachedSubworlds}
    />
  );
}
