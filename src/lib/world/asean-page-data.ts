import { readAseanDatasetMetricState } from '@/lib/world/asean-dataset-metrics';
import { readAseanMetasoSearchStatus, readAseanMetasoSignals, type AseanMetasoSearchStatus } from '@/lib/world/asean-metaso-search';
import { readAseanPublicRiskSignals } from '@/lib/world/asean-public-risk-events';
import { readAseanResearchResults } from '@/lib/world/asean-research-results';
import { readAseanSourceFeedSignals } from '@/lib/world/asean-source-feeds';
import { buildAseanTopic, type AseanSignalLike, type AseanTopicPayload } from '@/lib/world/asean-topic';
import { isPublicEventSignal, sanitizePublicSignal } from '@/lib/world/signal-quality';
import type { WorldEvidenceSignal } from '@/lib/world/types';

function dedupeSignals(signals: WorldEvidenceSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.id || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function selectDatasetMetricSignals(signals: AseanSignalLike[], limit = 8) {
  const priority = (signal: AseanSignalLike) => {
    const text = [
      signal.title,
      signal.summary,
      signal.source_name,
      ...(signal.tags || []),
      ...(signal.alignment_tags || []),
    ].filter(Boolean).join(' ');
    if (/电力|电价|用电|能源|数据中心|算力|secure internet servers|electricity|energy|data center|compute/iu.test(text)) return 0;
    if (/高技术|贸易|FDI|投资|high-technology|trade|investment/iu.test(text)) return 1;
    return 2;
  };
  const countryRank = (signal: AseanSignalLike) => {
    const text = [signal.country, signal.title, signal.summary].filter(Boolean).join(' ');
    const order = ['越南', '泰国', '马来西亚', '新加坡', '印尼', '印度尼西亚', '菲律宾', '老挝', '柬埔寨', '缅甸', '文莱', '东帝汶'];
    const index = order.findIndex((country) => text.includes(country));
    return index < 0 ? order.length : index;
  };
  return [...signals]
    .sort((left, right) => priority(left) - priority(right) || countryRank(left) - countryRank(right))
    .slice(0, limit);
}

export type ReadAseanTopicOptions = {
  request?: Request;
  limit?: number;
  force?: boolean;
};

function readAseanDashboard() {
  return {
    generated_at: new Date().toISOString(),
    top_signals: [] as WorldEvidenceSignal[],
    graph_signals: [] as WorldEvidenceSignal[],
    knowledge_signals: [] as WorldEvidenceSignal[],
  };
}

function publicAseanSourceName(value: string | null | undefined) {
  const text = String(value || '');
  if (/Malaysia OpenAPI Fuel Price/iu.test(text)) return '马来西亚公开燃油价格';
  if (/Malaysia OpenAPI Electricity Supply/iu.test(text)) return '马来西亚公开电力供应数据';
  if (/Malaysia OpenAPI Electricity Consumption/iu.test(text)) return '马来西亚公开用电数据';
  if (/Malaysia OpenAPI Industrial Production/iu.test(text)) return '马来西亚公开工业生产数据';
  if (/Malaysia OpenAPI/iu.test(text)) return '马来西亚公开数据';
  return text;
}

function publicAseanText(value: string | null | undefined) {
  return String(value || '')
    .replace(/Malaysia OpenAPI Fuel Price/gu, '马来西亚公开燃油价格')
    .replace(/Malaysia OpenAPI Electricity Supply/gu, '马来西亚公开电力供应数据')
    .replace(/Malaysia OpenAPI Electricity Consumption/gu, '马来西亚公开用电数据')
    .replace(/Malaysia OpenAPI Industrial Production/gu, '马来西亚公开工业生产数据')
    .replace(/Malaysia OpenAPI/gu, '马来西亚公开数据');
}

function publicAseanPayload<T>(value: T): T {
  if (typeof value === 'string') return publicAseanText(value) as T;
  if (Array.isArray(value)) return value.map((item) => publicAseanPayload(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, publicAseanPayload(item)]),
    ) as T;
  }
  return value;
}

