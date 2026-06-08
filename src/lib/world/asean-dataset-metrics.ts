import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ASEAN_SOURCE_POOL, type AseanSignalLike, type AseanTopicKey, type AseanTopicSource } from './asean-topic';

export type AseanDatasetMetric = {
  id: string;
  source_name: string;
  source_url: string;
  source_priority: 'p0' | 'p1' | 'p2';
  label: string;
  country: string;
  date: string;
  value: number | string;
  unit: string;
  topic: AseanTopicKey;
  status: 'fresh' | 'stale' | 'metadata';
  extracted_at: string;
};

export type AseanDatasetSeriesPoint = {
  date: string;
  value: number;
};

export type AseanDatasetSeries = {
  id: string;
  source_name: string;
  source_url: string;
  label: string;
  country: string;
  unit: string;
  topic: AseanTopicKey;
  points: AseanDatasetSeriesPoint[];
  latest_date: string;
  latest_value: number;
};

export type AseanDatasetSourceHealth = {
  source_name: string;
  source_url: string;
  fetched: boolean;
  metric_count: number;
  status: 'ok' | 'empty' | 'failed';
  checked_at: string;
};

type AseanDatasetMetricCache = {
  version: 1;
  refreshed_at: string;
  metrics: AseanDatasetMetric[];
  series?: AseanDatasetSeries[];
  source_health?: AseanDatasetSourceHealth[];
  latest_run?: {
    refreshed_at: string;
    source_count: number;
    fetched_count: number;
    metric_count: number;
    failed_count: number;
  };
};

const CACHE_FILE = path.join(process.cwd(), '.cache', 'asean-dataset-metric-cache.json');
const ENABLED = process.env.WORLD_ASEAN_DATASET_METRICS !== '0';
const CACHE_TTL_MS = Math.max(15, Number(process.env.WORLD_ASEAN_DATASET_METRIC_TTL_MINUTES || 180)) * 60 * 1000;
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(5000, Number(process.env.WORLD_ASEAN_DATASET_METRIC_TIMEOUT_MS || 12000)));
const SOURCE_LIMIT = Math.min(48, Math.max(1, Number(process.env.WORLD_ASEAN_DATASET_METRIC_SOURCE_LIMIT || 36)));
const METRICS_LIMIT = Math.min(240, Math.max(8, Number(process.env.WORLD_ASEAN_DATASET_METRIC_LIMIT || 220)));
const SERIES_LIMIT = Math.min(220, Math.max(8, Number(process.env.WORLD_ASEAN_DATASET_SERIES_LIMIT || 160)));
const FETCH_ATTEMPTS = Math.min(4, Math.max(1, Number(process.env.WORLD_ASEAN_DATASET_FETCH_ATTEMPTS || 3)));
const FETCH_CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.WORLD_ASEAN_DATASET_FETCH_CONCURRENCY || 2)));
const INCLUDE_EXTENDED_DATASETS = process.env.WORLD_ASEAN_INCLUDE_EXTENDED_DATASETS === '1';
const EXTENDED_DATASET_SOURCE = /Our World in Data|Philippines PSA|Open Development Cambodia|USGS|Malaysia OpenAPI Electricity Supply|Malaysia OpenAPI Electricity Consumption|Malaysia OpenAPI Industrial Production/i;
const CORE_ENERGY_DATASET_SOURCE = /Our World in Data Energy Dataset|Malaysia OpenAPI Electricity Supply|Malaysia OpenAPI Electricity Consumption/i;

const WORLD_BANK_LABELS: Record<string, { label: string; unit: string; topic: AseanTopicKey }> = {
  'NY.GDP.MKTP.CD': { label: 'GDP', unit: 'current US$', topic: 'market_macro' },
  'EG.ELC.ACCS.ZS': { label: '电力可及率', unit: '% of population', topic: 'technology_infrastructure' },
  'EG.ELC.RNEW.ZS': { label: '可再生电力输出占比', unit: '% of electricity output', topic: 'technology_infrastructure' },
  'EG.FEC.RNEW.ZS': { label: '可再生能源消费占比', unit: '% of final energy consumption', topic: 'technology_infrastructure' },
  'IT.NET.USER.ZS': { label: '互联网使用率', unit: '% of population', topic: 'technology_infrastructure' },
  'EG.USE.ELEC.KH.PC': { label: '人均用电量', unit: 'kWh per capita', topic: 'technology_infrastructure' },
  'IT.NET.SECR.P6': { label: '安全互联网服务器密度', unit: 'per 1M people', topic: 'technology_infrastructure' },
  'TX.VAL.TECH.CD': { label: '高技术出口额', unit: 'current US$', topic: 'trade_supply_chain' },
  'BX.KLT.DINV.CD.WD': { label: 'FDI净流入', unit: 'current US$', topic: 'market_macro' },
  'NE.TRD.GNFS.ZS': { label: '贸易开放度', unit: '% of GDP', topic: 'trade_supply_chain' },
};

const COUNTRY_ZH: Record<string, string> = {
  IDN: '印尼',
  MYS: '马来西亚',
  SGP: '新加坡',
  THA: '泰国',
  VNM: '越南',
  PHL: '菲律宾',
  MMR: '缅甸',
  KHM: '柬埔寨',
  LAO: '老挝',
  BRN: '文莱',
  TLS: '东帝汶',
};

const FOCUS_COUNTRIES = new Set(['马来西亚', '越南', '新加坡', '泰国', '老挝', '柬埔寨']);
const PEERINGDB_COUNTRY_ZH: Record<string, string> = {
  SG: '新加坡',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  LA: '老挝',
  KH: '柬埔寨',
};

const OWID_COUNTRY_ZH: Record<string, string> = {
  Malaysia: '马来西亚',
  Vietnam: '越南',
  Singapore: '新加坡',
  Thailand: '泰国',
  Laos: '老挝',
  Cambodia: '柬埔寨',
};

