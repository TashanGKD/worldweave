import { existsSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';

import type { AseanTopicPayload } from './asean-topic';

const DECISION_MODEL_BASE_URL =
  process.env.WORLD_ASEAN_DECISION_MODEL_BASE_URL ||
  process.env.MINIMAX_BASE_URL ||
  'https://api.scnet.cn/api/llm/v1';
const DECISION_MODEL_API_KEY =
  process.env.WORLD_ASEAN_DECISION_MODEL_API_KEY ||
  process.env.MINIMAX_API_KEY ||
  '';
const DECISION_MODEL_ID = process.env.WORLD_ASEAN_DECISION_MODEL_ID || 'DeepSeek-V4-Pro';
const DECISION_MODEL_TIMEOUT_MS = Math.min(180_000, Math.max(10_000, Number(process.env.WORLD_ASEAN_DECISION_MODEL_TIMEOUT_MS || 120_000)));
const DECISION_MODEL_CACHE_PATH = path.join(process.cwd(), '.cache', 'asean-decision-model.json');
const POWER_RISK_TRAINING_PATH = path.join(process.cwd(), '.cache', 'asean-training', 'power-risk-baseline.json');
const FUEL_PRICE_TRAINING_PATH = path.join(process.cwd(), '.cache', 'asean-training', 'fuel-price-forecast.json');
const LEGACY_FUEL_PRICE_TRAINING_PATH = path.join(process.cwd(), '.cache', 'asean-training', 'fuel-price-xgboost.json');
const FUEL_PRICE_MODEL_IDS = new Set(['malaysia-fuel-price-weekly-forecast', 'malaysia-fuel-price-xgboost-weekly']);
const PROXY_MODEL_TRAINING_PATH = path.join(process.cwd(), '.cache', 'asean-training', 'proxy-models.json');
const DECISION_MODEL_SCHEMA_VERSION = 10;
const FOCUS_COUNTRIES = ['马来西亚', '越南', '新加坡', '泰国', '老挝', '柬埔寨'];

export type AseanDecisionModelLayer = {
  id: string;
  title: string;
  description: string;
  items: string[];
};

export type AseanDecisionIndicator = {
  id: string;
  label: string;
  value: number;
  unit: string;
  direction: 'up' | 'down' | 'flat';
  basis: string;
  formula?: string;
  components?: Array<{
    label: string;
    value: string;
    source: string;
  }>;
};

export type AseanStrategyModel = {
  id: string;
  name: string;
  output: string;
  linked_view: string;
  confidence: number;
};

export type AseanPredictionTask = {
  id: string;
  title: string;
  horizon: string;
  target: string;
  metric: string;
  range_options: string[];
  current_assessment: string;
  watch_signals: string[];
};

export type AseanModelBlueprint = {
  id: string;
  title: string;
  business_question: string;
  current_data_status: string;
  data_requirements: string[];
  available_inputs: string[];
  method_decision: string;
  training_assessment: string;
  validation_plan: string;
  output_contract: string[];
  evidence_reading_contract: string[];
  visualization: string;
  next_data_gaps: string[];
  public_model?: {
    name: string;
    kind: string;
    summary: string;
    source_label: string;
    period_label: string;
    quality_label: string;
    quality_metrics: Array<{
      label: string;
      value: string;
      level: 'good' | 'watch' | 'weak';
      detail: string;
    }>;
    forecast_cards: Array<{
      country: string;
      label: string;
      current: number | null;
      estimated: number | null;
      direction: string;
      note: string;
      points?: Array<{
        date: string;
        value: number;
        kind: 'observed' | 'forecast';
      }>;
    }>;
  };
  training_diagnostics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  country_assessments: AseanModelCountryAssessment[];
};

export type AseanModelCountryAssessment = {
  country: string;
  level: '低约束' | '中约束' | '高约束' | '红灯预警';
  score: number;
  confidence: number;
  basis: string[];
  gaps: string[];
  trained_forecast?: {
    forecast_year: number;
    predicted_supply_gap_ratio: number;
    predicted_band: string;
    source_model: string;
  };
};

type AseanPowerRiskTrainingResult = {
  generated_at: string;
  model_id: string;
  target: string;
  scope?: string[];
  feature_names: string[];
  sample_count: number;
  year_range: { min: number; max: number };
  split: {
    train_target_year_max: number;
    test_target_year_min: number;
  };
  metrics: {
    train: { count: number; mae: number; rmse: number; r2: number };
    test: { count: number; mae: number; rmse: number; r2: number };
  };
  latest_predictions: Array<{
    country: string;
    base_year: number;
    forecast_year: number;
    predicted_supply_gap_ratio: number;
    predicted_band: string;
    points?: Array<{
      date: string;
      value: number;
      kind: 'observed' | 'forecast';
    }>;
  }>;
};

type AseanFuelPriceTrainingResult = {
  generated_at: string;
  model_id: string;
  model_type: string;
  target: string;
  forecast_horizon: string;
  source: {
    name: string;
    url: string;
    country: string;
  };
  series: Array<{
    product: string;
    label: string;
    country: string;
    source_name: string;
    source_url: string;
    start: string;
    end: string;
    point_count: number;
  }>;
  sample_count: number;
  split: {
    method: string;
    train_count: number;
    test_count: number;
  };
  feature_names: string[];
  metrics: {
    train: { count: number; mae: number; rmse: number; mape: number; r2: number };
    test: { count: number; mae: number; rmse: number; mape: number; r2: number };
  };
  metrics_by_product: Array<{
    product: string;
    count: number;
    start: string;
    end: string;
    mae: number;
    rmse: number;
    latest_validation_rows: Array<{
      date: string;
      current: number;
      actual_next: number;
      predicted_next: number;
      error: number;
    }>;
  }>;
  feature_importance: Array<{ feature: string; importance: number }>;
  forecast_8_weeks: Array<{
    date: string;
    step: number;
    product: string;
    predicted_price: number;
    previous_observed_or_predicted: number;
    change: number;
    direction: string;
  }>;
  limitations: string[];
};

type AseanFuelPriceForecastResult = {
  generated_at: string;
  source: {
    name: string;
    url: string;
    country: string;
  };
  series: Array<{
    product: string;
    label: string;
    country: string;
    source_name: string;
    source_url: string;
    start: string;
    end: string;
    point_count: number;
  }>;
  forecast_8_weeks: AseanFuelPriceTrainingResult['forecast_8_weeks'];
  trend_points: Array<{
    date: string;
    product: string;
    price: number;
    kind: 'observed' | 'forecast';
  }>;
  deviation_points: Array<{
    date: string;
    product: string;
    observed: number;
    estimated: number;
    difference: number;
    direction: '偏高' | '偏低';
  }>;
  model_metrics: Array<{
    id: 'average_error' | 'relative_error' | 'fit_score' | 'trend_correlation' | 'review_samples';
    label: string;
    value: string;
    level: 'good' | 'watch' | 'weak';
    help: string;
  }>;
  quality_label: string;
  public_readout: string;
  coverage_label: string;
  latest_date: string;
  limitations: string[];
};

type AseanProxyModelTraining = {
  id: string;
  ui_id: string;
  name: string;
  public_kind?: string;
  public_summary?: string;
  target: string;
  status: 'proxy_trained' | 'insufficient_series';
  quality_label?: string;
  sample_count: number;
  countries: string[];
  date_range: { min: string; max: string } | null;
  feature_labels?: string[];
  sources?: Array<{ name: string; country_count: number }>;
  latest_forecasts?: Array<{
    country: string;
    latest_date: string;
    current_score: number;
    estimated_next_score: number;
    direction: string;
  }>;
  forecast_series?: Array<{
    country: string;
    latest_date: string;
    estimated_date: string;
    direction: string;
    points: Array<{
      date: string;
      value: number;
      kind: 'observed' | 'forecast';
    }>;
  }>;
  metrics?: {
    test?: {
      count: number;
      average_error: number | null;
      relative_error: number | null;
      trend_correlation: number | null;
    };
  };
  limitations?: string[];
};

type AseanProxyModelTrainingState = {
  generated_at: string;
  models: AseanProxyModelTraining[];
};

export type AseanDecisionModelResult = {
  generated_at: string;
  schema_version?: number;
  configured: boolean;
  model: string;
  mode: 'deepseek-pro-decision-model';
  fallback: boolean;
  scope: string[];
  layers: AseanDecisionModelLayer[];
  indicators: AseanDecisionIndicator[];
  strategy_models: AseanStrategyModel[];
  prediction_tasks: AseanPredictionTask[];
  model_blueprints: AseanModelBlueprint[];
  fuel_price_training?: AseanFuelPriceForecastResult | null;
  summary: string;
};

function compactText(value: unknown, max = 700) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function parseJsonObject(value: string) {
  const direct = value.trim();
  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
    if (fenced) return JSON.parse(fenced) as Record<string, unknown>;
    const start = direct.indexOf('{');
    const end = direct.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(direct.slice(start, end + 1)) as Record<string, unknown>;
    throw new Error('Decision model did not return JSON');
  }
}

function formatMetricValue(value: unknown, unit: string) {
  const numeric = Number(value);
  const unitText = unit
    .replace('current US$', '美元')
    .replace('% of population', '%')
    .replace('% of GDP', '% GDP')
    .replace('per 1M people', '个/百万人')
    .replace('kWh per capita', '千瓦时/人');
  if (!Number.isFinite(numeric)) return `${compactText(value, 48)}${unitText ? ` ${unitText}` : ''}`.trim();
  const abs = Math.abs(numeric);
  if (unit === 'current US$') {
    if (abs >= 1_000_000_000_000) return `${(numeric / 1_000_000_000_000).toFixed(2)}万亿美元`;
    if (abs >= 100_000_000) return `${(numeric / 100_000_000).toFixed(1)}亿美元`;
    if (abs >= 10_000) return `${(numeric / 10_000).toFixed(1)}万美元`;
  }
  if (unit.includes('%')) return `${numeric.toFixed(numeric >= 10 ? 1 : 2)}%`;
  if (abs >= 1000) return `${Math.round(numeric).toLocaleString('zh-CN')}${unitText ? ` ${unitText}` : ''}`;
  if (abs >= 100) return `${numeric.toFixed(1)}${unitText ? ` ${unitText}` : ''}`;
  return `${numeric.toFixed(2)}${unitText ? ` ${unitText}` : ''}`;
}

function metricEvidence(topic: AseanTopicPayload, labels: string[], countries = FOCUS_COUNTRIES, max = 3) {
  return (topic.dataset_metrics || [])
    .filter((metric) => countries.includes(metric.country) && labels.some((label) => metric.label.includes(label)))
    .slice(0, max)
    .map((metric) => `${metric.country}${metric.label}：${formatMetricValue(metric.value, metric.unit)}，${metric.source_name}`);
}

function countSignals(topic: AseanTopicPayload, pattern: RegExp) {
  return (topic.timeline || []).filter((item) => pattern.test(`${item.title} ${item.summary} ${item.source_name || ''}`)).length;
}

function evidenceText(values: string[], fallback: string) {
  return values.length ? values.join('；') : fallback;
}

