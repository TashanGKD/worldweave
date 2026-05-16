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

function normalizeTag(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function normalizeText(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

  if (alignmentTags.includes('model:low-information')) return true;
  if (!title && !summary) return true;
  if (/^(global feed|research feed|.+\s*feed|.+,\s*.+,\s*.+)$/i.test(title) && summary.length < 80) return true;
  if (/信源更新|结构化更新|世界新闻更新|Bundle Feed|Source Feed|Global Feed/i.test(title)) return true;
  if (/当前接口返回了结构化|当前接口样本摘要|当前样本前几项包括|本轮前几条标题|标题清单|行情快照仅作背景参考/i.test(summary)) {
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
    if (isSourceFeedLikeRow(row) && isLowInformationSourceRow(row)) {
      dropped += 1;
      continue;
    }
    kept.push(row);
  }
  if (dropped > 0) options?.onDrop?.(dropped);
  return kept;
}
