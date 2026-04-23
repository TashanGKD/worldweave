'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const DASHBOARD_CACHE_PREFIXES = ['world-threads:dashboard:', 'world-threads:v'];

function clearWorldThreadsCache() {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (DASHBOARD_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore storage cleanup failure
  }
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[app:error]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-6 py-16">
      <div className="w-full rounded-[28px] border border-rose-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">World Threads</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em] text-slate-950">页面刚才在浏览器里中断了</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          这通常不是服务整体停了，而是浏览器本地缓存或某条前端数据在加载时不够完整。先清掉本地缓存再重试，通常能直接恢复。
        </p>
        {error?.digest ? (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-500">
            digest: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              clearWorldThreadsCache();
              reset();
            }}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            清缓存后重试
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700"
          >
            直接刷新
          </button>
        </div>
      </div>
    </main>
  );
}
