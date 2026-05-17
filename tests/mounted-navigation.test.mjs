import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('worldHref preserves hash fragments and worldHomeHref targets the mounted route', () => {
  const source = readSource('src/components/world-ui.tsx');

  assert.match(source, /return `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`;/);
  assert.match(source, /export function worldHomeHref\(scene: WorldScene = 'global', hash = ''\)/);
  assert.match(source, /return worldHref\(`\/worldweave\/\$\{normalizedHash\}`, scene\);/);
});

test('daily pages return to the mounted WorldWeave shell and keep daily tabs relative', () => {
  const source = readSource('src/app/daily/[kind]/page.tsx');

  assert.match(source, /href: worldHomeHref\('geo-politics-daily'\)/);
  assert.match(source, /href: worldHomeHref\('tech-ai'\)/);
  assert.match(source, /href: worldHomeHref\('global'\)/);
  assert.match(source, /<Link href="\.\/geo"/);
  assert.match(source, /<Link href="\.\/ai"/);
  assert.match(source, /<Link href="\.\/livebench"/);
  assert.doesNotMatch(source, /href:\s*'\.\.\/\??/);
});

test('secondary WorldWeave pages return through worldHomeHref instead of the host root', () => {
  for (const path of [
    'src/app/topiclab-preview/page.tsx',
    'src/app/source-knowledge/page.tsx',
    'src/app/livebench/evaluation/page.tsx',
    'src/app/livebench/[questionId]/page.tsx',
    'src/app/signals/[id]/page.tsx',
  ]) {
    const source = readSource(path);
    assert.match(source, /worldHomeHref/);
    assert.doesNotMatch(source, /href=\{worldHref\('\/(#arena-panel)?'/);
    assert.doesNotMatch(source, /href="\.\."/);
    assert.doesNotMatch(source, /href="\/"/);
  }
});

test('/worldweave compatibility route preserves query parameters before redirecting home', () => {
  const source = readSource('src/app/worldweave/page.tsx');

  assert.match(source, /redirect\(query \? `\/\?\$\{query\}` : '\/'\);/);
  assert.match(source, /search\.append\(key, item\);/);
  assert.match(source, /search\.set\(key, value\);/);
});
