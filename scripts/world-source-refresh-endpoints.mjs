export const ROTATING_MAINTENANCE_ENDPOINTS = [
  {
    method: 'POST',
    pathname: '/api/v1/world/source-knowledge/sync?scene=global&batch=1',
    timeoutMs: 300000,
    critical: false,
    batchHeader: true,
  },
  {
    method: 'POST',
    pathname: '/api/v1/world/livebench/sync?scene=global&batch=1',
    timeoutMs: 300000,
    critical: false,
    batchHeader: true,
  },
  {
    method: 'POST',
    pathname: '/api/v1/world/source-knowledge/sync?scene=tech-ai&batch=1',
    timeoutMs: 300000,
    critical: false,
    batchHeader: true,
  },
];

// These two snapshots are the public dashboard's primary timelines. They must
// be rebuilt on every scheduled cycle instead of waiting behind maintenance
// work in the rotating queue. Full proxy-backed rebuilds can exceed one minute.
export const SCHEDULED_DASHBOARD_REFRESH_ENDPOINTS = [
  {
    method: 'GET',
    pathname: '/api/v1/world/state?scene=geo-politics-daily&fresh=1&rebuild=1',
    timeoutMs: 180000,
    critical: false,
    batchHeader: false,
  },
  {
    method: 'GET',
    pathname: '/api/v1/world/state?scene=tech-ai&fresh=1&rebuild=1',
    timeoutMs: 180000,
    critical: false,
    batchHeader: false,
  },
];
