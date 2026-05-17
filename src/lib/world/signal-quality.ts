export type SourceQualityRow = {
  title: string | null;
  description: string | null;
  source_name: string | null;
  source_type?: string | null;
  tags: string[] | null;
  alignment_tags?: string[] | null;
};

export type PublicSignalQualityRow = {
  id?: string | null;
  node_id?: string | null;
  title?: string | null;
  summary?: string | null;
  display_title?: string | null;
  display_summary?: string | null;
  source_name?: string | null;
  urgency_reason?: string | null;
  tags?: string[] | null;
  alignment_tags?: string[] | null;
};

const INTERNAL_PUBLIC_TAG_PREFIXES = [
  'aihot-tier:',
  'aihot:scoring:',
  'aihot:tier:',
  'intake:',
  'model-tag:',
  'source-skill:',
  'upstream:score:',
];

function normalizeTag(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function normalizeText(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isInternalPublicTag(value?: string | null) {
  const normalized = normalizeTag(value || '');
  return INTERNAL_PUBLIC_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function sanitizePublicTags(tags?: string[] | null) {
  return (tags || []).filter((tag) => !isInternalPublicTag(tag));
}

function sanitizePublicReliability(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const tier = typeof record.tier === 'string' ? record.tier : 'watchlist';
  const reason =
    tier === 'stable'
      ? '这条线索来自已接入的稳定信源。'
      : tier === 'blocked_or_unknown'
        ? '这条线索的来源稳定性仍待确认。'
        : '这条线索来自观察中的已接入信源，适合作为补充参考。';
  return {
    tier,
    label: typeof record.label === 'string' ? record.label : tier,
    reason,
    source_name: typeof record.source_name === 'string' ? record.source_name : '',
    source_url: typeof record.source_url === 'string' ? record.source_url : '',
  };
}

export function sanitizePublicSignal<T extends PublicSignalQualityRow>(signal: T): T {
  const next = {
    ...signal,
    tags: sanitizePublicTags(signal.tags),
    alignment_tags: sanitizePublicTags(signal.alignment_tags),
  } as Record<string, unknown>;
  delete next.intake_score;
  delete next.intake_decision;
  delete next.intake_tier;
  delete next.upstream_score;
  if ('source_reliability' in next) {
    next.source_reliability = sanitizePublicReliability(next.source_reliability);
  }
  return next as T;
}

function signalQualityHaystack(signal: PublicSignalQualityRow) {
  return [
    signal.id,
    signal.node_id,
    signal.title,
    signal.summary,
    signal.display_title,
    signal.display_summary,
    signal.source_name,
    signal.urgency_reason,
    ...(signal.tags || []),
    ...(signal.alignment_tags || []),
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ');
}

export function isSourceFeedLikeRow(row: SourceQualityRow): boolean {
  const tags = (row.tags || []).map(normalizeTag);
  const alignmentTags = (row.alignment_tags || []).map(normalizeTag);
  const sourceType = normalizeTag(row.source_type || '');
  return (
    tags.includes('source-feed') ||
    tags.includes('catalog-source') ||
    alignmentTags.includes('source:catalog-source') ||
    ['rss', 'atom', 'api-text', 'api-json'].includes(sourceType)
  );
}

export function isLowInformationSourceRow(row: SourceQualityRow): boolean {
  const title = normalizeText(row.title || '');
  const summary = normalizeText(row.description || '');
  const sourceName = normalizeText(row.source_name || '');
  const alignmentTags = (row.alignment_tags || []).map(normalizeTag);
  const haystack = [title, summary, sourceName, ...(row.tags || []), ...(row.alignment_tags || [])].join(' ');
  const visibleText = [title, summary].join(' ');

  if (alignmentTags.includes('model:low-information')) return true;
  if (!title && !summary) return true;
  if (/^(global feed|research feed|.+\s*feed|.+,\s*.+,\s*.+)$/i.test(title) && summary.length < 80) return true;
  if (/信源更新|结构化更新|世界新闻更新|Bundle Feed|Source Feed|Global Feed/i.test(title)) return true;
  if (/当前接口返回了结构化|当前接口样本摘要|当前样本前几项包括|本轮前几条标题|标题清单|行情快照仅作背景参考/i.test(summary)) {
    return true;
  }
  if (
    /Location in headline|Source country match|Local news source|High Goldstein intensity|^\d+\s+events? at location$/iu.test(haystack) &&
    !/(attack|strike|missile|drone|outbreak|ceasefire|sanction|killed|death|deaths|evacuation|explosion|fire|clash|arrest|protest|爆炸|袭击|导弹|无人机|疫情|制裁|撤离|死亡|火灾|冲突|逮捕|抗议)/iu.test(visibleText)
  ) {
    return true;
  }
  if (sourceName && title.toLowerCase() === sourceName.toLowerCase() && summary.length < 80) return true;

  return false;
}

export function isSourceSnapshotLikeSignal(signal: PublicSignalQualityRow): boolean {
  const text = signalQualityHaystack(signal);
  return /catalog-source|monitor-snapshot|Bundle Feed|信源更新|信源包|世界新闻更新|本轮前几条标题|结构化更新|行情快照|宏观读数快照|structured snapshot|rss snapshot|source:market-snapshot|Location in headline|Source country match|High Goldstein intensity|Local news source/i.test(text);
}

export function isPublicEventSignal(signal: PublicSignalQualityRow): boolean {
  if (isSourceSnapshotLikeSignal(signal)) return false;
  const title = normalizeText(signal.display_title || signal.title || '');
  return !/^Assault and arrest$/iu.test(title);
}

export function filterLowInformationSourceRows<Row extends SourceQualityRow>(
  rows: Row[],
  options?: { onDrop?: (count: number) => void },
): Row[] {
  const kept: Row[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (isLowInformationSourceRow(row)) {
      dropped += 1;
      continue;
    }
    kept.push(row);
  }
  if (dropped > 0) options?.onDrop?.(dropped);
  return kept;
}