function readPowerRiskTrainingResult(): AseanPowerRiskTrainingResult | null {
  try {
    if (!existsSync(POWER_RISK_TRAINING_PATH)) return null;
    const parsed = JSON.parse(readFileSync(POWER_RISK_TRAINING_PATH, 'utf8')) as Partial<AseanPowerRiskTrainingResult>;
    if (!parsed || !Array.isArray(parsed.latest_predictions) || !parsed.metrics?.test || !parsed.sample_count) return null;
    return parsed as AseanPowerRiskTrainingResult;
  } catch {
    return null;
  }
}

function readFuelPriceTrainingResult(): AseanFuelPriceTrainingResult | null {
  try {
    const filePath = existsSync(FUEL_PRICE_TRAINING_PATH)
      ? FUEL_PRICE_TRAINING_PATH
      : existsSync(LEGACY_FUEL_PRICE_TRAINING_PATH)
        ? LEGACY_FUEL_PRICE_TRAINING_PATH
        : null;
    if (!filePath) return null;
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AseanFuelPriceTrainingResult>;
    if (!parsed || !FUEL_PRICE_MODEL_IDS.has(String(parsed.model_id || '')) || !parsed.metrics?.test || !Array.isArray(parsed.forecast_8_weeks)) return null;
    return parsed as AseanFuelPriceTrainingResult;
  } catch {
    return null;
  }
}

function readProxyModelTrainingState(): AseanProxyModelTrainingState | null {
  try {
    if (!existsSync(PROXY_MODEL_TRAINING_PATH)) return null;
    const parsed = JSON.parse(readFileSync(PROXY_MODEL_TRAINING_PATH, 'utf8')) as Partial<AseanProxyModelTrainingState>;
    if (!parsed || !Array.isArray(parsed.models)) return null;
    return parsed as AseanProxyModelTrainingState;
  } catch {
    return null;
  }
}

function proxyTrainingForUiId(uiId: string): AseanProxyModelTraining | null {
  const state = readProxyModelTrainingState();
  if (!state) return null;
  return state.models.find((model) => model.ui_id === uiId) || null;
}

function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVar = 0;
  let rightVar = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVar += leftDelta ** 2;
    rightVar += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVar * rightVar);
  return denominator > 1e-9 ? numerator / denominator : null;
}

function formatFuelMetric(value: number) {
  if (!Number.isFinite(value)) return '待验证';
  if (value < 0.1) return value.toFixed(2);
  return value.toFixed(2);
}

function publicFuelSourceName(value: string) {
  if (/Malaysia OpenAPI Fuel Price/iu.test(value)) return '马来西亚公开燃油价格';
  return value;
}

function publicFuelPriceForecast(training: AseanFuelPriceTrainingResult | null): AseanFuelPriceForecastResult | null {
  if (!training) return null;
  const latestDate = training.series
    .map((item) => item.end)
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  const test = training.metrics.test;
  const qualityLabel = test.r2 >= 0.8 && test.mape <= 0.08
    ? '可作短期扰动线索'
    : test.r2 >= 0.65 && test.mape <= 0.12
      ? '仅作辅助判断'
      : '只保留为观察线索';
  const trendPoints = [
    ...training.metrics_by_product.flatMap((item) => item.latest_validation_rows.slice(-8).map((row) => ({
      date: row.date,
      product: item.product,
      price: row.current,
      kind: 'observed' as const,
    }))),
    ...training.forecast_8_weeks.map((row) => ({
      date: row.date,
      product: row.product,
      price: row.predicted_price,
      kind: 'forecast' as const,
    })),
  ];
  const deviationPoints = training.metrics_by_product.flatMap((item) => item.latest_validation_rows.slice(-4).map((row) => ({
    date: row.date,
    product: item.product,
    observed: row.actual_next,
    estimated: row.predicted_next,
    difference: Math.abs(row.error),
    direction: row.error >= 0 ? '偏高' as const : '偏低' as const,
  })));
  const validationRows = training.metrics_by_product.flatMap((item) => item.latest_validation_rows || []);
  const actualValues = validationRows.map((row) => row.actual_next).filter(Number.isFinite);
  const estimatedValues = validationRows.map((row) => row.predicted_next).filter(Number.isFinite);
  const correlation = actualValues.length === estimatedValues.length ? pearsonCorrelation(actualValues, estimatedValues) : null;
  return {
    generated_at: training.generated_at,
    source: {
      ...training.source,
      name: publicFuelSourceName(training.source.name),
    },
    series: training.series.map((item) => ({
      ...item,
      source_name: publicFuelSourceName(item.source_name),
    })),
    forecast_8_weeks: training.forecast_8_weeks,
    trend_points: trendPoints,
    deviation_points: deviationPoints,
    model_metrics: [
      {
        id: 'average_error',
        label: '预测误差',
        value: formatFuelMetric(test.mae),
        level: test.mae <= 0.3 ? 'good' : test.mae <= 0.45 ? 'watch' : 'weak',
        help: '最近留出回看中，估计值与实际值的平均差距；越低代表短期估计越稳。',
      },
      {
        id: 'relative_error',
        label: '相对偏差',
        value: `${(Math.max(0, test.mape) * 100).toFixed(1)}%`,
        level: test.mape <= 0.08 ? 'good' : test.mape <= 0.12 ? 'watch' : 'weak',
        help: '把预测误差折算到价格水平后的比例；用于判断误差是否已经影响方向判断。',
      },
      {
        id: 'fit_score',
        label: '回看拟合',
        value: `${Math.max(0, Math.min(100, test.r2 * 100)).toFixed(0)}%`,
        level: test.r2 >= 0.8 ? 'good' : test.r2 >= 0.65 ? 'watch' : 'weak',
        help: '留出回看中模型解释走势变化的程度；越高说明历史走势与估计走势越一致。',
      },
      {
        id: 'trend_correlation',
        label: '走势相关',
        value: correlation === null ? '待验证' : `${Math.max(-100, Math.min(100, correlation * 100)).toFixed(0)}%`,
        level: correlation !== null && correlation >= 0.82 ? 'good' : correlation !== null && correlation >= 0.65 ? 'watch' : 'weak',
        help: '最近回看中，估计序列与实际序列同向变化的程度；用于判断时序形态是否贴合。',
      },
      {
        id: 'review_samples',
        label: '回看样本',
        value: `${test.count} 个`,
        level: test.count >= 36 ? 'good' : test.count >= 18 ? 'watch' : 'weak',
        help: '留作回看的样本数量；样本越多，短期稳定性判断越可靠。',
      },
    ],
    quality_label: qualityLabel,
    public_readout: '根据马来西亚 RON95、RON97 与柴油周度公开价格，读取未来 8 周能源成本扰动方向，辅助绿电平价和电力成本研判。',
    coverage_label: `${training.series.length} 类油品，${training.series.reduce((sum, item) => sum + item.point_count, 0)} 个公开价格点`,
    latest_date: latestDate,
    limitations: training.limitations.map((item) => item
      .replace(/燃油价格是能源成本扰动变量，不等同于电价或数据中心供电缺口。?/gu, '燃油价格用于观察能源成本扰动，需要结合电力供需和园区价格复核。')
      .replace(/不等同于/gu, '需要结合')),
  };
}

function formatRatioPercent(value: number) {
  if (!Number.isFinite(value)) return '待验证';
  return `${(Math.max(0, value) * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatScoreError(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '待验证';
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)}分`;
}

function formatCorrelation(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '待验证';
  return `${Math.max(-100, Math.min(100, Number(value) * 100)).toFixed(1)}%`;
}

function qualityLevelFromProxy(test: NonNullable<AseanProxyModelTraining['metrics']>['test'] | undefined) {
  const error = Number(test?.average_error);
  const trend = Number(test?.trend_correlation);
  if (Number.isFinite(error) && Number.isFinite(trend) && error <= 3.2 && trend >= 0.92) return 'good';
  if (Number.isFinite(error) && Number.isFinite(trend) && error <= 6 && trend >= 0.75) return 'watch';
  return 'weak';
}

function publicProxyModelReadout(
  proxyTraining: AseanProxyModelTraining | null,
  fallback: { name: string; kind: string; summary: string },
): AseanModelBlueprint['public_model'] | undefined {
  if (!proxyTraining || proxyTraining.status !== 'proxy_trained') return undefined;
  const test = proxyTraining.metrics?.test;
  const sourceCount = proxyTraining.sources?.length || 0;
  const qualityLevel = qualityLevelFromProxy(test);
  return {
    name: proxyTraining.name || fallback.name,
    kind: proxyTraining.public_kind || fallback.kind,
    summary: proxyTraining.public_summary || fallback.summary,
    source_label: `${sourceCount} 类公开来源 / ${proxyTraining.countries.length} 国`,
    period_label: `${proxyTraining.sample_count} 个年度回看点`,
    quality_label: proxyTraining.quality_label || (qualityLevel === 'good' ? '稳健' : qualityLevel === 'watch' ? '可用' : '观察'),
    quality_metrics: [
      {
        label: '预测误差',
        value: formatScoreError(test?.average_error),
        level: qualityLevel,
        detail: '历史回看中，上一期判断与下一期公开结果的平均差距；越低越稳定。',
      },
      {
        label: '走势一致性',
        value: formatCorrelation(test?.trend_correlation),
        level: qualityLevel,
        detail: '回看中估计序列与实际序列同向变化的程度；用于判断时序形态是否可信。',
      },
      {
        label: '回看样本',
        value: `${test?.count || 0} 个`,
        level: (test?.count || 0) >= 12 ? 'good' : (test?.count || 0) >= 6 ? 'watch' : 'weak',
        detail: '留作回看的样本数量；样本越多，稳定性判断越可靠。',
      },
      {
        label: '来源覆盖',
        value: `${sourceCount} 类`,
        level: sourceCount >= 4 ? 'good' : sourceCount >= 2 ? 'watch' : 'weak',
        detail: '参与该口径的公开来源类别数量；来源越多，越适合做交叉复核。',
      },
    ],
    forecast_cards: (proxyTraining.forecast_series?.length
      ? proxyTraining.forecast_series.map((series) => {
        const latestObserved = [...(series.points || [])].reverse().find((point) => point.kind === 'observed');
        const forecastPoint = [...(series.points || [])].reverse().find((point) => point.kind === 'forecast');
        return {
          country: series.country,
          label: `${series.latest_date}-${series.estimated_date}`,
          current: Number.isFinite(latestObserved?.value) ? Number(latestObserved?.value) : null,
          estimated: Number.isFinite(forecastPoint?.value) ? Number(forecastPoint?.value) : null,
          direction: series.direction,
          note: `${series.country}下一期预计${series.direction}，建议结合来源清单复核进入优先级。`,
          points: series.points,
        };
      })
      : (proxyTraining.latest_forecasts || []).map((item) => ({
        country: item.country,
        label: item.latest_date,
        current: Number.isFinite(item.current_score) ? item.current_score : null,
        estimated: Number.isFinite(item.estimated_next_score) ? item.estimated_next_score : null,
        direction: item.direction,
        note: `${item.country}下一期预计${item.direction}，建议结合来源清单复核进入优先级。`,
      }))).slice(0, 6),
  };
}

