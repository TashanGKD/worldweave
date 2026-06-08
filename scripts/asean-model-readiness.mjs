import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'asean-training');
const OUTPUT_FILE = path.join(CACHE_DIR, 'model-readiness.json');
const POWER_MODEL_FILE = path.join(CACHE_DIR, 'power-risk-baseline.json');
const PROXY_MODEL_FILE = path.join(CACHE_DIR, 'proxy-models.json');
const DATASET_CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-dataset-metric-cache.json');

const MODELS = [
  {
    id: 'market_attractiveness',
    name: '市场吸引力',
    business_question: '哪些东盟国家具备优先承接绿色算力服务和出海投资的市场条件。',
    required: ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度', '网络设施数量'],
    training_decision: 'not_supervised',
    landing_method: '规则指数 + 专家权重校准',
    missing: ['缺少历史进入结果或投资成败标签，无法直接监督训练。'],
    visualization: '国家排名、指标雷达、权重敏感性条带',
  },
  {
    id: 'power_gap_forecast',
    name: '供电缺口与电力预测',
    business_question: '未来一年哪些国家可能出现电力供需压力，广西绿电和智算中心如何辅助缓释。',
    required: ['年度发电量', '年度电力需求', '净电力进口', '可再生电力占比', '化石电力占比', '人均用电量', 'GDP'],
    training_decision: 'quantitative_hint',
    landing_method: '年度面板基线只作量化线索，主判断读取地图、趋势、指标和事件证据',
    missing: ['样本量不足以支撑独立预测模型；缺少数据中心项目级用电曲线和电网节点约束。'],
    visualization: '供需压力地图、趋势证据、国家分解条形图、研判依据列表',
  },
  {
    id: 'green_parity_energy',
    name: '绿电平价与能源约束',
    business_question: '绿色电力是否具备成本优势，哪些国家存在绿电比例、燃料价格和电价约束。',
    required: ['可再生电力占比', '可再生电力输出占比', '可再生能源消费占比', '化石电力占比', '月度电价', '燃油价格', '电力供给', '电力消费'],
    training_decision: 'scenario_index',
    landing_method: '能源约束指数 + 趋势图读取 + 情景敏感性分析',
    missing: ['缺少六国统一口径月度电价和绿电PPA价格，暂不适合训练跨国预测模型。'],
    visualization: '绿电约束热力图、价格走势、情景开关',
  },
  {
    id: 'compute_demand_roi',
    name: '算力需求与投资回报',
    business_question: '哪些国家存在算力需求缺口，进入后投资回收和资源约束是否可接受。',
    required: ['网络设施数量', '设施网络连接数', '设施IX连接数', '设施运营商连接数', '高技术出口额', '互联网使用率', 'FDI净流入'],
    training_decision: 'not_ready_for_training',
    landing_method: '需求代理评分 + 设施承载图读取 + 项目级补数',
    missing: ['缺少数据中心项目投资额、机架数、MW容量、客户需求和收入标签。'],
    visualization: '设施承载矩阵、需求代理指数、补数缺口表',
  },
  {
    id: 'overseas_priority',
    name: '出海优先级与行动路径',
    business_question: '广西企业应优先进入哪些国家，以及采用何种能源、电力、市场和政策路径。',
    required: ['市场吸引力', '供电缺口预测', '绿电约束', '算力需求代理', '风险事件'],
    availability_required: ['GDP', 'FDI净流入', '贸易开放度', '互联网使用率', '安全互联网服务器密度', '年度发电量', '年度电力需求', '可再生电力占比', '可再生能源消费占比', '化石电力占比', '高技术出口额'],
    training_decision: 'decision_synthesis',
    landing_method: '多指标排序 + 研判结果校准 + 行动路径生成',
    missing: ['缺少历史行动路径与结果标签，不能做端到端监督训练。'],
    visualization: '国家优先级、路径卡片、风险与机会并列展示',
  },
];

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function metricKey(metric) {
  return [
    metric?.label,
    metric?.country,
    metric?.source_name,
    metric?.date,
  ].filter(Boolean).join('|');
}

function countMetrics(metrics, required) {
  const unique = new Map();
  for (const metric of metrics) {
    if (!required.some((label) => String(metric?.label || '').includes(label))) continue;
    unique.set(metricKey(metric), metric);
  }
  return Array.from(unique.values());
}

function countSeries(series, required) {
  return (series || []).filter((item) => required.some((label) => String(item?.label || '').includes(label)));
}

function countriesFrom(items) {
  return Array.from(new Set(items.map((item) => item.country).filter(Boolean))).sort();
}

function sourceNames(items) {
  return Array.from(new Set(items.map((item) => item.source_name).filter(Boolean))).sort();
}

