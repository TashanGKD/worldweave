import assert from 'node:assert/strict';
import { test } from 'node:test';

import { probeRuntimeEgress } from '../scripts/check-runtime-egress.mjs';

test('runtime egress accepts reachable HTTP responses and enforces the threshold', async () => {
  const statuses = new Map([
    ['https://one.example', 200],
    ['https://two.example', 404],
    ['https://three.example', 503],
  ]);
  const summary = await probeRuntimeEgress({
    urls: [...statuses.keys()],
    minSuccess: 2,
    fetchImpl: async (url) => ({ status: statuses.get(url), body: null }),
    log: () => {},
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.required, 2);
});

test('runtime egress records network errors without hiding a failed threshold', async () => {
  const summary = await probeRuntimeEgress({
    urls: ['https://one.example', 'https://two.example'],
    minSuccess: 2,
    fetchImpl: async (url) => {
      if (url.endsWith('one.example')) return { status: 200, body: null };
      throw new Error('network unavailable');
    },
    log: () => {},
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.successCount, 1);
  assert.match(summary.results[1].error, /network unavailable/);
});
