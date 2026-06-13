import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const healthWorldSource = readFileSync(join(process.cwd(), 'scripts', 'health-world.mjs'), 'utf8');

test('world health check covers geo-politics scene freshness by default', () => {
  assert.match(healthWorldSource, /WORLD_HEALTH_CHECK_SCENES \|\| 'tech-ai,geo-politics-daily'/);
  assert.match(healthWorldSource, /WORLD_HEALTH_MAX_STATE_AGE_HOURS \|\| 24/);
  assert.match(healthWorldSource, /WORLD_HEALTH_MAX_SIGNAL_AGE_HOURS \|\| 36/);
});

test('world health check fails stale visible scene signals', () => {
  assert.match(healthWorldSource, /function latestSignalDate/);
  assert.match(healthWorldSource, /published_at/);
  assert.match(healthWorldSource, /last_report_at/);
  assert.match(healthWorldSource, /staleVisibleSignals/);
  assert.match(healthWorldSource, /latestVisibleSignalAgeHours > maxSignalAgeHours/);
  assert.match(healthWorldSource, /sceneFreshnessChecks\.some\(\(sceneCheck\) => !sceneCheck\.ok\)/);
});

test('world health check treats refresh pipeline degradation as unhealthy', () => {
  assert.match(healthWorldSource, /WORLD_HEALTH_FAIL_ON_REFRESH_DEGRADED/);
  assert.match(healthWorldSource, /refreshJob\.ok === false/);
  assert.match(healthWorldSource, /refreshJob\.world_cache_degraded === true/);
  assert.match(healthWorldSource, /refreshJob\.self_healing_ok === false/);
});
