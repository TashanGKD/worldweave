import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  WorldSourceCatalog,
  WorldSourceCatalogIntakeCandidate,
  WorldSourceAdmissionTier,
  WorldSourceCatalogHub,
  WorldSourceCatalogOverflowPool,
  WorldSourceCatalogSkill,
  WorldSourceCatalogSource,
  WorldScene,
} from './types';

export type RuntimeCatalogSource = {
  skill_name: string;
  source_platform: string;
  admission_tier: WorldSourceAdmissionTier;
  recommended_scene: WorldScene;
  integration_shape: string | null;
  source_name: string;
  url: string;
  source_type: string;
  connectivity: string;
  note: string;
};

type SourceBundleSummary = {
  date?: string;
  completion_stage?: string;
  high_value_total?: number;
  endpoint_covered?: number;
  site_covered?: number;
  uncovered?: number;
  connectivity_counts?: {
    direct?: number;
    unstable?: number;
    blocked_or_unknown?: number;
  };
};

type SourceBundleSkill = {
  name?: string;
  source_platform?: string;
  url?: string;
  skill_type?: string;
  visible_sources?: string;
  validation_status?: string | null;
  candidate_role_for_xia_report?: string | null;
  integration_shape?: string | null;
  priority_for_poc?: string | null;
};

type SourceBundleSource = {
  skill?: string;
  source_name?: string;
  url?: string;
  source_type?: string;
  connectivity?: string;
  note?: string;
};

type InkwellSnapshot = {
  generated_at?: string;
  source_platform?: string;
  skill?: SourceBundleSkill;
  summary?: {
    source_count?: number;
    category_counts?: Array<{ category?: string; count?: number }>;
  };
  sources?: Array<{
    id?: string;
    name?: string;
    url?: string;
    category?: string;
    html_url?: string;
    source_type?: string;
    connectivity?: string;
    note?: string;
  }>;
};

type SkillHubIndexRow = {
  platform_name: string;
  url: string;
  platform_type: string;
  domestic_ip_access: string;
  content_visibility: string;
  searchability: string;
  signal_skill_density: string;
  worth_tracking: string;
  notes: string;
};

type SkillHubIndexParseResult = {
  updatedAt: string | null;
  hubs: SkillHubIndexRow[];
};

function resolveResearchRoot() {
  return path.resolve(process.cwd(), 'research');
}

const RESEARCH_ROOT = resolveResearchRoot();
const SOURCE_SKILL_BUNDLES_DIR = path.join(RESEARCH_ROOT, 'source-skill-bundles');
const SKILLHUB_INDEX_FILE = path.join(RESEARCH_ROOT, 'skill-aggregator-index.md');
const INKWELL_SNAPSHOT_FILE = path.join(RESEARCH_ROOT, 'inkwell-rss-snapshot.json');
const CURATED_FEEDS_DIR = path.join(RESEARCH_ROOT, 'curated-feeds');
const SOURCE_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

const SOURCE_PLATFORM_ALIASES: Record<string, string> = {
  skillshubai: 'skills-hub.ai',
  skillshubaiscientificskills: 'skills-hub.ai',
  skillshubaifinanceskillscnen: 'skills-hub.ai',
  skillshubaifinanceskills: 'skills-hub.ai',
  skillshubaiopenskills: 'skills-hub.ai',
  financeskillscnen: 'skills-hub.ai',
  financeskills: 'skills-hub.ai',
  scientificskills: 'skills-hub.ai',
  clawhubecosystem: 'ClawHub',
  mcpmarket: 'MCPMarket Agent Skills',
  voltagent: 'VoltAgent awesome-openclaw-skills',
  sundial: 'sundial awesome-openclaw-skills',
};

let sourceCatalogCache: { expiresAt: number; value: WorldSourceCatalog | null } | null = null;

export function clearSourceCatalogCache() {
  sourceCatalogCache = null;
}

