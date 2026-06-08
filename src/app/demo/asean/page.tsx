import { readAseanTopic } from '@/lib/world/asean-page-data';

import AseanDemoClient from './asean-demo-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ASEAN_VISIBLE_SCOPE =
  /东盟|东南亚|马来西亚|越南|新加坡|泰国|老挝|柬埔寨|缅甸|菲律宾|印尼|印度尼西亚|文莱|东帝汶|帝汶|南海|马六甲|湄公河|ASEAN|Southeast Asia|Malaysia|Vietnam|Viet Nam|Singapore|Thailand|Laos|Lao PDR|Cambodia|Myanmar|Philippines|Indonesia|Brunei|Timor-Leste|South China Sea|Malacca|Mekong/iu;
const GUANGXI_COLLABORATION_SCOPE = /广西|Guangxi/iu;
const CROSS_BORDER_SCOPE = /东盟|东南亚|跨境|出海|协同|电力互联|互联互通|ASEAN|Southeast Asia|cross-border|interconnection/iu;

function publicSourceName(value: string | null | undefined) {
  const text = String(value || '');
  if (/Malaysia OpenAPI Fuel Price/iu.test(text)) return '马来西亚公开燃油价格';
  if (/Malaysia OpenAPI Electricity Supply/iu.test(text)) return '马来西亚公开电力供应数据';
  if (/Malaysia OpenAPI Electricity Consumption/iu.test(text)) return '马来西亚公开用电数据';
  if (/Malaysia OpenAPI Industrial Production/iu.test(text)) return '马来西亚公开工业生产数据';
  if (/Malaysia OpenAPI/iu.test(text)) return '马来西亚公开数据';
  return text;
}

function publicText(value: string | null | undefined) {
  return String(value || '')
    .replace(/^冒烟测试[:：]\s*/u, '')
    .replace(/不应直接解释为电价预测或数据中心供电缺口预测/gu, '需与电价、供电和项目数据交叉核验后使用')
    .replace(/不等同于电价或供电缺口/gu, '需与电价和供电数据交叉核验')
    .replace(/XGBoost/gu, '时序预测')
    .replace(/\b(?:MAE|MAPE|RMSE|R²)\b/gu, '回看误差')
    .replace(/[，,；;。.]?\s*三段以内[。.]?/gu, '')
    .replace(/Malaysia OpenAPI Fuel Price/gu, '马来西亚公开燃油价格')
    .replace(/Malaysia OpenAPI Electricity Supply/gu, '马来西亚公开电力供应数据')
    .replace(/Malaysia OpenAPI Electricity Consumption/gu, '马来西亚公开用电数据')
    .replace(/Malaysia OpenAPI Industrial Production/gu, '马来西亚公开工业生产数据')
    .replace(/Malaysia OpenAPI/gu, '马来西亚公开数据');
}

function sanitizeClientStrings(value: unknown): unknown {
  if (typeof value === 'string') return publicText(value);
  if (Array.isArray(value)) return value.map(sanitizeClientStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeClientStrings(item)]),
    );
  }
  return value;
}

function textFromItem(item: Record<string, unknown>) {
  return [
    item.title,
    item.summary,
    item.source_name,
    item.source_url,
    ...(Array.isArray(item.country_scope) ? item.country_scope : []),
  ]
    .filter(Boolean)
    .join(' ');
}

function isVisibleAseanItem(item: Record<string, unknown>) {
  const text = textFromItem(item);
  return ASEAN_VISIBLE_SCOPE.test(text) || (GUANGXI_COLLABORATION_SCOPE.test(text) && CROSS_BORDER_SCOPE.test(text));
}

function sanitizeSignal(signal: Record<string, unknown>) {
  return {
    id: String(signal.id || ''),
    title: publicText(String(signal.title || '')),
    summary: publicText(String(signal.summary || '')),
    source_name: typeof signal.source_name === 'string' ? publicSourceName(signal.source_name) : null,
    source_url: typeof signal.source_url === 'string' ? signal.source_url : null,
    source_category: signal.source_category,
    published_at: typeof signal.published_at === 'string' ? signal.published_at : null,
    country_scope: Array.isArray(signal.country_scope) ? signal.country_scope.filter((item) => typeof item === 'string') : [],
    topic: signal.topic,
    score: Number(signal.score || 0),
    related_signal_count: Number(signal.related_signal_count || 1),
    credibility_score: Number(signal.credibility_score || 0),
    credibility_level: signal.credibility_level,
    urgency_level: signal.urgency_level,
    dedupe_key: typeof signal.dedupe_key === 'string' ? signal.dedupe_key : undefined,
    verification_flags: Array.isArray(signal.verification_flags)
      ? signal.verification_flags.filter((item) => typeof item === 'string').slice(0, 5)
      : [],
    conflict_group: typeof signal.conflict_group === 'string' ? signal.conflict_group : null,
    evidence_sources: Array.isArray(signal.evidence_sources)
      ? signal.evidence_sources.map((source) => {
        const item = source as Record<string, unknown>;
        return {
          name: publicSourceName(String(item.name || '')),
          url: typeof item.url === 'string' ? item.url : null,
          category: item.category,
        };
      }).filter((source) => source.name)
      : [],
    evidence_signal_ids: Array.isArray(signal.evidence_signal_ids)
      ? signal.evidence_signal_ids.filter((item) => typeof item === 'string').slice(0, 32)
      : [],
  };
}