const WRI_RENEWABLE_FUELS = new Set(['Hydro', 'Solar', 'Wind', 'Geothermal', 'Biomass']);

const OWID_ENERGY_METRICS: Record<string, { label: string; unit: string; topic: AseanTopicKey }> = {
  electricity_generation: { label: '年度发电量', unit: 'TWh', topic: 'technology_infrastructure' },
  electricity_demand: { label: '年度电力需求', unit: 'TWh', topic: 'technology_infrastructure' },
  renewables_electricity: { label: '可再生发电量', unit: 'TWh', topic: 'technology_infrastructure' },
  renewables_share_elec: { label: '可再生电力占比', unit: '%', topic: 'technology_infrastructure' },
  fossil_share_elec: { label: '化石电力占比', unit: '%', topic: 'technology_infrastructure' },
  net_elec_imports: { label: '净电力进口', unit: 'TWh', topic: 'technology_infrastructure' },
};

const EXCLUDED_SERIES_KEYS = /_id|id|code|year|month|date|period|timestamp|time/i;
const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

function stableId(value: string) {
  return `asean-metric:${crypto.createHash('sha1').update(value).digest('hex').slice(0, 18)}`;
}

function compactText(value: unknown, max = 160) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function publicDatasetSourceName(value: string) {
  if (/Malaysia OpenAPI Fuel Price/iu.test(value)) return '马来西亚公开燃油价格';
  if (/Malaysia OpenAPI Electricity Supply/iu.test(value)) return '马来西亚公开电力供应数据';
  if (/Malaysia OpenAPI Electricity Consumption/iu.test(value)) return '马来西亚公开用电数据';
  if (/Malaysia OpenAPI Industrial Production/iu.test(value)) return '马来西亚公开工业生产数据';
  return value;
}

function publicMetric(metric: AseanDatasetMetric): AseanDatasetMetric {
  return {
    ...metric,
    source_name: publicDatasetSourceName(metric.source_name),
  };
}

function publicSeries(series: AseanDatasetSeries): AseanDatasetSeries {
  return {
    ...series,
    source_name: publicDatasetSourceName(series.source_name),
  };
}

function publicSourceHealth(source: AseanDatasetSourceHealth): AseanDatasetSourceHealth {
  return {
    ...source,
    source_name: publicDatasetSourceName(source.source_name),
  };
}

function publicCache(cache: AseanDatasetMetricCache): AseanDatasetMetricCache {
  return {
    ...cache,
    metrics: cache.metrics.map(publicMetric),
    series: (cache.series || []).map(publicSeries),
    source_health: (cache.source_health || []).map(publicSourceHealth),
  };
}

function sourcePriority(source: AseanTopicSource): 'p0' | 'p1' | 'p2' {
  return source.priority || 'p1';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberLike(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function datePrecision(value: string): 'day' | 'month' | 'year' | 'unknown' {
  if (/^\d{4}-\d{2}-\d{2}/u.test(value)) return 'day';
  if (/^\d{4}-\d{2}$/u.test(value)) return 'month';
  if (/^\d{4}$/u.test(value)) return 'year';
  return 'unknown';
}

function trainingWindowPoints(points: AseanDatasetSeriesPoint[]) {
  return points
    .filter((point) => Number.isFinite(point.value) && datePrecision(point.date) !== 'unknown')
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-120);
}

function aggregatePointsByDate(points: AseanDatasetSeriesPoint[]) {
  const grouped = new Map<string, { total: number; count: number }>();
  for (const point of points) {
    const current = grouped.get(point.date) || { total: 0, count: 0 };
    grouped.set(point.date, { total: current.total + point.value, count: current.count + 1 });
  }
  return Array.from(grouped.entries()).map(([date, value]) => ({
    date,
    value: value.count ? value.total / value.count : value.total,
  }));
}

function numericSeriesKeys(row: Record<string, unknown>) {
  return Object.keys(row)
    .filter((key) => !EXCLUDED_SERIES_KEYS.test(key) && numberLike(row[key]) !== null)
    .slice(0, 3);
}

function formatMetricValue(value: number | string) {
  if (typeof value === 'string') return value;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿美元`;
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}十亿美元`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}百万`;
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function metricDateValue(value: unknown, fallback: string) {
  const text = compactText(value, 32);
  return text || fallback;
}

function metricFreshness(date: string): AseanDatasetMetric['status'] {
  const year = Number(String(date).slice(0, 4));
  if (!Number.isFinite(year)) return 'metadata';
  const currentYear = new Date().getUTCFullYear();
  if (year >= currentYear - 1) return 'fresh';
  if (year >= currentYear - 3) return 'stale';
  return 'metadata';
}

function monthDate(year: unknown, month: unknown) {
  const yearText = compactText(year, 8);
  const monthText = compactText(month, 16).toLowerCase();
  const monthNumber = MONTH_NAME_TO_NUMBER[monthText] || (Number(monthText) >= 1 && Number(monthText) <= 12 ? String(Number(monthText)).padStart(2, '0') : '');
  return /^\d{4}$/u.test(yearText) && monthNumber ? `${yearText}-${monthNumber}` : '';
}

async function readCache(): Promise<AseanDatasetMetricCache | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')) as Partial<AseanDatasetMetricCache>;
    if (parsed.version !== 1 || !Array.isArray(parsed.metrics)) return null;
    return publicCache({
      version: 1,
      refreshed_at: parsed.refreshed_at || new Date(0).toISOString(),
      metrics: parsed.metrics.filter((item): item is AseanDatasetMetric => Boolean(item?.id && item.source_name && item.label)),
      series: Array.isArray(parsed.series)
        ? parsed.series.filter((item): item is AseanDatasetSeries => Boolean(item?.id && item.source_name && item.label && Array.isArray(item.points)))
        : [],
      source_health: Array.isArray(parsed.source_health) ? parsed.source_health.filter((item): item is AseanDatasetSourceHealth => Boolean(item?.source_name)) : [],
      latest_run: parsed.latest_run,
    });
  } catch {
    return null;
  }
}

async function writeCache(cache: AseanDatasetMetricCache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(publicCache(cache), null, 2)}\n`, 'utf-8');
}