function powerPressureNote(item: AseanPowerRiskTrainingResult['latest_predictions'][number]) {
  if (/高约束|中约束/u.test(item.predicted_band)) {
    return `${item.country}下一期预计${item.predicted_band}，应优先核对电网余量、项目负荷和备用能源安排。`;
  }
  if (/低约束/u.test(item.predicted_band)) {
    return `${item.country}下一期预计${item.predicted_band}，适合跟踪新增项目是否继续推高用电。`;
  }
  return `${item.country}下一期预计供给相对宽松，仍需用园区电价和具体项目负荷复核。`;
}

function publicPowerModelReadout(trainingResult: AseanPowerRiskTrainingResult | null): AseanModelBlueprint['public_model'] | undefined {
  if (!trainingResult) return undefined;
  const test = trainingResult.metrics.test;
  const fit = Math.max(0, Math.min(100, test.r2 * 100));
  const level: 'good' | 'watch' | 'weak' = fit >= 80 && test.mae <= 0.04 ? 'good' : fit >= 65 && test.mae <= 0.07 ? 'watch' : 'weak';
  return {
    name: '电力供需压力研判',
    kind: '年度面板回看',
    summary: '把年度发电量、用电需求、进口依赖和绿电占比放在一起，判断下一期哪里更容易卡在电力上。',
    source_label: 'OWID + World Bank 公开年度指标',
    period_label: `${trainingResult.sample_count} 个年度回看点`,
    quality_label: level === 'good' ? '稳健' : level === 'watch' ? '可用' : '观察',
    quality_metrics: [
      {
        label: '预测误差',
        value: formatRatioPercent(test.mae),
        level,
        detail: '历史回看中，估计供需压力与实际压力的平均差距；越低越稳定。',
      },
      {
        label: '走势一致性',
        value: `${fit.toFixed(0)}%`,
        level,
        detail: '历史回看中，估计走势解释供需压力变化的程度；越高说明形态越贴合。',
      },
      {
        label: '回看样本',
        value: `${test.count} 个`,
        level: test.count >= 20 ? 'good' : test.count >= 10 ? 'watch' : 'weak',
        detail: '留作回看的国家年份样本数量。',
      },
      {
        label: '国家覆盖',
        value: `${trainingResult.scope?.length || FOCUS_COUNTRIES.length} 国`,
        level: 'good',
        detail: '当前纳入东盟重点国家年度公开指标，用于国家间比较。',
      },
    ],
    forecast_cards: trainingResult.latest_predictions.map((item) => ({
      country: item.country,
      label: `下一期预计${item.predicted_band}`,
      current: Array.isArray(item.points)
        ? [...item.points].reverse().find((point) => point.kind === 'observed')?.value ?? null
        : null,
      estimated: Number.isFinite(item.predicted_supply_gap_ratio) ? item.predicted_supply_gap_ratio * 100 : null,
      direction: item.predicted_band,
      note: powerPressureNote(item),
      points: item.points,
    })),
  };
}

function buildTrainingDiagnostics(trainingResult: AseanPowerRiskTrainingResult | null): AseanModelBlueprint['training_diagnostics'] {
  if (!trainingResult) return [];
  const fit = Math.max(0, Math.min(100, trainingResult.metrics.test.r2 * 100));
  return [
    {
      label: '目标口径',
      value: '供需压力',
      detail: '用年度发电量、年度需求和宏观变量读取下一期供需压力方向。',
    },
    {
      label: '预测误差',
      value: formatRatioPercent(trainingResult.metrics.test.mae),
      detail: '历史回看中，估计压力值与实际压力值的平均差距；越低越稳定。',
    },
    {
      label: '回看拟合',
      value: `${fit.toFixed(0)}%`,
      detail: '历史回看中，模型解释供需压力变化的程度；越高说明走势越贴合。',
    },
    {
      label: '样本覆盖',
      value: `${trainingResult.sample_count}点`,
      detail: `覆盖${trainingResult.year_range.min}-${trainingResult.year_range.max}年，输入包含供需、进口、绿电、GDP、互联网和贸易开放度。`,
    },
  ];
}

function buildProxyDiagnostics(input: {
  target: string;
  samples: string;
  review: string;
  topic?: AseanTopicPayload;
  labels?: string[];
  proxyTraining?: AseanProxyModelTraining | null;
}): AseanModelBlueprint['training_diagnostics'] {
  const test = input.proxyTraining?.metrics?.test;
  if (input.proxyTraining?.status === 'proxy_trained' && test) {
    const period = input.proxyTraining.date_range
      ? `${input.proxyTraining.date_range.min}-${input.proxyTraining.date_range.max}`
      : '时间范围待确认';
    return [
      {
        label: '目标口径',
        value: input.target,
        detail: '用公开指标构造可回看的比较口径，不把缺失的项目结果当作真实标签。',
      },
      {
        label: '预测误差',
        value: formatScoreError(test.average_error),
        detail: '历史回看中，上一期判断与下一期公开结果的平均差距；越低越稳定。',
      },
      {
        label: '走势相关',
        value: formatCorrelation(test.trend_correlation),
        detail: '回看中估计序列与实际序列同向变化的程度；用于判断时序形态是否可用。',
      },
      {
        label: '样本覆盖',
        value: `${input.proxyTraining.sample_count}点 / ${input.proxyTraining.countries.length}国`,
        detail: `${period}，其中${test.count}个点用于回看；当前结论仍需结合来源复核。`,
      },
    ];
  }
  const stats = input.topic && input.labels?.length
    ? proxySeriesStats(input.topic, input.labels)
    : null;
  if (stats && stats.sampleCount >= 8) {
    return [
      {
        label: '目标口径',
        value: input.target,
        detail: '用公开指标构造可回看的代理目标，不把缺失的项目结果当作真实标签。',
      },
      {
        label: '预测误差',
        value: stats.errorLabel,
        detail: '用上一期公开序列估计下一期，回看估计值与实际值的平均差距。',
      },
      {
        label: '走势相关',
        value: stats.correlationLabel,
        detail: '回看中估计序列与实际序列同向变化的程度；用于判断时序形态是否可用。',
      },
      {
        label: '样本覆盖',
        value: stats.coverageLabel,
        detail: `${stats.periodLabel}；当前结论仍以代理口径和来源复核为准。`,
      },
    ];
  }
  return [
    {
      label: '目标口径',
      value: input.target,
      detail: '用公开指标构造代理目标，先形成可回看的模型口径。',
    },
    {
      label: '样本覆盖',
      value: input.samples,
      detail: '统计已接入指标、趋势或国家覆盖，判断能否支撑当前模型。',
    },
    {
      label: '回看状态',
      value: input.review,
      detail: '说明当前能做到时序回看、代理回看，还是需要补连续标签。',
    },
  ];
}

function proxySeriesStats(topic: AseanTopicPayload, labels: string[]) {
  const seriesRows = datasetSeries(topic)
    .filter((series) => labels.some((label) => series.label.includes(label)))
    .map((series) => ({
      ...series,
      points: [...(series.points || [])]
        .filter((point) => Number.isFinite(point.value))
        .sort((left, right) => left.date.localeCompare(right.date)),
    }))
    .filter((series) => series.points.length >= 4);
  const actuals: number[] = [];
  const estimates: number[] = [];
  const relativeErrors: number[] = [];
  const countries = new Set<string>();
  const dates: string[] = [];
  for (const series of seriesRows) {
    countries.add(series.country);
    dates.push(series.points[0]?.date || '', series.points.at(-1)?.date || '');
    for (let index = 1; index < series.points.length; index += 1) {
      const estimate = series.points[index - 1].value;
      const actual = series.points[index].value;
      if (!Number.isFinite(estimate) || !Number.isFinite(actual)) continue;
      actuals.push(actual);
      estimates.push(estimate);
      const denominator = Math.max(1, Math.abs(actual));
      relativeErrors.push(Math.abs(actual - estimate) / denominator);
    }
  }
  if (!actuals.length) return null;
  const meanError = relativeErrors.reduce((sum, value) => sum + value, 0) / relativeErrors.length;
  const correlation = pearsonCorrelation(actuals, estimates);
  const cleanDates = dates.filter(Boolean).sort();
  const start = cleanDates[0] || '待确认';
  const end = cleanDates.at(-1) || '待确认';
  return {
    sampleCount: actuals.length,
    errorLabel: `${Math.min(99, Math.max(0, meanError * 100)).toFixed(meanError >= 0.1 ? 1 : 2)}%`,
    correlationLabel: correlation === null ? '待验证' : `${Math.max(-100, Math.min(100, correlation * 100)).toFixed(0)}%`,
    coverageLabel: `${actuals.length}点 / ${countries.size}国`,
    periodLabel: `${start}-${end}`,
  };
}

function forecastScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0.15) return 68;
  if (value >= 0.1) return 60;
  if (value >= 0.03) return 46;
  if (value > 0) return 34;
  return 24;
}

function forecastLevel(value: number): AseanModelCountryAssessment['level'] {
  if (!Number.isFinite(value)) return '低约束';
  if (value >= 0.1) return '高约束';
  if (value >= 0.03) return '中约束';
  return '低约束';
}

function metricCountByLabels(topic: AseanTopicPayload, labels: string[]) {
  return (topic.dataset_metrics || []).filter((metric) => labels.some((label) => metric.label.includes(label))).length;
}

function metricCountriesByLabels(topic: AseanTopicPayload, labels: string[]) {
  return Array.from(new Set((topic.dataset_metrics || [])
    .filter((metric) => labels.some((label) => metric.label.includes(label)))
    .map((metric) => metric.country)
    .filter(Boolean))).sort();
}

function metricForCountry(topic: AseanTopicPayload, country: string, labels: string[]) {
  return (topic.dataset_metrics || [])
    .filter((metric) => metric.country === country && labels.some((label) => metric.label.includes(label)))
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))[0];
}

function metricNumber(topic: AseanTopicPayload, country: string, labels: string[]) {
  const metric = metricForCountry(topic, country, labels);
  const value = Number(metric?.value);
  return { metric, value: Number.isFinite(value) ? value : null };
}

function normalizeWithin(values: Array<number | null>, value: number | null) {
  if (value === null) return 0;
  const finite = values.filter((item): item is number => Number.isFinite(item));
  if (!finite.length) return 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 1e-9) return 50;
  return ((value - min) / (max - min)) * 100;
}

function datasetSeries(topic: AseanTopicPayload) {
  return ((topic as AseanTopicPayload & {
    dataset_series?: Array<{ label: string; country: string; source_name: string; points?: Array<{ date: string; value: number }> }>;
  }).dataset_series || []);
}

function powerSignalsForCountry(topic: AseanTopicPayload, country: string) {
  return (topic.timeline || []).filter((item) => {
    const optionalCountry = (item as typeof item & { country?: string }).country || '';
    const text = `${item.country_scope?.join(' ') || ''} ${optionalCountry} ${item.title} ${item.summary} ${item.source_name || ''}`;
    return text.includes(country) && /电力|电价|电网|能源|绿电|跨境电力|数据中心|power|electricity|grid|energy|data center/iu.test(text);
  });
}

