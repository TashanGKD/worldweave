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

function lowInfoReason(signal) {
  const title = String(signal.title || '').trim();
  const summary = String(signal.summary || '').trim();
  const text = [title, summary, signal.sourceName, ...(signal.tags || []), ...(signal.alignmentTags || [])].join(' ');
  const visibleText = [title, summary].join(' ');
  if (!title && !summary) return 'empty-title-summary';
  if (/信源更新|结构化更新|世界新闻更新|Bundle Feed|Source Feed|Global Feed/i.test(title)) return 'source-snapshot-title';
  if (/当前接口返回了结构化|当前接口样本摘要|当前样本前几项包括|本轮前几条标题|标题清单|行情快照仅作背景参考/i.test(summary)) return 'source-snapshot-summary';
  if (
    /Location in headline|Source country match|Local news source|High Goldstein intensity|^\d+\s+events? at location$/iu.test(text) &&
    !/(attack|strike|missile|drone|outbreak|ceasefire|sanction|killed|death|deaths|evacuation|explosion|fire|clash|arrest|protest|爆炸|袭击|导弹|无人机|疫情|制裁|撤离|死亡|火灾|冲突|逮捕|抗议)/iu.test(visibleText)
  ) {
    return 'world-monitor-diagnostic-only';
  }
  if (signal.sourceName && title.toLowerCase() === String(signal.sourceName).toLowerCase() && summary.length < 80) return 'title-equals-source';
  return '';
}

function buildMarkdown(payload) {
  const lines = [
    `# World low-info survivor audit (${payload.day_key})`,
    '',
    `Cache: ${payload.cache_path}`,
    '',
    `Suspect survivors: ${payload.suspects.length}`,
    '',
  ];
  for (const item of payload.suspects.slice(0, 80)) {
    lines.push(
      `## ${item.title || item.id}`,
      '',
      `- reason: ${item.reason}`,
      `- source: ${item.source_name}`,
      `- scene: ${item.scene}`,
      `- score: ${item.relevance_score}`,
      '',
      item.summary || '',
      '',
    );
  }
  return lines.join('\n');
}

async function main() {
  const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  const signals = Array.isArray(cache.signals) ? cache.signals : [];
  const suspects = signals
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      summary: signal.summary,
      source_name: signal.sourceName,
      scene: signal.scene,
      relevance_score: signal.relevanceScore,
      reason: lowInfoReason(signal),
    }))
    .filter((item) => item.reason)
    .sort((left, right) => String(left.reason).localeCompare(String(right.reason)) || String(left.title).localeCompare(String(right.title), 'zh-CN'));
  const payload = {
    generated_at: new Date().toISOString(),
    day_key: dayKey(),
    cache_path: cachePath,
    suspect_count: suspects.length,
    suspects,
  };
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `low-info-survivor-audit-${payload.day_key}.json`);
  const mdPath = path.join(outputDir, `low-info-survivor-audit-${payload.day_key}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(payload));
  console.log(JSON.stringify({ jsonPath, mdPath, suspect_count: suspects.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
