import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import {
  combineAbortSignals,
  createAbortError,
  delayWithSignal,
  isAbortError,
  terminateProcessTree,
} from './world-refresh-control.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const cacheDir = path.join(root, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
dotenv.config({ path: path.join(root, '.env.local') });

const pidPath = path.join(cacheDir, 'world-source-refresh-current.pid');
const workerPidPath = path.join(cacheDir, 'world-source-refresh-worker.pid');
const statusPath = path.join(cacheDir, 'world-source-refresh-status.json');
const outPath = path.join(cacheDir, 'world-source-refresh-daemon.out.log');
const errPath = path.join(cacheDir, 'world-source-refresh-daemon.err.log');
const workerOutPath = path.join(cacheDir, 'world-source-refresh-worker.out.log');
const workerErrPath = path.join(cacheDir, 'world-source-refresh-worker.err.log');

function append(filePath, value) {
  fs.appendFileSync(filePath, value, 'utf8');
}

function openLog(filePath) {
  return fs.openSync(filePath, 'a');
}

function removePidFileIfMatches(filePath, pid) {
  try {
    if (fs.readFileSync(filePath, 'utf8').trim() === String(pid)) fs.rmSync(filePath, { force: true });
  } catch {
    // The pid file may already have been replaced or removed.
  }
}

const intervalMinutes = process.env.WORLD_SOURCE_REFRESH_INTERVAL_MINUTES || '480';
const dailySlots = process.env.WORLD_SOURCE_REFRESH_DAILY_SLOTS || '08:00,12:00,20:00';
const refreshTimeZone = process.env.WORLD_SOURCE_REFRESH_TIME_ZONE || 'Asia/Shanghai';
const timeoutMinutes = process.env.WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES || '20';
const manageWorker = process.env.WORLD_SOURCE_REFRESH_MANAGE_WORKER !== '0';
const workerPort = process.env.WORLD_SOURCE_REFRESH_WORKER_PORT || '5020';
const workerHost = process.env.WORLD_SOURCE_REFRESH_WORKER_HOST || '127.0.0.1';
const workerBaseUrl = `http://${workerHost}:${workerPort}`;
const configuredBaseUrl = (process.env.WORLD_BATCH_REFRESH_BASE_URL || '').replace(/\/+$/, '');
const refreshBaseUrl = configuredBaseUrl || (manageWorker ? workerBaseUrl : 'http://127.0.0.1:5000');
const workerReadyTimeoutMs = Math.max(5_000, Number(process.env.WORLD_SOURCE_REFRESH_WORKER_READY_TIMEOUT_MS || 30_000));
const workerReadyPollMs = Math.max(100, Number(process.env.WORLD_SOURCE_REFRESH_WORKER_READY_POLL_MS || 500));
const restartDelayMs = Math.max(1_000, Number(process.env.WORLD_SOURCE_REFRESH_RESTART_DELAY_MS || 5_000));
const stopGraceMs = Math.max(3_000, Number(process.env.WORLD_SOURCE_REFRESH_STOP_GRACE_MS || 15_000));
const workerHealthIntervalMs = Math.max(5_000, Number(process.env.WORLD_SOURCE_REFRESH_WORKER_HEALTH_INTERVAL_MS || 15_000));
const workerHealthFailureThreshold = Math.max(1, Number(process.env.WORLD_SOURCE_REFRESH_WORKER_HEALTH_FAILURE_THRESHOLD || 2));
const includeHeavyWorldSync = process.env.WORLD_SOURCE_REFRESH_INCLUDE_HEAVY_SYNC !== '0';

const out = openLog(outPath);
const err = openLog(errPath);
const lifecycleController = new AbortController();

function withNodeOption(baseValue, option) {
  if (baseValue?.includes(option.split('=')[0])) return baseValue;
  return [baseValue, option].filter(Boolean).join(' ');
}

let stopping = false;
let worker = null;
let child = null;
let finishMain = null;
let shutdownPromise = null;
let workerHealthTimer = null;
let workerHealthChecking = false;
let workerHealthFailures = 0;

function scheduleRestart(callback) {
  setTimeout(() => {
    if (!stopping) callback();
  }, restartDelayMs).unref?.();
}

