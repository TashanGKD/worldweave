import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const cacheDir = path.join(root, '.cache');
const validationDir = path.join(root, 'research', 'source-skill-validation');
const directoryCandidateScript = path.join(root, 'scripts', 'extract-source-directory-candidates.mjs');

fs.mkdirSync(cacheDir, { recursive: true });

const statusPath = path.join(cacheDir, 'world-source-refresh-status.json');
const outPath = path.join(cacheDir, 'world-source-refresh.out.log');
const errPath = path.join(cacheDir, 'world-source-refresh.err.log');
const apiSnapshotPath = path.join(cacheDir, 'world-api-snapshots.json');
const API_SNAPSHOT_VERSION = 1;
const SOURCE_LATEST_SIGNAL_STALE_HOURS = Number(process.env.WORLD_SOURCE_LATEST_SIGNAL_STALE_HOURS || 48);

function parseArgs(argv) {
  const args = {
    loop: false,
    intervalMinutes: Number(process.env.WORLD_SOURCE_REFRESH_INTERVAL_MINUTES || 30),
    timeoutMinutes: Number(process.env.WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES || 20),
    dailySlots: process.env.WORLD_SOURCE_REFRESH_DAILY_SLOTS || '',
    timeZone: process.env.WORLD_SOURCE_REFRESH_TIME_ZONE || 'Asia/Shanghai',
    skipWorldWarm: false,
    includeHeavyWorldSync: process.env.WORLD_SOURCE_REFRESH_INCLUDE_HEAVY_SYNC === '1',
    worldBaseUrl: (process.env.WORLD_BATCH_REFRESH_BASE_URL || '').replace(/\/+$/, ''),
    worldBaseUrlExplicit: Boolean(process.env.WORLD_BATCH_REFRESH_BASE_URL),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--loop') args.loop = true;
    if (arg === '--skip-world-warm') args.skipWorldWarm = true;
    if (arg === '--include-heavy-world-sync') args.includeHeavyWorldSync = true;
    if (arg === '--interval-minutes') args.intervalMinutes = Number(argv[++index] || args.intervalMinutes);
    if (arg === '--timeout-minutes') args.timeoutMinutes = Number(argv[++index] || args.timeoutMinutes);
    if (arg === '--daily-slots') args.dailySlots = String(argv[++index] || args.dailySlots);
    if (arg === '--time-zone') args.timeZone = String(argv[++index] || args.timeZone);
    if (arg === '--world-base-url') {
      args.worldBaseUrl = String(argv[++index] || args.worldBaseUrl).replace(/\/+$/, '');
      args.worldBaseUrlExplicit = true;
    }
  }
  return args;
}

function parseDailySlots(value) {
  return String(value || '')
    .split(',')
    .map((slot) => slot.trim())
    .map((slot) => {
      const match = slot.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      return hour * 60 + minute;
    })
    .filter((slot) => slot !== null)
    .sort((left, right) => left - right);
}

