import process from 'node:process';

const DEFAULT_BASE_URL = (process.env.WORLD_ASEAN_REFRESH_BASE_URL || process.env.WORLD_BATCH_REFRESH_BASE_URL || 'http://127.0.0.1:5018').replace(/\/+$/, '');
const DEFAULT_INTERVAL_MINUTES = Math.max(5, Number(process.env.WORLD_ASEAN_REFRESH_INTERVAL_MINUTES || 60));
const DEFAULT_LIMIT = Math.max(20, Number(process.env.WORLD_ASEAN_REFRESH_LIMIT || 80));

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    limit: DEFAULT_LIMIT,
    loop: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--loop') args.loop = true;
    if (arg === '--base-url') args.baseUrl = String(argv[++index] || args.baseUrl).replace(/\/+$/, '');
    if (arg === '--interval-minutes') args.intervalMinutes = Math.max(5, Number(argv[++index] || args.intervalMinutes));
    if (arg === '--limit') args.limit = Math.max(20, Number(argv[++index] || args.limit));
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

async function refreshOnce(args) {
  const startedAt = Date.now();
  const url = `${args.baseUrl}/api/v1/world/asean?limit=${encodeURIComponent(String(args.limit))}&fresh=1`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(120000),
  });
  const payload = await response.json().catch(() => null);
  const incremental = payload?.incremental_search || {};
  const latestRun = incremental.latest_run || {};
  const feedSignals = Array.isArray(payload?.signals)
    ? payload.signals.filter((signal) => String(signal?.id || '').startsWith('asean-feed:'))
    : [];
  const feedSources = feedSignals.reduce((map, signal) => {
    const name = String(signal?.source_name || 'unknown');
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {});
  const summary = {
    at: nowIso(),
    ok: response.ok,
    status: response.status,
    duration_ms: Date.now() - startedAt,
    search_ready: Boolean(incremental.search_ready),
    keyword_count: incremental.keyword_count ?? null,
    incremental_signal_count: incremental.signal_count ?? null,
    incremental_refreshed_at: incremental.refreshed_at ?? null,
    latest_fetched_count: latestRun.fetched_count ?? null,
    latest_new_item_count: latestRun.new_item_count ?? null,
    source_feed_signal_count: feedSignals.length,
    source_feed_sources: feedSources,
    signal_count: payload?.signal_count ?? null,
    returned_signal_count: payload?.returned_signal_count ?? null,
  };
  console.log(JSON.stringify(summary));
  if (!response.ok) process.exitCode = 1;
}

const args = parseArgs(process.argv.slice(2));
do {
  await refreshOnce(args);
  if (!args.loop) break;
  await new Promise((resolve) => setTimeout(resolve, args.intervalMinutes * 60 * 1000));
} while (true);
