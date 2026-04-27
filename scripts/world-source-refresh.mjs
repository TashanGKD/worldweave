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

function parseArgs(argv) {
  const args = {
    loop: false,
    intervalMinutes: Number(process.env.WORLD_SOURCE_REFRESH_INTERVAL_MINUTES || 30),
    timeoutMinutes: Number(process.env.WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES || 20),
    skipWorldWarm: false,
    includeHeavyWorldSync: process.env.WORLD_SOURCE_REFRESH_INCLUDE_HEAVY_SYNC === '1',
    worldBaseUrl: (process.env.WORLD_BATCH_REFRESH_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, ''),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--loop') args.loop = true;
    if (arg === '--skip-world-warm') args.skipWorldWarm = true;
    if (arg === '--include-heavy-world-sync') args.includeHeavyWorldSync = true;
    if (arg === '--interval-minutes') args.intervalMinutes = Number(argv[++index] || args.intervalMinutes);
    if (arg === '--timeout-minutes') args.timeoutMinutes = Number(argv[++index] || args.timeoutMinutes);
    if (arg === '--world-base-url') args.worldBaseUrl = String(argv[++index] || args.worldBaseUrl).replace(/\/+$/, '');
  }
  return args;
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
        method: 'GET',
        pathname: '/api/v1/world/state?scene=global&batch=1',
        timeoutMs: 45000,
        critical: false,
        batchHeader: true,
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
      reason: remediation.shrink_guard ? 'shrunken-refresh-or-runtime-failure' : 'runtime-failure',
    });
    remediation.ok = remediation.ok && syncResult.ok;
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
  return remediation;
}

async function runOnce(args) {
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
    outputs: collectOutputs(reportDate),
  };
  writeStatus(baseStatus);
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
  writeStatus(status);
  append(outPath, `\n[${finishedAt}] source refresh finish ok=${status.ok} exit=${exitCode} timed_out=${timedOut}\n`);
  return status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  do {
    try {
      await runOnce(args);
    } catch (error) {
      const failedAt = nowIso();
      const message = error instanceof Error ? error.stack || error.message : String(error);
      append(errPath, `\n[${failedAt}] source refresh iteration failed: ${message}\n`);
      writeStatus({
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
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, args.intervalMinutes) * 60 * 1000));
  } while (true);
}

main().catch((error) => {
  append(errPath, `\n[${nowIso()}] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  writeStatus({
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