function zonedClockParts(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function msUntilNextDailySlot(slots, timeZone) {
  const now = zonedClockParts(timeZone);
  const currentMinute = now.hour * 60 + now.minute;
  const nextSlot = slots.find((slot) => slot > currentMinute) ?? slots[0] + 24 * 60;
  const minuteDelta = nextSlot - currentMinute;
  return Math.max(1000, minuteDelta * 60 * 1000 - now.second * 1000);
}

function nowIso() {
  return new Date().toISOString();
}

function append(filePath, text) {
  fs.appendFileSync(filePath, text, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function newestMatchingFile(pattern) {
  const entries = fs.existsSync(validationDir) ? fs.readdirSync(validationDir, { withFileTypes: true }) : [];
  let newest = null;
  for (const entry of entries) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    const filePath = path.join(validationDir, entry.name);
    const stat = fs.statSync(filePath);
    if (!newest || stat.mtimeMs > newest.mtimeMs) {
      newest = { name: entry.name, path: filePath, mtime: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
    }
  }
  return newest;
}

function collectOutputs(reportDate) {
  const directoryCandidatesFile = path.join(validationDir, `directory-candidates-${reportDate}.json`);
  const coverageFile = newestMatchingFile(/^probe-\d{4}-\d{2}-\d{2}-source-coverage\.json$/);
  const connectivityFile = newestMatchingFile(/^probe-\d{4}-\d{2}-\d{2}-source-connectivity\.json$/);
  const hubHealthFile = newestMatchingFile(/^probe-\d{4}-\d{2}-\d{2}-hub-index-health\.json$/);
  const mountedScanFile = newestMatchingFile(/^probe-\d{4}-\d{2}-\d{2}-hub-mounted-scan\.json$/);
  const coverage = coverageFile ? readJson(coverageFile.path) : null;
  const connectivity = connectivityFile ? readJson(connectivityFile.path) : null;
  const hubHealth = hubHealthFile ? readJson(hubHealthFile.path) : null;

  return {
    directory_candidates: fs.existsSync(directoryCandidatesFile) ? directoryCandidatesFile : null,
    coverage_file: coverageFile,
    connectivity_file: connectivityFile,
    hub_health_file: hubHealthFile,
    mounted_scan_file: mountedScanFile,
    coverage: coverage
      ? {
          completion_stage: coverage.completion_stage,
          high_value_total: coverage.high_value_total,
          endpoint_covered: coverage.endpoint_covered,
          site_covered: coverage.site_covered,
          uncovered: coverage.uncovered,
        }
      : null,
    connectivity_counts: connectivity?.summary || null,
    hub_health: hubHealth
      ? {
          total_urls: hubHealth.total_urls,
          ok_count: hubHealth.ok_count,
          error_count: hubHealth.error_count,
        }
      : null,
  };
}

function refreshDirectoryCandidates(reportDate) {
  if (!fs.existsSync(directoryCandidateScript)) return null;
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [directoryCandidateScript, '--report-date', reportDate], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  if (result.stdout) append(outPath, result.stdout);
  if (result.stderr) append(errPath, result.stderr);
  return {
    ok: result.status === 0,
    exit_code: result.status,
    duration_ms: Date.now() - startedAt,
    output: path.join(validationDir, `directory-candidates-${reportDate}.json`),
  };
}

function writeStatus(status) {
  fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

let refreshDbPool = null;
let refreshDbSchemaReady = null;

async function getRefreshDbPool() {
  const connectionString = process.env.WORLDWEAVE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!refreshDbPool) {
    const { Pool } = await import('pg');
    refreshDbPool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 30_000,
    });
  }
  return refreshDbPool;
}

async function ensureRefreshRunSchema(pool) {
  if (!refreshDbSchemaReady) {
    refreshDbSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS world_source_refresh_runs (
          started_at TIMESTAMPTZ PRIMARY KEY,
          finished_at TIMESTAMPTZ NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ok BOOLEAN NOT NULL DEFAULT FALSE,
          running BOOLEAN NOT NULL DEFAULT FALSE,
          timed_out BOOLEAN NOT NULL DEFAULT FALSE,
          exit_code INTEGER NULL,
          duration_ms INTEGER NULL,
          report_date TEXT NULL,
          world_base_url TEXT NULL,
          latest_signal_published_at TIMESTAMPTZ NULL,
          latest_signal_age_hours DOUBLE PRECISION NULL,
          freshness_status TEXT NULL,
          payload JSONB NOT NULL
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS world_source_refresh_runs_finished_idx
          ON world_source_refresh_runs (finished_at DESC NULLS LAST)
      `);
    })().catch((error) => {
      refreshDbSchemaReady = null;
      throw error;
    });
  }
  await refreshDbSchemaReady;
}

async function persistRefreshRunStatus(status) {
  const pool = await getRefreshDbPool();
  if (!pool) return;
  try {
    await ensureRefreshRunSchema(pool);
    const freshness =
      status.self_healing?.source_freshness ||
      status.world_cache_refresh?.endpoints?.find((endpoint) => endpoint.snapshot_key === 'source_status')?.snapshot_summary ||
      null;
    await pool.query(
      `
        INSERT INTO world_source_refresh_runs (
          started_at,
          finished_at,
          ok,
          running,
          timed_out,
          exit_code,
          duration_ms,
          report_date,
          world_base_url,
          latest_signal_published_at,
          latest_signal_age_hours,
          freshness_status,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        ON CONFLICT (started_at) DO UPDATE SET
          finished_at = EXCLUDED.finished_at,
          recorded_at = NOW(),
          ok = EXCLUDED.ok,
          running = EXCLUDED.running,
          timed_out = EXCLUDED.timed_out,
          exit_code = EXCLUDED.exit_code,
          duration_ms = EXCLUDED.duration_ms,
          report_date = EXCLUDED.report_date,
          world_base_url = EXCLUDED.world_base_url,
          latest_signal_published_at = EXCLUDED.latest_signal_published_at,
          latest_signal_age_hours = EXCLUDED.latest_signal_age_hours,
          freshness_status = EXCLUDED.freshness_status,
          payload = EXCLUDED.payload
      `,
      [
        status.started_at || nowIso(),
        status.finished_at || null,
        Boolean(status.ok),
        Boolean(status.running),
        Boolean(status.timed_out),
        Number.isInteger(status.exit_code) ? status.exit_code : null,
        Number.isFinite(status.duration_ms) ? status.duration_ms : null,
        status.report_date || null,
        status.world_cache_refresh?.base_url || null,
        freshness?.latest_signal_published_at || null,
        Number.isFinite(freshness?.latest_signal_age_hours) ? freshness.latest_signal_age_hours : null,
        freshness?.freshness_status || null,
        JSON.stringify(status),
      ],
    );
  } catch (error) {
    append(errPath, `\n[${nowIso()}] source refresh db status write failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function writeStatusWithMonitor(status) {
  writeStatus(status);
  await persistRefreshRunStatus(status);
}

function writeApiSnapshot(scene, key, data) {
  const now = nowIso();
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(apiSnapshotPath, 'utf8'));
  } catch {
    payload = null;
  }
  if (!payload || payload.version !== API_SNAPSHOT_VERSION || typeof payload !== 'object') {
    payload = { version: API_SNAPSHOT_VERSION, saved_at: now, scenes: {} };
  }
  if (!payload.scenes || typeof payload.scenes !== 'object') payload.scenes = {};
  if (!payload.scenes[scene] || typeof payload.scenes[scene] !== 'object') payload.scenes[scene] = {};
  payload.saved_at = now;
  payload.scenes[scene][key] = {
    saved_at: now,
    data,
  };
  fs.writeFileSync(apiSnapshotPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function callWorldEndpoint(baseUrl, method, pathname, timeoutMs = 120000, snapshot, batchHeader = false) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(batchHeader ? { 'x-world-batch-refresh': '1' } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let snapshotWritten = false;
    if (snapshot && response.ok) {
      try {
        const data = await response.json();
        writeApiSnapshot(snapshot.scene || 'global', snapshot.key, data);
        snapshotWritten = true;
      } catch (error) {
        append(
          errPath,
          `[${nowIso()}] failed to write api snapshot ${snapshot.key}: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      }
    } else {
      await response.arrayBuffer().catch(() => null);
    }
    return {
      path: pathname,
      method,
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      snapshot_key: snapshot?.key || null,
      snapshot_written: snapshotWritten,
    };
  } catch (error) {
    return {
      path: pathname,
      method,
      ok: false,
      status: null,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWorldJson(baseUrl, pathname, timeoutMs = 45000, batchHeader = false) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: {
        Accept: 'application/json',
        ...(batchHeader ? { 'x-world-batch-refresh': '1' } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      duration_ms: Date.now() - startedAt,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeWorldBaseUrl(baseUrl) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/world/livebench/questions?scene=global&limit=1`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    await response.arrayBuffer().catch(() => null);
    return {
      base_url: baseUrl,
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      base_url: baseUrl,
      ok: false,
      status: null,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveWorldBaseUrl(args) {
  if (args.skipWorldWarm) return args;
  const configured = args.worldBaseUrl;
  if (configured) {
    const probe = await probeWorldBaseUrl(configured);
    if (probe.ok || args.worldBaseUrlExplicit) {
      return { ...args, worldBaseUrl: configured, worldBaseUrlProbe: probe };
    }
  }

  const workerPort = process.env.WORLD_SOURCE_REFRESH_WORKER_PORT || '5020';
  const candidates = [
    process.env.WORLD_SOURCE_REFRESH_WORKER_BASE_URL,
    `http://127.0.0.1:${workerPort}`,
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5010',
    'http://127.0.0.1:3000',
  ]
    .filter(Boolean)
    .map((value) => String(value).replace(/\/+$/, ''));
  const uniqueCandidates = [...new Set(candidates)];
  const probes = [];
  for (const candidate of uniqueCandidates) {
    if (candidate === configured) continue;
    const probe = await probeWorldBaseUrl(candidate);
    probes.push(probe);
    if (probe.ok) {
      append(outPath, `[${nowIso()}] selected world refresh base ${candidate}\n`);
      return { ...args, worldBaseUrl: candidate, worldBaseUrlProbe: probe, worldBaseUrlCandidates: probes };
    }
  }

  return {
    ...args,
    worldBaseUrl: configured || uniqueCandidates[0] || 'http://127.0.0.1:5020',
    worldBaseUrlProbe: probes[0] || null,
    worldBaseUrlCandidates: probes,
  };
}

function summarizeSourceFreshness(payload) {
  const health = payload?.source_health && typeof payload.source_health === 'object' ? payload.source_health : {};
  const latestSignalPublishedAt =
    typeof payload?.latest_signal_published_at === 'string' ? payload.latest_signal_published_at : null;
  let latestSignalAgeHours =
    typeof health.latest_signal_age_hours === 'number' ? health.latest_signal_age_hours : null;
  if (latestSignalAgeHours === null && latestSignalPublishedAt) {
    const age = (Date.now() - Date.parse(latestSignalPublishedAt)) / 36e5;
    latestSignalAgeHours = Number.isFinite(age) ? Number(age.toFixed(2)) : null;
  }
  const freshnessStatus =
    typeof health.freshness_status === 'string'
      ? health.freshness_status
      : latestSignalAgeHours === null
        ? 'unknown'
        : latestSignalAgeHours > SOURCE_LATEST_SIGNAL_STALE_HOURS
          ? 'stale'
          : 'fresh';
  return {
    latest_signal_published_at: latestSignalPublishedAt,
    latest_signal_age_hours: latestSignalAgeHours,
    freshness_status: freshnessStatus,
    stale:
      freshnessStatus === 'stale' ||
      (typeof latestSignalAgeHours === 'number' && latestSignalAgeHours > SOURCE_LATEST_SIGNAL_STALE_HOURS),
  };
}

async function warmWorldCaches(args) {
  if (args.skipWorldWarm) {
    return { skipped: true, reason: 'skip-world-warm' };
  }
  const endpoints = [];
  if (args.includeHeavyWorldSync) {
    endpoints.push(
      {
        method: 'POST',
        pathname: '/api/v1/world/livebench/sync?scene=global&batch=1',
        timeoutMs: 120000,
        critical: false,
        batchHeader: true,
      },
      {
        method: 'POST',
        pathname: '/api/v1/world/source-knowledge/sync?scene=global&batch=1',
        timeoutMs: 90000,
        critical: false,
        batchHeader: true,
      },
      {
        method: 'POST',
        pathname: '/api/v1/world/source-knowledge/sync?scene=tech-ai&batch=1',
        timeoutMs: 90000,
        critical: false,
        batchHeader: true,
      },
      {
        method: 'GET',
        pathname: '/api/v1/world/state?scene=tech-ai&fresh=1',
        timeoutMs: 30000,
        critical: false,
        batchHeader: false,
      },
    );
  }
  const snapshotBatchHeader = args.includeHeavyWorldSync;
  endpoints.push(
    {
      method: 'GET',
      pathname: '/api/v1/world/livebench/questions?scene=global&limit=500',
      timeoutMs: 15000,
      critical: true,
      batchHeader: snapshotBatchHeader,
      snapshot: { scene: 'global', key: 'livebench_questions' },
    },
    {
      method: 'GET',
      pathname: '/api/v1/world/livebench/evaluation?scene=global',
      timeoutMs: 15000,
      critical: true,
      batchHeader: snapshotBatchHeader,
      snapshot: { scene: 'global', key: 'livebench_evaluation' },
    },
    {
      method: 'GET',
      pathname: '/api/v1/world/source-knowledge/status?scene=global',
      timeoutMs: 15000,
      critical: false,
      batchHeader: snapshotBatchHeader,
      snapshot: { scene: 'global', key: 'source_status' },
    },
    {
      method: 'GET',
      pathname: '/api/v1/world/source-knowledge/status?scene=tech-ai',
      timeoutMs: 15000,
      critical: false,
      batchHeader: snapshotBatchHeader,
      snapshot: { scene: 'tech-ai', key: 'source_status' },
    },
  );
  const results = [];
  for (const endpoint of endpoints) {
    const result = await callWorldEndpoint(
      args.worldBaseUrl,
      endpoint.method,
      endpoint.pathname,
      endpoint.timeoutMs,
      endpoint.snapshot,
      Boolean(endpoint.batchHeader),
    );
    results.push({
      ...result,
      critical: endpoint.critical,
    });
    append(
      outPath,
      `[${nowIso()}] world warm ${endpoint.method} ${endpoint.pathname} status=${result.status ?? 'ERR'} duration=${
        result.duration_ms
      }ms snapshot=${result.snapshot_written ? result.snapshot_key : '-'}\n`,
    );
  }
  return {
    skipped: false,
    base_url: args.worldBaseUrl,
    ok: results.filter((item) => item.critical).every((item) => item.ok),
    degraded: results.some((item) => !item.ok),
    endpoints: results,
  };
}

function parseLatestSignalShrink() {
  try {
    const text = fs.readFileSync(outPath, 'utf8').split(/\r?\n/).slice(-240).join('\n');
    const match = text.match(/Refusing to replace a fuller cached signal set \((\d+)\) with a shrunken refresh \((\d+)\)/g);
    if (!match || match.length === 0) return null;
    const latest = match[match.length - 1].match(/\((\d+)\) with a shrunken refresh \((\d+)\)/);
    if (!latest) return null;
    return {
      previous_count: Number(latest[1]),
      attempted_count: Number(latest[2]),
      detected_at: nowIso(),
    };
  } catch {
    return null;
  }
}

function classifyRuntimeFailures(governance) {
  const failures = Array.isArray(governance?.recent_runtime_failures) ? governance.recent_runtime_failures : [];
  const byKind = {
    rss: [],
    price: [],
    public_api: [],
    ai_release: [],
    other: [],
  };
  for (const failure of failures) {
    const key = String(failure.key || failure.label || '').toLowerCase();
    if (/rss|guardian|npr|aljazeera|inkwell/.test(key)) byKind.rss.push(failure);
    else if (/alpha|eastmoney|treasury|market-price|yahoo|stock|price/.test(key)) byKind.price.push(failure);
    else if (/openfda|fda|public-anchor/.test(key)) byKind.public_api.push(failure);
    else if (/ai-release|openai|anthropic|claude|github/.test(key)) byKind.ai_release.push(failure);
    else byKind.other.push(failure);
  }
  return byKind;
}

async function runSourceRefreshRemediation(args, warmStatus) {
  const remediation = {
    checked_at: nowIso(),
    ok: true,
    actions: [],
    shrink_guard: parseLatestSignalShrink(),
    runtime_failure_count: 0,
    failure_groups: null,
    source_freshness: null,
    notes: [],
  };
  let governance = null;
  let status = null;
  try {
    governance = await callWorldEndpoint(
      args.worldBaseUrl,
      'GET',
      '/api/v1/world/source-knowledge/governance',
      45000,
      null,
      true,
    );
    status = await callWorldEndpoint(
      args.worldBaseUrl,
      'GET',
      '/api/v1/world/source-knowledge/status?scene=global',
      15000,
      { scene: 'global', key: 'source_status_after_remediation_check' },
      false,
    );
    remediation.actions.push({ action: 'governance-check', ok: governance.ok, status: governance.status });
    remediation.actions.push({ action: 'source-status-check', ok: status.ok, status: status.status });
  } catch (error) {
    remediation.ok = false;
    remediation.notes.push(`governance check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  let governancePayload = null;
  try {
    const response = await fetch(`${args.worldBaseUrl}/api/v1/world/source-knowledge/governance`, {
      headers: { Accept: 'application/json', 'x-world-batch-refresh': '1' },
      signal: AbortSignal.timeout(45000),
    });
    governancePayload = response.ok ? await response.json() : null;
  } catch {
    governancePayload = null;
  }
  remediation.runtime_failure_count = Number(governancePayload?.runtime_failure_count || 0);
  remediation.failure_groups = classifyRuntimeFailures(governancePayload);

  const sourceStatusPayload = await fetchWorldJson(
    args.worldBaseUrl,
    '/api/v1/world/source-knowledge/status?scene=global&fresh=1',
    45000,
    true,
  );
  const sourceFreshnessCheckFailed = !sourceStatusPayload.ok || !sourceStatusPayload.data;
  if (!sourceFreshnessCheckFailed) {
    remediation.source_freshness = summarizeSourceFreshness(sourceStatusPayload.data);
    remediation.actions.push({
      action: 'source-freshness-check',
      ok: !remediation.source_freshness.stale,
      status: sourceStatusPayload.status,
      latest_signal_age_hours: remediation.source_freshness.latest_signal_age_hours,
      freshness_status: remediation.source_freshness.freshness_status,
    });
  } else {
    remediation.actions.push({
      action: 'source-freshness-check',
      ok: false,
      status: sourceStatusPayload.status,
      error: sourceStatusPayload.error || 'source status payload unavailable',
    });
  }

  const sourceStatusBusy =
    status &&
    !status.ok &&
    (status.status === 503 ||
      status.error === 'The operation was aborted due to timeout' ||
      String(status.error || '').toLowerCase().includes('timeout'));
  if (sourceStatusBusy) {
    remediation.actions.push({
      action: 'defer-source-knowledge-sync',
      ok: true,
      status: status.status,
      reason: 'source-status-busy',
    });
    remediation.notes.push('信源刷新仍在运行或接口繁忙，本轮只记录问题并延后补跑，避免叠加刷新任务。');
  }

  const needsSync =
    !sourceStatusBusy &&
    (remediation.runtime_failure_count > 0 ||
      Boolean(remediation.shrink_guard) ||
      sourceFreshnessCheckFailed ||
      Boolean(remediation.source_freshness?.stale) ||
      warmStatus?.ok === false);
  if (needsSync) {
    const syncResult = await callWorldEndpoint(
      args.worldBaseUrl,
      'POST',
      '/api/v1/world/source-knowledge/sync?scene=global&batch=1',
      120000,
      { scene: 'global', key: 'source_sync_after_remediation' },
      true,
    );
    remediation.actions.push({
      action: 'source-knowledge-sync',
      ok: syncResult.ok,
      status: syncResult.status,
      duration_ms: syncResult.duration_ms,
      reason: remediation.source_freshness?.stale
        ? 'stale-latest-signal'
        : sourceFreshnessCheckFailed
          ? 'source-freshness-unavailable'
        : remediation.shrink_guard
          ? 'shrunken-refresh-or-runtime-failure'
          : 'runtime-failure',
    });
    remediation.ok = remediation.ok && syncResult.ok;
    if (syncResult.ok) {
      const afterSyncStatus = await fetchWorldJson(
        args.worldBaseUrl,
        '/api/v1/world/source-knowledge/status?scene=global&fresh=1',
        45000,
        true,
      );
      const afterFreshness = afterSyncStatus.ok && afterSyncStatus.data ? summarizeSourceFreshness(afterSyncStatus.data) : null;
      remediation.actions.push({
        action: 'source-freshness-after-sync',
        ok: afterFreshness ? !afterFreshness.stale : false,
        status: afterSyncStatus.status,
        latest_signal_age_hours: afterFreshness?.latest_signal_age_hours ?? null,
        freshness_status: afterFreshness?.freshness_status || 'unknown',
      });
      remediation.source_freshness = afterFreshness || remediation.source_freshness;
    }
  }

  if (remediation.failure_groups?.price?.length) {
    remediation.notes.push('价格类失败源保留旧缓存并等待通用信源池下轮重试；需要历史行情时由题目回放链路按时间点补取。');
  }
  if (remediation.failure_groups?.ai_release?.length) {
    remediation.notes.push('AI 发布类失败源保留旧缓存并等待通用信源池下轮重试；不再额外挂硬编码厂商监控。');
  }
  if (remediation.failure_groups?.rss?.length) {
    remediation.notes.push('RSS 失败源保留旧缓存并等待下轮重试，BBC / Inkwell / World Monitor 继续补位。');
  }
  if (remediation.shrink_guard) {
    remediation.notes.push(
      `检测到缩水刷新 ${remediation.shrink_guard.previous_count} -> ${remediation.shrink_guard.attempted_count}，已保留旧缓存${sourceStatusBusy ? '，等待下轮补跑' : '并触发补跑'}。`,
    );
  }
  if (remediation.source_freshness?.stale) {
    remediation.ok = false;
    remediation.notes.push(
      `最新 signal 已经 ${remediation.source_freshness.latest_signal_age_hours ?? 'unknown'} 小时未更新；daemon 已触发补跑，但仍需检查信源生成链路和运行时密钥。`,
    );
  }
  return remediation;
}

async function runOnce(args) {
  args = await resolveWorldBaseUrl(args);
  const startedAt = nowIso();
  const reportDate = startedAt.slice(0, 10);
  const baseStatus = {
    kind: 'world-source-refresh',
    started_at: startedAt,
    finished_at: null,
    ok: false,
    running: true,
    timed_out: false,
    exit_code: null,
    duration_ms: null,
    report_date: reportDate,
    command: ['node', 'scripts/world-source-refresh.mjs'],
    world_base_url: args.worldBaseUrl,
    world_base_url_probe: args.worldBaseUrlProbe || null,
    outputs: collectOutputs(reportDate),
  };
  await writeStatusWithMonitor(baseStatus);
  append(outPath, `\n[${startedAt}] WorldWeave runtime refresh start\n`);

  let exitCode = 0;
  let timedOut = false;

  const sourceFinishedAt = nowIso();
  const directoryCandidateRefresh = refreshDirectoryCandidates(reportDate);
  const status = {
    ...baseStatus,
    source_finished_at: sourceFinishedAt,
    finished_at: sourceFinishedAt,
    ok: exitCode === 0 && !timedOut,
    running: false,
    timed_out: timedOut,
    exit_code: exitCode,
    duration_ms: new Date(sourceFinishedAt).getTime() - new Date(startedAt).getTime(),
    outputs: collectOutputs(reportDate),
    directory_candidate_refresh: directoryCandidateRefresh,
  };
  status.world_cache_refresh = await warmWorldCaches(args);
  status.self_healing = await runSourceRefreshRemediation(args, status.world_cache_refresh);
  const finishedAt = nowIso();
  status.finished_at = finishedAt;
  status.duration_ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  status.ok = status.ok && (status.world_cache_refresh.skipped || status.world_cache_refresh.ok !== false);
  status.ok = status.ok && status.self_healing.ok !== false;
  await writeStatusWithMonitor(status);
  append(outPath, `\n[${finishedAt}] source refresh finish ok=${status.ok} exit=${exitCode} timed_out=${timedOut}\n`);
  return status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dailySlots = parseDailySlots(args.dailySlots);

  do {
    try {
      await runOnce(args);
    } catch (error) {
      const failedAt = nowIso();
      const message = error instanceof Error ? error.stack || error.message : String(error);
      append(errPath, `\n[${failedAt}] source refresh iteration failed: ${message}\n`);
      await writeStatusWithMonitor({
        kind: 'world-source-refresh',
        started_at: failedAt,
        finished_at: failedAt,
        ok: false,
        running: false,
        loop_will_continue: Boolean(args.loop),
        error: error instanceof Error ? error.message : String(error),
        outputs: collectOutputs(failedAt.slice(0, 10)),
      });
      if (!args.loop) throw error;
    }
    if (!args.loop) break;
    const waitMs = dailySlots.length > 0
      ? msUntilNextDailySlot(dailySlots, args.timeZone)
      : Math.max(1, args.intervalMinutes) * 60 * 1000;
    append(
      outPath,
      `[${nowIso()}] next refresh in ${Math.round(waitMs / 60000)} minutes${
        dailySlots.length > 0 ? ` slots=${args.dailySlots} tz=${args.timeZone}` : ` interval=${args.intervalMinutes}`
      }\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  } while (true);
}

main().catch(async (error) => {
  append(errPath, `\n[${nowIso()}] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  await writeStatusWithMonitor({
    kind: 'world-source-refresh',
    started_at: nowIso(),
    finished_at: nowIso(),
    ok: false,
    running: false,
    error: error instanceof Error ? error.message : String(error),
    outputs: collectOutputs(nowIso().slice(0, 10)),
  });
  process.exit(1);
});
