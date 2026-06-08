import fs from 'node:fs/promises';
import path from 'node:path';

const DATASET_CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-dataset-metric-cache.json');
const OUTPUT_FILE = path.join(process.cwd(), '.cache', 'asean-training', 'proxy-models.json');

const MODEL_CONFIGS = [
  {
    id: 'market_attractiveness',
    ui_id: 'market-heat',
    name: '市场进入吸引力研判',
    public_kind: '代理回看',
    public_summary: '用宏观、资本流入、贸易开放和数字基础指标估计下一期市场进入热度。',
    target: '下一期市场吸引力代理分',
    features: [
      { label: 'GDP', weight: 0.22 },
      { label: 'FDI净流入', weight: 0.18 },
      { label: '贸易开放度', weight: 0.18 },
      { label: '互联网使用率', weight: 0.2 },
      { label: '安全互联网服务器密度', weight: 0.22 },
    ],
  },
  {
    id: 'green_parity_energy',
    ui_id: 'green-parity',
    name: '绿电支撑能力研判',
    public_kind: '代理回看',
    public_summary: '用绿电占比、能源结构和价格线索估计下一期绿电支撑条件。',
    target: '下一期绿电支撑代理分',
    features: [
      { label: '可再生电力占比', weight: 0.2 },
      { label: '可再生电力输出占比', weight: 0.18 },
      { label: '可再生能源消费占比', weight: 0.16 },
      { label: '可再生发电量', weight: 0.14 },
      { label: '化石电力占比', weight: 0.2, direction: 'negative' },
      { label: '年度发电量', weight: 0.08 },
      { label: '净电力进口', weight: 0.04, direction: 'negative' },
    ],
  },
  {
    id: 'compute_demand_proxy',
    ui_id: 'compute-roi',
    name: '算力需求承载研判',
    public_kind: '代理回看',
    public_summary: '用服务器密度、互联网使用、高技术出口和资本流入估计算力需求承载强弱。',
    target: '下一期算力需求代理分',
    features: [
      { label: '安全互联网服务器密度', weight: 0.28 },
      { label: '互联网使用率', weight: 0.22 },
      { label: '高技术出口额', weight: 0.24 },
      { label: 'FDI净流入', weight: 0.14 },
      { label: '贸易开放度', weight: 0.12 },
    ],
  },
  {
    id: 'overseas_priority_synthesis',
    ui_id: 'go-priority',
    name: '出海优先级排序研判',
    public_kind: '综合回看',
    public_summary: '汇总市场、数字基础、电力和绿电线索，形成可复核的国家进入排序。',
    target: '下一期综合优先级代理分',
    features: [
      { label: 'GDP', weight: 0.12 },
      { label: 'FDI净流入', weight: 0.1 },
      { label: '贸易开放度', weight: 0.1 },
      { label: '互联网使用率', weight: 0.12 },
      { label: '安全互联网服务器密度', weight: 0.14 },
      { label: '电力可及率', weight: 0.1 },
      { label: '人均用电量', weight: 0.08 },
      { label: '年度发电量', weight: 0.08 },
      { label: '可再生电力占比', weight: 0.06 },
      { label: '可再生能源消费占比', weight: 0.04 },
      { label: '化石电力占比', weight: 0.06, direction: 'negative' },
    ],
  },
];

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(values, value) {
  if (!Number.isFinite(value)) return null;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 1e-9) return 50;
  return ((value - min) / (max - min)) * 100;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  if (leftMean === null || rightMean === null) return null;
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
  const denom = Math.sqrt(leftVar * rightVar);
  return denom > 1e-9 ? numerator / denom : null;
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-9) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const pivotValue = rows[col][col];
    for (let item = col; item <= size; item += 1) rows[col][item] /= pivotValue;
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let item = col; item <= size; item += 1) rows[row][item] -= factor * rows[col][item];
    }
  }
  return rows.map((row) => row[size]);
}

function trainRidge(samples, featureCount, lambda = 0.12) {
  const width = featureCount + 1;
  const xtx = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const xty = Array.from({ length: width }, () => 0);
  for (const sample of samples) {
    const x = [1, ...sample.x];
    for (let row = 0; row < width; row += 1) {
      xty[row] += x[row] * sample.y;
      for (let col = 0; col < width; col += 1) xtx[row][col] += x[row] * x[col];
    }
  }
  for (let index = 1; index < width; index += 1) xtx[index][index] += lambda;
  return solveLinearSystem(xtx, xty);
}

