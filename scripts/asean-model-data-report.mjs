import fs from 'node:fs/promises';
import path from 'node:path';

const TRAINING_DIR = path.join(process.cwd(), '.cache', 'asean-training');
const DATASET_CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-dataset-metric-cache.json');
const OUTPUT_JSON = path.join(TRAINING_DIR, 'model-data-coverage.json');
const OUTPUT_MD = path.join(process.cwd(), 'research', 'asean-model-data-coverage.md');
const FUEL_PRICE_FORECAST_FILE = path.join(TRAINING_DIR, 'fuel-price-forecast.json');
const LEGACY_FUEL_PRICE_FORECAST_FILE = path.join(TRAINING_DIR, 'fuel-price-xgboost.json');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function readFirstJson(files, fallback = null) {
  for (const file of files) {
    const value = await readJson(file, null);
    if (value) return value;
  }
  return fallback;
}

function rangeFromPoints(points = []) {
  const dates = points.map((point) => point.date).filter(Boolean).sort();
  if (!dates.length) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}

function summarizeSeries(dataset, patterns) {
  const rows = (dataset.series || []).filter((series) => patterns.some((pattern) => pattern.test(series.label)));
  const countries = Array.from(new Set(rows.map((row) => row.country).filter(Boolean))).sort();
  const ranges = rows.map((row) => rangeFromPoints(row.points)).filter(Boolean);
  const dates = ranges.flatMap((range) => [range.min, range.max]).sort();
  const sources = Array.from(new Map(rows.map((row) => [row.source_name, {
    name: row.source_name,
    url: row.source_url,
    series_count: rows.filter((item) => item.source_name === row.source_name).length,
  }])).values());
  return {
    series_count: rows.length,
    point_count: rows.reduce((total, row) => total + (row.points?.length || 0), 0),
    countries,
    date_range: dates.length ? { min: dates[0], max: dates[dates.length - 1] } : null,
    sources,
  };
}

function modelById(proxy, id) {
  return (proxy.models || []).find((model) => model.id === id || model.ui_id === id) || null;
}