function startWorker() {
  if (!manageWorker || configuredBaseUrl || stopping || worker) return worker;
  const workerOut = openLog(workerOutPath);
  const workerErr = openLog(workerErrPath);
  const workerRef = spawn(process.execPath, [path.join(root, 'scripts', 'world-start.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      HOST: workerHost,
      PORT: workerPort,
      WORLD_HOST: workerHost,
      DEPLOY_RUN_PORT: workerPort,
      WORLD_START_PID_PREFIX: 'world-source-refresh-worker',
      WORLD_WEB_ENABLE_HEAVY_REFRESH: '1',
      NODE_OPTIONS: withNodeOption(process.env.NODE_OPTIONS, '--max-old-space-size=3072'),
    },
    stdio: ['ignore', workerOut, workerErr],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  worker = workerRef;
  const startedWorkerPid = workerRef.pid;
  fs.writeFileSync(workerPidPath, `${startedWorkerPid}\n`, 'utf8');
  append(outPath, `\n[${new Date().toISOString()}] source refresh worker started pid=${startedWorkerPid} base=${workerBaseUrl} port=${workerPort}\n`);
  workerRef.on('exit', (code, signal) => {
    append(outPath, `[${new Date().toISOString()}] source refresh worker exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    if (worker === workerRef) worker = null;
    removePidFileIfMatches(workerPidPath, startedWorkerPid);
    void terminateProcessTree(startedWorkerPid, {
      detached: process.platform !== 'win32',
      graceMs: Math.min(stopGraceMs, 5_000),
    }).finally(() => {
      if (!stopping) scheduleRestart(startWorker);
    });
  });
  return worker;
}

async function probeWorkerReady() {
  try {
    const response = await fetch(`${workerBaseUrl}/api/v1/openclaw/skill.md`, {
      signal: combineAbortSignals([lifecycleController.signal, AbortSignal.timeout(2_000)]),
    });
    await response.arrayBuffer().catch(() => null);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForWorkerReady() {
  if (!manageWorker || configuredBaseUrl) return true;
  const startedAt = Date.now();
  append(outPath, `[${new Date().toISOString()}] waiting for source refresh worker readiness timeout=${workerReadyTimeoutMs}ms\n`);
  while (!stopping && Date.now() - startedAt < workerReadyTimeoutMs) {
    if (await probeWorkerReady()) {
      append(outPath, `[${new Date().toISOString()}] source refresh worker ready after ${Date.now() - startedAt}ms\n`);
      return true;
    }
    await delayWithSignal(workerReadyPollMs, lifecycleController.signal);
  }
  return false;
}

function refreshRunIsActive() {
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (!status.running && !['queued', 'running'].includes(status.state)) return false;
    const heartbeatAt = new Date(status.heartbeat_at || status.started_at || 0).getTime();
    return Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt < 60_000;
  } catch {
    return false;
  }
}

async function checkWorkerHealth() {
  if (stopping || workerHealthChecking || !worker) return;
  if (refreshRunIsActive()) {
    workerHealthFailures = 0;
    return;
  }
  workerHealthChecking = true;
  try {
    if (await probeWorkerReady()) {
      workerHealthFailures = 0;
      return;
    }
    workerHealthFailures += 1;
    append(
      errPath,
      `[${new Date().toISOString()}] source refresh worker health probe failed count=${workerHealthFailures}/${workerHealthFailureThreshold} pid=${worker.pid}\n`,
    );
    if (workerHealthFailures < workerHealthFailureThreshold) return;
    const unhealthyPid = worker.pid;
    workerHealthFailures = 0;
    append(outPath, `[${new Date().toISOString()}] recycling unresponsive source refresh worker pid=${unhealthyPid}\n`);
    await terminateProcessTree(unhealthyPid, {
      detached: process.platform !== 'win32',
      graceMs: stopGraceMs,
    });
  } finally {
    workerHealthChecking = false;
  }
}

function startWorkerHealthMonitor() {
  if (workerHealthTimer || !manageWorker || configuredBaseUrl) return;
  workerHealthTimer = setInterval(() => void checkWorkerHealth(), workerHealthIntervalMs);
  workerHealthTimer.unref?.();
}

function startRefreshLoop() {
  if (stopping || child) return child;
  const refreshArgs = [
    path.join(root, 'scripts', 'world-source-refresh.mjs'),
    '--loop',
    '--interval-minutes',
    intervalMinutes,
    '--daily-slots',
    dailySlots,
    '--time-zone',
    refreshTimeZone,
    '--timeout-minutes',
    timeoutMinutes,
    '--world-base-url',
    refreshBaseUrl,
  ];
  if (includeHeavyWorldSync) refreshArgs.push('--include-heavy-world-sync');
  child = spawn(process.execPath, refreshArgs, {
    cwd: root,
    env: {
      ...process.env,
      WORLD_BATCH_REFRESH_BASE_URL: refreshBaseUrl,
      WORLD_SOURCE_REFRESH_TRIGGER: 'daemon',
    },
    stdio: ['ignore', out, err],
    windowsHide: true,
  });

  fs.writeFileSync(pidPath, `${child.pid}\n`, 'utf8');
  append(
    outPath,
    `[${new Date().toISOString()}] source refresh loop started pid=${child.pid} interval=${intervalMinutes} dailySlots=${dailySlots} timeZone=${refreshTimeZone} timeout=${timeoutMinutes} base=${refreshBaseUrl} heavySync=${includeHeavyWorldSync ? '1' : '0'}\n`,
  );
  child.on('exit', (code, signal) => {
    append(outPath, `[${new Date().toISOString()}] source refresh loop exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    child = null;
    fs.rmSync(pidPath, { force: true });
    if (!stopping) scheduleRestart(startRefreshLoop);
  });
  return child;
}

async function waitForExit(processRef, label, options = {}) {
  if (!processRef?.pid) return;
  const result = await terminateProcessTree(processRef.pid, {
    detached: options.detached === true,
    graceMs: stopGraceMs,
  });
  if (result.forced) {
    append(errPath, `[${new Date().toISOString()}] ${label} required SIGKILL after ${stopGraceMs}ms\n`);
  }
  if (!result.ok) {
    append(errPath, `[${new Date().toISOString()}] ${label} process tree remained alive after SIGKILL\n`);
  }
}

function shutdown(signalName) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    stopping = true;
    lifecycleController.abort(createAbortError(`Refresh daemon received ${signalName}`));
    append(outPath, `[${new Date().toISOString()}] refresh daemon shutting down signal=${signalName}\n`);
    if (workerHealthTimer) clearInterval(workerHealthTimer);
    await Promise.all([
      waitForExit(child, 'source refresh loop'),
      waitForExit(worker, 'source refresh worker', { detached: process.platform !== 'win32' }),
    ]);
    fs.rmSync(pidPath, { force: true });
    fs.rmSync(workerPidPath, { force: true });
    try {
      fs.closeSync(out);
    } catch {}
    try {
      fs.closeSync(err);
    } catch {}
    finishMain?.();
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

async function main() {
  startWorker();
  while (!stopping) {
    const ready = await waitForWorkerReady();
    if (ready || !manageWorker || configuredBaseUrl) break;
    append(errPath, `[${new Date().toISOString()}] source refresh worker readiness timed out; retrying\n`);
    await delayWithSignal(restartDelayMs, lifecycleController.signal);
  }
  if (stopping) return;
  startRefreshLoop();
  startWorkerHealthMonitor();

  console.log(
    JSON.stringify(
      {
        pid: child?.pid || null,
        workerPid: worker?.pid || null,
        intervalMinutes,
        dailySlots,
        refreshTimeZone,
        timeoutMinutes,
        refreshBaseUrl,
        includeHeavyWorldSync,
        workerManaged: Boolean(worker),
        workerReadyTimeoutMs,
        restartDelayMs,
        stopGraceMs,
        workerHealthIntervalMs,
        workerHealthFailureThreshold,
        pidPath,
        workerPidPath: worker ? workerPidPath : null,
        outPath,
        errPath,
      },
      null,
      2,
    ),
  );

  await new Promise((resolve) => {
    finishMain = resolve;
  });
}

main().catch((error) => {
  if (isAbortError(error) || stopping) return;
  append(errPath, `[${new Date().toISOString()}] source refresh daemon fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
