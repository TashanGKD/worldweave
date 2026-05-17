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
const baseUrl = String(cliArgs.baseUrl || process.env.WORLD_INTAKE_AUDIT_BASE_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
const scenes = String(cliArgs.scenes || 'geo-politics-daily,tech-ai')
  .split(',')
  .map((scene) => scene.trim())
  .filter(Boolean);
const fresh = cliArgs.fresh === '1' || cliArgs.fresh === 'true';
const outputDir = path.join(process.cwd(), 'research', 'source-skill-validation');

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function extractTaggedString(tags, prefix) {
  const normalizedPrefix = normalizeTag(prefix);
  const tag = (tags || []).map(normalizeTag).find((item) => item.startsWith(normalizedPrefix));
  return tag ? tag.slice(normalizedPrefix.length) || null : null;
}

function extractTaggedNumber(tags, prefix) {
  const value = extractTaggedString(tags, prefix);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectSignals(state) {
  const rows = [
    ...(Array.isArray(state.top_signals) ? state.top_signals : []),
    ...(Array.isArray(state.graph_signals) ? state.graph_signals : []),
    ...(Array.isArray(state.graph?.nodes) ? state.graph.nodes.map((node) => node?.signal).filter(Boolean) : []),
    ...(Array.isArray(state.knowledge_signals) ? state.knowledge_signals : []),
    ...(Array.isArray(state.knowledge_items) ? state.knowledge_items : []),
  ];
  return [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()];
}

function signalText(signal) {
  return [
    signal.source_name,
    signal.source_url,
    signal.title,
    signal.summary,
    signal.display_title,
    signal.display_summary,
    ...(signal.tags || []),
    ...(signal.alignment_tags || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function sourceGroup(signal) {
  const text = normalizeTag(signalText(signal));
  if (/source:aihot|aihot|ai-hot/.test(text)) return 'aihot';
  if (/source:world-monitor|world-monitor|wm:intensity|wm:mentions/.test(text)) return 'world-monitor';
  if (/source:catalog-source|catalog-source|rss|atom|source-feed/.test(text)) return 'rss-api-pool';
  if (/source:public-anchor|treasury|openfda|arxiv/.test(text)) return 'public-anchor';
  return 'other';
}

function scorePair(signal) {
  const tags = signal.alignment_tags || [];
  const upstreamScore = typeof signal.upstream_score === 'number' ? signal.upstream_score : extractTaggedNumber(tags, 'upstream:score:');
  const intakeScore = typeof signal.intake_score === 'number' ? signal.intake_score : extractTaggedNumber(tags, 'intake:score:');
  const intakeDecision = signal.intake_decision || extractTaggedString(tags, 'intake:decision:');
  const intakeTier = signal.intake_tier || extractTaggedString(tags, 'intake:tier:');
  if (typeof upstreamScore !== 'number' || typeof intakeScore !== 'number') return null;
  return {
    id: signal.id,
    title: signal.display_title || signal.title || '',
    source_name: signal.source_name || '',
    source_group: sourceGroup(signal),
    upstream_score: upstreamScore,
    intake_score: intakeScore,
    delta: intakeScore - upstreamScore,
    intake_decision: intakeDecision,
    intake_tier: intakeTier,
    relevance_score: signal.relevance_score ?? null,
    hotspot_score: signal.hotspot_score ?? null,
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pearson(rows) {
  if (rows.length < 2) return null;
  const xs = rows.map((row) => row.upstream_score);
  const ys = rows.map((row) => row.intake_score);
  const avgX = average(xs);
  const avgY = average(ys);
  const numerator = rows.reduce((sum, _row, index) => sum + (xs[index] - avgX) * (ys[index] - avgY), 0);
  const denomX = Math.sqrt(xs.reduce((sum, value) => sum + (value - avgX) ** 2, 0));
  const denomY = Math.sqrt(ys.reduce((sum, value) => sum + (value - avgY) ** 2, 0));
  if (!denomX || !denomY) return null;
  return numerator / (denomX * denomY);
}

function summarizeRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const existing = groups.get(row.source_group) || [];
    existing.push(row);
    groups.set(row.source_group, existing);
  }
  const bySourceGroup = {};
  for (const [group, groupRows] of groups.entries()) {
    bySourceGroup[group] = summarizeGroup(groupRows);
  }
  return {
    count: rows.length,
    pearson: round(pearson(rows), 3),
    avg_upstream_score: round(average(rows.map((row) => row.upstream_score)), 1),
    avg_intake_score: round(average(rows.map((row) => row.intake_score)), 1),
    avg_delta: round(average(rows.map((row) => row.delta)), 1),
    aligned_count: rows.filter((row) => Math.abs(row.delta) <= 10).length,
    upgraded_count: rows.filter((row) => row.delta > 10).length,
    downgraded_count: rows.filter((row) => row.delta < -10).length,
    missing_score_count: 0,
    by_source_group: bySourceGroup,
    largest_upgrades: [...rows].sort((a, b) => b.delta - a.delta).slice(0, 8),
    largest_downgrades: [...rows].sort((a, b) => a.delta - b.delta).slice(0, 8),
  };
}

function summarizeGroup(rows) {
  return {
    count: rows.length,
    pearson: round(pearson(rows), 3),
    avg_upstream_score: round(average(rows.map((row) => row.upstream_score)), 1),
    avg_intake_score: round(average(rows.map((row) => row.intake_score)), 1),
    avg_delta: round(average(rows.map((row) => row.delta)), 1),
    aligned_count: rows.filter((row) => Math.abs(row.delta) <= 10).length,
    upgraded_count: rows.filter((row) => row.delta > 10).length,
    downgraded_count: rows.filter((row) => row.delta < -10).length,
  };
}

function round(value, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchState(scene) {
  const url = new URL(`/api/v1/world/state`, baseUrl);
  url.searchParams.set('scene', scene);
  if (fresh) {
    url.searchParams.set('fresh', '1');
    url.searchParams.set('batch', '1');
    url.searchParams.set('rebuild', '1');
  }
  const response = await fetch(url, {
    headers: fresh ? { 'x-world-batch-refresh': '1' } : {},
    signal: AbortSignal.timeout(fresh ? 120000 : 30000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${scene} state failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

function markdownReport(payload) {
  const lines = [
    `# World intake scoring audit (${payload.generated_at.slice(0, 10)})`,
    '',
    `Base URL: ${payload.base_url}`,
    `Fresh rebuild: ${payload.fresh ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    '| scene | scored | pearson | avg upstream | avg intake | avg delta | aligned | upgraded | downgraded |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [scene, summary] of Object.entries(payload.scenes)) {
    lines.push(
      `| ${scene} | ${summary.count} | ${summary.pearson ?? ''} | ${summary.avg_upstream_score ?? ''} | ${summary.avg_intake_score ?? ''} | ${summary.avg_delta ?? ''} | ${summary.aligned_count} | ${summary.upgraded_count} | ${summary.downgraded_count} |`,
    );
  }
  lines.push('', '## Source Groups', '');
  for (const [scene, summary] of Object.entries(payload.scenes)) {
    lines.push(`### ${scene}`, '');
    lines.push('| group | scored | pearson | avg upstream | avg intake | avg delta | aligned | upgraded | downgraded |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const [group, groupSummary] of Object.entries(summary.by_source_group)) {
      lines.push(
        `| ${group} | ${groupSummary.count} | ${groupSummary.pearson ?? ''} | ${groupSummary.avg_upstream_score ?? ''} | ${groupSummary.avg_intake_score ?? ''} | ${groupSummary.avg_delta ?? ''} | ${groupSummary.aligned_count} | ${groupSummary.upgraded_count} | ${groupSummary.downgraded_count} |`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const payload = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    fresh,
    scenes: {},
  };
  for (const scene of scenes) {
    const state = await fetchState(scene);
    const signals = collectSignals(state);
    const rows = signals.map(scorePair).filter(Boolean);
    const missingScoreCount = signals.length - rows.length;
    payload.scenes[scene] = {
      ...summarizeRows(rows),
      total_signal_count: signals.length,
      missing_score_count: missingScoreCount,
    };
  }
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(outputDir, `intake-scoring-audit-${stamp}.json`);
  const mdPath = path.join(outputDir, `intake-scoring-audit-${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await fs.writeFile(mdPath, markdownReport(payload), 'utf-8');
  console.log(JSON.stringify({ jsonPath, mdPath, scenes: Object.keys(payload.scenes) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
