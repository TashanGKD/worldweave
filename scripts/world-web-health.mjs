import fs from 'node:fs/promises';

const baseUrl = (process.env.WORLD_WEB_HEALTH_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/u, '');
const warmMarker = process.env.WORLD_WEB_WARM_MARKER || '/tmp/worldweave-asean-warmed';

async function fetchText(pathname, timeoutMs) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return body;
}

try {
  await fetchText('/api/v1/openclaw/skill.md', 15_000);

  const alreadyWarmed = await fs.access(warmMarker).then(() => true).catch(() => false);
  if (!alreadyWarmed) {
    const aseanPage = await fetchText('/demo/asean', 90_000);
    if (!aseanPage.includes('东盟专题')) throw new Error('/demo/asean returned an unexpected page');
    await fs.writeFile(warmMarker, `${new Date().toISOString()}\n`, 'utf8');
  }

  process.exit(0);
} catch (error) {
  process.stderr.write(`[world-web-health] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
