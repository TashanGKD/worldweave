import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../scripts/world-source-refresh.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('refresh.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = (name) => ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);

function remediation(firstAge) {
  const calls = [];
  let readCount = 0;
  const helpers = ['summarizeSourceFreshness', 'classifyRuntimeFailures'].map(declaration).join('\n');
  const run = new Function('deps', `
    const { callWorldEndpoint, fetchWorldJson, fetch } = deps;
    const SOURCE_LATEST_SIGNAL_STALE_HOURS = 48;
    const nowIso = () => new Date().toISOString();
    const parseLatestSignalShrink = () => null;
    const combineAbortSignals = () => undefined;
    ${helpers}
    return ${declaration('runSourceRefreshRemediation')};
  `)({
    callWorldEndpoint: async (_base, method, path, timeout, _snapshot, batchHeader) => {
      calls.push({ method, path, timeout, batchHeader });
      return { ok: true, status: 200, duration_ms: 1 };
    },
    fetchWorldJson: async (_base, path, _timeout, batchHeader) => {
      calls.push({ method: 'GET', path, batchHeader });
      const age = readCount++ === 0 ? firstAge : 0.01;
      return { ok: true, status: 200, data: {
        source_health: { latest_signal_age_hours: age, freshness_status: age > 48 ? 'stale' : 'fresh' },
      } };
    },
    fetch: async () => ({ ok: true, json: async () => ({ runtime_failure_count: 12, recent_runtime_failures: [] }) }),
  });
  return { run, calls };
}

test('fresh live signals prevent redundant synchronization despite failed individual sources', async () => {
  const { run, calls } = remediation(0.01);
  const result = await run({ worldBaseUrl: 'http://world.test' }, { ok: true }, undefined, 'test-run');
  assert.equal(result.ok, true);
  assert.equal(result.source_freshness.stale, false);
  assert.equal(calls.some((call) => call.method === 'POST'), false);
  assert.equal(calls.some((call) => call.path.includes('fresh=1')), false);
  assert.ok(calls.filter((call) => call.path.includes('/source-knowledge/status')).every((call) => !call.batchHeader));
  assert.ok(result.actions.some((action) => action.action === 'defer-runtime-failure-resync'));
});

test('stale live signals still trigger one bounded real synchronization and are checked again', async () => {
  const { run, calls } = remediation(72);
  const result = await run({ worldBaseUrl: 'http://world.test' }, { ok: true }, undefined, 'test-run');
  assert.equal(result.ok, true);
  assert.equal(result.source_freshness.stale, false);
  const writes = calls.filter((call) => call.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/api/v1/world/source-knowledge/sync?scene=global&batch=1');
  assert.equal(writes[0].timeout, 300000);
  assert.equal(calls.some((call) => call.path.includes('fresh=1')), false);
  assert.ok(calls.filter((call) => call.path.includes('/source-knowledge/status')).every((call) => !call.batchHeader));
});