function predict(coefficients, x) {
  if (!coefficients) return null;
  return Math.max(0, Math.min(100, coefficients[0] + x.reduce((sum, value, index) => sum + value * coefficients[index + 1], 0)));
}

function featureValueMaps(series, features) {
  const selected = series.filter((item) => features.some((feature) => item.label.includes(feature.label)));
  const rawValues = new Map();
  for (const feature of features) {
    rawValues.set(feature.label, selected
      .filter((item) => item.label.includes(feature.label))
      .flatMap((item) => item.points || [])
      .map((point) => numberValue(point.value))
      .filter((value) => value !== null));
  }
  const rows = new Map();
  const sources = new Map();
  for (const item of selected) {
    const feature = features.find((candidate) => item.label.includes(candidate.label));
    if (!feature) continue;
    for (const point of item.points || []) {
      const value = numberValue(point.value);
      if (value === null) continue;
      const key = `${item.country}|${point.date}`;
      const current = rows.get(key) || { country: item.country, date: point.date, features: {} };
      const normalized = normalize(rawValues.get(feature.label) || [], value);
      if (normalized === null) continue;
      current.features[feature.label] = feature.direction === 'negative' ? 100 - normalized : normalized;
      rows.set(key, current);
      const sourceSet = sources.get(item.source_name) || new Set();
      sourceSet.add(item.country);
      sources.set(item.source_name, sourceSet);
    }
  }
  return {
    rows: Array.from(rows.values()),
    sources: Array.from(sources.entries()).map(([name, countries]) => ({ name, country_count: countries.size })),
  };
}

function scoreRow(row, features) {
  let total = 0;
  let weightTotal = 0;
  for (const feature of features) {
    const value = row.features[feature.label];
    if (!Number.isFinite(value)) continue;
    total += value * feature.weight;
    weightTotal += feature.weight;
  }
  if (weightTotal <= 0) return null;
  return total / weightTotal;
}

function buildSamples(rows, features) {
  const scored = rows
    .map((row) => ({ ...row, score: scoreRow(row, features) }))
    .filter((row) => row.score !== null && Object.keys(row.features).length >= Math.min(3, features.length));
  const byCountry = new Map();
  for (const row of scored) {
    const current = byCountry.get(row.country) || [];
    current.push(row);
    byCountry.set(row.country, current);
  }
  const samples = [];
  const latestRows = [];
  for (const [country, countryRows] of byCountry.entries()) {
    countryRows.sort((left, right) => left.date.localeCompare(right.date));
    if (countryRows.length) latestRows.push(countryRows[countryRows.length - 1]);
    for (let index = 0; index < countryRows.length - 1; index += 1) {
      const current = countryRows[index];
      const next = countryRows[index + 1];
      samples.push({
        country,
        date: current.date,
        target_date: next.date,
        x: [...features.map((feature) => current.features[feature.label] ?? 50), current.score],
        y: next.score,
        previous_score: current.score,
      });
    }
  }
  return { samples, latestRows, scoredRows: scored };
}

function evaluate(samples, coefficients) {
  if (!samples.length || !coefficients) {
    return { count: 0, average_error: null, relative_error: null, trend_correlation: null };
  }
  const actual = [];
  const estimated = [];
  for (const sample of samples) {
    const value = predict(coefficients, sample.x);
    if (value === null) continue;
    actual.push(sample.y);
    estimated.push(value);
  }
  const errors = actual.map((value, index) => Math.abs(value - estimated[index]));
  const averageError = mean(errors);
  return {
    count: actual.length,
    average_error: averageError,
    relative_error: averageError === null ? null : averageError / 100,
    trend_correlation: correlation(actual, estimated),
  };
}

function qualityLevel(test) {
  const error = Number(test?.average_error);
  const trend = Number(test?.trend_correlation);
  if (Number.isFinite(error) && Number.isFinite(trend) && error <= 3.2 && trend >= 0.92) return '稳健';
  if (Number.isFinite(error) && Number.isFinite(trend) && error <= 6 && trend >= 0.75) return '可用';
  return '观察';
}

function nextPeriod(date) {
  const value = String(date || '');
  if (/^\d{4}$/u.test(value)) return String(Number(value) + 1);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '下一期';
  parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  return parsed.toISOString().slice(0, 10);
}

