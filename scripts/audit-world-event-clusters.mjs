import fs from 'node:fs/promises';
import path from 'node:path';

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
const cachePath = cliArgs.cache || '.cache/world-signal-cache-funnel-check.json';
const outputDir = path.join(process.cwd(), 'research', 'source-skill-validation');

function dayKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function eventTag(signal, prefix) {
  return (signal.alignmentTags || []).find((tag) => String(tag).startsWith(prefix)) || '';
}

function eventTagNumber(signal, prefix) {
  return Number(String(eventTag(signal, prefix)).split(':').pop()) || 0;
}

function eventClusters(cache) {
  return (Array.isArray(cache.signals) ? cache.signals : [])
    .filter((signal) => (signal.alignmentTags || []).includes('event:clustered'))
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      source_name: signal.sourceName,
      scene: signal.scene,
      related_count: eventTagNumber(signal, 'event:related-count:'),
      source_count: eventTagNumber(signal, 'event:source-count:'),
      primary_source: String(eventTag(signal, 'event:primary-source:')).replace(/^event:primary-source:/, ''),
      urgency_reason: signal.urgencyReason || '',
      cluster_notes: signal.clusterNotes || '',
      event_tags: (signal.alignmentTags || []).filter((tag) => String(tag).startsWith('event:')),
    }))
    .sort((left, right) => right.related_count - left.related_count || left.title.localeCompare(right.title, 'zh-CN'));
}

function buildMarkdown(payload) {
  const lines = [
    `# World event cluster audit (${payload.day_key})`,
    '',
    `Cache: ${payload.cache_path}`,
    '',
    `Clustered primary rows: ${payload.clusters.length}`,
    '',
  ];
  for (const cluster of payload.clusters) {
    lines.push(
      `## ${cluster.title}`,
      '',
      `- scene: ${cluster.scene}`,
      `- primary_source: ${cluster.primary_source || cluster.source_name}`,
      `- source_name: ${cluster.source_name}`,
      `- related_count: ${cluster.related_count}`,
      `- source_count: ${cluster.source_count}`,
      `- tags: ${cluster.event_tags.join(', ')}`,
      '',
      cluster.urgency_reason ? `reason: ${cluster.urgency_reason}` : '',
      '',
      cluster.cluster_notes ? '```text' : '',
      cluster.cluster_notes || '',
      cluster.cluster_notes ? '```' : '',
      '',
    );
  }
  return lines.filter((line, index, arr) => line || arr[index - 1]).join('\n');
}

async function main() {
  const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  const payload = {
    generated_at: new Date().toISOString(),
    day_key: dayKey(),
    cache_path: cachePath,
    clusters: eventClusters(cache),
  };
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `event-cluster-audit-${payload.day_key}.json`);
  const mdPath = path.join(outputDir, `event-cluster-audit-${payload.day_key}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(payload));
  console.log(JSON.stringify({ jsonPath, mdPath, clusters: payload.clusters.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
