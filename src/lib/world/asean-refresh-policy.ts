// Background rebuilds may share a deliberately limited proxy connection.
export function aseanProviderTimeout(defaultMs: number, force: boolean, cacheOnly: boolean,
  configured = process.env.WORLD_ASEAN_PROVIDER_REFRESH_TIMEOUT_MS) {
  const value = Number(configured);
  if (!force || cacheOnly || !Number.isFinite(value) || value <= 0) return defaultMs;
  return Math.min(300_000, Math.max(defaultMs, value));
}

export function reusableCsvDataset(sourceType: string | undefined, checkedAt: string | undefined,
  status: string | undefined, hasData: boolean, now: number, ttlMs: number) {
  const age = now - Date.parse(checkedAt || '');
  return sourceType === 'csv' && status === 'ok' && hasData &&
    Number.isFinite(age) && age >= 0 && age < ttlMs;
}

export function latestSuccessfulProviderRefresh(
  caches: Array<{ refreshed_at?: string; latest_run?: { fetched_count?: number } } | null>,
  startedAt: string,
) {
  const start = Date.parse(startedAt);
  return caches.filter((cache) => Number(cache?.latest_run?.fetched_count) > 0)
    .map((cache) => cache?.refreshed_at || '')
    .filter((date) => Number.isFinite(Date.parse(date)) && Date.parse(date) >= start)
    .sort().at(-1) || null;
}