function pressureLevel(score: number): AseanModelCountryAssessment['level'] {
  if (score >= 70) return '红灯预警';
  if (score >= 55) return '高约束';
  if (score >= 40) return '中约束';
  return '低约束';
}

function buildMarketCountryAssessments(topic: AseanTopicPayload): AseanModelCountryAssessment[] {
  const rows = FOCUS_COUNTRIES.map((country) => {
    const gdp = metricNumber(topic, country, ['GDP']);
    const fdi = metricNumber(topic, country, ['FDI净流入']);
    const trade = metricNumber(topic, country, ['贸易开放度']);
    const internet = metricNumber(topic, country, ['互联网使用率']);
    const secureServers = metricNumber(topic, country, ['安全互联网服务器密度']);
    const facilities = metricNumber(topic, country, ['网络设施数量']);
    return { country, gdp, fdi, trade, internet, secureServers, facilities };
  });
  const gdpValues = rows.map((row) => row.gdp.value);
  const fdiValues = rows.map((row) => row.fdi.value);
  const tradeValues = rows.map((row) => row.trade.value);
  const internetValues = rows.map((row) => row.internet.value);
  const secureValues = rows.map((row) => row.secureServers.value);
  const facilityValues = rows.map((row) => row.facilities.value);
  return rows.map((row) => {
    const score =
      normalizeWithin(gdpValues, row.gdp.value) * 0.22 +
      normalizeWithin(fdiValues, row.fdi.value) * 0.18 +
      normalizeWithin(tradeValues, row.trade.value) * 0.16 +
      normalizeWithin(internetValues, row.internet.value) * 0.16 +
      normalizeWithin(secureValues, row.secureServers.value) * 0.14 +
      normalizeWithin(facilityValues, row.facilities.value) * 0.14;
    const gaps = [
      row.gdp.metric ? '' : 'GDP',
      row.fdi.metric ? '' : 'FDI净流入',
      row.trade.metric ? '' : '贸易开放度',
      row.internet.metric ? '' : '互联网使用率',
      row.secureServers.metric ? '' : '安全服务器密度',
      row.facilities.metric ? '' : '网络设施数量',
    ].filter(Boolean);
    const basis = [
      row.gdp.metric ? `GDP ${formatMetricValue(row.gdp.metric.value, row.gdp.metric.unit)}` : '缺GDP',
      row.fdi.metric ? `FDI ${formatMetricValue(row.fdi.metric.value, row.fdi.metric.unit)}` : '缺FDI',
      row.trade.metric ? `贸易开放度 ${formatMetricValue(row.trade.metric.value, row.trade.metric.unit)}` : '缺贸易开放度',
      row.internet.metric ? `互联网使用率 ${formatMetricValue(row.internet.metric.value, row.internet.metric.unit)}` : '缺互联网使用率',
      row.facilities.metric ? `网络设施 ${formatMetricValue(row.facilities.metric.value, row.facilities.metric.unit)}` : '缺网络设施数量',
    ];
    return {
      country: row.country,
      level: score >= 72 ? '低约束' : score >= 55 ? '中约束' : score >= 38 ? '高约束' : '红灯预警',
      score: Math.round(score),
      confidence: Math.max(42, Math.min(90, 88 - gaps.length * 9)),
      basis,
      gaps,
    } satisfies AseanModelCountryAssessment;
  }).sort((left, right) => right.score - left.score);
}

function buildMarketAttractivenessBlueprint(topic: AseanTopicPayload): AseanModelBlueprint {
  const labels = ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度', '网络设施数量'];
  const metricCount = metricCountByLabels(topic, labels);
  const countries = metricCountriesByLabels(topic, labels);
  const marketSignals = countSignals(topic, /投资|FDI|贸易|市场|产业|外资|园区|数据中心|AI|人工智能|合作/u);
  return {
    id: 'market-heat',
    title: '市场吸引力研判',
    business_question: '判断哪些东盟国家更适合作为广西绿色算力、智算服务和产业协同出海的优先进入对象。',
    current_data_status: `已接入市场、网络和数字基础指标 ${metricCount} 项，覆盖 ${countries.length} 个国家；近期市场与合作线索 ${marketSignals} 条。`,
    data_requirements: [
      'GDP、FDI净流入、贸易开放度和高技术出口额，用于判断市场规模与开放程度。',
      '互联网使用率、安全服务器密度和网络设施数量，用于判断数字基础条件。',
      '数据中心、园区、云服务、AI合作和外资政策线索，用于校准进入窗口。',
      '投资落地结果、客户需求和成本数据，用于后续验证排序是否转化为项目机会。',
    ],
    available_inputs: [
      `宏观与市场指标：${metricCountByLabels(topic, ['GDP', 'FDI净流入', '贸易开放度'])} 项。`,
      `网络与数字基础指标：${metricCountByLabels(topic, ['互联网使用率', '安全互联网服务器密度', '网络设施数量'])} 项。`,
      `市场相关线索：${marketSignals} 条，用于修正近期政策与项目变化。`,
      '当前已有公开指标回看；缺少项目成败标签时，不输出进入成功率。',
    ],
    method_decision: '采用“公开指标回看 + 线索校准”：先看市场规模、开放度、数字基础和网络设施的变化，再用近期项目、政策和合作线索修正优先级。',
    training_assessment: '研判口径：已形成市场进入吸引力回看，可用于国家排序、趋势观察和补数优先级；缺少历史进入结果、投资回收和客户需求标签，因此不输出项目成功率。',
    validation_plan: '先以季度复盘验证：被列为高优先级的国家是否新增项目线索、政策支持或客户需求；后续补齐投资结果后再考虑监督学习。',
    output_contract: [
      '国家市场吸引力排序：给出分数、等级、依据和缺口。',
      '进入窗口解释：市场规模、开放度、数字基础和网络设施分别贡献多少。',
      '风险提示：明确哪些国家因缺数据或近期风险需要降权。',
      '补数清单：列出项目结果、客户需求和成本数据缺口。',
    ],
    evidence_reading_contract: [
      '先读指标：GDP、FDI、贸易开放度和数字基础指标。',
      '再读地图：网络设施点位和国家分布是否支撑进入判断。',
      '再读线索：政策、园区、项目和合作动态是否改变排序。',
      '再读来源：确认关键指标来自公开指标源或可信来源。',
      '最后输出：优先进入国家、理由、可信度和需补数据。',
    ],
    visualization: '页面应展示国家排序条、指标贡献条和地图设施点，避免只放文字说明。',
    next_data_gaps: [
      '补项目级投资额、客户需求、机架/MW规模和投产结果。',
      '补六国数据中心园区和云服务节点清单。',
      '补政策落地时间线与外资准入限制。',
      '补广西企业可承接服务的成本与交付约束。',
    ],
    public_model: publicProxyModelReadout(proxyTrainingForUiId('market-heat'), {
      name: '市场进入吸引力研判',
      kind: '代理回看',
      summary: '用宏观规模、资本流入、贸易开放和数字基础变化，判断下一期进入热度。',
    }),
    training_diagnostics: buildProxyDiagnostics({
      target: '进入优先级代理',
      samples: `${metricCount}项 / ${countries.length}国`,
      review: '可做代理回看',
      topic,
      labels: ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度'],
      proxyTraining: proxyTrainingForUiId('market-heat'),
    }),
    country_assessments: buildMarketCountryAssessments(topic),
  };
}

function buildGreenCountryAssessments(topic: AseanTopicPayload): AseanModelCountryAssessment[] {
  return FOCUS_COUNTRIES.map((country) => {
    const renewableShare = metricNumber(topic, country, ['可再生电力占比']);
    const fossilShare = metricNumber(topic, country, ['化石电力占比']);
    const renewablePower = metricNumber(topic, country, ['可再生发电量']);
    const price = metricNumber(topic, country, ['月度电价', '电价构成']);
    const fuel = metricNumber(topic, country, ['燃油价格']);
    const signals = powerSignalsForCountry(topic, country).filter((item) => /绿电|可再生|燃料|燃油|电价|能源价格|新能源|renewable|tariff|fuel|energy price/iu.test(`${item.title} ${item.summary}`));
    const renewable = renewableShare.value;
    const fossil = fossilShare.value;
    let score = 0;
    score += renewable === null ? 18 : renewable < 15 ? 26 : renewable < 30 ? 17 : renewable < 50 ? 9 : 3;
    score += fossil === null ? 16 : fossil > 80 ? 24 : fossil > 60 ? 16 : fossil > 40 ? 8 : 3;
    score += price.metric ? 3 : 12;
    score += fuel.metric ? 2 : 8;
    score += Math.min(14, signals.length * 3);
    const gaps = [
      renewableShare.metric ? '' : '可再生电力占比',
      fossilShare.metric ? '' : '化石电力占比',
      renewablePower.metric ? '' : '可再生发电量',
      price.metric ? '' : '工业/月度电价',
      fuel.metric ? '' : '燃料价格',
      signals.length ? '' : '绿电项目线索',
    ].filter(Boolean);
    const basis = [
      renewableShare.metric ? `可再生电力占比 ${formatMetricValue(renewableShare.metric.value, renewableShare.metric.unit)}` : '缺可再生电力占比',
      fossilShare.metric ? `化石电力占比 ${formatMetricValue(fossilShare.metric.value, fossilShare.metric.unit)}` : '缺化石电力占比',
      renewablePower.metric ? `可再生发电量 ${formatMetricValue(renewablePower.metric.value, renewablePower.metric.unit)}` : '缺可再生发电量',
      price.metric ? `电价 ${formatMetricValue(price.metric.value, price.metric.unit)}` : '缺工业/月度电价',
      fuel.metric ? `燃料价格 ${formatMetricValue(fuel.metric.value, fuel.metric.unit)}` : '缺燃料价格',
      `绿电/能源价格线索 ${signals.length} 条`,
    ];
    return {
      country,
      level: pressureLevel(score),
      score: Math.round(score),
      confidence: Math.max(38, Math.min(88, 86 - gaps.length * 8 + Math.min(6, signals.length))),
      basis,
      gaps,
    } satisfies AseanModelCountryAssessment;
  }).sort((left, right) => right.score - left.score);
}

