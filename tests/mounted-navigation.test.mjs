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

test('public skill URLs preserve mounted API prefixes and public HTTPS', () => {
  const originSource = readSource('src/lib/request-origin.ts');

  assert.match(originSource, /export function resolveRequestBaseUrl/);
  assert.match(originSource, /pathname\.indexOf\('\/api\/v1\/'\)/);
  assert.match(originSource, /inferProtocol\(host\) === 'https'/);
  assert.match(originSource, /export function resolvePublicBaseUrl/);

  for (const path of [
    'src/app/api/v1/openclaw/skill.md/route.ts',
    'src/app/api/v1/openclaw/aihot.skill.md/route.ts',
    'src/app/api/v1/openclaw/sources.skill.md/route.ts',
    'src/app/api/v1/openclaw/livebench.skill.md/route.ts',
    'src/app/api/v1/openclaw/evaluation.skill.md/route.ts',
    'src/app/api/v1/world/state/route.ts',
  ]) {
    const source = readSource(path);
    assert.match(source, /resolvePublicBaseUrl/);
  }
});

test('scene-filtered world state uses the public signal quality gate', () => {
  const routeSource = readSource('src/app/api/v1/world/state/route.ts');
  const signalsRouteSource = readSource('src/app/api/v1/world/signals/route.ts');
  const topiclabRouteSource = readSource('src/app/api/v1/topiclab/source-feed/articles/route.ts');
  const recallRouteSource = readSource('src/app/api/v1/world/source-knowledge/recall/route.ts');
  const homePageSource = readSource('src/app/page.tsx');
  const dailyPageSource = readSource('src/app/daily/[kind]/page.tsx');
  const detailPageSource = readSource('src/app/signals/[id]/page.tsx');
  const qualitySource = readSource('src/lib/world/signal-quality.ts');

  assert.match(routeSource, /isPublicEventSignal\(signal\) && dashboardSignalMatchesScene\(signal, scene\)/);
  assert.match(signalsRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(topiclabRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(recallRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(homePageSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(dailyPageSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(detailPageSource, /!isPublicEventSignal/);
  assert.match(qualitySource, /looksLikeTemplatedSignalCopy/);
  assert.ok(qualitySource.includes('/出现新的[^。]{1,16}(?:信号|消息)/u.test(text)'));
  assert.match(qualitySource, /本轮前几条标题\|该分类收录约\|当前样本累计/);
});

test('AI News Radar is ingested through the selected source pipeline', () => {
  const runtimeSource = readSource('src/lib/world/runtime.ts');
  const dashboardSource = readSource('src/lib/world/dashboard-presentation.ts');
  const stateRouteSource = readSource('src/app/api/v1/world/state/route.ts');

  assert.match(runtimeSource, /latest-24h\.json/);
  assert.match(runtimeSource, /function normalizeAiNewsRadarSnapshot/);
  assert.match(runtimeSource, /source:ai-news-radar/);
  assert.match(runtimeSource, /daily:ai/);
  assert.match(runtimeSource, /AI_NEWS_RADAR_PER_SITE_LIMIT/);
  assert.match(dashboardSource, /source:ai-news-radar/);
  assert.match(stateRouteSource, /source:ai-news-radar/);
});

test('daily poster export uses model curation, title fallback dedupe, and a DOM-backed png download', () => {
  const dailyPageSource = readSource('src/app/daily/[kind]/page.tsx');
  const posterSource = readSource('src/app/daily/daily-share-poster.tsx');
  const runtimeSource = readSource('src/lib/world/runtime.ts');

  assert.match(runtimeSource, /export async function curateWorldDailySignals/);
  assert.match(runtimeSource, /requestLabel: `daily-curation-\$\{input\.kind\}`/);
  assert.match(runtimeSource, /display_title/);
  assert.match(runtimeSource, /display_summary/);
  assert.match(dailyPageSource, /await curateWorldDailySignals/);
  assert.match(dailyPageSource, /daily_display_title/);
  assert.match(dailyPageSource, /daily_display_summary/);
  assert.match(dailyPageSource, /function dedupeDailyVisibleTitles/);
  assert.match(posterSource, /function uniquePosterSignals/);
  assert.match(posterSource, /canvas\.toBlob/);
  assert.match(posterSource, /document\.body\.appendChild\(link\)/);
});
