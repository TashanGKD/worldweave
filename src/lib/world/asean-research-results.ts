import fs from 'node:fs/promises';
import path from 'node:path';

const STORE_FILE = path.join(process.cwd(), '.cache', 'asean-research-results.json');
const STORE_LIMIT = 24;

export type AseanResearchStoredSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type AseanResearchStoredResult = {
  id: string;
  question: string;
  content: string;
  created_at: string;
  model: string;
  references: AseanResearchStoredSource[];
  source_count: number;
};

function compactText(value: unknown, max = 800) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function publicResearchText(value: unknown, max = 800) {
  return compactText(value, max)
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .replace(/^冒烟测试[:：]\s*/u, '')
    .replace(/不应直接解释为电价预测或数据中心供电缺口预测/gu, '需与电价、供电和项目数据交叉核验后使用')
    .replace(/不等同于电价或供电缺口/gu, '需与电价和供电数据交叉核验')
    .replace(/XGBoost/gu, '时序预测')
    .replace(/\b(?:MAE|MAPE|RMSE|R²)\b/gu, '回看误差')
    .replace(/[，,；;。.]?\s*三段以内[。.]?/gu, '')
    .replace(/Malaysia OpenAPI Fuel Price/gu, '马来西亚公开燃油价格')
    .replace(/Malaysia OpenAPI Electricity Supply/gu, '马来西亚公开电力供应数据')
    .replace(/Malaysia OpenAPI Electricity Consumption/gu, '马来西亚公开用电数据')
    .replace(/Malaysia OpenAPI Industrial Production/gu, '马来西亚公开工业生产数据')
    .replace(/Malaysia OpenAPI/gu, '马来西亚公开数据');
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return url.replace(/^https?:\/\//u, '').split('/')[0] || '公开来源';
  }
}

function hasUnreadableSourceTitle(value: string) {
  const compact = value.replace(/\s+/gu, '');
  if (!compact) return true;
  if (/[�□]{1,}/u.test(compact)) return true;
  const mojibakeCount = (compact.match(/[\u00a0-\u00bf\u00c0-\u00ff]/gu) || []).length;
  if (compact.length >= 12 && mojibakeCount / compact.length > 0.18) return true;
  const unusualCount = [...compact].filter((char) => !/[\p{Script=Han}\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)).length;
  return compact.length >= 12 && unusualCount / compact.length > 0.16;
}

function readableSourceTitle(input: unknown, url: string) {
  const title = publicResearchText(input, 180);
  if (hasUnreadableSourceTitle(title)) {
    const host = sourceHost(url);
    return title.startsWith('[PDF]') || /\.pdf(?:$|\?)/iu.test(url)
      ? `[PDF] ${host} 公开资料`
      : `${host} 公开来源`;
  }
  return title;
}

function normalizeQuestionKey(value: unknown) {
  return publicResearchText(value, 360)
    .replace(/^研究问题：/u, '')
    .replace(/^请研究[:：]\s*/u, '')
    .replace(/^冒烟测试[:：]\s*/u, '')
    .replace(/能源成本(?:扰动)?预测结果?/gu, '燃油价格预测结果')
    .replace(/能源成本扰动预测/gu, '燃油价格预测')
    .replace(/[，,；;。.!！?？:：\s"'“”‘’`]+/gu, '')
    .toLowerCase();
}

function normalizeSource(value: unknown): AseanResearchStoredSource | null {
  const source = value as Record<string, unknown>;
  const url = compactText(source.url || source.link || source.href, 500);
  const title = readableSourceTitle(source.title || source.name || source.hostname || url, url);
  const snippet = publicResearchText(source.snippet || source.description || source.content, 260);
  if (!title && !url) return null;
  return { title: title || url, url, snippet };
}

function mergeSources(values: unknown[], max = 12) {
  const seen = new Set<string>();
  const sources: AseanResearchStoredSource[] = [];
  for (const raw of values) {
    const source = normalizeSource(raw);
    if (!source) continue;
    const key = (source.url || source.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
    if (sources.length >= max) break;
  }
  return sources;
}

async function readStoreFile() {
  try {
    const payload = JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')) as { results?: AseanResearchStoredResult[] };
    return Array.isArray(payload.results) ? payload.results : [];
  } catch {
    return [];
  }
}

export async function readAseanResearchResults(limit = 6) {
  const seen = new Set<string>();
  const results = [];
  for (const item of await readStoreFile()) {
    const key = normalizeQuestionKey(item.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= limit) break;
  }
  return results.map((item) => ({
    ...item,
    question: publicResearchText(item.question, 360),
    content: publicResearchText(item.content, 12000),
    model: '公开来源研判',
    references: item.references.map((source) => ({
      ...source,
      title: publicResearchText(source.title, 180),
      snippet: source.snippet ? publicResearchText(source.snippet, 260) : undefined,
    })),
  }));
}

export async function appendAseanResearchResult(input: {
  question: string;
  content: string;
  model: string;
  references?: unknown[];
  web_sites?: unknown[];
  source_count?: number;
}) {
  const content = publicResearchText(input.content, 12000);
  if (!content) return null;
  const now = new Date().toISOString();
  const sources = mergeSources([...(input.references || []), ...(input.web_sites || [])]);
  const item: AseanResearchStoredResult = {
    id: `asean-research:${Buffer.from(`${input.question}:${now}`).toString('base64url').slice(0, 18)}`,
    question: publicResearchText(input.question, 360),
    content,
    created_at: now,
    model: '公开来源研判',
    references: sources,
    source_count: Math.max(input.source_count || 0, sources.length),
  };
  const existing = await readStoreFile();
  const itemKey = normalizeQuestionKey(item.question);
  const deduped = existing.filter((result) => normalizeQuestionKey(result.question) !== itemKey);
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, `${JSON.stringify({ updated_at: now, results: [item, ...deduped].slice(0, STORE_LIMIT) }, null, 2)}\n`, 'utf-8');
  return item;
}