async function fetchJson(source: AseanTopicSource): Promise<unknown | null> {
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(source.url, {
        headers: {
          Accept: 'application/json, */*',
          'User-Agent': 'WorldWeaveAseanDataset/0.1',
        },
        signal: controller.signal,
      });
      if (response.ok) return response.json();
      if (response.status < 500 && response.status !== 429) return null;
    } catch {
      // Transient resets are common on public data APIs under bursty polling; retry below.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < FETCH_ATTEMPTS) await sleep(250 * attempt);
  }
  return null;
}

async function fetchText(source: AseanTopicSource): Promise<string | null> {
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(source.url, {
        headers: {
          Accept: 'text/csv, text/plain, */*',
          'User-Agent': 'WorldWeaveAseanDataset/0.1',
        },
        signal: controller.signal,
      });
      if (response.ok) return response.text();
      if (response.status < 500 && response.status !== 429) return null;
    } catch {
      // Retry transient public data errors.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < FETCH_ATTEMPTS) await sleep(250 * attempt);
  }
  return null;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRows(text: string) {
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const header = parseCsvLine(lines[0] || '');
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, index) => [key, values[index] || '']));
  });
}

function latestWorldBankSpec(rows: Array<Record<string, unknown>>, source: AseanTopicSource) {
  const indicatorId = compactText(rows.find((row) => row?.indicator)?.indicator && (rows.find((row) => row?.indicator)?.indicator as Record<string, unknown>).id, 48);
  return WORLD_BANK_LABELS[indicatorId] || {
    label: compactText(source.scope, 24) || source.name,
    unit: 'value',
    topic: source.topic_tags?.[0] || 'market_macro',
  };
}

function extractWorldBankMetrics(source: AseanTopicSource, json: unknown, nowIso: string): AseanDatasetMetric[] {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
  const rows = json[1] as Array<Record<string, unknown>>;
  const latestByCountry = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const value = numberLike(row.value);
    const iso3 = compactText(row.countryiso3code, 8);
    const date = compactText(row.date, 8);
    if (value === null || !iso3 || !date) continue;
    const current = latestByCountry.get(iso3);
    if (!current || String(date).localeCompare(String(current.date || '')) > 0) latestByCountry.set(iso3, row);
  }
  const spec = latestWorldBankSpec(rows, source);
  return Array.from(latestByCountry.entries())
    .map(([iso3, row]) => ({
      id: stableId(`${source.name}|${iso3}|${row.date}|${row.value}`),
      source_name: source.name,
      source_url: source.url,
      source_priority: sourcePriority(source),
      label: spec.label,
      country: COUNTRY_ZH[iso3] || compactText((row.country as Record<string, unknown> | undefined)?.value, 24) || iso3,
      date: metricDateValue(row.date, nowIso.slice(0, 10)),
      value: Number(row.value),
      unit: spec.unit,
      topic: spec.topic,
      status: metricFreshness(String(row.date || '')),
      extracted_at: nowIso,
    }))
    .sort((left, right) => {
      const focusRank = Number(FOCUS_COUNTRIES.has(right.country)) - Number(FOCUS_COUNTRIES.has(left.country));
      if (focusRank) return focusRank;
      const leftValue = typeof left.value === 'number' ? left.value : 0;
      const rightValue = typeof right.value === 'number' ? right.value : 0;
      return rightValue - leftValue;
    });
}

function extractWorldBankSeries(source: AseanTopicSource, json: unknown): AseanDatasetSeries[] {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
  const rows = json[1] as Array<Record<string, unknown>>;
  const spec = latestWorldBankSpec(rows, source);
  const byCountry = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const value = numberLike(row.value);
    const iso3 = compactText(row.countryiso3code, 8);
    const date = compactText(row.date, 8);
    if (value === null || !iso3 || !date || !COUNTRY_ZH[iso3]) continue;
    const current = byCountry.get(iso3) || [];
    current.push(row);
    byCountry.set(iso3, current);
  }
  return Array.from(byCountry.entries()).flatMap(([iso3, countryRows]) => {
    const points = countryRows
      .flatMap((row) => {
        const date = compactText(row.date, 8);
        const value = numberLike(row.value);
        return date && value !== null ? [{ date, value }] : [];
      })
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-12);
    const latest = points[points.length - 1];
    if (!latest || points.length < 3) return [];
    const country = COUNTRY_ZH[iso3] || iso3;
    return {
      id: stableId(`${source.name}|series|${country}|${spec.label}`),
      source_name: source.name,
      source_url: source.url,
      label: spec.label,
      country,
      unit: spec.unit,
      topic: spec.topic,
      points,
      latest_date: latest.date,
      latest_value: latest.value,
    } satisfies AseanDatasetSeries;
  });
}

function extractOwidEnergyMetrics(source: AseanTopicSource, csvText: string, nowIso: string): AseanDatasetMetric[] {
  const rows = parseCsvRows(csvText)
    .filter((row) => OWID_COUNTRY_ZH[compactText(row.country, 40)])
    .filter((row) => Number.isFinite(Number(row.year)));
  const latestByCountry = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const country = compactText(row.country, 40);
    const current = latestByCountry.get(country);
    if (!current || Number(row.year) > Number(current.year)) latestByCountry.set(country, row);
  }
  return Array.from(latestByCountry.entries()).flatMap(([countryEn, row]) => {
    const country = OWID_COUNTRY_ZH[countryEn] || countryEn;
    return Object.entries(OWID_ENERGY_METRICS).flatMap(([key, spec]) => {
      const value = numberLike(row[key]);
      if (value === null) return [];
      const date = metricDateValue(row.year, nowIso.slice(0, 10));
      return {
        id: stableId(`${source.name}|${country}|${date}|${key}|${value}`),
        source_name: source.name,
        source_url: source.url,
        source_priority: sourcePriority(source),
        label: spec.label,
        country,
        date,
        value,
        unit: spec.unit,
        topic: spec.topic,
        status: metricFreshness(date),
        extracted_at: nowIso,
      } satisfies AseanDatasetMetric;
    });
  }).sort((left, right) => {
    const countryRank = Number(FOCUS_COUNTRIES.has(right.country)) - Number(FOCUS_COUNTRIES.has(left.country));
    if (countryRank) return countryRank;
    return right.date.localeCompare(left.date) || left.label.localeCompare(right.label);
  });
}

