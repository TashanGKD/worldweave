import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : 'true');
    result[key] = value;
    if (inlineValue == null && next && !next.startsWith('--')) index += 1;
  }
  return result;
}

const cliArgs = parseCliArgs(process.argv.slice(2));
const logPath = cliArgs.log || '.cache/world-start-5016-cluster-check.out.log';
const cachePath = cliArgs.cache || '.cache/world-signal-cache-cluster-check.json';
const outputDir = path.join(process.cwd(), 'research', 'source-skill-validation');

function dayKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function parseFunnelLogs(text) {
  const pattern =
    /\[loadSignals\] Loaded (?<loaded>\d+) merged signals .*?\(emitted (?<emitted>\d+), kept (?<kept>\d+)\/(?<publishable>\d+), exact_collapsed (?<exactCollapsed>\d+), event_clusters (?<eventClusters>\d+), event_collapsed (?<eventCollapsed>\d+), source_collapsed (?<sourceCollapsed>\d+)\)/g;
  return [...text.matchAll(pattern)].map((match, index) => ({
    run: index + 1,
    ...Object.fromEntries(Object.entries(match.groups || {}).map(([key, value]) => [key, Number(value)])),
  }));
}

function pct(value, base) {
  if (!base) return null;
  return Math.round((value / base) * 1000) / 10;
}

function summarizeCache(cache) {
  const signals = Array.isArray(cache.signals) ? cache.signals : [];
  const byScene = {};
  const clustered = [];
  const sourceGroups = {};
  for (const signal of signals) {
    const scene = signal.scene || 'unknown';
    byScene[scene] = (byScene[scene] || 0) + 1;
    const tags = [...(signal.alignmentTags || []), ...(signal.tags || [])].map((tag) => String(tag).toLowerCase());
    if (tags.includes('event:clustered')) {
      clustered.push(signal);
    }
    let group = 'other';
    const text = tags.join(' ');
    if (text.includes('source:world-monitor')) group = 'world-monitor';
    else if (text.includes('source:aihot') || text.includes('aihot')) group = 'aihot';
    else if (text.includes('source:public-anchor')) group = 'public-anchor';
    else if (text.includes('rss') || text.includes('source-feed') || text.includes('source:selected-source')) group = 'rss-api-pool';
    sourceGroups[group] = (sourceGroups[group] || 0) + 1;
  }
  return {
    total_signals: signals.length,
    by_scene: byScene,
    by_source_group: sourceGroups,
    clustered_count: clustered.length,
    max_related_count: Math.max(
      0,
      ...clustered.map((signal) => {
        const tag = (signal.alignmentTags || []).find((item) => String(item).startsWith('event:related-count:'));
        return Number(String(tag || '').split(':').pop()) || 0;
      }),
    ),
    cluster_samples: clustered.slice(0, 12).map((signal) => ({
      title: signal.title,
      source_name: signal.sourceName,
      scene: signal.scene,
      event_tags: (signal.alignmentTags || []).filter((tag) => String(tag).startsWith('event:')),
    })),
  };
}

function funnelRows(f) {
  const afterSource = f.emitted - f.sourceCollapsed;
  const lowInfoRemoved = afterSource - f.publishable;
  const afterExact = f.kept - f.exactCollapsed;
  return [
    `| raw emitted | ${f.emitted} |  |  | all rows collected before source stability |`,
    `| source stability | ${afterSource} | ${f.sourceCollapsed} | ${pct(f.sourceCollapsed, f.emitted)} | per-source burst/literature/source-feed policy |`,
    `| publishable after model/low-info | ${f.publishable} | ${lowInfoRemoved} | ${pct(lowInfoRemoved, afterSource)} | model alignment plus low-info/source snapshot cleanup |`,
    `| intake scoring kept | ${f.kept} | ${f.publishable - f.kept} | ${pct(f.publishable - f.kept, f.publishable)} | archive decision by secondary scoring |`,
    `| exact dedupe | ${afterExact} | ${f.exactCollapsed} | ${pct(f.exactCollapsed, f.kept)} | same URL/signature |`,
    `| event clustering | ${f.loaded} | ${f.eventCollapsed} | ${pct(f.eventCollapsed, afterExact)} | same-event fold; clusters=${f.eventClusters} |`,
  ];
}

function buildMarkdown(payload) {
  const lines = [
    `# World stage funnel audit (${payload.day_key})`,
    '',
    `Log: ${payload.log_path}`,
    `Cache: ${payload.cache_path}`,
    '',
    '## Funnel',
    '',
    '| stage | remaining | removed | removed % vs previous | note |',
    '| --- | ---: | ---: | ---: | --- |',
  ];
  if (payload.latest_funnel) {
    lines.push(...funnelRows(payload.latest_funnel));
  } else {
    lines.push('| unavailable |  |  |  | no matching loadSignals log found |');
  }
  if (payload.all_funnels.length > 1) {
    lines.push('', '## All Refresh Runs', '');
    for (const run of payload.all_funnels) {
      lines.push(`### Run ${run.run}`, '', '| stage | remaining | removed | removed % vs previous | note |', '| --- | ---: | ---: | ---: | --- |', ...funnelRows(run), '');
    }
  }
  lines.push('', '## Final Cache', '', '```json', JSON.stringify(payload.cache_summary, null, 2), '```', '');
  return lines.join('\n');
}

async function main() {
  const logText = await fs.readFile(logPath, 'utf8').catch(() => '');
  const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  const allFunnels = parseFunnelLogs(logText);
  const payload = {
    generated_at: new Date().toISOString(),
    day_key: dayKey(),
    log_path: logPath,
    cache_path: cachePath,
    all_funnels: allFunnels,
    latest_funnel: allFunnels.at(-1) || null,
    cache_summary: summarizeCache(cache),
  };
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `stage-funnel-audit-${payload.day_key}.json`);
  const mdPath = path.join(outputDir, `stage-funnel-audit-${payload.day_key}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(payload));
  console.log(JSON.stringify({ jsonPath, mdPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
