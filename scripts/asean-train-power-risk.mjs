import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'asean-training');
const OUTPUT_FILE = path.join(CACHE_DIR, 'power-risk-baseline.json');
const OWID_URLS = [
  'https://owid-public.owid.io/data/energy/owid-energy-data.csv',
  'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv',
];
const WORLD_BANK_URL = 'https://api.worldbank.org/v2/country/{countries}/indicator/{indicator}?format=json&per_page=20000';

const COUNTRIES = [
  { code: 'MYS', owid: 'Malaysia', zh: '马来西亚' },
  { code: 'VNM', owid: 'Vietnam', zh: '越南' },
  { code: 'SGP', owid: 'Singapore', zh: '新加坡' },
  { code: 'THA', owid: 'Thailand', zh: '泰国' },
  { code: 'LAO', owid: 'Laos', zh: '老挝' },
  { code: 'KHM', owid: 'Cambodia', zh: '柬埔寨' },
];

const WORLD_BANK_INDICATORS = {
  access: 'EG.ELC.ACCS.ZS',
  gdp: 'NY.GDP.MKTP.CD',
  internet: 'IT.NET.USER.ZS',
  secureServers: 'IT.NET.SECR.P6',
  fdi: 'BX.KLT.DINV.CD.WD',
  tradeOpen: 'NE.TRD.GNFS.ZS',
  perCapitaElectricity: 'EG.USE.ELEC.KH.PC',
};

const FEATURE_NAMES = [
  'current_supply_gap_ratio',
  'current_surplus_ratio',
  'generation_twh',
  'demand_twh',
  'net_import_share',
  'renewables_share_elec',
  'fossil_share_elec',
  'demand_yoy',
  'generation_yoy',
  'access_pct',
  'log_gdp_usd',
  'internet_pct',
  'log_secure_servers',
  'fdi_share_gdp',
  'trade_open_pct',
  'per_capita_electricity_kwh',
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quote = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quote = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])));
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeDiv(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-9) return null;
  return a / b;
}