function extractOwidEnergySeries(source: AseanTopicSource, csvText: string): AseanDatasetSeries[] {
  const rows = parseCsvRows(csvText)
    .filter((row) => OWID_COUNTRY_ZH[compactText(row.country, 40)])
    .filter((row) => Number.isFinite(Number(row.year)));
  return Object.entries(OWID_COUNTRY_ZH).flatMap(([countryEn, country]) => {
    const countryRows = rows
      .filter((row) => compactText(row.country, 40) === countryEn)
      .sort((left, right) => Number(left.year) - Number(right.year));
    return Object.entries(OWID_ENERGY_METRICS).flatMap(([key, spec]) => {
      const points = countryRows.flatMap((row) => {
        const value = numberLike(row[key]);
        const date = compactText(row.year, 8);
        return value !== null && date ? [{ date, value }] : [];
      }).slice(-8);
      const latest = points[points.length - 1];
      if (!latest || points.length < 2) return [];
      return {
        id: stableId(`${source.name}|series|${country}|${key}`),
        source_name: source.name,
        source_url: source.url,
        label: spec.label,
        country,
        unit: spec.unit,
        topic: spec.topic,
        points,
        latest_date: latest.date,
        latest_value: latest.value,
      } satisfies AseanDatasetSeries;
    });
  });
}

function thailandEppoSectorLabel(value: unknown) {
  const text = compactText(value, 60);
  if (/Industrial/i.test(text)) return '工业用电量';
  if (/Business/i.test(text)) return '商业用电量';
  if (/Residential/i.test(text)) return '居民用电量';
  if (/Agriculture/i.test(text)) return '农业用电量';
  if (/Government|Non-Profit/i.test(text)) return '政府与公益用电量';
  if (/Free of Charge/i.test(text)) return '免费供电量';
  if (/Other/i.test(text)) return '其他用电量';
  return `${compactText(text || '部门', 24)}用电量`;
}

function extractThailandEppoElectricityMetrics(source: AseanTopicSource, csvText: string, nowIso: string): AseanDatasetMetric[] {
  const rows = parseCsvRows(csvText)
    .map((row) => ({
      date: monthDate(row.Year, row.Month),
      value: numberLike(row.Quantity),
      sector: compactText(row.Sector, 60),
      unit: compactText(row.UNIT, 16) || 'GWh',
    }))
    .filter((row) => row.date && row.value !== null);
  if (!rows.length) return [];
  const latestDate = rows.map((row) => row.date).sort().pop() || nowIso.slice(0, 7);
  return rows
    .filter((row) => row.date === latestDate)
    .slice(0, 8)
    .map((row) => {
      const label = thailandEppoSectorLabel(row.sector);
      return {
        id: stableId(`${source.name}|泰国|${latestDate}|${label}|${row.value}`),
        source_name: source.name,
        source_url: source.url,
        source_priority: sourcePriority(source),
        label,
        country: '泰国',
        date: latestDate,
        value: Number(row.value),
        unit: row.unit,
        topic: source.topic_tags?.[0] || 'technology_infrastructure',
        status: metricFreshness(latestDate),
        extracted_at: nowIso,
      } satisfies AseanDatasetMetric;
    });
}

function extractThailandEppoElectricitySeries(source: AseanTopicSource, csvText: string): AseanDatasetSeries[] {
  const rows = parseCsvRows(csvText)
    .map((row) => ({
      ...row,
      date: monthDate(row.Year, row.Month),
      value: numberLike(row.Quantity),
      sector: compactText(row.Sector, 60),
      unit: compactText(row.UNIT, 16) || 'GWh',
    }))
    .filter((row) => row.date && row.value !== null && row.sector);
  const bySector = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = bySector.get(row.sector) || [];
    current.push(row);
    bySector.set(row.sector, current);
  }
  return Array.from(bySector.entries()).flatMap(([sector, sectorRows]) => {
    const points = trainingWindowPoints(sectorRows.map((row) => ({ date: row.date, value: Number(row.value) })));
    const latest = points[points.length - 1];
    if (!latest || points.length < 12) return [];
    const label = thailandEppoSectorLabel(sector);
    return {
      id: stableId(`${source.name}|series|泰国|${label}`),
      source_name: source.name,
      source_url: source.url,
      label,
      country: '泰国',
      unit: sectorRows[0]?.unit || 'GWh',
      topic: source.topic_tags?.[0] || 'technology_infrastructure',
      points,
      latest_date: latest.date,
      latest_value: latest.value,
    } satisfies AseanDatasetSeries;
  });
}

