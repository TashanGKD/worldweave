import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function createRunId(prefix = 'world-refresh') {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createAbortError(message = 'Operation aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export function abortMessage(signal, fallback = 'Operation aborted') {
  if (signal?.reason instanceof Error) return signal.reason.message;
  if (typeof signal?.reason === 'string' && signal.reason.trim()) return signal.reason;
  return fallback;
}

export function combineAbortSignals(signals) {
  const active = signals.filter(Boolean);
  if (!active.length) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);

  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason || createAbortError());
  };
  for (const signal of active) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }
  return controller.signal;
}

export async function delayWithSignal(ms, signal) {
  if (signal?.aborted) throw createAbortError(abortMessage(signal));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    if (!signal) return;
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(createAbortError(abortMessage(signal)));
      },
      { once: true },
    );
  });
}

function processTreeTarget(pid, detached) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 1) return null;
  return detached && process.platform !== 'win32' ? -normalizedPid : normalizedPid;
}

export function processTreeIsAlive(pid, options = {}) {
  const target = processTreeTarget(pid, options.detached !== false);
  if (target === null) return false;
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function signalProcessTree(pid, signal = 'SIGTERM', options = {}) {
  const target = processTreeTarget(pid, options.detached !== false);
  if (target === null) return false;
  try {
    process.kill(target, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

export async function terminateProcessTree(pid, options = {}) {
  const detached = options.detached !== false;
  const graceMs = Math.max(100, Number(options.graceMs) || 10_000);
  const killWaitMs = Math.max(100, Number(options.killWaitMs) || 2_000);
  const pollMs = Math.max(25, Number(options.pollMs) || 100);
  const startedAt = Date.now();
  if (!processTreeIsAlive(pid, { detached })) {
    return { ok: true, signaled: false, forced: false, duration_ms: 0 };
  }

  signalProcessTree(pid, 'SIGTERM', { detached });
  const gracefulDeadline = Date.now() + graceMs;
  while (processTreeIsAlive(pid, { detached }) && Date.now() < gracefulDeadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  let forced = false;
  if (processTreeIsAlive(pid, { detached })) {
    forced = signalProcessTree(pid, 'SIGKILL', { detached });
    const killDeadline = Date.now() + killWaitMs;
    while (processTreeIsAlive(pid, { detached }) && Date.now() < killDeadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  return {
    ok: !processTreeIsAlive(pid, { detached }),
    signaled: true,
    forced,
    duration_ms: Date.now() - startedAt,
  };
}

export async function withDeadline(task, timeoutMs, options = {}) {
  const controller = new AbortController();
  const signal = combineAbortSignals([options.signal, controller.signal]);
  const timeout = Math.max(1, Number(timeoutMs) || 1);
  const timer = setTimeout(
    () => controller.abort(createAbortError(options.message || `Operation timed out after ${timeout}ms`)),
    timeout,
  );
  timer.unref?.();
  try {
    return await task(signal);
  } finally {
    clearTimeout(timer);
  }
}

export function writeJsonAtomicSync(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

export function acquireFileLock(lockPath, options = {}) {
  const runId = options.runId || createRunId();
  const staleAfterMs = Math.max(60_000, Number(options.staleAfterMs) || 30 * 60_000);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      const lock = {
        run_id: runId,
        pid: process.pid,
        created_at: new Date().toISOString(),
        ...options.metadata,
      };
      fs.writeFileSync(descriptor, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
      fs.closeSync(descriptor);
      return {
        acquired: true,
        lock,
        release() {
          const current = readLock(lockPath);
          if (!current || current.run_id === runId) fs.rmSync(lockPath, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const current = readLock(lockPath);
      let ageMs = Infinity;
      try {
        ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      } catch {
        ageMs = Infinity;
      }
      if (attempt === 0 && ageMs > staleAfterMs) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      return { acquired: false, lock: current, age_ms: ageMs, release() {} };
    }
  }

  return { acquired: false, lock: readLock(lockPath), age_ms: null, release() {} };
}