async function fetchText(url, cacheName) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheName);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) return await fs.readFile(file, 'utf-8');
  } catch {
    // fall through
  }
  const urls = Array.isArray(url) ? url : [url];
  let lastError = null;
  for (const candidate of urls) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await fetch(candidate, {
          headers: { 'User-Agent': 'WorldWeave ASEAN training data refresh' },
          signal: AbortSignal.timeout(90000),
        });
        if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${candidate}`);
        const text = Buffer.from(await response.arrayBuffer()).toString('utf-8');
        await fs.writeFile(file, text, 'utf-8');
        return text;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
  }
  throw lastError || new Error(`Fetch failed: ${urls.join(', ')}`);
}

async function loadWorldBank() {
  const countryParam = COUNTRIES.map((country) => country.code).join(';');
  const byKey = new Map();
  for (const [name, indicator] of Object.entries(WORLD_BANK_INDICATORS)) {
    const url = WORLD_BANK_URL
      .replace('{countries}', encodeURIComponent(countryParam))
      .replace('{indicator}', encodeURIComponent(indicator));
    const text = await fetchText(url, `worldbank-${indicator}.json`);
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed?.[1]) ? parsed[1] : [];
    for (const row of rows) {
      const code = row?.countryiso3code;
      const year = Number(row?.date);
      const value = num(row?.value);
      if (!code || !Number.isFinite(year) || value === null) continue;
      const key = `${code}:${year}`;
      const current = byKey.get(key) || {};
      current[name] = value;
      byKey.set(key, current);
    }
  }
  return byKey;
}

function buildPanel(owidRows, worldBank) {
  const countryByName = new Map(COUNTRIES.map((country) => [country.owid, country]));
  const rows = [];
  for (const row of owidRows) {
    const country = countryByName.get(row.country);
    if (!country) continue;
    const year = Number(row.year);
    if (!Number.isFinite(year) || year < 1995) continue;
    const generation = num(row.electricity_generation);
    const demand = num(row.electricity_demand);
    if (generation === null || demand === null) continue;
    const wb = worldBank.get(`${country.code}:${year}`) || {};
    rows.push({
      code: country.code,
      country: country.zh,
      year,
      generation_twh: generation,
      demand_twh: demand,
      current_supply_gap_ratio: Math.max(0, safeDiv(demand - generation, demand) ?? 0),
      current_surplus_ratio: Math.max(0, safeDiv(generation - demand, demand) ?? 0),
      net_import_share: safeDiv(num(row.net_elec_imports) ?? demand - generation, demand),
      renewables_share_elec: num(row.renewables_share_elec),
      fossil_share_elec: num(row.fossil_share_elec),
      access_pct: wb.access ?? null,
      log_gdp_usd: wb.gdp ? Math.log(wb.gdp) : null,
      internet_pct: wb.internet ?? null,
      log_secure_servers: wb.secureServers ? Math.log1p(wb.secureServers) : null,
      fdi_share_gdp: wb.fdi && wb.gdp ? wb.fdi / wb.gdp : null,
      trade_open_pct: wb.tradeOpen ?? null,
      per_capita_electricity_kwh: wb.perCapitaElectricity ?? null,
    });
  }
  const byCountry = new Map();
  for (const row of rows) {
    const list = byCountry.get(row.code) || [];
    list.push(row);
    byCountry.set(row.code, list);
  }
  for (const list of byCountry.values()) {
    list.sort((left, right) => left.year - right.year);
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      const prev = list[index - 1];
      row.demand_yoy = prev ? safeDiv(row.demand_twh - prev.demand_twh, prev.demand_twh) : null;
      row.generation_yoy = prev ? safeDiv(row.generation_twh - prev.generation_twh, prev.generation_twh) : null;
      const next = list[index + 1];
      if (next) {
        row.target_year = next.year;
        row.next_supply_gap_ratio = Math.max(0, safeDiv(next.demand_twh - next.generation_twh, next.demand_twh) ?? 0);
      }
    }
  }
  return rows;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function transpose(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]));
}

function matMul(a, b) {
  const out = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      for (let j = 0; j < b[0].length; j += 1) {
        out[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return out;
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function trainRidge(samples, lambda = 1) {
  const latestTrainYear = Math.max(...samples.map((sample) => sample.target_year)) - 4;
  const train = samples.filter((sample) => sample.target_year <= latestTrainYear);
  const test = samples.filter((sample) => sample.target_year > latestTrainYear);
  const imputers = Object.fromEntries(FEATURE_NAMES.map((name) => [name, median(train.map((sample) => sample[name]))]));
  const means = {};
  const stds = {};
  for (const name of FEATURE_NAMES) {
    const values = train.map((sample) => sample[name] ?? imputers[name]).filter(Number.isFinite);
    const mean = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, values.length);
    means[name] = mean;
    stds[name] = Math.sqrt(variance) || 1;
  }
  const vectorize = (sample) => [
    1,
    ...FEATURE_NAMES.map((name) => ((sample[name] ?? imputers[name]) - means[name]) / stds[name]),
  ];
  const x = train.map(vectorize);
  const y = train.map((sample) => sample.next_supply_gap_ratio);
  const xt = transpose(x);
  const xtx = matMul(xt, x);
  for (let i = 1; i < xtx.length; i += 1) xtx[i][i] += lambda;
  const xty = matMul(xt, y.map((value) => [value])).map((row) => row[0]);
  const weights = solveLinearSystem(xtx, xty);
  const predictRaw = (sample) => vectorize(sample).reduce((total, value, index) => total + value * weights[index], 0);
  const predict = (sample) => Math.max(0, predictRaw(sample));
  const evaluate = (rows) => {
    const predictions = rows.map((sample) => ({
      ...sample,
      prediction: predict(sample),
      error: predict(sample) - sample.next_supply_gap_ratio,
    }));
    const mae = predictions.reduce((total, row) => total + Math.abs(row.error), 0) / Math.max(1, predictions.length);
    const rmse = Math.sqrt(predictions.reduce((total, row) => total + row.error ** 2, 0) / Math.max(1, predictions.length));
    const meanY = rows.reduce((total, row) => total + row.next_supply_gap_ratio, 0) / Math.max(1, rows.length);
    const sse = predictions.reduce((total, row) => total + row.error ** 2, 0);
    const sst = rows.reduce((total, row) => total + (row.next_supply_gap_ratio - meanY) ** 2, 0);
    const r2 = sst > 0 ? 1 - sse / sst : 0;
    return { count: rows.length, mae, rmse, r2, predictions };
  };
  return {
    train_year_max: latestTrainYear,
    train: evaluate(train),
    test: evaluate(test),
    coefficients: Object.fromEntries(['intercept', ...FEATURE_NAMES].map((name, index) => [name, weights[index]])),
    imputers,
    means,
    stds,
    predict,
    predictRaw,
  };
}

function band(value) {
  if (value >= 0.1) return '高约束';
  if (value >= 0.03) return '中约束';
  if (value > 0) return '低约束';
  return '供给宽松';
}

function pressureHistoryPoints(rows, code, forecastYear, forecastValue) {
  const history = rows
    .filter((row) => row.code === code && Number.isFinite(row.current_supply_gap_ratio))
    .sort((left, right) => left.year - right.year)
    .slice(-7)
    .map((row) => ({
      date: String(row.year),
      value: Number((row.current_supply_gap_ratio * 100).toFixed(2)),
      kind: 'observed',
    }));
  return [
    ...history,
    {
      date: String(forecastYear),
      value: Number((forecastValue * 100).toFixed(2)),
      kind: 'forecast',
    },
  ];
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const [owidText, worldBank] = await Promise.all([
    fetchText(OWID_URLS, 'owid-energy-data.csv'),
    loadWorldBank(),
  ]);
  const rows = parseCsv(owidText);
  const panel = buildPanel(rows, worldBank);
  const trainingSamples = panel.filter((row) => Number.isFinite(row.next_supply_gap_ratio));
  const model = trainRidge(trainingSamples, 1);
  const latestByCountry = Object.values(
    panel.reduce((acc, row) => {
      if (!acc[row.code] || row.year > acc[row.code].year) acc[row.code] = row;
      return acc;
    }, {}),
  ).sort((left, right) => right.year - left.year || left.country.localeCompare(right.country, 'zh-Hans-CN'));
  const latestPredictions = latestByCountry.map((row) => {
    const prediction = model.predict(row);
    return {
      country: row.country,
      base_year: row.year,
      forecast_year: row.year + 1,
      predicted_supply_gap_ratio: Number(prediction.toFixed(4)),
      predicted_band: band(prediction),
      points: pressureHistoryPoints(panel, row.code, row.year + 1, prediction),
    latest_observed_gap_ratio: Number.isFinite(row.next_supply_gap_ratio) ? Number(row.next_supply_gap_ratio.toFixed(4)) : null,
    observed_year: Number.isFinite(row.target_year) ? row.target_year : null,
    observed_band: Number.isFinite(row.next_supply_gap_ratio) ? band(row.next_supply_gap_ratio) : null,
      evidence: {
        demand_twh: row.demand_twh,
        generation_twh: row.generation_twh,
        renewables_share_elec: row.renewables_share_elec,
        fossil_share_elec: row.fossil_share_elec,
        access_pct: row.access_pct,
      },
    };
  });
  const output = {
    generated_at: new Date().toISOString(),
    model_id: 'asean-power-risk-ridge-baseline',
    target: 'next_year_supply_gap_ratio = max(0, electricity_demand - electricity_generation) / electricity_demand',
    source_urls: [...OWID_URLS, 'https://api.worldbank.org/v2/'],
    scope: COUNTRIES.map((country) => country.zh),
    feature_names: FEATURE_NAMES,
    sample_count: trainingSamples.length,
    year_range: {
      min: Math.min(...trainingSamples.map((row) => row.year)),
      max: Math.max(...trainingSamples.map((row) => row.target_year)),
    },
    split: {
      train_target_year_max: model.train_year_max,
      test_target_year_min: model.train_year_max + 1,
    },
    metrics: {
      train: { count: model.train.count, mae: model.train.mae, rmse: model.train.rmse, r2: model.train.r2 },
      test: { count: model.test.count, mae: model.test.mae, rmse: model.test.rmse, r2: model.test.r2 },
    },
    latest_predictions: latestPredictions,
    limitations: [
      '该模型预测的是电力供需压力代理标签，不等同于数据中心实际供电缺口。',
      '当前训练以年度公开数据为主，无法替代月度电价、项目用电量和电网节点约束。',
      '样本量较小，结果应作为策略测算基线和补数方向，不作为单独决策依据。',
    ],
  };
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