function extractWriPowerPlantMetrics(source: AseanTopicSource, csvText: string, nowIso: string): AseanDatasetMetric[] {
  const rows = parseCsvRows(csvText)
    .filter((row) => COUNTRY_ZH[compactText(row.country, 8)])
    .map((row) => ({
      countryCode: compactText(row.country, 8),
      country: COUNTRY_ZH[compactText(row.country, 8)],
      capacity: numberLike(row.capacity_mw) || 0,
      fuel: compactText(row.primary_fuel, 32),
      year: numberLike(row.year_of_capacity_data) || numberLike(row.commissioning_year),
    }))
    .filter((row) => row.country && row.capacity > 0);
  const byCountry = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = byCountry.get(row.country) || [];
    current.push(row);
    byCountry.set(row.country, current);
  }
  return Array.from(byCountry.entries()).flatMap(([country, countryRows]) => {
    const totalCapacity = countryRows.reduce((total, row) => total + row.capacity, 0);
    const renewableCapacity = countryRows
      .filter((row) => WRI_RENEWABLE_FUELS.has(row.fuel))
      .reduce((total, row) => total + row.capacity, 0);
    const latestYear = Math.max(0, ...countryRows.flatMap((row) => (row.year ? [row.year] : [])));
    const date = String(latestYear || Number(nowIso.slice(0, 4)));
    const metrics = [
      { label: '电厂数量', value: countryRows.length, unit: 'plants' },
      { label: '电厂装机容量', value: totalCapacity, unit: 'MW' },
      { label: '可再生装机容量', value: renewableCapacity, unit: 'MW' },
      { label: '可再生装机占比', value: totalCapacity ? (renewableCapacity / totalCapacity) * 100 : 0, unit: '%' },
    ];
    return metrics.map((metric) => ({
      id: stableId(`${source.name}|${country}|${date}|${metric.label}|${metric.value.toFixed(4)}`),
      source_name: source.name,
      source_url: source.url,
      source_priority: sourcePriority(source),
      label: metric.label,
      country,
      date,
      value: Number(metric.value.toFixed(2)),
      unit: metric.unit,
      topic: source.topic_tags?.[0] || 'technology_infrastructure',
      status: metricFreshness(date),
      extracted_at: nowIso,
    } satisfies AseanDatasetMetric));
  }).sort((left, right) => {
    const focusRank = Number(FOCUS_COUNTRIES.has(right.country)) - Number(FOCUS_COUNTRIES.has(left.country));
    if (focusRank) return focusRank;
    return left.country.localeCompare(right.country) || left.label.localeCompare(right.label);
  });
}

function extractCsvMetricsForSource(source: AseanTopicSource, csvText: string, nowIso: string) {
  if (/Thailand EPPO National Electricity Use/i.test(source.name)) return extractThailandEppoElectricityMetrics(source, csvText, nowIso);
  if (/WRI Global Power Plant Database/i.test(source.name)) return extractWriPowerPlantMetrics(source, csvText, nowIso);
  return extractOwidEnergyMetrics(source, csvText, nowIso);
}

function extractCsvSeriesForSource(source: AseanTopicSource, csvText: string) {
  if (/Thailand EPPO National Electricity Use/i.test(source.name)) return extractThailandEppoElectricitySeries(source, csvText);
  return extractOwidEnergySeries(source, csvText);
}

function labelForArraySource(source: AseanTopicSource, numericKey: string, totalKeys: number) {
  const base =
    /Fuel Price/i.test(source.name)
      ? '燃油价格'
      : /Electricity Supply/i.test(source.name)
        ? '电力供给'
        : /Electricity Consumption/i.test(source.name)
          ? '电力消费'
          : /Industrial Production/i.test(source.name)
            ? '工业生产指数'
            : compactText(source.category || source.name, 24);
  return totalKeys > 1 ? `${base} ${numericKey}` : base;
}

function rowsFromArrayJson(json: unknown) {
  return Array.isArray(json)
    ? (json as Array<Record<string, unknown>>)
    : Array.isArray((json as { data?: unknown[] })?.data)
      ? ((json as { data: Array<Record<string, unknown>> }).data)
      : [];
}

function rowsFromPeeringDb(json: unknown) {
  return Array.isArray((json as { data?: unknown[] })?.data)
    ? ((json as { data: Array<Record<string, unknown>> }).data)
    : [];
}

function countryFromPeeringDbSource(source: AseanTopicSource, rows: Array<Record<string, unknown>>) {
  const code = compactText(rows.find((row) => row.country)?.country, 8);
  if (PEERINGDB_COUNTRY_ZH[code]) return PEERINGDB_COUNTRY_ZH[code];
  if (/Singapore/i.test(source.name)) return '新加坡';
  if (/Malaysia/i.test(source.name)) return '马来西亚';
  if (/Thailand/i.test(source.name)) return '泰国';
  if (/Vietnam/i.test(source.name)) return '越南';
  return '东盟';
}

function sumPeeringDb(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + Math.max(0, numberLike(row[key]) || 0), 0);
}

function extractPeeringDbMetrics(source: AseanTopicSource, json: unknown, nowIso: string): AseanDatasetMetric[] {
  const rows = rowsFromPeeringDb(json).filter((row) => compactText(row.status, 12) === 'ok');
  if (!rows.length) return [];
  const country = countryFromPeeringDbSource(source, rows);
  const latestUpdate = rows
    .map((row) => compactText(row.updated || row.created, 24))
    .filter(Boolean)
    .sort()
    .pop() || nowIso.slice(0, 10);
  const date = metricDateValue(latestUpdate.slice(0, 10), nowIso.slice(0, 10));
  const metrics = [
    { label: '网络设施数量', value: rows.length, unit: 'facilities' },
    { label: '设施网络连接数', value: sumPeeringDb(rows, 'net_count'), unit: 'net_count' },
    { label: '设施IX连接数', value: sumPeeringDb(rows, 'ix_count'), unit: 'ix_count' },
    { label: '设施运营商连接数', value: sumPeeringDb(rows, 'carrier_count'), unit: 'carrier_count' },
  ];
  return metrics.map((metric) => ({
    id: stableId(`${source.name}|${country}|${date}|${metric.label}|${metric.value}`),
    source_name: source.name,
    source_url: source.url,
    source_priority: sourcePriority(source),
    label: metric.label,
    country,
    date,
    value: metric.value,
    unit: metric.unit,
    topic: source.topic_tags?.[0] || 'technology_infrastructure',
    status: metricFreshness(date),
    extracted_at: nowIso,
  }));
}

