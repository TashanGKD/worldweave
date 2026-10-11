import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/world/asean-refresh-policy.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { aseanProviderTimeout, reusableCsvDataset, latestSuccessfulProviderRefresh } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('only live forced refreshes use a bounded extended provider deadline', () => {
  assert.equal(aseanProviderTimeout(25000, true, false, '180000'), 180000);
  assert.equal(aseanProviderTimeout(25000, false, false, '180000'), 25000);
  assert.equal(aseanProviderTimeout(25000, true, true, '180000'), 25000);
  assert.equal(aseanProviderTimeout(25000, true, false, '999999999'), 300000);
  for (const value of ['invalid', '', '-1', 'Infinity']) {
    assert.equal(aseanProviderTimeout(25000, true, false, value), 25000);
  }
});

test('successful recent CSV extracts are reusable without refreshing their age', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const ttl = 24 * 60 * 60 * 1000;
  const recent = '2026-10-11T01:00:00Z';
  assert.equal(reusableCsvDataset('csv', recent, 'ok', true, now, ttl), true);
  assert.equal(reusableCsvDataset('api-json', recent, 'ok', true, now, ttl), false);
  assert.equal(reusableCsvDataset('csv', recent, 'failed', true, now, ttl), false);
  assert.equal(reusableCsvDataset('csv', recent, 'ok', false, now, ttl), false);
  for (const date of ['2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z', 'invalid']) {
    assert.equal(reusableCsvDataset('csv', date, 'ok', true, now, ttl), false);
  }
  assert.equal(reusableCsvDataset('csv', recent, 'ok', true, now, 0), false);
});

test('retained data and failed refreshes cannot report live refresh success', () => {
  const start = '2026-10-11T12:00:00Z';
  const old = { refreshed_at: '2026-10-11T11:59:00Z', latest_run: { fetched_count: 25 } };
  const empty = { refreshed_at: '2026-10-11T12:01:00Z', latest_run: { fetched_count: 0 } };
  assert.equal(latestSuccessfulProviderRefresh([old, empty, null], start), null);
  const fresh = { refreshed_at: '2026-10-11T12:01:00Z', latest_run: { fetched_count: 18 } };
  assert.equal(latestSuccessfulProviderRefresh([old, empty, fresh], start), fresh.refreshed_at);
});
