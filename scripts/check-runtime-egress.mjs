import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_URLS = [
  'https://export.arxiv.org/',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore',
  'https://gamma-api.polymarket.com/markets?limit=1',
  'https://api.manifold.markets/v0/markets?limit=1',
];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function probeRuntimeEgress({
  urls = DEFAULT_URLS,
  minSuccess = 3,
  timeoutMs = 30_000,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('At least one egress probe URL is required.');
  }

  const required = Math.min(positiveInteger(minSuccess, 3), urls.length);
  const results = await Promise.all(
    urls.map(async (url) => {
      const startedAt = Date.now();
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(positiveInteger(timeoutMs, 30_000)),
        });
        await response.body?.cancel?.();
        const ok = response.status >= 200 && response.status < 500;
        log(`[egress] ${url} -> HTTP ${response.status} (${Date.now() - startedAt}ms)`);
        return { url, ok, status: response.status, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`[egress] ${url} -> ERROR ${message} (${Date.now() - startedAt}ms)`);
        return { url, ok: false, status: null, error: message };
      }
    }),
  );

  const successCount = results.filter((result) => result.ok).length;
  return {
    ok: successCount >= required,
    required,
    successCount,
    results,
  };
}

async function main() {
  const configuredUrls = String(process.env.WORLD_EGRESS_PROBE_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const urls = configuredUrls.length > 0 ? configuredUrls : DEFAULT_URLS;
  const summary = await probeRuntimeEgress({
    urls,
    minSuccess: positiveInteger(process.env.WORLD_EGRESS_PROBE_MIN_SUCCESS, 3),
    timeoutMs: positiveInteger(process.env.WORLD_EGRESS_PROBE_TIMEOUT_MS, 30_000),
  });

  console.log(
    `[egress] ${summary.successCount}/${summary.results.length} reachable; ` +
      `${summary.required} required; env proxy ${process.env.NODE_USE_ENV_PROXY === '1' ? 'enabled' : 'disabled'}`,
  );
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await main();
}