function extractArrayMetrics(source: AseanTopicSource, json: unknown, nowIso: string): AseanDatasetMetric[] {
  const rows = rowsFromArrayJson(json);
  if (!rows.length) return [];
  const row = /Fuel Price/i.test(source.name)
    ? rows.find((candidate) => String(candidate.series_type || '').toLowerCase() === 'level') || rows[0]
    : rows[0];
  const date = metricDateValue(row.date || row.month || row.year || row.period, nowIso.slice(0, 10));
  const preferredKeys = /Fuel Price/i.test(source.name)
    ? ['ron95', 'ron97', 'diesel']
    : numericSeriesKeys(row);
  const keys = preferredKeys.filter((key) => numberLike(row[key]) !== null).slice(0, 3);
  if (!keys.length) {
    return [{
      id: stableId(`${source.name}|${date}|metadata`),
      source_name: source.name,
      source_url: source.url,
      source_priority: sourcePriority(source),
      label: compactText(source.category || source.name, 24),
      country: source.name.includes('Malaysia') ? '马来西亚' : '东盟',
      date,
      value: compactText(row.date || row.month || row.year || 'metadata', 48),
      unit: 'metadata',
      topic: source.topic_tags?.[0] || 'market_macro',
      status: metricFreshness(date),
      extracted_at: nowIso,
    }];
  }
  return keys.map((numericKey) => ({
    id: stableId(`${source.name}|${date}|${numericKey}|${row[numericKey]}`),
    source_name: source.name,
    source_url: source.url,
    source_priority: sourcePriority(source),
    label: labelForArraySource(source, numericKey, keys.length),
    country: source.name.includes('Malaysia') ? '马来西亚' : '东盟',
    date,
    value: Number(row[numericKey]),
    unit: numericKey,
    topic: source.topic_tags?.[0] || 'market_macro',
    status: metricFreshness(date),
    extracted_at: nowIso,
  }));
}

function extractArraySeries(source: AseanTopicSource, json: unknown): AseanDatasetSeries[] {
  const rawRows = rowsFromArrayJson(json);
  const rows = /Fuel Price/i.test(source.name)
    ? rawRows.filter((row) => String(row.series_type || '').toLowerCase() === 'level')
    : rawRows;
  if (rows.length < 2) return [];
  const sample = rows.find((row) => numericSeriesKeys(row).length);
  if (!sample) return [];
  const keys = /Fuel Price/i.test(source.name)
    ? ['ron95', 'ron97', 'diesel'].filter((key) => numberLike(sample[key]) !== null)
    : numericSeriesKeys(sample);
  const country = source.name.includes('Malaysia') ? '马来西亚' : '东盟';
  return keys
    .map((key) => {
      const points = trainingWindowPoints(aggregatePointsByDate(rows.flatMap((row) => {
        const date = compactText(row.date || row.month || row.period || row.year, 16);
        const value = numberLike(row[key]);
        return date && value !== null ? [{ date, value }] : [];
      })));
      const latest = points[points.length - 1];
      return {
        id: stableId(`${source.name}|series|${key}`),
        source_name: source.name,
        source_url: source.url,
        label: labelForArraySource(source, key, keys.length),
        country,
        unit: key,
        topic: source.topic_tags?.[0] || 'market_macro',
        points,
        latest_date: latest?.date || '',
        latest_value: latest?.value || 0,
      } satisfies AseanDatasetSeries;
    })
    .filter((series) => series.points.length >= 2 && series.latest_date);
}

function extractDataGovSgMetrics(source: AseanTopicSource, json: unknown, nowIso: string): AseanDatasetMetric[] {
  const records = (json as { result?: { records?: Array<Record<string, unknown>> } })?.result?.records || [];
  if (!records.length) return [];
  if (/Generation And Consumption/i.test(source.name)) return extractDataGovSgWideMetrics(source, records, nowIso);
  const sorted = [...records].sort((left, right) => String(right.month || right.year || '').localeCompare(String(left.month || left.year || '')));
  const row = sorted[0];
  const date = metricDateValue(row.month || row.year || nowIso.slice(0, 10), nowIso.slice(0, 10));
  const numericKey = Object.keys(row).find((key) => numberLike(row[key]) !== null && !/_id|year|month/i.test(key));
  const value = numericKey ? numberLike(row[numericKey]) : null;
  const label =
    /Tariff Components/i.test(source.name)
      ? '电价构成'
      : /Tariffs/i.test(source.name)
        ? '月度电价'
        : /Accounts/i.test(source.name)
          ? '电力账户'
          : '发电与用电';
  return [
    {
      id: stableId(`${source.name}|${date}|${numericKey || 'metadata'}|${value ?? 'metadata'}`),
      source_name: source.name,
      source_url: source.url,
      source_priority: sourcePriority(source),
      label,
      country: '新加坡',
      date,
      value: value ?? compactText(row[numericKey || 'year'] || 'metadata', 48),
      unit: numericKey || 'metadata',
      topic: source.topic_tags?.[0] || 'technology_infrastructure',
      status: metricFreshness(date),
      extracted_at: nowIso,
    },
  ];
}

function extractDataGovSgSeries(source: AseanTopicSource, json: unknown): AseanDatasetSeries[] {
  const records = (json as { result?: { records?: Array<Record<string, unknown>> } })?.result?.records || [];
  if (records.length < 2) return [];
  if (/Generation And Consumption/i.test(source.name)) return extractDataGovSgWideSeries(source, records);
  const sample = records.find((row) => numericSeriesKeys(row).length);
  if (!sample) return [];
  const keys = numericSeriesKeys(sample);
  const label =
    /Tariff Components/i.test(source.name)
      ? '电价构成'
      : /Tariffs/i.test(source.name)
        ? '月度电价'
        : /Accounts/i.test(source.name)
          ? '电力账户'
          : '发电与用电';
  return keys
    .map((key) => {
      const points = trainingWindowPoints(aggregatePointsByDate(records.flatMap((row) => {
        const date = compactText(row.month || row.date || row.year || row.period, 16);
        const value = numberLike(row[key]);
        return date && value !== null ? [{ date, value }] : [];
      })));
      const latest = points[points.length - 1];
      return {
        id: stableId(`${source.name}|series|${key}`),
        source_name: source.name,
        source_url: source.url,
        label: keys.length > 1 ? `${label} ${key}` : label,
        country: '新加坡',
        unit: key,
        topic: source.topic_tags?.[0] || 'technology_infrastructure',
        points,
        latest_date: latest?.date || '',
        latest_value: latest?.value || 0,
      } satisfies AseanDatasetSeries;
    })
    .filter((series) => series.points.length >= 2 && series.latest_date);
}

