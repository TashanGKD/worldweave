import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('Docker context keeps reviewed ASEAN model seed artifacts', () => {
  const dockerIgnore = readSource('.dockerignore');

  assert.match(dockerIgnore, /^\.cache\/\*$/m);
  assert.match(dockerIgnore, /^!\.cache\/asean-training\/$/m);

  for (const filename of [
    'fuel-price-forecast.json',
    'power-risk-baseline.json',
    'proxy-models.json',
    'model-data-coverage.json',
    'model-readiness.json',
  ]) {
    assert.match(dockerIgnore, new RegExp(`^!\\.cache/asean-training/${filename}$`, 'm'));
  }
});