function sanitizeTimelineItem(item: Record<string, unknown>) {
  return {
    id: String(item.id || ''),
    kind: item.kind,
    title: publicText(String(item.title || '')),
    summary: publicText(String(item.summary || '')),
    source_name: typeof item.source_name === 'string' ? publicSourceName(item.source_name) : null,
    source_url: typeof item.source_url === 'string' ? item.source_url : null,
    published_at: typeof item.published_at === 'string' ? item.published_at : null,
    country_scope: Array.isArray(item.country_scope) ? item.country_scope.filter((value) => typeof value === 'string') : [],
    topic: item.topic,
    credibility_score: Number(item.credibility_score || 0),
    conflict_group: typeof item.conflict_group === 'string' ? item.conflict_group : null,
  };
}

function countRowsFromSignals<T extends { key?: unknown; label?: unknown; count?: unknown }>(
  rows: T[],
  signals: Array<{ topic: unknown; country_scope: string[]; related_signal_count: number }>,
) {
  return rows.map((row) => {
    const rowKey = String(row.key || row.label || '');
    const count = signals.reduce((sum, signal) => {
      const matchesTopic = row.key ? signal.topic === row.key : signal.country_scope.includes(rowKey);
      return matchesTopic ? sum + Math.max(1, signal.related_signal_count || 1) : sum;
    }, 0);
    return { ...row, count };
  }).filter((row) => Number(row.count || 0) > 0);
}

function sanitizeAseanTopicForClient(topic: Awaited<ReturnType<typeof readAseanTopic>>) {
  const signals = (topic.signals || [])
    .filter((signal) => isVisibleAseanItem(signal as Record<string, unknown>))
    .map((signal) => sanitizeSignal(signal as Record<string, unknown>));
  const timeline = (topic.timeline || [])
    .filter((item) => item.kind !== 'metric' && isVisibleAseanItem(item as Record<string, unknown>))
    .map((item) => sanitizeTimelineItem(item as Record<string, unknown>));
  const signalCount = signals.reduce((sum, signal) => sum + Math.max(1, signal.related_signal_count || 1), 0);
  const sourceProcessing = topic.source_processing
    ? {
      total_source_count: topic.source_processing.total_source_count,
      active_source_count: topic.source_processing.active_source_count,
      candidate_source_count: topic.source_processing.candidate_source_count,
      contributing_source_count: topic.source_processing.contributing_source_count,
      degraded_source_count: topic.source_processing.degraded_source_count,
      dataset_source_count: topic.source_processing.dataset_source_count,
      polling_source_count: topic.source_processing.polling_source_count,
      static_anchor_count: topic.source_processing.static_anchor_count,
      selected_polling_source_count: topic.source_processing.selected_polling_source_count,
      selected_dataset_source_count: topic.source_processing.selected_dataset_source_count,
      run_selected_source_count: topic.source_processing.run_selected_source_count,
      selected_contributing_source_count: topic.source_processing.selected_contributing_source_count,
      selected_no_contribution_source_count: topic.source_processing.selected_no_contribution_source_count,
      ready_unselected_source_count: topic.source_processing.ready_unselected_source_count,
      profiles: [],
    }
    : null;

  return {
    topic: topic.topic,
    title: topic.title,
    summary: topic.summary,
    generated_at: topic.generated_at,
    signal_count: signalCount,
    processed_signal_count: signals.length,
    raw_signal_count: topic.raw_signal_count,
    returned_signal_count: signals.length,
    signals,
    timeline,
    dataset_metrics: (topic.dataset_metrics || []).map((metric) => ({
      ...metric,
      source_name: publicSourceName(metric.source_name),
    })),
    dataset_series: (topic.dataset_series || []).map((series) => ({
      ...series,
      source_name: publicSourceName(series.source_name),
    })),
    dataset_metric_status: topic.dataset_metric_status
      ? {
        ...topic.dataset_metric_status,
        source_health: (topic.dataset_metric_status.source_health || []).map((source) => ({
          ...source,
          source_name: publicSourceName(source.source_name),
        })),
      }
      : topic.dataset_metric_status,
    incremental_search: topic.incremental_search,
    validation_summary: topic.validation_summary,
    source_processing: sourceProcessing,
    topic_counts: countRowsFromSignals(topic.topic_counts || [], signals),
    country_counts: countRowsFromSignals(topic.country_counts || [], signals),
    recent_research_reports: (topic.recent_research_reports || []).map((report) => ({
      id: report.id,
      question: publicText(report.question),
      content: publicText(report.content),
      created_at: report.created_at,
      references: report.references.map((source) => ({
        ...source,
        title: publicText(source.title),
        snippet: source.snippet ? publicText(source.snippet) : undefined,
      })),
      source_count: report.source_count,
    })),
  } as unknown as typeof topic;
}

export default async function AseanDemoPage() {
  const topic = await readAseanTopic();
  const clientTopic = sanitizeClientStrings(sanitizeAseanTopicForClient(topic)) as Awaited<ReturnType<typeof readAseanTopic>>;
  return <AseanDemoClient topic={clientTopic} />;
}