function buildGreenParityBlueprint(topic: AseanTopicPayload): AseanModelBlueprint {
  const greenLabels = ['可再生电力占比', '可再生电力输出占比', '可再生能源消费占比', '可再生发电量', '化石电力占比', '月度电价', '电价构成', '燃油价格', '电力供给', '电力消费'];
  const metricCount = metricCountByLabels(topic, greenLabels);
  const countries = metricCountriesByLabels(topic, greenLabels);
  const greenSeries = datasetSeries(topic).filter((series) => /可再生|化石|电价|燃油|电力供给|电力消费|renewable|fossil|tariff|fuel|electricity/iu.test(`${series.label} ${series.source_name}`));
  const maxSeriesPoints = Math.max(0, ...greenSeries.map((series) => series.points?.length || 0));
  const greenSignals = countSignals(topic, /绿电|可再生|新能源|电价|燃油|能源价格|跨境电力|清洁能源|renewable|tariff|fuel|clean energy/iu);
  return {
    id: 'green-parity',
    title: '绿电平价与能源约束研判',
    business_question: '判断东盟重点国家是否具备以绿色电力支撑算力项目的成本和供给条件，并识别广西绿电协同的进入窗口。',
    current_data_status: `已接入绿电、电价、燃料和电力供需指标 ${metricCount} 项，覆盖 ${countries.length} 个国家；可读取走势 ${greenSeries.length} 组，最长 ${maxSeriesPoints} 个点；能源相关线索 ${greenSignals} 条。`,
    data_requirements: [
      '可再生电力占比、可再生发电量、化石电力占比，用于判断绿电底座。',
      '工业电价、电价构成、燃料价格，用于判断成本约束和价格波动。',
      '电力供给、电力消费和跨境电力互济，用于判断绿电是否能支撑新增算力负荷。',
      '绿电PPA、数据中心绿电采购和新能源项目投产时间，用于形成项目级判断。',
    ],
    available_inputs: [
      `绿电与化石电力指标：${metricCountByLabels(topic, ['可再生电力占比', '可再生发电量', '化石电力占比'])} 项。`,
      `电价与燃料价格指标：${metricCountByLabels(topic, ['月度电价', '电价构成', '燃油价格'])} 项。`,
      `可读取趋势：${greenSeries.length} 组，最长 ${maxSeriesPoints} 个点。`,
      `能源相关线索：${greenSignals} 条，用于修正价格和政策变化。`,
    ],
    method_decision: '采用“绿电支撑回看 + 趋势读取”：先看绿电占比、化石依赖和价格口径，再读取电价、燃料和电力供需走势，最后用项目与政策线索修正。',
    training_assessment: '研判口径：已形成绿电支撑能力回看，可用于判断绿电支撑窗口；六国统一月度电价、绿电PPA价格和项目用电量仍不齐，因此不输出项目级平价结论。',
    validation_plan: '以季度复盘验证：高约束国家是否出现电价上行、燃料成本扰动、绿电项目延迟或数据中心供电压力；补齐PPA和项目用电后，再评估是否具备预测建模条件。',
    output_contract: [
      '国家绿电约束等级：低约束、中约束、高约束、红灯预警。',
      '成本解释：绿电占比、化石依赖、电价和燃料价格分别贡献多少。',
      '趋势依据：列出可读取的价格、供需或能源结构序列。',
      '补数清单：明确缺哪些电价、PPA、项目用电和跨境电力数据。',
    ],
    evidence_reading_contract: [
      '先读指标：可再生电力占比、化石电力占比和可再生发电量。',
      '再读趋势：电价、燃油价格、电力供给和消费是否有连续序列。',
      '再读地图：高约束点位是否集中在算力项目或跨境通道附近。',
      '再读线索：新能源项目、电价政策和跨境电力动态是否改变判断。',
      '最后输出：绿电约束等级、成本解释、可信度和补数清单。',
    ],
    visualization: '页面应展示国家约束点、绿电占比条、价格/燃料趋势和缺口标签，避免把绿电平价写成抽象文字。',
    next_data_gaps: [
      '补越南、泰国、马来西亚、新加坡工业电价和绿电PPA价格。',
      '补六国新能源项目投产时间、容量和并网状态。',
      '补数据中心绿电采购、电力消费和可再生能源证书口径。',
      '补跨境电力互济电量、价格和协议期限。',
    ],
    public_model: publicProxyModelReadout(proxyTrainingForUiId('green-parity'), {
      name: '绿电支撑能力研判',
      kind: '代理回看',
      summary: '用绿电占比、能源结构和价格线索估计下一期绿电支撑条件。',
    }),
    training_diagnostics: buildProxyDiagnostics({
      target: '绿电约束代理',
      samples: `${greenSeries.length}组趋势`,
      review: maxSeriesPoints >= 24 ? '可做时序回看' : '需补月度序列',
      topic,
      labels: greenLabels,
      proxyTraining: proxyTrainingForUiId('green-parity'),
    }),
    country_assessments: buildGreenCountryAssessments(topic),
  };
}

function buildComputeCountryAssessments(topic: AseanTopicPayload): AseanModelCountryAssessment[] {
  const rows = FOCUS_COUNTRIES.map((country) => {
    const facilities = metricNumber(topic, country, ['网络设施数量']);
    const netCount = metricNumber(topic, country, ['设施网络连接数']);
    const ixCount = metricNumber(topic, country, ['设施IX连接数']);
    const carrierCount = metricNumber(topic, country, ['设施运营商连接数']);
    const secureServers = metricNumber(topic, country, ['安全互联网服务器密度']);
    const internet = metricNumber(topic, country, ['互联网使用率']);
    const highTechExports = metricNumber(topic, country, ['高技术出口额']);
    const fdi = metricNumber(topic, country, ['FDI净流入']);
    return { country, facilities, netCount, ixCount, carrierCount, secureServers, internet, highTechExports, fdi };
  });
  const facilityValues = rows.map((row) => row.facilities.value);
  const netValues = rows.map((row) => row.netCount.value);
  const ixValues = rows.map((row) => row.ixCount.value);
  const carrierValues = rows.map((row) => row.carrierCount.value);
  const secureValues = rows.map((row) => row.secureServers.value);
  const internetValues = rows.map((row) => row.internet.value);
  const exportValues = rows.map((row) => row.highTechExports.value);
  const fdiValues = rows.map((row) => row.fdi.value);
  return rows.map((row) => {
    const score =
      normalizeWithin(facilityValues, row.facilities.value) * 0.16 +
      normalizeWithin(netValues, row.netCount.value) * 0.16 +
      normalizeWithin(ixValues, row.ixCount.value) * 0.1 +
      normalizeWithin(carrierValues, row.carrierCount.value) * 0.08 +
      normalizeWithin(secureValues, row.secureServers.value) * 0.14 +
      normalizeWithin(internetValues, row.internet.value) * 0.12 +
      normalizeWithin(exportValues, row.highTechExports.value) * 0.14 +
      normalizeWithin(fdiValues, row.fdi.value) * 0.1;
    const gaps = [
      row.facilities.metric ? '' : '网络设施数量',
      row.netCount.metric ? '' : '设施网络连接数',
      row.ixCount.metric ? '' : 'IX连接数',
      row.carrierCount.metric ? '' : '运营商连接数',
      row.secureServers.metric ? '' : '安全服务器密度',
      row.highTechExports.metric ? '' : '高技术出口额',
      row.fdi.metric ? '' : 'FDI净流入',
      '项目MW/机架/投资回收标签',
    ].filter(Boolean);
    const basis = [
      row.facilities.metric ? `网络设施 ${formatMetricValue(row.facilities.metric.value, row.facilities.metric.unit)}` : '缺网络设施数量',
      row.netCount.metric ? `网络连接 ${formatMetricValue(row.netCount.metric.value, row.netCount.metric.unit)}` : '缺设施网络连接数',
      row.ixCount.metric ? `IX连接 ${formatMetricValue(row.ixCount.metric.value, row.ixCount.metric.unit)}` : '缺IX连接数',
      row.secureServers.metric ? `安全服务器密度 ${formatMetricValue(row.secureServers.metric.value, row.secureServers.metric.unit)}` : '缺安全服务器密度',
      row.highTechExports.metric ? `高技术出口 ${formatMetricValue(row.highTechExports.metric.value, row.highTechExports.metric.unit)}` : '缺高技术出口额',
    ];
    return {
      country: row.country,
      level: score >= 70 ? '低约束' : score >= 52 ? '中约束' : score >= 35 ? '高约束' : '红灯预警',
      score: Math.round(score),
      confidence: Math.max(34, Math.min(86, 84 - gaps.length * 7)),
      basis,
      gaps,
    } satisfies AseanModelCountryAssessment;
  }).sort((left, right) => right.score - left.score);
}

function buildComputeRoiBlueprint(topic: AseanTopicPayload): AseanModelBlueprint {
  const labels = ['网络设施数量', '设施网络连接数', '设施IX连接数', '设施运营商连接数', '安全互联网服务器密度', '互联网使用率', '高技术出口额', 'FDI净流入'];
  const metricCount = metricCountByLabels(topic, labels);
  const countries = metricCountriesByLabels(topic, labels);
  const computeSignals = countSignals(topic, /算力|数据中心|智算|云服务|AI|人工智能|GPU|机架|服务器|data center|compute|cloud|GPU/iu);
  return {
    id: 'compute-roi',
    title: '算力需求承载研判',
    business_question: '判断东盟重点国家是否具备承接算力服务、数据中心和智算协同的需求基础，并识别项目级测算还缺哪些输入。',
    current_data_status: `已接入网络设施、数字基础、产业和资本指标 ${metricCount} 项，覆盖 ${countries.length} 个国家；算力与数据中心线索 ${computeSignals} 条。`,
    data_requirements: [
      '网络设施数量、网络连接数、IX连接数和运营商连接数，用于判断承载基础。',
      '安全互联网服务器密度、互联网使用率和高技术出口额，用于判断数字需求基础。',
      'FDI净流入和项目投资线索，用于判断资本进入环境。',
      '数据中心MW容量、机架数、PUE、客户合同、建设成本和收入，用于真实项目收益测算。',
    ],
    available_inputs: [
      `网络设施与连接指标：${metricCountByLabels(topic, ['网络设施数量', '设施网络连接数', '设施IX连接数', '设施运营商连接数'])} 项。`,
      `数字需求代理指标：${metricCountByLabels(topic, ['安全互联网服务器密度', '互联网使用率', '高技术出口额'])} 项。`,
      `资本环境指标：${metricCountByLabels(topic, ['FDI净流入'])} 项。`,
      `算力/数据中心线索：${computeSignals} 条，用于识别项目窗口。`,
    ],
    method_decision: '采用“算力需求强度 + 项目补数清单”：先读网络设施和数字需求指标，形成可比较的承载与需求强度，再用数据中心项目线索校准；项目收益不做虚构测算。',
    training_assessment: '研判口径：已形成算力需求承载代理回看，可用于需求强弱和国家排序；缺少项目级 MW 容量、机架数、建设成本、客户收入和投产结果标签，因此不输出投资回报率。',
    validation_plan: '以项目追踪验证：高分国家是否新增数据中心、云节点、客户合同或投资公告；补齐项目结果后，再评估需求转化和投资回报口径。',
    output_contract: [
      '国家算力需求代理排序：给出分数、依据、可信度和数据缺口。',
      '承载基础解释：设施、网络连接、IX、运营商和安全服务器分别贡献多少。',
      '项目测算状态：明确哪些国家只能做需求代理，哪些已有项目级输入。',
      '补数清单：列出 MW、机架、成本、收入和投产结果缺口。',
    ],
    evidence_reading_contract: [
      '先读地图：网络设施和国家点位是否支持算力承载。',
      '再读指标：设施连接、安全服务器、互联网、高技术出口和 FDI。',
      '再读线索：数据中心、云服务、AI项目和投资公告。',
      '再读缺口：是否具备 MW、机架、成本和收入等项目输入。',
      '最后输出：需求代理排序、可信度和项目级补数清单。',
    ],
    visualization: '页面应展示设施承载矩阵、国家需求代理条和项目输入缺口，而不是直接给未验证的回报率。',
    next_data_gaps: [
      '补六国数据中心项目清单、MW容量、机架数和投产时间。',
      '补建设成本、电价合同、客户合同和收入口径。',
      '补云服务节点、GPU供给和行业客户需求线索。',
      '补项目结果标签，用于后续评估需求转化和投资回报。',
    ],
    public_model: publicProxyModelReadout(proxyTrainingForUiId('compute-roi'), {
      name: '算力需求承载研判',
      kind: '代理回看',
      summary: '用服务器密度、互联网使用、高技术出口和资本流入估计算力需求承载强弱。',
    }),
    training_diagnostics: buildProxyDiagnostics({
      target: '算力需求代理',
      samples: `${metricCount}项 / ${countries.length}国`,
      review: '需补项目标签',
      topic,
      labels: ['互联网使用率', '安全互联网服务器密度', '高技术出口额', 'FDI净流入', '贸易开放度'],
      proxyTraining: proxyTrainingForUiId('compute-roi'),
    }),
    country_assessments: buildComputeCountryAssessments(topic),
  };
}