function splitSamples(samples) {
  const sorted = [...samples].sort((left, right) => left.target_date.localeCompare(right.target_date));
  const testCount = Math.max(4, Math.round(sorted.length * 0.22));
  return {
    train: sorted.slice(0, Math.max(0, sorted.length - testCount)),
    test: sorted.slice(Math.max(0, sorted.length - testCount)),
  };
}

function trainProxyModel(config, series) {
  const { rows, sources } = featureValueMaps(series, config.features);
  const { samples, latestRows, scoredRows } = buildSamples(rows, config.features);
  const countries = Array.from(new Set(rows.map((row) => row.country))).sort();
  const dates = scoredRows.map((row) => row.date).filter(Boolean).sort();
  if (samples.length < 8) {
    return {
      id: config.id,
      ui_id: config.ui_id,
      name: config.name,
      public_kind: config.public_kind,
      public_summary: config.public_summary,
      target: config.target,
      status: 'insufficient_series',
      sample_count: samples.length,
      countries,
      date_range: dates.length ? { min: dates[0], max: dates[dates.length - 1] } : null,
      sources,
      limitations: ['连续可回看样本不足，当前只保留代理指标展示。'],
    };
  }
  const split = splitSamples(samples);
  const coefficients = trainRidge(split.train, config.features.length + 1);
  const test = evaluate(split.test, coefficients);
  const train = evaluate(split.train, coefficients);
  const latest_forecasts = latestRows
    .map((row) => {
      const x = [...config.features.map((feature) => row.features[feature.label] ?? 50), row.score];
      const forecast = predict(coefficients, x);
      if (forecast === null) return null;
      return {
        country: row.country,
        latest_date: row.date,
        current_score: Number(row.score.toFixed(2)),
        estimated_next_score: Number(forecast.toFixed(2)),
        direction: forecast > row.score + 1 ? '上行' : forecast < row.score - 1 ? '下行' : '平稳',
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.estimated_next_score - left.estimated_next_score)
    .slice(0, 8);
  const scoredByCountry = new Map();
  for (const row of scoredRows) {
    const current = scoredByCountry.get(row.country) || [];
    current.push(row);
    scoredByCountry.set(row.country, current);
  }
  const forecast_series = latest_forecasts.map((forecast) => {
    const history = (scoredByCountry.get(forecast.country) || [])
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-7)
      .map((row) => ({
        date: row.date,
        value: Number(row.score.toFixed(2)),
        kind: 'observed',
      }));
    return {
      country: forecast.country,
      latest_date: forecast.latest_date,
      estimated_date: nextPeriod(forecast.latest_date),
      direction: forecast.direction,
      points: [
        ...history,
        {
          date: nextPeriod(forecast.latest_date),
          value: forecast.estimated_next_score,
          kind: 'forecast',
        },
      ],
    };
  });
  return {
    id: config.id,
    ui_id: config.ui_id,
    name: config.name,
    public_kind: config.public_kind,
    public_summary: config.public_summary,
    target: config.target,
    status: 'proxy_trained',
    quality_label: qualityLevel(test),
    sample_count: samples.length,
    countries,
    date_range: { min: dates[0], max: dates[dates.length - 1] },
    feature_labels: config.features.map((feature) => feature.label),
    sources,
    metrics: { train, test },
    latest_forecasts,
    forecast_series,
    limitations: [
      '该模型预测公开指标构造的代理分，不代表真实项目收益或行动结果。',
      '缺少项目级标签时，只能用于排序、趋势和补数优先级判断。',
    ],
  };
}

async function main() {
  const dataset = await readJson(DATASET_CACHE_FILE, { series: [], latest_run: null });
  const series = Array.isArray(dataset.series) ? dataset.series : [];
  const models = MODEL_CONFIGS.map((config) => trainProxyModel(config, series));
  const output = {
    generated_at: new Date().toISOString(),
    source_state: dataset.latest_run || null,
    models,
  };
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    models: models.map((model) => ({
      id: model.id,
      status: model.status,
      sample_count: model.sample_count,
      countries: model.countries.length,
      date_range: model.date_range,
      test_points: model.metrics?.test?.count || 0,
      average_error: model.metrics?.test?.average_error ?? null,
      trend_correlation: model.metrics?.test?.trend_correlation ?? null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
