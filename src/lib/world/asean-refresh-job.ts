import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createAseanAbortError, createLinkedTimeoutSignal, raceAseanAbort, writeAseanCacheAtomic } from './asean-abort';
import { readAseanTopic } from './asean-page-data';

export type AseanRefreshState = 'idle' | 'queued' | 'running' | 'success' | 'degraded' | 'timed_out' | 'canceled' | 'failed';

export type AseanRefreshStatus = {
  run_id: string | null;
  state: AseanRefreshState;
  trigger: string | null;
  queued_at: string | null;
  started_at: string | null;
  deadline_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  data_refreshed_at: string | null;
  signal_count: number | null;
  metric_count: number | null;
  error: string | null;
  reused?: boolean;
};

const cacheDir = path.join(process.cwd(), '.cache');
const statusPath = path.join(cacheDir, 'asean-refresh-status.json');
const lockPath = path.join(cacheDir, 'asean-refresh.lock');
const timeoutMs = Math.min(
  10 * 60_000,
  Math.max(30_000, Number(process.env.WORLD_ASEAN_REFRESH_TIMEOUT_MS || 120_000)),
);
const workerHostname = os.hostname();

let activeJob: { runId: string; controller: AbortController; promise: Promise<AseanRefreshStatus> } | null = null;

function emptyStatus(): AseanRefreshStatus {
  return {
    run_id: null,
    state: 'idle',
    trigger: null,
    queued_at: null,
    started_at: null,
    deadline_at: null,
    finished_at: null,
    duration_ms: null,
    data_refreshed_at: null,
    signal_count: null,
    metric_count: null,
    error: null,
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function writeStatus(status: AseanRefreshStatus) {
  await fs.mkdir(cacheDir, { recursive: true });
  await writeAseanCacheAtomic(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

async function releaseLock(runId: string) {
  const lock = await readJson<{ run_id?: string }>(lockPath);
  if (!lock || lock.run_id === runId) await fs.rm(lockPath, { force: true });
}

function processIsRunning(pid: number | undefined) {
  if (!Number.isInteger(pid) || Number(pid) <= 1) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function acquireLock(runId: string, trigger: string, nowIso: string) {
  await fs.mkdir(cacheDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(
        `${JSON.stringify({ run_id: runId, pid: process.pid, hostname: workerHostname, trigger, created_at: nowIso, deadline_at: new Date(Date.now() + timeoutMs).toISOString() }, null, 2)}\n`,
        'utf-8',
      );
      await handle.close();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const lock = await readJson<{ pid?: number; hostname?: string; deadline_at?: string }>(lockPath);
      const stat = await fs.stat(lockPath).catch(() => null);
      const ownerIsLocal = !lock?.hostname || lock.hostname === workerHostname;
      const deadline = new Date(lock?.deadline_at || 0).getTime();
      const deadlineExpired = Number.isFinite(deadline) && deadline > 0 && Date.now() >= deadline;
      if (
        attempt === 0 &&
        (!stat ||
          deadlineExpired ||
          (ownerIsLocal && lock?.pid && !processIsRunning(lock.pid)) ||
          Date.now() - stat.mtimeMs > timeoutMs + 60_000)
      ) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      return false;
    }
  }
  return false;
}

export async function readAseanRefreshStatus(): Promise<AseanRefreshStatus> {
  const status = (await readJson<AseanRefreshStatus>(statusPath)) || emptyStatus();
  if (!['queued', 'running'].includes(status.state) || activeJob?.runId === status.run_id) return status;
  const now = Date.now();
  const lock = await readJson<{ run_id?: string; pid?: number; hostname?: string; deadline_at?: string }>(lockPath);
  const lockDeadline = new Date(lock?.deadline_at || status.deadline_at || 0).getTime();
  const localOwnerAlive = (!lock?.hostname || lock.hostname === workerHostname) && processIsRunning(lock?.pid);
  const foreignOwnerWithinDeadline = Boolean(
    lock?.hostname &&
      lock.hostname !== workerHostname &&
      Number.isFinite(lockDeadline) &&
      lockDeadline > now,
  );
  if (lock?.run_id === status.run_id && (localOwnerAlive || foreignOwnerWithinDeadline)) return status;
  const latestStatus = await readJson<AseanRefreshStatus>(statusPath);
  if (
    latestStatus &&
    (latestStatus.run_id !== status.run_id || !['queued', 'running'].includes(latestStatus.state))
  ) {
    return latestStatus;
  }
  const deadline = new Date(status.deadline_at || 0).getTime();
  const started = new Date(status.started_at || status.queued_at || now).getTime();
  const reconciled: AseanRefreshStatus = {
    ...status,
    state: Number.isFinite(deadline) && deadline > 0 && now >= deadline ? 'timed_out' : 'failed',
    finished_at: new Date(now).toISOString(),
    duration_ms: Number.isFinite(started) ? Math.max(0, now - started) : null,
    error: Number.isFinite(deadline) && deadline > 0 && now >= deadline
      ? 'ASEAN refresh exceeded its deadline before the worker could report completion'
      : 'ASEAN refresh was interrupted by a worker restart',
  };
  await writeStatus(reconciled);
  if (status.run_id) await releaseLock(status.run_id);
  return reconciled;
}

async function executeRefresh(initial: AseanRefreshStatus, controller: AbortController) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const timeout = createLinkedTimeoutSignal(controller.signal, timeoutMs, 'ASEAN refresh job');
  let status: AseanRefreshStatus = {
    ...initial,
    state: 'running',
    started_at: startedAt,
  };
  await writeStatus(status);
  try {
    await raceAseanAbort(
      readAseanTopic({ force: true, cacheOnly: false, signal: timeout.signal, limit: 80 }),
      timeout.signal,
    );
    const topic = await raceAseanAbort(
      readAseanTopic({ cacheOnly: true, signal: timeout.signal, limit: 80 }),
      timeout.signal,
    );
    status = {
      ...status,
      state: topic.signals.length || topic.dataset_metrics.length ? 'success' : 'degraded',
      data_refreshed_at: topic.data_refreshed_at,
      signal_count: topic.signals.length,
      metric_count: topic.dataset_metrics.length,
      error: null,
    };
  } catch (error) {
    const timedOut = timeout.timedOut();
    status = {
      ...status,
      state: timedOut ? 'timed_out' : controller.signal.aborted ? 'canceled' : 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    timeout.dispose();
    status.finished_at = new Date().toISOString();
    status.duration_ms = Date.now() - startedMs;
    await writeStatus(status);
    await releaseLock(initial.run_id!);
    if (activeJob?.runId === initial.run_id) activeJob = null;
  }
  return status;
}

export async function startAseanRefresh(trigger = 'manual') {
  if (activeJob) return { ...(await readAseanRefreshStatus()), reused: true };
  const nowIso = new Date().toISOString();
  const runId = `asean-${nowIso.replace(/[-:.TZ]/gu, '')}-${crypto.randomUUID().slice(0, 8)}`;
  const acquired = await acquireLock(runId, trigger, nowIso);
  if (!acquired) return { ...(await readAseanRefreshStatus()), reused: true };

  const initial: AseanRefreshStatus = {
    run_id: runId,
    state: 'queued',
    trigger,
    queued_at: nowIso,
    started_at: null,
    deadline_at: new Date(Date.now() + timeoutMs).toISOString(),
    finished_at: null,
    duration_ms: null,
    data_refreshed_at: null,
    signal_count: null,
    metric_count: null,
    error: null,
  };
  await writeStatus(initial);
  const controller = new AbortController();
  const promise = executeRefresh(initial, controller);
  activeJob = { runId, controller, promise };
  void promise.catch(() => undefined);
  return initial;
}

export async function cancelAseanRefresh(runId?: string) {
  if (!activeJob || (runId && activeJob.runId !== runId)) return false;
  activeJob.controller.abort(createAseanAbortError('ASEAN refresh canceled by operator'));
  await activeJob.promise.catch(() => undefined);
  return true;
}

export function getAseanRefreshConfig() {
  return { timeout_ms: timeoutMs };
}