function dataGovSgWideLabel(value: unknown) {
  const text = compactText(value, 80).replace(/\s+/gu, ' ').trim();
  if (/Generation/i.test(text)) return '年度发电量';
  if (/Consumption/i.test(text)) return '年度用电量';
  if (/Industrial/i.test(text)) return '工业用电量';
  if (/Commerce|Service/i.test(text)) return '商业服务用电量';
  if (/Residential/i.test(text)) return '居民用电量';
  return compactText(text || '年度电力指标', 28);
}

function yearValueKeys(row: Record<string, unknown>) {
  return Object.keys(row)
    .filter((key) => /^\d{4}$/u.test(key) && numberLike(row[key]) !== null)
    .sort();
}

function extractDataGovSgWideMetrics(
  source: AseanTopicSource,
  records: Array<Record<string, unknown>>,
  nowIso: string,
): AseanDatasetMetric[] {
  return records
    .filter((row) => /Generation|Consumption/i.test(compactText(row.DataSeries, 80)))
    .slice(0, 4)
    .flatMap((row) => {
      const keys = yearValueKeys(row);
      const year = keys[keys.length - 1];
      const value = year ? numberLike(row[year]) : null;
      if (!year || value === null) return [];
      const label = dataGovSgWideLabel(row.DataSeries);
      return {
        id: stableId(`${source.name}|${label}|${year}|${value}`),
        source_name: source.name,
        source_url: source.url,
        source_priority: sourcePriority(source),
        label,
        country: '新加坡',
        date: year,
        value,
        unit: 'GWh',
        topic: source.topic_tags?.[0] || 'technology_infrastructure',
        status: metricFreshness(year),
        extracted_at: nowIso,
      } satisfies AseanDatasetMetric;
    });
}

function extractDataGovSgWideSeries(source: AseanTopicSource, records: Array<Record<string, unknown>>): AseanDatasetSeries[] {
  return records
    .filter((row) => /Generation|Consumption/i.test(compactText(row.DataSeries, 80)))
    .slice(0, 4)
    .flatMap((row) => {
      const label = dataGovSgWideLabel(row.DataSeries);
      const points = yearValueKeys(row).flatMap((year) => {
        const value = numberLike(row[year]);
        return value === null ? [] : [{ date: year, value }];
      });
      const latest = points[points.length - 1];
      if (!latest || points.length < 2) return [];
      return {
        id: stableId(`${source.name}|series|${label}`),
        source_name: source.name,
        source_url: source.url,
        label,
        country: '新加坡',
        unit: 'GWh',
        topic: source.topic_tags?.[0] || 'technology_infrastructure',
        points: trainingWindowPoints(points),
        latest_date: latest.date,
        latest_value: latest.value,
      } satisfies AseanDatasetSeries;
    });
}

function extractMetadataMetrics(source: AseanTopicSource, json: unknown, nowIso: string): AseanDatasetMetric[] {
  const ckanResults = (json as { result?: { results?: Array<Record<string, unknown>> } })?.result?.results;
  const pxweb = Array.isArray(json) ? (json as Array<Record<string, unknown>>) : null;
  const count = ckanResults?.length ?? pxweb?.length ?? 0;
  if (!count) return [];
  const first = ckanResults?.[0] || pxweb?.[0] || {};
  const date = metricDateValue(first.metadata_modified || first.updated || first.modified || nowIso.slice(0, 10), nowIso.slice(0, 10));
  const country = source.name.includes('Cambodia')
    ? '柬埔寨'
    : source.name.includes('Philippines')
      ? '菲律宾'
      : source.name.includes('Mekong')
        ? '东盟'
        : '东盟';
  return [
    {
      id: stableId(`${source.name}|${date}|${count}`),
      source_name: source.name,
      source_url: source.url,
      source_priority: sourcePriority(source),
      label: /OpenSTAT/i.test(source.name) ? '统计表目录更新' : '开放数据集目录',
      country,
      date,
      value: count,
      unit: 'datasets',
      topic: source.topic_tags?.[0] || 'technology_infrastructure',
      status: 'metadata',
      extracted_at: nowIso,
    },
  ];
}

function extractMetricsForSource(source: AseanTopicSource, json: unknown, nowIso: string) {
  if (/World Bank/i.test(source.name)) return extractWorldBankMetrics(source, json, nowIso);
  if (/Singapore Data\.gov/i.test(source.name)) return extractDataGovSgMetrics(source, json, nowIso);
  if (/PeeringDB Facilities/i.test(source.name)) return extractPeeringDbMetrics(source, json, nowIso);
  if (/Malaysia OpenAPI/i.test(source.name)) return extractArrayMetrics(source, json, nowIso);
  return extractMetadataMetrics(source, json, nowIso);
}

function extractSeriesForSource(source: AseanTopicSource, json: unknown) {
  if (/World Bank/i.test(source.name)) return extractWorldBankSeries(source, json);
  if (/Singapore Data\.gov/i.test(source.name)) return extractDataGovSgSeries(source, json);
  if (/Malaysia OpenAPI/i.test(source.name)) return extractArraySeries(source, json);
  return [];
}

