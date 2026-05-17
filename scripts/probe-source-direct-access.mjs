import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const validationDir = path.join(root, 'research', 'source-skill-validation');
const today = new Date().toISOString().slice(0, 10);

for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete process.env[key];
}
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

function parseArgs(argv) {
  const args = {
    concurrency: Number(process.env.SOURCE_DIRECT_PROBE_CONCURRENCY || 32),
    timeoutMs: Number(process.env.SOURCE_DIRECT_PROBE_TIMEOUT_MS || 8000),
    limit: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--concurrency') args.concurrency = Number(argv[++index] || args.concurrency);
    if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index] || args.timeoutMs);
    if (arg === '--limit') args.limit = Number(argv[++index] || args.limit);
  }
  args.concurrency = Math.min(Math.max(Math.floor(args.concurrency || 32), 1), 128);
  args.timeoutMs = Math.min(Math.max(Math.floor(args.timeoutMs || 8000), 1000), 60000);
  args.limit = Math.max(Math.floor(args.limit || 0), 0);
  return args;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  const raw = String(value || '').trim().replace(/[)\],，。；;]+$/u, '');
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function addSource(map, input) {
  const url = normalizeUrl(input.url);
  if (!url) return;
  const key = url.toLowerCase();
  const existing = map.get(key);
  const source = {
    url,
    name: String(input.name || input.source_name || '').trim(),
    source_type: String(input.source_type || input.type || '').trim(),
    collection: String(input.collection || input.skill || input.file || '').trim(),
    admission: String(input.admission || '').trim(),
    source_role: String(input.source_role || '').trim(),
    origin: String(input.origin || '').trim(),
  };
  if (existing) {
    existing.origins = Array.from(new Set([...existing.origins, source.origin || source.collection].filter(Boolean)));
    if (!existing.name && source.name) existing.name = source.name;
    if (!existing.source_type && source.source_type) existing.source_type = source.source_type;
    if (!existing.collection && source.collection) existing.collection = source.collection;
    if (!existing.admission && source.admission) existing.admission = source.admission;
    if (!existing.source_role && source.source_role) existing.source_role = source.source_role;
    return;
  }
  map.set(key, {
    ...source,
    origins: [source.origin || source.collection].filter(Boolean),
  });
}