function assessmentMap(items: AseanModelCountryAssessment[]) {
  return new Map(items.map((item) => [item.country, item]));
}

function buildGoPriorityCountryAssessments(topic: AseanTopicPayload): AseanModelCountryAssessment[] {
  const market = assessmentMap(buildMarketCountryAssessments(topic));
  const power = assessmentMap(buildPowerCountryAssessments(topic, readPowerRiskTrainingResult()));
  const green = assessmentMap(buildGreenCountryAssessments(topic));
  const compute = assessmentMap(buildComputeCountryAssessments(topic));
  return FOCUS_COUNTRIES.map((country) => {
    const marketItem = market.get(country);
    const powerItem = power.get(country);
    const greenItem = green.get(country);
    const computeItem = compute.get(country);
    const marketScore = marketItem?.score ?? 0;
    const computeScore = computeItem?.score ?? 0;
    const powerRelief = 100 - (powerItem?.score ?? 70);
    const greenRelief = 100 - (greenItem?.score ?? 70);
    const score = marketScore * 0.32 + computeScore * 0.24 + powerRelief * 0.24 + greenRelief * 0.2;
    const gaps = Array.from(new Set([
      ...(marketItem?.gaps || []),
      ...(powerItem?.gaps || []),
      ...(greenItem?.gaps || []),
      ...(computeItem?.gaps || []),
    ])).slice(0, 8);
    const basis = [
      `市场吸引力 ${marketScore}分`,
      `算力需求代理 ${computeScore}分`,
      `电力约束缓释 ${Math.round(powerRelief)}分`,
      `绿电约束缓释 ${Math.round(greenRelief)}分`,
      `缺口 ${gaps.length}项`,
    ];
    return {
      country,
      level: score >= 70 ? '低约束' : score >= 55 ? '中约束' : score >= 40 ? '高约束' : '红灯预警',
      score: Math.round(score),
      confidence: Math.max(36, Math.min(88, Math.round(((marketItem?.confidence || 45) + (powerItem?.confidence || 45) + (greenItem?.confidence || 45) + (computeItem?.confidence || 45)) / 4) - gaps.length * 2)),
      basis,
      gaps,
    } satisfies AseanModelCountryAssessment;
  }).sort((left, right) => right.score - left.score);
}

