import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/components/world-ui.tsx'), 'utf8');
const dashboardSource = readFileSync(join(process.cwd(), 'src/app/dashboard-client.tsx'), 'utf8');

test('dashboard timestamps render deterministically in Shanghai time during hydration', () => {
  assert.match(source, /timestamp \+ 8 \* 60 \* 60 \* 1000/);
  assert.match(source, /getUTCMonth\(\)/);
  assert.match(source, /getUTCHours\(\)/);
  assert.doesNotMatch(source, /toLocaleString\('zh-CN'/);
  assert.match(dashboardSource, /function shanghaiDate\(iso: string\)/);
  assert.match(dashboardSource, /date\.getUTCMonth\(\)/);
  assert.match(dashboardSource, /date\.getUTCHours\(\)/);
  assert.doesNotMatch(dashboardSource, /date\.getMonth\(\)|date\.getHours\(\)/);
});
