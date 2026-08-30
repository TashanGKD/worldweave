import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const livebench = readFileSync(join(process.cwd(), 'src', 'lib', 'world', 'livebench.ts'), 'utf8');
const statusRoute = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'v1', 'world', 'source-knowledge', 'status', 'route.ts'),
  'utf8',
);
const refreshScript = readFileSync(join(process.cwd(), 'scripts', 'world-source-refresh.mjs'), 'utf8');
const daemonScript = readFileSync(join(process.cwd(), 'scripts', 'world-source-refresh-daemon.mjs'), 'utf8');
const composeFile = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');

test('livebench persistence quantizes embeddings and writes compact JSON', () => {
  assert.match(livebench, /function quantizePersistedEmbedding/);
  assert.match(livebench, /LIVEBENCH_EMBEDDING_PERSIST_PRECISION/);
  assert.ok(!livebench.includes('JSON.stringify(storeToWrite, null, 2)'));
  assert.ok(!livebench.includes('JSON.stringify(normalizedStore, null, 2)'));
});

test('retained livebench archive is capped and quantized', () => {
  assert.match(livebench, /WORLD_LIVEBENCH_RETAINED_ARCHIVE_CHUNK_LIMIT/);
  assert.match(livebench, /limitRetainedArchiveChunks\(/);
});

test('source status fallback refuses oversized state files', () => {
  assert.match(statusRoute, /SOURCE_STATUS_FALLBACK_MAX_STATE_FILE_BYTES/);
  assert.match(statusRoute, /fs\.stat\(statePath\)/);
});

test('refresh probes tolerate slow worker warm-up', () => {
  assert.match(refreshScript, /WORLD_SOURCE_REFRESH_PROBE_TIMEOUT_MS/);
  assert.ok(!refreshScript.includes('AbortSignal.timeout(5000)'));
  assert.ok(!refreshScript.includes('AbortSignal.timeout(5_000)'));
  assert.match(daemonScript, /WORLD_SOURCE_REFRESH_WORKER_PROBE_TIMEOUT_MS/);
});

test('compose gives the world web container enough heap headroom', () => {
  assert.match(composeFile, /WORLDWEAVE_MEM_LIMIT:-2560m/);
  assert.match(composeFile, /--max-old-space-size=2048/);
});