function trainingSummary(powerModel) {
  if (!powerModel) return null;
  return {
    sample_count: powerModel.sample_count,
    year_range: powerModel.year_range,
    feature_count: Array.isArray(powerModel.feature_names) ? powerModel.feature_names.length : 0,
    train_count: powerModel.metrics?.train?.count,
    test_count: powerModel.metrics?.test?.count,
    test_mae: powerModel.metrics?.test?.mae,
    test_r2: powerModel.metrics?.test?.r2,
  };
}

function proxyTrainingFor(model, proxyById, proxyByUiId) {
  const alias = {
    compute_demand_roi: 'compute_demand_proxy',
    overseas_priority: 'overseas_priority_synthesis',
  }[model.id];
  return proxyById.get(model.id) || (alias ? proxyById.get(alias) : null) || proxyByUiId.get(model.id) || null;
}

function readinessLevel(model, availableMetrics, availableSeries, powerModel) {
  if (model.id === 'power_gap_forecast') {
    const summary = trainingSummary(powerModel);
    if (summary?.sample_count >= 120 && summary?.test_count >= 20 && Number.isFinite(summary?.test_mae)) return 'quant_hint_ready';
    return 'needs_more_history';
  }
  if (model.id === 'compute_demand_roi') return 'needs_project_labels';
  if (model.id === 'overseas_priority') {
    if (availableMetrics.length >= 60 && countriesFrom(availableMetrics).length >= 6) return 'synthesis_ready';
    if (availableMetrics.length >= 30) return 'partial_synthesis';
    return 'needs_more_data';
  }
  if (availableMetrics.length >= 12 && countriesFrom(availableMetrics).length >= 4) return 'index_ready';
  if (availableMetrics.length >= 6 || availableSeries.length >= 4) return 'partial_index';
  return 'needs_more_data';
}

async function main() {
  const [datasetCache, powerModel, proxyModelState] = await Promise.all([
    readJson(DATASET_CACHE_FILE, { metrics: [], series: [], latest_run: null }),
    readJson(POWER_MODEL_FILE),
    readJson(PROXY_MODEL_FILE, { models: [] }),
  ]);
  const metrics = Array.isArray(datasetCache.metrics) ? datasetCache.metrics : [];
  const series = Array.isArray(datasetCache.series) ? datasetCache.series : [];
  const proxyModels = Array.isArray(proxyModelState?.models) ? proxyModelState.models : [];
  const proxyByUiId = new Map(proxyModels.map((model) => [model.ui_id, model]));
  const proxyById = new Map(proxyModels.map((model) => [model.id, model]));
  const output = {
    generated_at: new Date().toISOString(),
    source_state: datasetCache.latest_run || null,
    power_training: trainingSummary(powerModel),
    proxy_training: {
      generated_at: proxyModelState?.generated_at || null,
      model_count: proxyModels.length,
      trained_count: proxyModels.filter((model) => model.status === 'proxy_trained').length,
    },
    models: MODELS.map((model) => {
      const availabilityRequired = model.availability_required || model.required;
      const availableMetrics = countMetrics(metrics, availabilityRequired);
      const availableSeries = countSeries(series, availabilityRequired);
      const proxyTraining = proxyTrainingFor(model, proxyById, proxyByUiId);
      return {
        id: model.id,
        name: model.name,
        business_question: model.business_question,
        readiness: readinessLevel(model, availableMetrics, availableSeries, powerModel),
        training_decision: model.training_decision,
        landing_method: model.landing_method,
        proxy_training: proxyTraining ? {
          status: proxyTraining.status,
          sample_count: proxyTraining.sample_count,
          country_count: Array.isArray(proxyTraining.countries) ? proxyTraining.countries.length : 0,
          date_range: proxyTraining.date_range || null,
          test_points: proxyTraining.metrics?.test?.count || 0,
          average_error: proxyTraining.metrics?.test?.average_error ?? null,
          trend_correlation: proxyTraining.metrics?.test?.trend_correlation ?? null,
        } : null,
        evidence_reading_contract: [
          '先读取地图点位的国家、议题和紧急度。',
          '再读取指标走势、来源校验和近期线索。',
          '最后输出国家排序、风险解释、可行动建议和需补数据。',
        ],
        available_metric_count: availableMetrics.length,
        available_series_count: availableSeries.length,
        countries: countriesFrom([...availableMetrics, ...availableSeries]),
        sources: sourceNames([...availableMetrics, ...availableSeries]).slice(0, 12),
        required_fields: model.required,
        missing_or_limits: model.missing,
        visualization: model.visualization,
      };
    }),
  };
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    source_state: output.source_state,
    power_training: output.power_training,
    proxy_training: output.proxy_training,
    models: output.models.map((model) => ({
      id: model.id,
      readiness: model.readiness,
      metrics: model.available_metric_count,
      series: model.available_series_count,
      countries: model.countries.length,
      proxy: model.proxy_training ? {
        status: model.proxy_training.status,
        samples: model.proxy_training.sample_count,
        test_points: model.proxy_training.test_points,
      } : null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