function selectedSources() {
  return ASEAN_SOURCE_POOL
    .filter((source) => source.status === 'active' && source.ingestion === 'dataset' && (source.source_type === 'api-json' || source.source_type === 'csv'))
    .filter((source) => source.priority === 'p0' || source.priority === 'p1')
    .filter((source) => INCLUDE_EXTENDED_DATASETS || CORE_ENERGY_DATASET_SOURCE.test(source.name) || !EXTENDED_DATASET_SOURCE.test(source.name))
    .slice(0, SOURCE_LIMIT);
}

async function forEachSourceWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

function metricToSignal(metric: AseanDatasetMetric): AseanSignalLike {
  return {
    id: metric.id,
    title: `${metric.country}${metric.label}更新至${metric.date}`,
    summary: `${metric.source_name}公开数据接口返回${metric.date}口径：${metric.label}为${formatMetricValue(metric.value)}（${metric.unit}）。用于国家口径对比和专题研判。`,
    source_name: metric.source_name,
    source_url: metric.source_url,
    published_at: metric.extracted_at,
    publishedAt: metric.extracted_at,
    country: metric.country,
    region: 'Southeast Asia',
    scene: 'asean',
    tags: ['asean', 'dataset', 'metric', metric.topic, metric.country, metric.source_priority],
    alignment_tags: [
      'scene:asean',
      'source:asean-dataset',
      `metric:${metric.label}`,
      `priority:${metric.source_priority}`,
      `metric-status:${metric.status}`,
    ],
    severity: metric.source_priority === 'p0' ? 4 : 3,
    relevance_score: metric.source_priority === 'p0' ? 0.86 : 0.78,
  };
}

async function refreshMetrics(cache: AseanDatasetMetricCache | null, nowIso: string) {
  const sources = selectedSources();
  let fetchedCount = 0;
  let failedCount = 0;
  const metrics: AseanDatasetMetric[] = [];
  const series: AseanDatasetSeries[] = [];
  const sourceHealth: AseanDatasetSourceHealth[] = [];
  await forEachSourceWithConcurrency(
    sources,
    FETCH_CONCURRENCY,
    async (source) => {
      const payload = source.source_type === 'csv' ? await fetchText(source) : await fetchJson(source);
      if (!payload) {
        failedCount += 1;
        sourceHealth.push({
          source_name: source.name,
          source_url: source.url,
          fetched: false,
          metric_count: 0,
          status: 'failed',
          checked_at: nowIso,
        });
        return;
      }
      fetchedCount += 1;
      const sourceMetrics = typeof payload === 'string'
        ? extractCsvMetricsForSource(source, payload, nowIso)
        : extractMetricsForSource(source, payload, nowIso);
      const sourceSeries = typeof payload === 'string'
        ? extractCsvSeriesForSource(source, payload)
        : extractSeriesForSource(source, payload);
      metrics.push(...sourceMetrics);
      series.push(...sourceSeries);
      sourceHealth.push({
        source_name: source.name,
        source_url: source.url,
        fetched: true,
        metric_count: sourceMetrics.length,
        status: sourceMetrics.length ? 'ok' : 'empty',
        checked_at: nowIso,
      });
    },
  );
  const failedSourceNames = new Set(sourceHealth.filter((source) => !source.fetched).map((source) => source.source_name));
  const failedSourceUrls = new Set(sourceHealth.filter((source) => !source.fetched).map((source) => source.source_url));
  const preservedMetrics = (cache?.metrics || []).filter((metric) => failedSourceNames.has(metric.source_name) || failedSourceUrls.has(metric.source_url));
  const preservedSeries = (cache?.series || []).filter((item) => failedSourceNames.has(item.source_name) || failedSourceUrls.has(item.source_url));
  const metricById = new Map<string, AseanDatasetMetric>();
  for (const metric of [...preservedMetrics, ...metrics]) metricById.set(metric.id, metric);
  const seriesById = new Map<string, AseanDatasetSeries>();
  for (const item of [...preservedSeries, ...series]) seriesById.set(item.id, item);
  const nextMetrics = Array.from(metricById.values())
    .sort((left, right) => {
      const priority = left.source_priority.localeCompare(right.source_priority);
      if (priority) return priority;
      return right.date.localeCompare(left.date);
    })
    .slice(0, METRICS_LIMIT);
  const nextSeries = Array.from(seriesById.values()).slice(0, SERIES_LIMIT);
  const nextCache: AseanDatasetMetricCache = {
    version: 1,
    refreshed_at: nowIso,
    metrics: nextMetrics,
    series: nextSeries,
    source_health: sourceHealth,
    latest_run: {
      refreshed_at: nowIso,
      source_count: sources.length,
      fetched_count: fetchedCount,
      metric_count: nextMetrics.length,
      failed_count: failedCount,
    },
  };
  await writeCache(nextCache);
  return nextCache;
}

export async function readAseanDatasetMetricState(options: { force?: boolean } = {}) {
  const cache = await readCache();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cacheAge = cache ? now - new Date(cache.refreshed_at).getTime() : Infinity;
  const nextCache =
    ENABLED && (options.force || !cache || !Number.isFinite(cacheAge) || cacheAge >= CACHE_TTL_MS)
      ? await refreshMetrics(cache, nowIso)
      : cache || {
          version: 1 as const,
          refreshed_at: nowIso,
          metrics: [],
          source_health: [],
          latest_run: {
            refreshed_at: nowIso,
            source_count: 0,
            fetched_count: 0,
            metric_count: 0,
            failed_count: 0,
          },
        };
  const publicMetrics = nextCache.metrics.map(publicMetric);
  const publicSeriesRows = (nextCache.series || []).map(publicSeries);
  return {
    enabled: ENABLED,
    refreshed_at: nextCache.refreshed_at,
    latest_run: nextCache.latest_run || null,
    source_health: (nextCache.source_health || []).map(publicSourceHealth),
    metrics: publicMetrics,
    series: publicSeriesRows,
    signals: publicMetrics.map(metricToSignal),
  };
}