function pct(value) {
  if (!Number.isFinite(value)) return '待验证';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function score(value) {
  if (!Number.isFinite(value)) return '待验证';
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)}分`;
}

function proxyRow(proxyModel, fallback) {
  if (!proxyModel) return fallback;
  return {
    status: proxyModel.status,
    sample_count: proxyModel.sample_count,
    countries: proxyModel.countries || [],
    date_range: proxyModel.date_range,
    sources: proxyModel.sources || [],
    public_metrics: {
      review_points: proxyModel.metrics?.test?.count || 0,
      average_error: score(proxyModel.metrics?.test?.average_error),
      trend_correlation: pct(proxyModel.metrics?.test?.trend_correlation),
    },
    limitations: proxyModel.limitations || fallback.limitations,
  };
}

function markdownTable(rows) {
  const statusLabels = {
    weekly_time_series_ready: '周度时序可用',
    annual_panel_ready: '年度面板可用',
    proxy_trained: '代理回看可用',
    proxy_pending: '代理待补数',
    missing_training: '训练待补',
  };
  const header = '| 模型 | 数据来源 | 时间范围 | 样本/点位 | 国家覆盖 | 当前判断 | 局限 |\n|---|---|---|---:|---:|---|---|';
  const body = rows.map((row) => {
    const sources = (row.sources || []).map((source) => source.name || source).filter(Boolean).slice(0, 4).join('；') || '待补';
    const range = row.date_range ? `${row.date_range.min}-${row.date_range.max}` : '待确认';
    const countries = Array.isArray(row.countries) ? row.countries.length : row.country_count || 0;
    const limit = (row.limitations || []).slice(0, 2).join('；').replace(/。；/gu, '；') || '无';
    return `| ${row.name} | ${sources} | ${range} | ${row.sample_count || row.point_count || 0} | ${countries} | ${statusLabels[row.status] || row.status} | ${limit} |`;
  }).join('\n');
  return `${header}\n${body}`;
}

async function main() {
  const [dataset, proxy, power, fuel] = await Promise.all([
    readJson(DATASET_CACHE_FILE, { series: [], latest_run: null }),
    readJson(path.join(TRAINING_DIR, 'proxy-models.json'), { models: [] }),
    readJson(path.join(TRAINING_DIR, 'power-risk-baseline.json')),
    readFirstJson([FUEL_PRICE_FORECAST_FILE, LEGACY_FUEL_PRICE_FORECAST_FILE]),
  ]);

  const fuelRangeDates = (fuel?.series || []).flatMap((series) => [series.start, series.end]).filter(Boolean).sort();
  const fuelRow = {
    id: 'fuel-cost',
    name: '能源成本扰动预测',
    status: fuel ? 'weekly_time_series_ready' : 'missing_training',
    sample_count: fuel?.sample_count || 0,
    countries: fuel?.source?.country ? [fuel.source.country] : [],
    date_range: fuelRangeDates.length ? { min: fuelRangeDates[0], max: fuelRangeDates[fuelRangeDates.length - 1] } : null,
    sources: fuel?.source ? [{ name: fuel.source.name, url: fuel.source.url }] : [],
    public_metrics: fuel?.metrics?.test ? {
      review_points: fuel.metrics.test.count,
      average_error: String(fuel.metrics.test.mae),
      trend_correlation: '按产品回看',
    } : null,
    limitations: ['只作为能源成本扰动线索，不直接代表电价或供电缺口。'],
  };

  const powerSeries = summarizeSeries(dataset, [/年度发电量/u, /年度电力需求/u, /净电力进口/u, /人均用电量/u, /电力可及率/u]);
  const powerRow = {
    id: 'power-risk',
    name: '电力瓶颈',
    status: power ? 'annual_panel_ready' : 'missing_training',
    sample_count: power?.sample_count || powerSeries.point_count,
    countries: power?.latest_predictions?.map((row) => row.country) || powerSeries.countries,
    date_range: power?.year_range ? { min: String(power.year_range.min), max: String(power.year_range.max) } : powerSeries.date_range,
    sources: [{ name: 'Our World in Data Energy Dataset' }, { name: 'World Bank annual indicators' }],
    public_metrics: power?.metrics?.test ? {
      review_points: power.metrics.test.count,
      average_error: pct(power.metrics.test.mae),
      trend_correlation: `${Math.max(0, Math.min(100, power.metrics.test.r2 * 100)).toFixed(0)}%回看拟合`,
    } : null,
    limitations: ['年度国家面板适合供需压力线索，不代表园区或项目级缺电概率。'],
  };

  const rows = [
    fuelRow,
    proxyRow(modelById(proxy, 'market_attractiveness'), {
      id: 'market-heat',
      name: '市场吸引力',
      status: 'proxy_pending',
      sample_count: 0,
      countries: [],
      date_range: null,
      sources: [],
      limitations: ['缺少历史进入成败、客户需求和投资结果标签。'],
    }),
    powerRow,
    proxyRow(modelById(proxy, 'green_parity_energy'), {
      id: 'green-parity',
      name: '绿电平价',
      status: 'proxy_pending',
      sample_count: 0,
      countries: [],
      date_range: null,
      sources: [],
      limitations: ['缺少统一口径电价、PPA和项目用电量。'],
    }),
    proxyRow(modelById(proxy, 'compute_demand_proxy'), {
      id: 'compute-roi',
      name: '算力需求',
      status: 'proxy_pending',
      sample_count: 0,
      countries: [],
      date_range: null,
      sources: [],
      limitations: ['缺少MW、机架、建设成本、客户收入和投产结果。'],
    }),
    proxyRow(modelById(proxy, 'overseas_priority_synthesis'), {
      id: 'go-priority',
      name: '出海优先级',
      status: 'proxy_pending',
      sample_count: 0,
      countries: [],
      date_range: null,
      sources: [],
      limitations: ['缺少历史行动路径和落地结果标签。'],
    }),
  ].map((row, index) => ({
    ...row,
    id: row.id || ['fuel-cost', 'market-heat', 'power-risk', 'green-parity', 'compute-roi', 'go-priority'][index],
    name: row.name || ['能源成本扰动预测', '市场吸引力', '电力瓶颈', '绿电平价', '算力需求', '出海优先级'][index],
  }));

  const output = {
    generated_at: new Date().toISOString(),
    source_state: dataset.latest_run || null,
    models: rows,
  };
  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.mkdir(path.dirname(OUTPUT_MD), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  await fs.writeFile(OUTPUT_MD, [
    '# 东盟模型数据覆盖记录',
    '',
    `Updated: ${output.generated_at}`,
    '',
    markdownTable(rows),
    '',
    '说明：',
    '- 代理模型预测的是公开指标构造的代理分，不代表真实项目收益或行动结果。',
    '- 电力与油价是当前更扎实的时序/面板基线。',
    '- 算力需求和出海优先级仍需要项目结果或行动结果标签，才能推进到业务结果预测。',
    '',
  ].join('\n'), 'utf-8');
  console.log(JSON.stringify({
    output: OUTPUT_JSON,
    report: OUTPUT_MD,
    models: rows.map((row) => ({
      id: row.id,
      status: row.status,
      samples: row.sample_count,
      countries: Array.isArray(row.countries) ? row.countries.length : 0,
      range: row.date_range,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
