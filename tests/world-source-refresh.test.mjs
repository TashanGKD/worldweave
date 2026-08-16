import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  ROTATING_MAINTENANCE_ENDPOINTS,
  SCHEDULED_DASHBOARD_REFRESH_ENDPOINTS,
} from '../scripts/world-source-refresh-endpoints.mjs';

const sourceRefreshScript = readFileSync(join(process.cwd(), 'scripts', 'world-source-refresh.mjs'), 'utf8');
const worldRuntime = readFileSync(join(process.cwd(), 'src', 'lib', 'world', 'runtime.ts'), 'utf8');

test('world source refresh rebuilds both public dashboard scenes every cycle', () => {
  assert.deepEqual(
    SCHEDULED_DASHBOARD_REFRESH_ENDPOINTS.map((endpoint) => endpoint.pathname),
    [
      '/api/v1/world/state?scene=geo-politics-daily&fresh=1&rebuild=1',
      '/api/v1/world/state?scene=tech-ai&fresh=1&rebuild=1',
    ],
  );
  assert.ok(ROTATING_MAINTENANCE_ENDPOINTS.every((endpoint) => endpoint.timeoutMs >= 300000));
  assert.ok(SCHEDULED_DASHBOARD_REFRESH_ENDPOINTS.every((endpoint) => endpoint.timeoutMs >= 180000));
  assert.ok(ROTATING_MAINTENANCE_ENDPOINTS.every((endpoint) => !endpoint.pathname.includes('/world/state?')));
  assert.match(sourceRefreshScript, /\.\.\.SCHEDULED_DASHBOARD_REFRESH_ENDPOINTS/);
  assert.match(sourceRefreshScript, /WORLD_SOURCE_REFRESH_INCLUDE_HEAVY_SYNC/);
});

test('world source refresh rotates heavy work and resets its managed worker after timeouts', () => {
  assert.match(sourceRefreshScript, /WORLD_SOURCE_REFRESH_HEAVY_BATCH_SIZE/);
  assert.match(sourceRefreshScript, /selectRotatingHeavyEndpoints/);
  assert.match(sourceRefreshScript, /resetManagedWorker/);
  assert.match(sourceRefreshScript, /DEADLINE_EXCEEDED/);
  assert.match(sourceRefreshScript, /worker_resets/);
  assert.match(sourceRefreshScript, /terminateProcessTree/);
  assert.match(sourceRefreshScript, /replacement_pid/);
  assert.match(sourceRefreshScript, /snapshot-timeouts:/);
  assert.match(sourceRefreshScript, /retried_after_worker_reset/);
  assert.match(sourceRefreshScript, /recovered_after_timeout/);
  assert.match(sourceRefreshScript, /final_worker_health_after_recovery/);
});

test('dashboard snapshots record generated_at after signal refresh work completes', () => {
  const dashboardStart = worldRuntime.indexOf('export async function getWorldDashboardState(');
  const dashboardEnd = worldRuntime.indexOf('\nasync function getWorldBriefing(', dashboardStart);
  const dashboardBody = worldRuntime.slice(dashboardStart, dashboardEnd);

  assert.ok(dashboardBody.indexOf('const signals = await loadSignals(') >= 0);
  assert.ok(dashboardBody.indexOf('const generated_at = new Date().toISOString();') > dashboardBody.indexOf('const signals = await loadSignals('));
  assert.ok(dashboardBody.indexOf('const generated_at = new Date().toISOString();') < dashboardBody.indexOf('await persistWorldDashboardSnapshot('));
});
