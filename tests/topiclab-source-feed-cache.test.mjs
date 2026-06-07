import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('TopicLab source feed bridge refreshes dashboard when source status is newer', () => {
  const routeSource = readSource('src/app/api/v1/topiclab/source-feed/articles/route.ts');

  assert.match(routeSource, /readWorldApiSnapshot<WorldSourceKnowledgeState>/);
  assert.match(routeSource, /latest_signal_published_at/);
  assert.match(routeSource, /isDashboardOlderThanSourceStatus/);
  assert.match(routeSource, /sourceLatest - dashboardLatest > 60 \* 60 \* 1000/);
  assert.match(routeSource, /getWorldDashboardState\(scene,/);
});