function buildGoPriorityBlueprint(topic: AseanTopicPayload): AseanModelBlueprint {
  const marketCount = metricCountByLabels(topic, ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度', '网络设施数量']);
  const powerCount = metricCountByLabels(topic, ['电力可及率', '人均用电量', '年度发电量', '年度电力需求', '月度电价', '电价构成']);
  const greenCount = metricCountByLabels(topic, ['可再生电力占比', '化石电力占比', '可再生发电量', '燃油价格']);
  const computeCount = metricCountByLabels(topic, ['设施网络连接数', '设施IX连接数', '设施运营商连接数', '高技术出口额']);
  const actionSignals = countSignals(topic, /投资|合作|数据中心|算力|电力|绿电|园区|政策|外资|跨境|AI|人工智能/u);
  return {
    id: 'go-priority',
    title: '出海优先级与行动路径研判',
    business_question: '综合市场、电力、绿电和算力承载条件，判断广西绿色算力服务应优先进入哪些国家，以及采用何种支撑路径。',
    current_data_status: `已接入市场指标 ${marketCount} 项、电力指标 ${powerCount} 项、绿电指标 ${greenCount} 项、算力承载指标 ${computeCount} 项；行动相关线索 ${actionSignals} 条。`,
    data_requirements: [
      '市场吸引力：GDP、FDI、贸易开放度、互联网使用率和网络设施。',
      '电力与绿电约束：发电、需求、净进口、绿电占比、电价和燃料价格。',
      '算力承载：设施数量、网络连接、IX、运营商、高技术出口和安全服务器密度。',
      '行动落地：项目投资额、MW容量、客户需求、政策准入、伙伴方和时间表。',
    ],
    available_inputs: [
      `市场口径输入：${marketCount} 项。`,
      `电力口径输入：${powerCount} 项。`,
      `绿电口径输入：${greenCount} 项。`,
      `算力承载输入：${computeCount} 项。`,
      `行动线索：${actionSignals} 条，用于修正排序和路径。`,
    ],
    method_decision: '采用“多口径回看汇总 + 权重排序”：市场吸引力占32%，算力需求代理占24%，电力约束缓释占24%，绿电约束缓释占20%；所有权重仅用于当前页面排序，可由专家复核调整。',
    training_assessment: '研判口径：已形成出海优先级综合回看，可用于国家排序、路径生成和补数优先级；当前缺历史进入路径、合作结果和投资回收标签，因此不输出成功率预测。',
    validation_plan: '以月度复盘验证：排名靠前国家是否出现项目推进、政策窗口、客户需求或伙伴合作；若后续积累足够项目结果，再评估进入成功率或回报概率口径。',
    output_contract: [
      '国家进入优先级：给出排序、分数、等级、依据和可信度。',
      '行动路径：说明是市场优先、电力支撑、绿电协同还是算力承载优先。',
      '风险与缺口：列出每个国家进入前必须补齐的数据。',
      '复核入口：允许调整四类权重并观察排序变化。',
    ],
    evidence_reading_contract: [
      '先读市场口径：是否具备进入基础和需求环境。',
      '再读电力口径：是否存在供电瓶颈和广西支撑窗口。',
      '再读绿电口径：是否具备绿色电力协同条件。',
      '再读算力口径：网络和设施是否支撑承载。',
      '最后输出：优先国家、行动路径、风险缺口和复核权重。',
    ],
    visualization: '页面应展示综合排名、四类分项贡献、国家缺口标签和行动路径卡，不展示不可验证的最终收益数字。',
    next_data_gaps: [
      '补历史进入项目结果、合作方、投入、收入和投产时间。',
      '补广西侧可供给能力、服务成本、跨境交付约束和政策条件。',
      '补目标国家数据中心客户需求、园区政策和当地合作伙伴。',
      '补权重复核记录，用于后续形成可审计排序依据。',
    ],
    public_model: publicProxyModelReadout(proxyTrainingForUiId('go-priority'), {
      name: '出海优先级排序研判',
      kind: '综合回看',
      summary: '汇总市场、数字基础、电力和绿电线索，形成可复核的国家进入排序。',
    }),
    training_diagnostics: buildProxyDiagnostics({
      target: '出海优先级代理',
      samples: `${marketCount + powerCount + greenCount + computeCount}项输入`,
      review: '可做权重回看',
      topic,
      labels: ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度', '年度发电量', '年度电力需求', '可再生电力占比', '可再生能源消费占比', '化石电力占比'],
      proxyTraining: proxyTrainingForUiId('go-priority'),
    }),
    country_assessments: buildGoPriorityCountryAssessments(topic),
  };
}

function averageScore(items: AseanModelCountryAssessment[], transform: (score: number) => number = (score) => score) {
  if (!items.length) return 0;
  return Math.round(items.reduce((total, item) => total + transform(item.score), 0) / items.length);
}

function buildDecisionIndicators(
  topic: AseanTopicPayload,
  networkEvidence: string[],
  powerEvidence: string[],
  marketEvidence: string[],
  techEvidence: string[],
  policySignals: number,
  sourceCount: number,
  metricCount: number,
): AseanDecisionIndicator[] {
  const greenAssessments = buildGreenCountryAssessments(topic);
  const computeAssessments = buildComputeCountryAssessments(topic);
  const marketAssessments = buildMarketCountryAssessments(topic);
  const greenValue = Math.max(0, Math.min(100, averageScore(greenAssessments, (score) => 100 - score)));
  const computeValue = Math.max(0, Math.min(100, averageScore(computeAssessments)));
  const marketAverage = averageScore(marketAssessments);
  const policyValue = Math.max(0, Math.min(100, Math.round(marketAverage * 0.62 + Math.min(100, policySignals * 5) * 0.18 + Math.min(100, metricCount / 2) * 0.2)));
  return [
    {
      id: 'network',
      label: '网络竞争力指数',
      value: Math.min(86, 54 + networkEvidence.length * 8 + Math.round(sourceCount / 8)),
      unit: '分',
      direction: 'up',
      basis: evidenceText(networkEvidence, '已有网络专题来源，但跨境专线时延、带宽和利用率仍需定点接入。'),
      formula: '互联网使用率、安全服务器密度和专题来源覆盖形成当前网络基础参考。',
      components: networkEvidence.map((item, index) => ({ label: `网络证据${index + 1}`, value: item, source: '指标源' })),
    },
    {
      id: 'power',
      label: '电力竞争力指数',
      value: Math.min(86, 48 + powerEvidence.length * 6 + Math.round(metricCount / 16)),
      unit: '分',
      direction: 'flat',
      basis: evidenceText(powerEvidence, '已有电力公开指标，季度发电量、平均电价和跨境互济电量仍需补齐。'),
      formula: '电力可及率、人均用电量、年度发电/需求和电价口径共同判断。',
      components: powerEvidence.map((item, index) => ({ label: `电力证据${index + 1}`, value: item, source: '指标源' })),
    },
    {
      id: 'green',
      label: '绿电竞争力指数',
      value: greenValue,
      unit: '分',
      direction: 'flat',
      basis: `由绿电平价与能源约束研判反向折算：绿电约束越低，竞争力越高。当前${greenAssessments.length}国纳入，仍缺工业电价、PPA价格和项目用电量。`,
      formula: '100 - 六国绿电约束均值；绿电约束由可再生占比、化石依赖、电价/燃料价格和能源线索组成。',
      components: greenAssessments.slice(0, 6).map((item) => ({
        label: item.country,
        value: `${100 - item.score}分`,
        source: item.basis.slice(0, 2).join('；'),
      })),
    },
    {
      id: 'compute',
      label: '算力竞争力指数',
      value: computeValue,
      unit: '分',
      direction: 'up',
      basis: `由算力需求与投资回报研判的需求强度形成：设施、网络连接、IX、运营商、安全服务器、高技术出口和FDI共同参与。当前不输出ROI。`,
      formula: '六国算力需求强度均值；由网络设施16%、网络连接16%、IX10%、运营商8%、安全服务器14%、互联网12%、高技术出口14%、FDI10%组成。',
      components: computeAssessments.slice(0, 6).map((item) => ({
        label: item.country,
        value: `${item.score}分`,
        source: item.basis.slice(0, 2).join('；'),
      })),
    },
    {
      id: 'policy',
      label: 'AI与营商环境指数',
      value: policyValue,
      unit: '分',
      direction: 'up',
      basis: `综合市场吸引力均值、AI/政策/投资线索和指标覆盖度。市场证据包括：${evidenceText(marketEvidence, 'GDP、FDI、贸易开放度等指标仍需稳定展示。')}`,
      formula: '市场吸引力均值62% + AI/政策/投资线索18% + 指标覆盖度20%。',
      components: [
        { label: '市场吸引力', value: `${marketAverage}分`, source: marketAssessments.slice(0, 3).map((item) => `${item.country}${item.score}分`).join('、') },
        { label: 'AI/政策/投资线索', value: `${policySignals}条`, source: '专题时间线' },
        { label: '指标覆盖度', value: `${metricCount}项`, source: '指标源与公开来源' },
      ],
    },
  ];
}

function buildPowerCountryAssessments(topic: AseanTopicPayload, trainingResult: AseanPowerRiskTrainingResult | null): AseanModelCountryAssessment[] {
  return FOCUS_COUNTRIES.map((country) => {
    const access = metricForCountry(topic, country, ['电力可及率']);
    const consumption = metricForCountry(topic, country, ['人均用电量']);
    const generation = metricForCountry(topic, country, ['年度发电量']);
    const demand = metricForCountry(topic, country, ['年度电力需求']);
    const renewableShare = metricForCountry(topic, country, ['可再生电力占比']);
    const price = metricForCountry(topic, country, ['月度电价', '电价构成']);
    const signals = powerSignalsForCountry(topic, country);
    const forecast = trainingResult?.latest_predictions.find((item) => item.country === country) || null;
    const forecastRatio = Number(forecast?.predicted_supply_gap_ratio);
    const accessValue = access ? Number(access.value) : Number.NaN;
    const consumptionValue = consumption ? Number(consumption.value) : Number.NaN;
    const generationValue = generation ? Number(generation.value) : Number.NaN;
    const demandValue = demand ? Number(demand.value) : Number.NaN;
    const renewableValue = renewableShare ? Number(renewableShare.value) : Number.NaN;
    const gaps = [
      !generation ? '年度发电量' : '',
      !demand ? '年度电力需求' : '',
      !renewableShare ? '可再生电力占比' : '',
      !price ? '月度/季度电价' : '',
      signals.length ? '' : '电力项目线索',
    ].filter(Boolean);
    let score = 0;
    score += !Number.isFinite(accessValue) ? 12 : accessValue < 98 ? 18 : accessValue < 99.5 ? 8 : 2;
    score += !Number.isFinite(consumptionValue) ? 12 : consumptionValue < 1000 ? 16 : consumptionValue < 2500 ? 9 : 4;
    score += Number.isFinite(generationValue) && Number.isFinite(demandValue)
      ? generationValue < demandValue ? 15 : 4
      : 10;
    score += Number.isFinite(renewableValue) ? renewableValue < 20 ? 10 : renewableValue < 40 ? 6 : 2 : 8;
    score += price ? 2 : 6;
    score += Math.min(15, signals.length * 3);
    score += Math.min(12, gaps.length * 3);
    if (forecast && Number.isFinite(forecastRatio)) {
      score = Math.round(score * 0.58 + forecastScore(forecastRatio) * 0.42);
    }
    const validationConfidence = trainingResult ? Math.max(0, Math.min(10, Math.round((0.05 - trainingResult.metrics.test.mae) * 180))) : 0;
    const confidence = Math.max(35, Math.min(92, 84 - gaps.length * 9 + Math.min(8, signals.length) + validationConfidence));
    const basis = [
      forecast && Number.isFinite(forecastRatio)
        ? `${forecast.forecast_year}年供需压力线索 ${formatRatioPercent(forecastRatio)}`
        : '缺量化供需线索',
      access ? `电力可及率 ${formatMetricValue(access.value, access.unit)}` : '缺电力可及率最新口径',
      consumption ? `人均用电量 ${formatMetricValue(consumption.value, consumption.unit)}` : '缺人均用电量最新口径',
      generation && demand
        ? `发电/需求 ${formatMetricValue(generation.value, generation.unit)} / ${formatMetricValue(demand.value, demand.unit)}`
        : '缺年度发电量或电力需求',
      renewableShare ? `可再生电力占比 ${formatMetricValue(renewableShare.value, renewableShare.unit)}` : '缺可再生电力占比',
      `电力相关线索 ${signals.length} 条`,
    ];
    return {
      country,
      level: forecast && Number.isFinite(forecastRatio) ? forecastLevel(forecastRatio) : pressureLevel(score),
      score: Math.round(score),
      confidence,
      basis,
      gaps,
      trained_forecast: forecast && Number.isFinite(forecastRatio)
        ? {
          forecast_year: forecast.forecast_year,
          predicted_supply_gap_ratio: forecastRatio,
          predicted_band: forecast.predicted_band,
          source_model: trainingResult?.model_id || 'power-risk-baseline',
        }
        : undefined,
    };
  }).sort((left, right) => right.score - left.score);
}

function buildPowerRiskBlueprint(topic: AseanTopicPayload): AseanModelBlueprint {
  const trainingResult = readPowerRiskTrainingResult();
  const basicPowerLabels = ['电力可及率', '人均用电量'];
  const energyBalanceLabels = ['年度发电量', '年度电力需求', '可再生发电量', '可再生电力占比', '化石电力占比', '净电力进口'];
  const priceLabels = ['月度电价', '电价构成'];
  const basicCount = metricCountByLabels(topic, basicPowerLabels);
  const energyBalanceCount = metricCountByLabels(topic, energyBalanceLabels);
  const priceCount = metricCountByLabels(topic, priceLabels);
  const countries = metricCountriesByLabels(topic, [...basicPowerLabels, ...energyBalanceLabels, ...priceLabels]);
  const powerSeries = datasetSeries(topic).filter((series) => /电力|用电|发电|需求|可再生|化石|进口|电价|electricity|energy/iu.test(`${series.label} ${series.source_name}`));
  const maxSeriesPoints = Math.max(0, ...powerSeries.map((series) => series.points?.length || 0));
  const hasTrainableSeries = powerSeries.length >= FOCUS_COUNTRIES.length && maxSeriesPoints >= 24;
  const countryAssessments = buildPowerCountryAssessments(topic, trainingResult);
  const methodDecision = trainingResult
    ? `采用“可视化证据读取 + 量化线索校准”：先读地图、趋势、来源和事件线索，再用${trainingResult.sample_count}条年度国家样本形成供需压力参考。该参考只参与校准，不单独作为项目落地结论。`
    : hasTrainableSeries
    ? '具备形成量化线索的基础，但主判断仍采用图表读取和事件校准，避免把小样本误当成预测能力。'
    : '当前样本不足以训练稳健模型，先采用规则指数加事件校准：电力可及率、人均用电量、供需/进口口径、价格线索和数据中心项目线索共同形成风险等级。';
  const latestForecastCount = trainingResult?.latest_predictions.length || 0;
  return {
    id: 'power-risk',
    title: '供电缺口与电力约束研判',
    business_question: '判断东盟重点国家在数据中心和算力项目扩张时，是否会出现电力供给、价格或绿电约束，并提示广西绿电和智算服务可以介入的窗口。',
    current_data_status: `已接入电力基础指标 ${basicCount} 项、年度能源平衡指标 ${energyBalanceCount} 项、电价指标 ${priceCount} 项；覆盖 ${countries.length} 个国家；可用于走势的电力序列 ${powerSeries.length} 组，最长 ${maxSeriesPoints} 个点${trainingResult ? `；供需压力年度样本 ${trainingResult.sample_count} 条，已形成 ${latestForecastCount} 国下一年量化线索` : '。'}`,
    data_requirements: [
      '年度发电量、电力需求、净电力进口、可再生电力占比、化石电力占比。',
      '月度或季度工业电价、燃料成本、电网收费和补贴调整。',
      '数据中心批复、机架规模、预计用电量、投产时间和所在电网节点。',
      '跨境电力贸易、输电通道、购电协议和清洁能源采购进展。',
    ],
    available_inputs: [
      `电力可及率/人均用电量：${basicCount} 项，可作为国家电力基础成熟度锚点。`,
      `年度发电、需求、绿电和净进口：${energyBalanceCount} 项，决定是否能计算供需差和绿电约束。`,
      `电价与电价构成：${priceCount} 项，用于识别成本侧压力，目前覆盖不足。`,
      trainingResult
        ? `量化线索：${trainingResult.year_range.min}-${trainingResult.year_range.max} 年公开年度数据，已做留出回看，偏差控制在 ${formatRatioPercent(trainingResult.metrics.test.mae)} 左右。`
        : '量化线索：尚未生成，需先补历史数据。',
      `电力相关线索：${countSignals(topic, /电力|电价|电网|能源|绿电|跨境电力|数据中心|power|electricity|grid|energy/iu)} 条，用于修正规则指数。`,
    ],
    method_decision: methodDecision,
    training_assessment: trainingResult
      ? `研判口径：年度样本只有${trainingResult.sample_count}条，不作为独立预测依据；它只给出供需压力辅助线索。最终判断以地图点位、指标走势、来源校验和项目线索共同确定。`
      : hasTrainableSeries
      ? '研判口径：可以形成量化线索，但仍需按国家留出滚动验证，避免把未来项目线索泄漏进判断。'
      : '研判口径：暂不建议训练。当前走势序列太少，若直接训练，会把国家差异和来源缺口误当成预测能力。',
    validation_plan: '验证方式采用时间顺序切分；量化线索先与简单基线比较，页面主结论还要经过来源校验、事件线索和专家复核。',
    output_contract: [
      '国家供电约束等级：低约束、中约束、高约束、红灯预警。',
      '下一年供需压力线索：按国家输出参考比例、等级和误差说明。',
      '缺口解释：基础电力、价格、绿电、跨境互济、数据中心新增负荷分别贡献多少。',
      '补数状态：哪些国家缺月度电价、季度发电量或数据中心用电量。',
    ],
    evidence_reading_contract: [
      '先读地图：国家点位、紧急度颜色、海上通道和国家分布。',
      '再读指标：年度电力、绿电占比、电价、网络设施和宏观指标的最新口径。',
      '再读趋势：只采用真实序列，观察近年方向、波动和异常点。',
      '再读线索：政策、项目、风险和来源校验结果用于修正等级。',
      '最后输出：国家约束等级、依据、可信度、缺口和下一步补数清单。',
    ],
    visualization: '页面上以东盟地图红蓝绿点展示国家风险，右侧模型卡展示输入覆盖、来源校验、线索支撑和“不确定性说明”；趋势图只展示有足够点数的真实序列。',
    next_data_gaps: [
      '补东盟六国近 5-10 年年度发电量、需求、净进口和可再生占比。',
      '补越南、泰国、马来西亚、新加坡月度或季度电价与燃料成本。',
      '补数据中心项目的机架规模、预计用电量和投产时间，形成缺口标签。',
      '补跨境电力互联和购电协议的项目级时间线。',
    ],
    public_model: publicPowerModelReadout(trainingResult),
    training_diagnostics: buildTrainingDiagnostics(trainingResult),
    country_assessments: countryAssessments,
  };
}

function normalizeResult(value: Record<string, unknown>, fallback: AseanDecisionModelResult): AseanDecisionModelResult {
  return {
    ...fallback,
    fallback: false,
    schema_version: DECISION_MODEL_SCHEMA_VERSION,
    layers: fallback.layers,
    indicators: fallback.indicators,
    strategy_models: fallback.strategy_models,
    prediction_tasks: fallback.prediction_tasks,
    model_blueprints: fallback.model_blueprints,
    fuel_price_training: fallback.fuel_price_training,
    summary: compactText(value.summary, 220) || fallback.summary,
  };
}

function buildFallbackDecisionModel(topic: AseanTopicPayload): AseanDecisionModelResult {
  const metricCount = topic.dataset_metrics?.length || 0;
  const sourceCount = topic.source_processing?.contributing_source_count || topic.source_processing?.active_source_count || 0;
  const timelineCount = topic.timeline?.length || 0;
  const networkEvidence = metricEvidence(topic, ['互联网使用率', '安全互联网服务器密度']);
  const powerEvidence = metricEvidence(topic, ['电力可及率', '人均用电量', '年度发电量', '年度电力需求']);
  const greenEvidence = metricEvidence(topic, ['可再生电力占比', '可再生发电量', '化石电力占比']);
  const priceEvidence = metricEvidence(topic, ['月度电价', '电价构成']);
  const marketEvidence = metricEvidence(topic, ['GDP', 'FDI净流入', '贸易开放度']);
  const techEvidence = metricEvidence(topic, ['安全互联网服务器密度', '高技术出口额']);
  const policySignals = countSignals(topic, /政策|监管|外资|数据|AI|人工智能|投资|合作/u);
  const fuelPriceTraining = readFuelPriceTrainingResult();
  const activeSourceCount = topic.source_processing?.active_source_count || 0;
  const contributingSourceCount = topic.source_processing?.contributing_source_count || 0;
  const researchReportCount = Array.isArray((topic as { recent_research_reports?: unknown[] }).recent_research_reports)
    ? ((topic as { recent_research_reports?: unknown[] }).recent_research_reports || []).length
    : 0;
  return {
    generated_at: new Date().toISOString(),
    schema_version: DECISION_MODEL_SCHEMA_VERSION,
    configured: Boolean(DECISION_MODEL_API_KEY),
    model: DECISION_MODEL_ID,
    mode: 'deepseek-pro-decision-model',
    fallback: true,
    scope: FOCUS_COUNTRIES,
    summary: '围绕东盟六国的网络、电力、算力、AI政策和市场环境，形成数据采集、指数化分析、策略口径和综合研判输出四层结构，为广西算力电力协同出海提供当前依据与支撑策略。',
    layers: [
      {
        id: 'collection',
        title: '第一层：数据采集层（数据资源池）',
        description: '采集东盟六国、广西相关发布和全球AI供应链约束，形成专题数据资源池。',
        items: [`采集范围：${FOCUS_COUNTRIES.length}国`, `专题来源：${activeSourceCount}个`, `有效来源：${contributingSourceCount}个`, `结构化指标：${metricCount}项`, `时间线依据：${timelineCount}条`],
      },
      {
        id: 'analysis',
        title: '第二层：数据分析层（指数化转化）',
        description: '将分散数据转化为可比较的标准指数，供地图、时间线和策略研判调用。',
        items: [`网络数据锚点：${networkEvidence.length}项`, `电力数据锚点：${powerEvidence.length}项`, `绿电数据锚点：${greenEvidence.length}项`, `电价数据锚点：${priceEvidence.length}项`, `市场数据锚点：${marketEvidence.length}项`],
      },
      {
        id: 'strategy',
        title: '第三层：模型测算与决策窗口',
        description: '围绕市场、电力、绿电、算力需求和出海优先级形成专题判断标准。',
        items: ['6类测算模型', `电力/绿电依据：${powerEvidence.length + greenEvidence.length}项`, `政策与市场线索：${policySignals}条`, '电力压力回看', '综合排序'],
      },
      {
        id: 'delivery',
        title: '第四层：综合策略输出层（业务终局落地）',
        description: '在专题研究对话中汇总证据、风险和策略，形成可导出的综合研判结果。',
        items: [`近期研报：${researchReportCount}份`, '可导出战略规划报告', '广西企业东盟市场优先级', '进入路径与支撑策略', '来源与校验状态保留'],
      },
    ],
    indicators: buildDecisionIndicators(topic, networkEvidence, powerEvidence, marketEvidence, techEvidence, policySignals, sourceCount, metricCount),
    strategy_models: [
      { id: 'market-heat', name: '市场进入吸引力研判', output: '给出优先进入国家，并提示需要复核的市场线索。', linked_view: '市场热力图', confidence: 72 },
      { id: 'power-risk', name: '电力供需压力研判', output: '标出下一期更可能卡在电力上的国家。', linked_view: '电力压力回看', confidence: 66 },
      { id: 'green-parity', name: '绿电支撑能力研判', output: '识别绿电支撑不足和能源价格需要复核的国家。', linked_view: '绿电支撑回看', confidence: 58 },
      ...(fuelPriceTraining ? [{ id: 'fuel-cost-xgb', name: '能源成本扰动预测', output: '展示马来西亚燃油价格对能源成本的短期扰动。', linked_view: '能源成本预测', confidence: Math.max(55, Math.min(92, Math.round(fuelPriceTraining.metrics.test.r2 * 100))) }] : []),
      { id: 'compute-roi', name: '算力需求承载研判', output: '比较数字基础和算力需求承载缺口。', linked_view: '算力需求回看', confidence: 64 },
      { id: 'go-priority', name: '出海优先级排序研判', output: '形成优先国家、主要短板和下一步核查清单。', linked_view: '优先级排序', confidence: 68 },
    ],
    prediction_tasks: [
      {
        id: 'latency-bandwidth',
        title: '跨境网络高精度监测',
        horizon: '下半年',
        target: '广西五象新区至东盟六国核心节点',
        metric: '网络时延、带宽负载、专线利用率',
        range_options: ['优', '良', '承压', '严重承压'],
        current_assessment: '需补齐跨境专线和核心节点实测数据。',
        watch_signals: ['跨境专线利用率', '云服务节点部署', '运营商公告'],
      },
      {
        id: 'power-flow-green',
        title: '跨境电力流向与绿能源底座',
        horizon: '上下半年滚动',
        target: '东盟六国',
        metric: '发电量、电价、跨境互济电量、绿电纯度',
        range_options: ['低约束', '中约束', '高约束', '红灯预警'],
        current_assessment: '电力口径可从公开指标启动，但跨境互济和绿电消纳需定点补源。',
        watch_signals: ['季度发电量', '工业电价', '跨境电力协议', '绿电交易'],
      },
      {
        id: 'h2-trend',
        title: '下半年趋势预测',
        horizon: '下半年',
        target: '数据中心与算力供需',
        metric: '电力瓶颈国家、缺口GW级别、绿电平价拐点',
        range_options: ['供给宽松', '局部紧张', '多国紧张', '系统性紧张'],
        current_assessment: '预测应随指标和线索滚动更新，不做一次性静态结论。',
        watch_signals: ['数据中心批复', '电网投资', '电价政策', 'AI部署项目'],
      },
    ],
    model_blueprints: [
      buildMarketAttractivenessBlueprint(topic),
      buildPowerRiskBlueprint(topic),
      buildGreenParityBlueprint(topic),
      buildComputeRoiBlueprint(topic),
      buildGoPriorityBlueprint(topic),
    ],
    fuel_price_training: publicFuelPriceForecast(fuelPriceTraining),
  };
}

function buildDecisionPrompt(topic: AseanTopicPayload) {
  const metrics = (topic.dataset_metrics || [])
    .slice(0, 10)
    .map((metric) => `${metric.country}:${metric.label}=${metric.value}${metric.unit},${metric.date},${compactText(metric.source_name, 40)}`)
    .join('\n');
  const timeline = (topic.timeline || [])
    .slice(0, 10)
    .map((item) => `${compactText(item.title, 72)}；${item.country_scope.join('/')}；${item.topic}；可信度${item.credibility_score}`)
    .join('\n');
  const sources = (topic.source_processing?.profiles || [])
    .filter((source) => source.health === 'contributing')
    .slice(0, 8)
    .map((source) => `${compactText(source.name, 56)}:${source.category},${source.ingestion},贡献${source.contribution_count}`)
    .join('\n');
  return [
    '你是“中国—东盟 算电协同及算电出海决策系统”的数据分析与策略研判模型。请基于材料生成一句正式摘要，不生成长报告。',
    '范围固定为东盟六国：马来西亚、越南、新加坡、泰国、老挝、柬埔寨。综合长报告由 Deep Research 承接。',
    '输出必须正式、克制、可展示。不要写泛泛口号，不要虚构具体指标数值。',
    '只输出 JSON，字段只有 summary。summary 控制在 90 字以内。',
    `指标:\n${metrics || '暂无'}`,
    `线索:\n${timeline || '暂无'}`,
    `来源:\n${sources || '暂无'}`,
  ].join('\n\n');
}

export async function readCachedAseanDecisionModel() {
  try {
    const raw = await fs.readFile(DECISION_MODEL_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as AseanDecisionModelResult;
    if (parsed.schema_version !== DECISION_MODEL_SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.model_blueprints)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function buildAseanDecisionModel(topic: AseanTopicPayload, options: { force?: boolean } = {}) {
  const fallback = buildFallbackDecisionModel(topic);
  if (!options.force) {
    const cached = await readCachedAseanDecisionModel();
    if (cached) {
      return {
        ...cached,
        model_blueprints: fallback.model_blueprints,
        fuel_price_training: publicFuelPriceForecast(readFuelPriceTrainingResult()),
      };
    }
  }
  if (!DECISION_MODEL_API_KEY) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('ASEAN decision model timed out')), DECISION_MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(`${DECISION_MODEL_BASE_URL.replace(/\/$/u, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DECISION_MODEL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DECISION_MODEL_ID,
        messages: [
          { role: 'system', content: '你是严谨的中文政策研究与产业策略模型，只输出可解析JSON。' },
          { role: 'user', content: buildDecisionPrompt(topic) },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`ASEAN decision model failed: ${response.status} ${compactText(text, 180)}`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(content);
    const result = normalizeResult(parsed, {
      ...fallback,
      configured: true,
      generated_at: new Date().toISOString(),
    });
    await fs.mkdir(path.dirname(DECISION_MODEL_CACHE_PATH), { recursive: true });
    await fs.writeFile(DECISION_MODEL_CACHE_PATH, JSON.stringify(result, null, 2), 'utf8');
    return result;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