function addUrlsFromText(map, filePath, origin) {
  const text = readText(filePath);
  const matches = text.match(/https?:\/\/[^\s<>"'`|]+/g) || [];
  for (const url of matches) {
    addSource(map, { url, origin, collection: path.basename(filePath) });
  }
}

function loadSources() {
  const map = new Map();
  const directory = readJson(path.join(validationDir, 'latest-directory-candidates.json'));
  for (const item of Array.isArray(directory?.candidates) ? directory.candidates : []) {
    addSource(map, { ...item, origin: 'latest-directory-candidates.json' });
  }

  const bundleDir = path.join(root, 'research', 'source-skill-bundles', 'source-skill-bundle-2026-04-11');
  for (const fileName of ['all-sources.json', 'direct-sources.json', 'high-value-usable-sources.json', 'usable-sources.json']) {
    const items = readJson(path.join(bundleDir, fileName));
    for (const item of Array.isArray(items) ? items : []) {
      addSource(map, { ...item, origin: fileName });
    }
  }

  const inkwell = readJson(path.join(root, 'research', 'inkwell-rss-snapshot.json'));
  for (const item of Array.isArray(inkwell?.sources) ? inkwell.sources : []) {
    addSource(map, {
      url: item.url || item.html_url,
      name: item.name,
      source_type: item.source_type || 'rss',
      collection: 'inkwell-rss-snapshot',
      origin: 'inkwell-rss-snapshot.json',
    });
  }

  for (const fileName of ['shunyanet-world-core.txt', 'shunyanet-iran-watch.txt']) {
    const filePath = path.join(root, 'research', 'curated-feeds', fileName);
    for (const line of readText(filePath).split(/\r?\n/)) {
      addSource(map, { url: line, collection: fileName, origin: fileName, source_type: 'rss' });
    }
  }

  for (const fileName of [
    'source-link-registry.md',
    'source-skill-candidates.md',
    'skill-aggregator-index.md',
    'shunyanet-sentinel-curated-feeds.md',
  ]) {
    addUrlsFromText(map, path.join(root, 'research', fileName), fileName);
  }

  return Array.from(map.values()).sort((left, right) => left.url.localeCompare(right.url));
}

function classify(result) {
  if (result.error) {
    const error = result.error.toLowerCase();
    if (error.includes('timeout') || error.includes('aborted')) return 'timeout';
    if (error.includes('enotfound') || error.includes('eai_again')) return 'dns_failed';
    if (error.includes('certificate') || error.includes('ssl') || error.includes('tls')) return 'tls_failed';
    if (error.includes('econnreset') || error.includes('socket') || error.includes('fetch failed')) return 'network_failed';
    return 'error';
  }
  const status = result.status_code || 0;
  if (status >= 200 && status < 300) return 'direct_2xx';
  if (status >= 300 && status < 400) return 'redirect_3xx';
  if (status === 401 || status === 403) return 'auth_or_forbidden';
  if (status === 404 || status === 410) return 'not_found';
  if (status === 405) return 'method_blocked';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'other_status';
}

async function probe(source, timeoutMs) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/json, text/xml, application/xml, text/html;q=0.7, */*;q=0.5',
        'User-Agent': 'WorldWeave-source-direct-access-probe/1.0',
      },
    });
    let sample = '';
    try {
      const reader = response.body?.getReader();
      if (reader) {
        let received = 0;
        const chunks = [];
        while (received < 8192) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          received += value.byteLength;
          if (received >= 8192) break;
        }
        await reader.cancel().catch(() => {});
        sample = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
      }
    } catch {
      sample = '';
    }
    const result = {
      ...source,
      ok: response.ok,
      status_code: response.status,
      final_url: response.url,
      content_type: response.headers.get('content-type') || '',
      elapsed_ms: Date.now() - started,
      sample_kind: detectSampleKind(sample, response.headers.get('content-type') || ''),
      error: null,
    };
    return {
      ...result,
      access: classify(result),
    };
  } catch (error) {
    const result = {
      ...source,
      ok: false,
      status_code: null,
      final_url: null,
      content_type: '',
      elapsed_ms: Date.now() - started,
      sample_kind: '',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
    return {
      ...result,
      access: classify(result),
    };
  } finally {
    clearTimeout(timer);
  }
}

function detectSampleKind(sample, contentType) {
  const text = String(sample || '').slice(0, 8192).toLowerCase();
  const type = String(contentType || '').toLowerCase();
  if (type.includes('json') || /^[\s\r\n]*[\[{]/.test(text)) return 'json';
  if (type.includes('rss') || text.includes('<rss')) return 'rss';
  if (type.includes('atom') || text.includes('<feed')) return 'atom';
  if (type.includes('xml') || text.includes('<?xml')) return 'xml';
  if (type.includes('html') || text.includes('<html')) return 'html';
  if (text.trim()) return 'text';
  return 'empty';
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
      done += 1;
      if (done % 100 === 0 || done === items.length) {
        console.log(`[probe] ${done}/${items.length}`);
      }
      await delay(10);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const byAccess = {};
  const byCollection = {};
  const byKind = {};
  const byHostFailures = {};
  for (const row of results) {
    byAccess[row.access] = (byAccess[row.access] || 0) + 1;
    byCollection[row.collection || 'unknown'] = (byCollection[row.collection || 'unknown'] || 0) + 1;
    byKind[row.sample_kind || 'unknown'] = (byKind[row.sample_kind || 'unknown'] || 0) + 1;
    if (!['direct_2xx', 'redirect_3xx'].includes(row.access)) {
      const host = (() => {
        try {
          return new URL(row.url).hostname;
        } catch {
          return 'unknown';
        }
      })();
      byHostFailures[host] = (byHostFailures[host] || 0) + 1;
    }
  }
  return { total: results.length, by_access: byAccess, by_collection: byCollection, by_sample_kind: byKind, top_failure_hosts: Object.entries(byHostFailures).sort((a, b) => b[1] - a[1]).slice(0, 30) };
}

function writeMarkdown(filePath, payload) {
  const good = payload.results.filter((row) => row.access === 'direct_2xx' || row.access === 'redirect_3xx');
  const lines = [
    `# Direct source access probe ${payload.date}`,
    '',
    `- total: ${payload.summary.total}`,
    ...Object.entries(payload.summary.by_access).sort().map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Direct structured samples',
    '',
    '| name | collection | status | kind | ms | url |',
    '|---|---|---:|---|---:|---|',
    ...good
      .filter((row) => ['rss', 'atom', 'xml', 'json'].includes(row.sample_kind))
      .slice(0, 120)
      .map((row) => `| ${escapeCell(row.name || row.collection || '')} | ${escapeCell(row.collection || '')} | ${row.status_code || ''} | ${row.sample_kind} | ${row.elapsed_ms} | ${escapeCell(row.url)} |`),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(validationDir, { recursive: true });
  let sources = loadSources();
  if (args.limit > 0) sources = sources.slice(0, args.limit);
  console.log(`[probe] direct/no-proxy source count=${sources.length} concurrency=${args.concurrency} timeoutMs=${args.timeoutMs}`);
  const results = await runPool(sources, args.concurrency, (source) => probe(source, args.timeoutMs));
  const payload = {
    date: today,
    generated_at: new Date().toISOString(),
    direct_no_proxy: true,
    timeout_ms: args.timeoutMs,
    concurrency: args.concurrency,
    source_count: sources.length,
    summary: summarize(results),
    results,
  };
  const jsonPath = path.join(validationDir, `direct-access-probe-${today}.json`);
  const mdPath = path.join(validationDir, `direct-access-probe-${today}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeMarkdown(mdPath, payload);
  console.log(`[probe] wrote ${jsonPath}`);
  console.log(`[probe] wrote ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