function normalizeCatalogKey(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function textOrEmpty(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function connectivityRank(value: string) {
  if (value === 'direct') return 0;
  if (value === 'unstable') return 1;
  if (value === 'blocked_or_unknown') return 2;
  return 3;
}

function priorityRank(value: string | null | undefined) {
  if (value === 'p0') return 0;
  if (value === 'p1') return 1;
  if (value === 'p2') return 2;
  return 3;
}

function compareSkills(left: WorldSourceCatalogSkill, right: WorldSourceCatalogSkill) {
  return (
    priorityRank(left.priority_for_poc) - priorityRank(right.priority_for_poc) ||
    right.runnable_source_count - left.runnable_source_count ||
    right.usable_source_count - left.usable_source_count ||
    left.name.localeCompare(right.name, 'zh-CN')
  );
}

function compareHubs(left: WorldSourceCatalogHub, right: WorldSourceCatalogHub) {
  return (
    Number(right.source_skill_count > 0) - Number(left.source_skill_count > 0) ||
    right.source_skill_count - left.source_skill_count ||
    right.usable_source_count - left.usable_source_count ||
    Number(right.worth_tracking === 'yes') - Number(left.worth_tracking === 'yes') ||
    left.platform_name.localeCompare(right.platform_name, 'zh-CN')
  );
}

function isStructuredSourceType(sourceType: string) {
  return ['api', 'api-json', 'webpage-json', 'rss', 'atom'].includes(sourceType);
}

function isRuntimeRunnableSource(source: WorldSourceCatalogSource) {
  const sourceType = textOrEmpty(source.source_type).toLowerCase();
  const url = textOrEmpty(source.url).toLowerCase();
  const note = textOrEmpty(source.note).toLowerCase();
  const name = textOrEmpty(source.source_name).toLowerCase();

  if (source.connectivity !== 'direct') {
    return false;
  }

  if (!isStructuredSourceType(sourceType)) {
    return false;
  }

  if (
    url.includes('apikey=demo') ||
    url.includes('/docs') ||
    url.includes('/support') ||
    name.includes('docs') ||
    note.includes('demo') ||
    note.includes('示例') ||
    note.includes('文档')
  ) {
    return false;
  }

  return true;
}

function isRuntimeIngestibleSource(source: WorldSourceCatalogSource) {
  const sourceType = textOrEmpty(source.source_type).toLowerCase();
  const url = textOrEmpty(source.url).toLowerCase();
  const name = textOrEmpty(source.source_name).toLowerCase();
  const note = textOrEmpty(source.note).toLowerCase();

  if (!isRuntimeRunnableSource(source)) {
    return false;
  }

  if (!['api', 'api-json', 'api-text', 'rss', 'atom'].includes(sourceType)) {
    return false;
  }

  if (
    url.includes('/ping') ||
    name.includes('ping') ||
    url.includes('apikey=demo') ||
    name.includes('demo') ||
    note.includes('demo') ||
    url.includes('duckduckgo.com') ||
    url.includes('baidu.com') ||
    url.includes('jina.ai') ||
    name.includes('search') ||
    note.includes('搜索入口')
  ) {
    return false;
  }

  return true;
}

function compareOverflowPools(left: WorldSourceCatalogOverflowPool, right: WorldSourceCatalogOverflowPool) {
  return (
    right.source_skill_count - left.source_skill_count ||
    right.usable_source_count - left.usable_source_count ||
    left.platform_name.localeCompare(right.platform_name, 'zh-CN')
  );
}

function compareIntakeCandidates(left: WorldSourceCatalogSkill, right: WorldSourceCatalogSkill) {
  const tierRank = (value: WorldSourceAdmissionTier) => {
    if (value === 'anchor') return 0;
    if (value === 'context') return 1;
    if (value === 'weak_signal') return 2;
    return 3;
  };

  return (
    tierRank(left.admission_tier) - tierRank(right.admission_tier) ||
    priorityRank(left.priority_for_poc) - priorityRank(right.priority_for_poc) ||
    right.usable_source_count - left.usable_source_count ||
    left.name.localeCompare(right.name, 'zh-CN')
  );
}

function buildSkillHaystack(rawSkill: SourceBundleSkill, sources: WorldSourceCatalogSource[]) {
  return [
    rawSkill.source_platform,
    rawSkill.skill_type,
    rawSkill.visible_sources,
    rawSkill.candidate_role_for_xia_report,
    rawSkill.integration_shape,
    ...sources.flatMap((source) => [source.source_name, source.source_type, source.note, source.url]),
  ]
    .map((value) => textOrEmpty(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function resolveRecommendedScene(rawSkill: SourceBundleSkill, sources: WorldSourceCatalogSource[]): WorldScene {
  const haystack = buildSkillHaystack(rawSkill, sources);

  if (/(reddit|x\.com|twitter|bluesky|polymarket|truth social|truthsocial|hacker news|youtube|tiktok|instagram|forum|community|social)/.test(haystack)) {
    return 'weak-signal';
  }
  if (/(outbreak|virus|disease|health|who|cdc|clinical|vaccine|biosecurity|medrxiv|biorxiv|hospital)/.test(haystack)) {
    return 'health';
  }
  if (/(war|military|conflict|security|missile|border|defense|sanction|diplom|battlefield)/.test(haystack)) {
    return 'war';
  }
  if (/(market|equity|stock|bond|bank|finance|earnings|sec|edgar|treasury|fred|world bank|nse|macro|fiscal|price|quote|trading|crypto)/.test(haystack)) {
    return 'finance';
  }
  if (/(supply|shipping|logistics|factory|manufacturing|capacity|commodity|energy|oil|lng|refinery|pipeline)/.test(haystack)) {
    return 'capacity';
  }
  if (/(ai|llm|model|paper|arxiv|openalex|semantic scholar|crossref|hugging face|chip|gpu|technology|science|literature|preprint|lab)/.test(haystack)) {
    return 'technology';
  }

  return 'global';
}

function resolveAdmissionTier(rawSkill: SourceBundleSkill, sources: WorldSourceCatalogSource[]): WorldSourceAdmissionTier {
  if (sources.length === 0) {
    return 'blocked';
  }

  const haystack = buildSkillHaystack(rawSkill, sources);
  const hasDirect = sources.some((source) => source.connectivity === 'direct');
  const runnableSourceCount = sources.filter(isRuntimeRunnableSource).length;
  const weakSignal = /(reddit|x\.com|twitter|bluesky|polymarket|truth social|truthsocial|hacker news|youtube|tiktok|instagram|social|forum)/.test(
    haystack,
  );
  const officialData = /(sec|edgar|treasury|fred|world bank|companyfacts|submissions|nse|alpha vantage|finnhub|twelvedata|fiscal data|api|openalex|crossref|semantic scholar|unpaywall|fda|uspto)/.test(
    haystack,
  );

  if (weakSignal) {
    return 'weak_signal';
  }

  if (rawSkill.integration_shape === 'tooling-reference' && !hasDirect) {
    return 'blocked';
  }

  if (rawSkill.integration_shape === 'direct-source' && runnableSourceCount > 0 && officialData) {
    return 'anchor';
  }

  if (rawSkill.integration_shape === 'direct-source' && hasDirect) {
    return 'context';
  }

  if (rawSkill.integration_shape === 'aggregator-layer') {
    return weakSignal ? 'weak_signal' : 'context';
  }

  return hasDirect ? 'context' : 'blocked';
}

function splitPlatformTokens(value: string | null | undefined) {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of String(value || '')) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
    }

    if ((char === '/' || char === '+') && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return Array.from(new Set(tokens));
}

function parseSkillhubIndex(markdown: string): SkillHubIndexParseResult {
  const lines = markdown.split(/\r?\n/);
  const updatedAtMatch = markdown.match(/更新时间：([0-9-]+)/);
  const hubs: SkillHubIndexRow[] = [];
  let inMainTable = false;

  for (const line of lines) {
    if (line.startsWith('## 主表')) {
      inMainTable = true;
      continue;
    }

    if (inMainTable && line.startsWith('## ')) {
      break;
    }

    if (!inMainTable || !line.startsWith('|') || /^\|---/.test(line)) {
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells[0] === 'platform_name' || cells.length < 9) {
      continue;
    }

    hubs.push({
      platform_name: cells[0],
      url: cells[1],
      platform_type: cells[2],
      domestic_ip_access: cells[3],
      content_visibility: cells[4],
      searchability: cells[5],
      signal_skill_density: cells[6],
      worth_tracking: cells[7],
      notes: cells[8],
    });
  }

  return {
    updatedAt: updatedAtMatch?.[1] || null,
    hubs,
  };
}

async function resolveLatestBundleDir() {
  const entries = await fs.readdir(SOURCE_SKILL_BUNDLES_DIR, { withFileTypes: true });
  const bundleDirs = entries
    .filter((entry) => entry.isDirectory() && /^source-skill-bundle-\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  return bundleDirs[0] ? path.join(SOURCE_SKILL_BUNDLES_DIR, bundleDirs[0]) : null;
}

async function readJsonFile<T>(filePath: string) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

async function readOptionalJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function appendInkwellSnapshot(
  rawSkills: SourceBundleSkill[],
  rawSources: SourceBundleSource[],
  snapshot: InkwellSnapshot | null,
) {
  if (!snapshot?.skill || !Array.isArray(snapshot.sources) || snapshot.sources.length === 0) {
    return { rawSkills, rawSources };
  }

  const skillName = textOrEmpty(snapshot.skill.name) || 'inkwell-rss-reader';
  const nextSkills = [
    ...rawSkills,
    {
      ...snapshot.skill,
      name: skillName,
      source_platform: textOrEmpty(snapshot.skill.source_platform) || 'Inkwell',
      url: textOrEmpty(snapshot.skill.url) || 'https://inkwell.coze.site/skill.md',
      visible_sources: textOrEmpty(snapshot.skill.visible_sources) || `${snapshot.sources.length} curated RSS/Atom feeds`,
      validation_status: snapshot.skill.validation_status || 'verified',
      candidate_role_for_xia_report: snapshot.skill.candidate_role_for_xia_report || 'high-quality source-feed supplement',
      integration_shape: snapshot.skill.integration_shape || 'aggregator-layer',
      priority_for_poc: snapshot.skill.priority_for_poc || 'p1',
    },
  ];

  const nextSources = [
    ...rawSources,
    ...snapshot.sources.map<SourceBundleSource>((source) => ({
      skill: skillName,
      source_name: textOrEmpty(source.name) || 'Inkwell source',
      url: textOrEmpty(source.url) || textOrEmpty(source.html_url),
      source_type: textOrEmpty(source.source_type) || 'rss',
      connectivity: textOrEmpty(source.connectivity) || 'direct',
      note: textOrEmpty(source.note) || `Inkwell curated source (${textOrEmpty(source.category) || 'General'}).`,
    })),
  ];

  return {
    rawSkills: nextSkills,
    rawSources: nextSources,
  };
}

function resolveHubName(token: string, hubLookup: Map<string, string>) {
  const normalized = normalizeCatalogKey(token);
  if (!normalized) {
    return null;
  }

  const alias = SOURCE_PLATFORM_ALIASES[normalized];
  if (alias) {
    return alias;
  }

  const exact = hubLookup.get(normalized);
  if (exact) {
    return exact;
  }

  const matches = Array.from(hubLookup.entries())
    .filter(([hubKey]) => normalized.includes(hubKey) || hubKey.includes(normalized))
    .map(([, hubName]) => hubName);

  return matches.length === 1 ? matches[0] : null;
}

async function readCuratedFeedList(fileName: string) {
  try {
    const content = await fs.readFile(path.join(CURATED_FEEDS_DIR, fileName), 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('http'));
  } catch {
    return [];
  }
}

async function appendCuratedFeedBundles(rawSkills: SourceBundleSkill[], rawSources: SourceBundleSource[]) {
  const [worldCore, iranWatch] = await Promise.all([
    readCuratedFeedList('shunyanet-world-core.txt'),
    readCuratedFeedList('shunyanet-iran-watch.txt'),
  ]);

  const nextSkills = [...rawSkills];
  const nextSources = [...rawSources];

  const bundles = [
    {
      skillName: 'ShunyaNet Sentinel World Core Bundle',
      url: 'research/curated-feeds/shunyanet-world-core.txt',
      skillType: 'curated rss bundle / world core',
      visibleSources: 'BBC/AP/NBC/NYT/CNN/GDACS/USGS/FEMA/FAA/Newswise + selected Reddit/Bluesky weak signals',
      role: 'hotspot discovery / curated world rss bundle',
      integrationShape: 'direct-source',
      priority: 'p1',
      sources: worldCore,
    },
    {
      skillName: 'ShunyaNet Sentinel Iran Watch Bundle',
      url: 'research/curated-feeds/shunyanet-iran-watch.txt',
      skillType: 'curated rss bundle / iran middle east watch',
      visibleSources: 'Crisis Group/France24/NYT MiddleEast/Mehr/JPost/The Hindu/Times of India/Washington Post',
      role: 'regional watch / iran middle east conflict rss bundle',
      integrationShape: 'direct-source',
      priority: 'p1',
      sources: iranWatch,
    },
  ];

  for (const bundle of bundles) {
    if (bundle.sources.length === 0) {
      continue;
    }

    nextSkills.push({
      name: bundle.skillName,
      source_platform: 'ShunyaNet Sentinel Curated',
      url: bundle.url,
      skill_type: bundle.skillType,
      visible_sources: bundle.visibleSources,
      validation_status: 'partially_verified',
      candidate_role_for_xia_report: bundle.role,
      integration_shape: bundle.integrationShape,
      priority_for_poc: bundle.priority,
    });

    bundle.sources.forEach((url, index) => {
      nextSources.push({
        skill: bundle.skillName,
        source_name: `${bundle.skillName} Feed ${index + 1}`,
        url,
        source_type: url.includes('/rss') || url.endsWith('.rss') || url.endsWith('.xml') || url.includes('atom')
          ? 'rss'
          : 'webpage',
        connectivity: 'direct',
        note: `Curated from ${bundle.url} and maintained as a filtered ShunyaNet Sentinel derivative bundle.`,
      });
    });
  }

  return {
    rawSkills: nextSkills,
    rawSources: nextSources,
  };
}

function buildSkillEntry(rawSkill: SourceBundleSkill, sources: WorldSourceCatalogSource[]): WorldSourceCatalogSkill {
  const runnableSourceCount = sources.filter(isRuntimeRunnableSource).length;
  return {
    name: textOrEmpty(rawSkill.name) || '未命名 skill',
    source_platform: textOrEmpty(rawSkill.source_platform),
    url: textOrEmpty(rawSkill.url),
    skill_type: textOrEmpty(rawSkill.skill_type),
    visible_sources: textOrEmpty(rawSkill.visible_sources),
    validation_status: rawSkill.validation_status || null,
    candidate_role_for_xia_report: rawSkill.candidate_role_for_xia_report || null,
    integration_shape: rawSkill.integration_shape || null,
    priority_for_poc: rawSkill.priority_for_poc || null,
    admission_tier: resolveAdmissionTier(rawSkill, sources),
    recommended_scene: resolveRecommendedScene(rawSkill, sources),
    usable_source_count: sources.length,
    runnable_source_count: runnableSourceCount,
    sources,
  };
}

function buildCatalog(
  bundleName: string,
  summary: SourceBundleSummary,
  rawSkills: SourceBundleSkill[],
  rawSources: SourceBundleSource[],
  indexData: SkillHubIndexParseResult,
): WorldSourceCatalog {
  const hubLookup = new Map(
    indexData.hubs.map((hub) => [normalizeCatalogKey(hub.platform_name), hub.platform_name]),
  );
  const sourcesBySkill = new Map<string, WorldSourceCatalogSource[]>();

  for (const rawSource of rawSources) {
    const skillKey = normalizeCatalogKey(rawSource.skill);
    if (!skillKey) {
      continue;
    }

    const source: WorldSourceCatalogSource = {
      source_name: textOrEmpty(rawSource.source_name) || '未命名信源',
      url: textOrEmpty(rawSource.url),
      source_type: textOrEmpty(rawSource.source_type),
      connectivity: textOrEmpty(rawSource.connectivity) || 'unknown',
      note: textOrEmpty(rawSource.note),
    };

    const existing = sourcesBySkill.get(skillKey) || [];
    existing.push(source);
    sourcesBySkill.set(skillKey, existing);
  }

  for (const sources of sourcesBySkill.values()) {
    sources.sort(
      (left, right) =>
        connectivityRank(left.connectivity) - connectivityRank(right.connectivity) ||
        left.source_name.localeCompare(right.source_name, 'zh-CN'),
    );
  }

  const allSkillEntries = rawSkills.map((rawSkill) => ({
    rawSkill,
    skillEntry: buildSkillEntry(rawSkill, sourcesBySkill.get(normalizeCatalogKey(textOrEmpty(rawSkill.name))) || []),
  }));
  const hubBuckets = new Map<string, WorldSourceCatalogSkill[]>();
  const overflowBuckets = new Map<string, WorldSourceCatalogSkill[]>();

  for (const { rawSkill, skillEntry } of allSkillEntries) {
    const matchedHubs = new Set<string>();
    const unmatchedTokens = new Set<string>();

    for (const token of splitPlatformTokens(rawSkill.source_platform)) {
      const hubName = resolveHubName(token, hubLookup);
      if (hubName) {
        matchedHubs.add(hubName);
      } else if (token) {
        unmatchedTokens.add(token);
      }
    }

    if (matchedHubs.size === 0 && skillEntry.source_platform) {
      unmatchedTokens.add(skillEntry.source_platform);
    }

    for (const hubName of matchedHubs) {
      const existing = hubBuckets.get(hubName) || [];
      existing.push(skillEntry);
      hubBuckets.set(hubName, existing);
    }

    for (const token of unmatchedTokens) {
      const existing = overflowBuckets.get(token) || [];
      existing.push(skillEntry);
      overflowBuckets.set(token, existing);
    }
  }

  const hubs = indexData.hubs
    .map<WorldSourceCatalogHub>((hub) => {
      const sourceSkills = (hubBuckets.get(hub.platform_name) || []).sort(compareSkills);
      const uniqueSources = new Set(
        sourceSkills.flatMap((skill) =>
          skill.sources.map((source) => `${source.source_name}::${source.url || source.source_type}`),
        ),
      );

      return {
        ...hub,
        source_skill_count: sourceSkills.length,
        usable_source_count: uniqueSources.size,
        source_skills: sourceSkills,
      };
    })
    .sort(compareHubs);

  const overflowPools = Array.from(overflowBuckets.entries())
    .map<WorldSourceCatalogOverflowPool>(([platformName, sourceSkills]) => {
      const dedupedSkills = Array.from(
        new Map(sourceSkills.map((skill) => [normalizeCatalogKey(skill.name), skill])).values(),
      ).sort(compareSkills);
      const uniqueSources = new Set(
        dedupedSkills.flatMap((skill) =>
          skill.sources.map((source) => `${source.source_name}::${source.url || source.source_type}`),
        ),
      );

      return {
        platform_name: platformName,
        source_skill_count: dedupedSkills.length,
        usable_source_count: uniqueSources.size,
        source_skills: dedupedSkills,
      };
    })
    .sort(compareOverflowPools);

  const admissionCounts = allSkillEntries
    .map(({ skillEntry }) => skillEntry)
    .reduce(
      (acc, skill) => {
        acc[skill.admission_tier] += 1;
        return acc;
      },
      { anchor: 0, context: 0, weak_signal: 0, blocked: 0 },
    );

  const stableSkills = allSkillEntries
    .map(({ skillEntry }) => skillEntry)
    .filter((skill) => skill.admission_tier === 'anchor' || skill.admission_tier === 'context');
  const watchlistSkills = allSkillEntries
    .map(({ skillEntry }) => skillEntry)
    .filter((skill) => skill.admission_tier === 'weak_signal');
  const blockedSkills = allSkillEntries
    .map(({ skillEntry }) => skillEntry)
    .filter((skill) => skill.admission_tier === 'blocked');
  const sceneCounts = allSkillEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.skillEntry.recommended_scene] = (acc[entry.skillEntry.recommended_scene] || 0) + 1;
    return acc;
  }, {});
  const stableSourceCount = stableSkills.reduce(
    (sum, skill) => sum + skill.sources.filter((source) => source.connectivity === 'direct').length,
    0,
  );
  const watchlistSourceCount = watchlistSkills.reduce((sum, skill) => sum + skill.sources.length, 0);
  const nextBatch = allSkillEntries
    .map(({ skillEntry }) => skillEntry)
    .filter((skill) => skill.admission_tier !== 'blocked')
    .sort(compareIntakeCandidates)
    .slice(0, 12)
    .map<WorldSourceCatalogIntakeCandidate>((skill) => ({
      name: skill.name,
      source_platform: skill.source_platform,
      admission_tier: skill.admission_tier,
      recommended_scene: skill.recommended_scene,
      priority_for_poc: skill.priority_for_poc,
      integration_shape: skill.integration_shape,
      validation_status: skill.validation_status,
      usable_source_count: skill.usable_source_count,
      runnable_source_count: skill.runnable_source_count,
    }));

  return {
    generated_at: new Date().toISOString(),
    bundle_name: bundleName,
    bundle_date: textOrEmpty(summary.date),
    index_updated_at: indexData.updatedAt,
    completion_stage: textOrEmpty(summary.completion_stage),
    high_value_total: numberOrZero(summary.high_value_total),
    endpoint_covered: numberOrZero(summary.endpoint_covered),
    site_covered: numberOrZero(summary.site_covered),
    uncovered: numberOrZero(summary.uncovered),
    connectivity_counts: {
      direct: numberOrZero(summary.connectivity_counts?.direct),
      unstable: numberOrZero(summary.connectivity_counts?.unstable),
      blocked_or_unknown: numberOrZero(summary.connectivity_counts?.blocked_or_unknown),
    },
    admission_counts: admissionCounts,
    intake_summary: {
      runtime_ready_skill_count: stableSkills.filter((skill) => skill.admission_tier === 'anchor').length,
      context_ready_skill_count: stableSkills.filter((skill) => skill.admission_tier === 'context').length,
      weak_signal_skill_count: watchlistSkills.length,
      blocked_skill_count: blockedSkills.length,
      stable_source_count: stableSourceCount,
      watchlist_source_count: watchlistSourceCount,
      scene_counts: sceneCounts,
      next_batch: nextBatch,
    },
    skillhub_count: hubs.length,
    mapped_skillhub_count: hubs.filter((hub) => hub.source_skill_count > 0).length,
    source_skill_count: rawSkills.length,
    usable_source_count: rawSources.length,
    hubs,
    overflow_pools: overflowPools,
  };
}

export async function loadSourceCatalog(options?: { force?: boolean }) {
  const now = Date.now();
  if (options?.force) {
    clearSourceCatalogCache();
  }
  if (sourceCatalogCache && sourceCatalogCache.expiresAt > now) {
    return sourceCatalogCache.value;
  }

  try {
    const bundleDir = await resolveLatestBundleDir();
    if (!bundleDir) {
      sourceCatalogCache = {
        expiresAt: now + SOURCE_CATALOG_CACHE_TTL_MS,
        value: null,
      };
      return null;
    }

    const [summary, rawSkills, rawSources, indexMarkdown, inkwellSnapshot] = await Promise.all([
      readJsonFile<SourceBundleSummary>(path.join(bundleDir, 'package-summary.json')),
      readJsonFile<SourceBundleSkill[]>(path.join(bundleDir, 'high-value-skills.json')),
      readJsonFile<SourceBundleSource[]>(path.join(bundleDir, 'high-value-usable-sources.json')),
      fs.readFile(SKILLHUB_INDEX_FILE, 'utf8'),
      readOptionalJsonFile<InkwellSnapshot>(INKWELL_SNAPSHOT_FILE),
    ]);
    const mergedBundle = appendInkwellSnapshot(rawSkills, rawSources, inkwellSnapshot);
    const curatedBundle = await appendCuratedFeedBundles(mergedBundle.rawSkills, mergedBundle.rawSources);
    const catalog = buildCatalog(
      path.basename(bundleDir),
      summary,
      curatedBundle.rawSkills,
      curatedBundle.rawSources,
      parseSkillhubIndex(indexMarkdown),
    );

    sourceCatalogCache = {
      expiresAt: now + SOURCE_CATALOG_CACHE_TTL_MS,
      value: catalog,
    };
    return catalog;
  } catch (error) {
    console.warn('loadSourceCatalog failed', error);
    sourceCatalogCache = {
      expiresAt: now + SOURCE_CATALOG_CACHE_TTL_MS,
      value: null,
    };
    return null;
  }
}

export async function loadRuntimeCatalogSources(): Promise<RuntimeCatalogSource[]> {
  const catalog = await loadSourceCatalog();
  if (!catalog) return [];

  const dedicatedSkills = new Set([
    normalizeCatalogKey('inkwell-rss-reader'),
    normalizeCatalogKey('open-skills-get-crypto-price'),
    normalizeCatalogKey('alpha-vantage'),
    normalizeCatalogKey('knowledgelm-nse'),
    normalizeCatalogKey('U.S. Treasury Fiscal Data'),
  ]);

  const skills = [
    ...catalog.hubs.flatMap((hub) => hub.source_skills || []),
    ...catalog.overflow_pools.flatMap((pool) => pool.source_skills || []),
  ];
  const dedupedSkills = Array.from(new Map(skills.map((skill) => [normalizeCatalogKey(skill.name), skill])).values());

  const rows = dedupedSkills
    .filter((skill) => skill.admission_tier === 'anchor' || skill.admission_tier === 'context')
    .filter((skill) => !dedicatedSkills.has(normalizeCatalogKey(skill.name)))
    .flatMap((skill) =>
      skill.sources
        .filter(isRuntimeIngestibleSource)
        .slice(0, skill.integration_shape === 'aggregator-layer' ? 8 : 12)
        .map<RuntimeCatalogSource>((source) => ({
          skill_name: skill.name,
          source_platform: skill.source_platform,
          admission_tier: skill.admission_tier,
          recommended_scene: skill.recommended_scene,
          integration_shape: skill.integration_shape,
          source_name: source.source_name,
          url: source.url,
          source_type: source.source_type,
          connectivity: source.connectivity,
          note: source.note,
        })),
    );

  return Array.from(
    new Map(rows.map((row) => [`${normalizeCatalogKey(row.skill_name)}::${normalizeCatalogKey(row.source_name)}::${row.url}`, row])).values(),
  );
}