function publicSourceProcessing<T extends AseanTopicPayload['source_processing']>(sourceProcessing: T): T {
  if (!sourceProcessing) return sourceProcessing;
  return {
    ...sourceProcessing,
    profiles: sourceProcessing.profiles.map((profile) => ({
      ...profile,
      name: publicAseanSourceName(profile.name),
      scope: publicAseanText(profile.scope),
      issue: publicAseanText(profile.issue),
    })),
  };
}

function publicSourcePool<T extends AseanTopicPayload['source_pool']>(sourcePool: T): T {
  return sourcePool.map((source) => ({
    ...source,
    name: publicAseanSourceName(source.name),
    scope: publicAseanText(source.scope),
    verification: source.verification ? publicAseanText(source.verification) : source.verification,
  })) as T;
}

export async function readAseanTopic(
  options: ReadAseanTopicOptions = {},
): Promise<
  AseanTopicPayload & {
    generated_at: string;
    incremental_search: AseanMetasoSearchStatus;
    dataset_metric_status: {
      enabled: boolean;
      refreshed_at: string;
      latest_run: Awaited<ReturnType<typeof readAseanDatasetMetricState>>['latest_run'];
      metric_count: number;
      source_health: Awaited<ReturnType<typeof readAseanDatasetMetricState>>['source_health'];
    };
    dataset_series: Awaited<ReturnType<typeof readAseanDatasetMetricState>>['series'];
    recent_research_reports: Awaited<ReturnType<typeof readAseanResearchResults>>;
  }
> {
  const limit = options.limit || 40;
  const dashboard = readAseanDashboard();
  const signals = dedupeSignals([
    ...(dashboard.top_signals || []),
    ...(dashboard.graph_signals || []),
    ...(dashboard.knowledge_signals || []),
  ])
    .filter(isPublicEventSignal)
    .map(sanitizePublicSignal)
    .filter(isPublicEventSignal);

  const metasoSignals = await readAseanMetasoSignals({ force: options.force });
  const sourceFeedSignals = await readAseanSourceFeedSignals({ force: options.force });
  const publicRiskSignals = await readAseanPublicRiskSignals({ force: options.force });
  const datasetMetricState = await readAseanDatasetMetricState({ force: options.force });
  const datasetMapSignals = selectDatasetMetricSignals(datasetMetricState.signals);
  const metasoStatus = await readAseanMetasoSearchStatus();
  const recentResearchReports = await readAseanResearchResults(6);
  const topicPayload = buildAseanTopic([...signals, ...sourceFeedSignals, ...publicRiskSignals, ...metasoSignals, ...datasetMapSignals], limit, {
    datasetMetrics: datasetMetricState.metrics,
    datasetSourceHealth: datasetMetricState.source_health,
  });

  return publicAseanPayload({
    generated_at: dashboard.generated_at,
    incremental_search: {
      ...metasoStatus,
      signal_count: metasoSignals.length,
    },
    dataset_metric_status: {
      enabled: datasetMetricState.enabled,
      refreshed_at: datasetMetricState.refreshed_at,
      latest_run: datasetMetricState.latest_run,
      metric_count: datasetMetricState.metrics.length,
      source_health: datasetMetricState.source_health,
    },
    dataset_series: datasetMetricState.series,
    recent_research_reports: recentResearchReports,
    ...topicPayload,
    source_processing: publicSourceProcessing(topicPayload.source_processing),
    source_pool: publicSourcePool(topicPayload.source_pool),
    questions: topicPayload.questions.map((question) => ({
      ...question,
      resolution_source: publicAseanText(question.resolution_source),
    })),
    research_blueprints: topicPayload.research_blueprints.map((blueprint) => ({
      ...blueprint,
      primary_resolution_sources: blueprint.primary_resolution_sources.map(publicAseanText),
    })),
  });
}
