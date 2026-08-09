import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export type AseanReadOptions = {
  force?: boolean;
  cacheOnly?: boolean;
  signal?: AbortSignal;
};

export function createAseanAbortError(message = 'ASEAN refresh aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function throwIfAseanAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw createAseanAbortError(typeof signal.reason === 'string' ? signal.reason : undefined);
}

export function createLinkedTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number, label: string) {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => {
    if (!controller.signal.aborted) controller.abort(parent?.reason || createAseanAbortError(`${label} canceled`));
  };
  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(createAseanAbortError(`${label} timed out after ${timeoutMs}ms`));
  }, Math.max(1, timeoutMs));

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

export async function raceAseanAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAseanAborted(signal);
  if (!signal) return operation;
  let onAbort: (() => void) | null = null;
  const aborted = new Promise<T>((_resolve, reject) => {
    onAbort = () => {
      reject(signal.reason instanceof Error ? signal.reason : createAseanAbortError(String(signal.reason || 'ASEAN operation aborted')));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export async function withAseanTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  fallback: T,
  parentSignal: AbortSignal | undefined,
  label: string,
): Promise<T> {
  const timeout = createLinkedTimeoutSignal(parentSignal, timeoutMs, label);
  try {
    return await raceAseanAbort(Promise.resolve().then(() => operation(timeout.signal)), timeout.signal);
  } catch (error) {
    if (parentSignal?.aborted) throw error;
    if (timeout.timedOut()) return fallback;
    throw error;
  } finally {
    timeout.dispose();
  }
}

export async function mapAseanWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, async () => {
    while (cursor < items.length) {
      throwIfAseanAborted(signal);
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  throwIfAseanAborted(signal);
  return results;
}

export async function writeAseanCacheAtomic(filePath: string, content: string, signal?: AbortSignal) {
  throwIfAseanAborted(signal);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, 'utf-8');
    throwIfAseanAborted(signal);
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
