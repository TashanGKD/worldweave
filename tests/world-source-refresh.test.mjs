import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const sourceRefreshScript = readFileSync(join(process.cwd(), 'scripts', 'world-source-refresh.mjs'), 'utf8');

test('world source refresh warms both AI and geo-politics scene states', () => {
  assert.match(sourceRefreshScript, /\/api\/v1\/world\/state\?scene=tech-ai&fresh=1&rebuild=1/);
  assert.match(sourceRefreshScript, /\/api\/v1\/world\/state\?scene=geo-politics-daily&fresh=1&rebuild=1/);
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
  assert.match(sourceRefreshScript, /final_worker_health_after_recovery/);
});
