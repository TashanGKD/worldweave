import process from 'node:process';

const BASE_URL = process.env.WORLD_LOAD_BASE_URL || 'http://127.0.0.1:5000';
const DEFAULT_CONCURRENCY = Number(process.env.WORLD_LOAD_CONCURRENCY || 8);
const DEFAULT_ROUNDS = Number(process.env.WORLD_LOAD_ROUNDS || 5);
const DEFAULT_TIMEOUT_MS = Number(process.env.WORLD_LOAD_TIMEOUT_MS || 15000);

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  const data = await response.json();
  return { response, data };
}

async function resolveQuestionHref() {
  const { response, data } = await fetchJson(
    `${BASE_URL}/api/v1/world/livebench/questions?scene=global&audience=human&status=active&limit=1`,
  );
  if (!response.ok) {
    throw new Error(`failed to load active question list: HTTP ${response.status}`);
  }
  const first = data?.questions?.[0] || data?.[0];
  if (!first?.href) {
    throw new Error('no active question href available for load test');
  }
  return first.href;
}

async function oneRequest(url) {
  const start = Date.now();
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'network_error',
      ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runEndpoint(name, url, concurrency, rounds) {
  const samples = [];
  const statuses = new Map();
  const total = concurrency * rounds;
  for (let round = 0; round < rounds; round += 1) {
    const batch = await Promise.all(Array.from({ length: concurrency }, () => oneRequest(url)));
    for (const sample of batch) {
      samples.push(sample);
      const key = String(sample.status);
      statuses.set(key, (statuses.get(key) || 0) + 1);
    }
  }

  const successful = samples.filter((sample) => sample.ok);
  const latencies = successful.map((sample) => sample.ms);
  return {
    name,
    url,
    total,
    success: successful.length,
    failed: total - successful.length,
    avg_ms: average(latencies),
    p50_ms: percentile(latencies, 0.5),
    p95_ms: percentile(latencies, 0.95),
    p99_ms: percentile(latencies, 0.99),
    max_ms: latencies.length ? Math.max(...latencies) : null,
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    sample_errors: samples.filter((sample) => !sample.ok).slice(0, 3).map((sample) => sample.error || String(sample.status)),
  };
}

async function main() {
  const concurrency = Number(process.argv[2] || DEFAULT_CONCURRENCY);
  const rounds = Number(process.argv[3] || DEFAULT_ROUNDS);
  if (!Number.isFinite(concurrency) || concurrency <= 0 || !Number.isFinite(rounds) || rounds <= 0) {
    throw new Error('usage: node scripts/load-world.mjs [concurrency] [rounds]');
  }

  const questionHref = await resolveQuestionHref();
  const endpoints = [
    { name: 'home', url: `${BASE_URL}/` },
    { name: 'state', url: `${BASE_URL}/api/v1/world/state?scene=global` },
    { name: 'questions', url: `${BASE_URL}/api/v1/world/livebench/questions?scene=global&audience=human&limit=60` },
    { name: 'question_detail_page', url: `${BASE_URL}${questionHref}` },
    { name: 'evaluation_page', url: `${BASE_URL}/livebench/evaluation` },
    { name: 'source_knowledge_page', url: `${BASE_URL}/source-knowledge` },
    { name: 'skill', url: `${BASE_URL}/api/v1/openclaw/skill.md` },
  ];

  const startedAt = new Date().toISOString();
  const results = [];
  for (const endpoint of endpoints) {
    results.push(await runEndpoint(endpoint.name, endpoint.url, concurrency, rounds));
  }

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    base_url: BASE_URL,
    concurrency,
    rounds,
    requests_per_endpoint: concurrency * rounds,
    endpoints: results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
