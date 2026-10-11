export function signalFreshness(published: string[], generatedAt: string | null | undefined, now = Date.now()) {
  const timestamps = published.map(Date.parse).filter(value => Number.isFinite(value) && value <= now);
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const age = latest === null ? null : (now - latest) / 3600000;
  return {
    response_generated_at: new Date(now).toISOString(),
    cache_generated_at: generatedAt || null,
    latest_signal_published_at: latest === null ? null : new Date(latest).toISOString(),
    content_age_hours: age,
    freshness_status: age === null ? 'unknown' : age > 24 ? 'stale' : 'recent',
    freshness_basis: 'latest_content_publication',
    source_fetch_succeeded_at: null,
    source_fetch_status: 'unknown',
  };
}
