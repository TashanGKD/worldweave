import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'research', 'source-skill-validation');
const reportDate = process.argv.includes('--report-date')
  ? process.argv[process.argv.indexOf('--report-date') + 1]
  : new Date().toISOString().slice(0, 10);

const SOURCES = [
  {
    collection: 'public-apis',
    url: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md',
    kind: 'public-api-directory',
  },
  {
    collection: 'awesome-ai-in-finance',
    url: 'https://raw.githubusercontent.com/georgezouq/awesome-ai-in-finance/main/README.md',
    kind: 'finance-ai-directory',
  },
];

const PUBLIC_APIS_TARGET_SECTIONS = new Set([
  'Blockchain',
  'Cryptocurrency',
  'Currency Exchange',
  'Environment',
  'Finance',
  'Geocoding',
  'Government',
  'News',
  'Science & Math',
  'Transportation',
  'Weather',
]);

const AWESOME_FINANCE_TARGET_SECTIONS = new Set([
  'Agents',
  'Skills',
  'Strategies & Research',
  'Data Sources',
  'Research Tools',
  'Trading System',
  'Exchange API',
]);

function normalizeRoot() {
  return path.resolve(root);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
      'User-Agent': 'world-source-directory-refresh/1.0',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
}

function stripMarkdown(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[`?([^`\]]+)`?\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdownLink(text) {
  const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!match) return null;
  return {
    name: stripMarkdown(match[1]),
    url: match[2].trim(),
  };
}

function sourceRoleForPublicApis(section) {
  if (['Finance', 'Cryptocurrency', 'Currency Exchange'].includes(section)) return 'market-signal';
  if (['Government', 'Science & Math'].includes(section)) return 'macro-regulatory';
  if (['Weather', 'Environment', 'Transportation', 'Geocoding'].includes(section)) return 'world-context';
  if (section === 'News') return 'hotspot-discovery';
  return 'source-discovery';
}

function sourceRoleForAwesomeFinance(section) {
  if (['Data Sources', 'Exchange API'].includes(section)) return 'market-signal';
  if (section === 'Skills') return 'source-skill';
  if (['Agents', 'Trading System'].includes(section)) return 'agent-workflow';
  return 'method-reference';
}

function parsePublicApis(markdown) {
  const rows = [];
  let section = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      section = stripMarkdown(heading[1]);
      continue;
    }
    if (!section || !PUBLIC_APIS_TARGET_SECTIONS.has(section)) continue;
    const line = rawLine.trim();
    if (!line.startsWith('|') || /^\|\s*API\s*\|/i.test(line) || /^\|\s*-+/.test(line)) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    const link = extractMarkdownLink(cells[0] || '');
    if (!link) continue;
    rows.push({
      collection: 'public-apis',
      section,
      name: link.name,
      url: link.url,
      description: stripMarkdown(cells[1] || ''),
      auth: stripMarkdown(cells[2] || ''),
      https: stripMarkdown(cells[3] || ''),
      source_role: sourceRoleForPublicApis(section),
      admission: ['No', ''].includes(stripMarkdown(cells[2] || '')) ? 'candidate-no-key' : 'candidate-keyed',
    });
  }
  return rows;
}

function parseAwesomeFinance(markdown) {
  const rows = [];
  let section = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = stripMarkdown(heading[1]);
      continue;
    }
    if (!section || !AWESOME_FINANCE_TARGET_SECTIONS.has(section)) continue;
    const line = rawLine.trim();
    if (!/^[-*]\s+\[/.test(line)) continue;
    const link = extractMarkdownLink(line);
    if (!link) continue;
    const description = stripMarkdown(line.replace(/^[-*]\s+\[[^\]]+\]\([^)]+\)\s*[-—:]?\s*/, ''));
    rows.push({
      collection: 'awesome-ai-in-finance',
      section,
      name: link.name,
      url: link.url,
      description,
      auth: '',
      https: link.url.startsWith('https://') ? 'Yes' : 'Unknown',
      source_role: sourceRoleForAwesomeFinance(section),
      admission: ['Data Sources', 'Exchange API', 'Skills'].includes(section) ? 'candidate-source' : 'candidate-method',
    });
  }
  return rows;
}

function rankCandidate(candidate) {
  let score = 0;
  if (candidate.admission === 'candidate-no-key' || candidate.admission === 'candidate-source') score += 4;
  if (/api|data|feed|rss|market|news|filing|price|quote|weather|government|SEC|exchange/i.test(`${candidate.name} ${candidate.description}`)) score += 3;
  if (/github\.com|docs|api|data|gov|finance|weather|coin|sec/i.test(candidate.url)) score += 2;
  if (/No/i.test(candidate.auth)) score += 1;
  return score;
}

function toMarkdown(candidates, meta) {
  const lines = [
    '# GitHub 目录型信源候选拆解',
    '',
    `更新时间：${meta.generated_at}`,
    '',
    '说明：本文件只记录“从目录中拆出的候选入口”。目录本身不进入实时信号，只有后续验证过的 API / RSS / 数据集 / 官方文档才进入正式信源池。',
    '',
    `- public-apis 候选：${meta.by_collection['public-apis'] || 0}`,
    `- awesome-ai-in-finance 候选：${meta.by_collection['awesome-ai-in-finance'] || 0}`,
    '',
    '| collection | section | name | role | admission | url | description |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const item of candidates.slice(0, 120)) {
    lines.push(
      `| ${item.collection} | ${item.section} | ${item.name.replace(/\|/g, '/')} | ${item.source_role} | ${item.admission} | ${item.url} | ${item.description.replace(/\|/g, '/')} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const fetched = [];
  for (const source of SOURCES) {
    const markdown = await fetchText(source.url);
    fetched.push({ ...source, markdown });
  }
  const candidates = [
    ...parsePublicApis(fetched.find((item) => item.collection === 'public-apis')?.markdown || ''),
    ...parseAwesomeFinance(fetched.find((item) => item.collection === 'awesome-ai-in-finance')?.markdown || ''),
  ]
    .map((candidate) => ({ ...candidate, score: rankCandidate(candidate) }))
    .sort((a, b) => b.score - a.score || a.collection.localeCompare(b.collection) || a.name.localeCompare(b.name));

  const meta = {
    generated_at: new Date().toISOString(),
    repo_root: normalizeRoot(),
    source_urls: SOURCES.map((source) => source.url),
    total: candidates.length,
    by_collection: candidates.reduce((summary, candidate) => {
      summary[candidate.collection] = (summary[candidate.collection] || 0) + 1;
      return summary;
    }, {}),
    by_role: candidates.reduce((summary, candidate) => {
      summary[candidate.source_role] = (summary[candidate.source_role] || 0) + 1;
      return summary;
    }, {}),
  };

  const payload = {
    ...meta,
    candidates,
  };
  const jsonPath = path.join(outputDir, `directory-candidates-${reportDate}.json`);
  const mdPath = path.join(outputDir, `directory-candidates-${reportDate}.md`);
  const latestJsonPath = path.join(outputDir, 'latest-directory-candidates.json');
  const latestMdPath = path.join(outputDir, 'latest-directory-candidates.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, toMarkdown(candidates, meta), 'utf8');
  await fs.writeFile(latestJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(latestMdPath, toMarkdown(candidates, meta), 'utf8');
  console.log(`directory_candidates=${candidates.length} output=${jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
