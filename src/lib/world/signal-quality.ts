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
  location_name?: string | null;
  urgency_reason?: string | null;
  tags?: string[] | null;
  alignment_tags?: string[] | null;
};

const INTERNAL_PUBLIC_TAG_PREFIXES = [
  'aihot-tier:',
  'aihot:scoring:',
  'aihot:tier:',
  'ai-radar:score:',
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

function looksLikeTemplatedSignalCopy(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return false;
  return (
    /出现新的[^。]{1,16}(?:信号|消息)/u.test(text) ||
    /(?:后续重点看|主要看)(?:二次信源|外溢范围|供应链反应|保险|运价|绕航|港口声明|现货价格|装运节奏|政策反应|更多报道|相邻地点|相关回应)/u.test(text) ||
    /(?:这边的[^。]{1,16}线|先把地理锚点按住|这一笔声量起得不低|先轻轻记下|它未必最显眼)/u.test(text) ||
    /(?:这条线索值得补充观察|这条消息热度较高|同类消息不多，可以先留意|先按普通消息记录)/u.test(text) ||
    /^(?:冲突|地缘|科技|AI|市场|公共卫生|产能与供应链)\s*[·:：-]?\s*(?:冲突强度上升|航运风险上升|能源市场有新动向|供应链有新变化|市场出现新变化|公共卫生有新情况|政策出现新变化|[^。；]{2,24}(?:有新动向|有新变化|出现新变化|上升))/u.test(text)
  );
}

function hasConcreteEventText(value?: string | null) {
  const text = normalizeText(value);
  if (text.length < 24) return false;
  if (looksLikeTemplatedSignalCopy(text)) return false;
  if (/本轮前几条标题|当前接口样本摘要|标题清单|该分类收录约|当前样本累计|行情快照仅作背景参考/u.test(text)) return false;
  return /(attack|strike|missile|drone|outbreak|ceasefire|sanction|killed|death|deaths|evacuation|explosion|fire|clash|arrest|protest|jamming|sink|sank|vessel|ship|bomb|shoot|seize|captured|袭击|导弹|无人机|疫情|制裁|撤离|死亡|火灾|冲突|逮捕|抗议|干扰|船|爆炸|扣押|查获|空袭)/iu.test(
    text,
  );
}

export function sanitizePublicNarrativeText(value?: string | null) {
  return normalizeText(value)
    .replace(
      /(?:^|[；。]\s*)[^。；]{0,32}出现新的[^。；]{1,24}(?:信号|消息)。?(?:后续重点看|主要看)[^。；]{0,80}。?(?:这条线索值得补充观察|目前热度较高，需继续跟踪|这条消息热度较高|同类消息不多，可以先留意|先按普通消息记录)。?/gu,
      '。',
    )
    .replace(/[^。；]{0,64}出现新的[^。；]{1,32}(?:信号|消息)。?/gu, '')
    .replace(/(?:后续重点看|主要看)[^。；]{0,80}。?/gu, '')
    .replace(/(?:这条线索值得补充观察|目前热度较高，需继续跟踪)。?/gu, '')
    .replace(/这条消息热度较高。?/gu, '相关报道较集中。')
    .replace(/同类消息不多，可以先留意。?/gu, '同类报道还不多。')
    .replace(/先按普通消息记录。?/gu, '暂按一般报道处理。')
    .replace(/这边的([^。]{1,16})线(?:先)?记成一笔(?:续写|更新)。?/gu, '$1有相关报道。')
    .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '可能影响$1。')
    .replace(/这一笔声量起得不低，适合先压住。?/gu, '相关报道较集中。')
    .replace(/先轻轻记下，不急着加重语气。?/gu, '暂按普通材料处理。')
    .replace(/它未必最显眼[^。；]{0,32}。?/gu, '可作为补充材料。')
    .replace(/本轮前几条标题包括\s*《[^。；]+?(?:。|；|$)/gu, '')
    .replace(/该分类收录约\s*\d+\s*个 RSS 源。?/gu, '')
    .replace(/当前样本累计点赞\s*\d+、评论\s*\d+。?/gu, '')
    .replace(/。{2,}/g, '。')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function compactPublicTitle(value?: string | null, maxLength = 96) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  const sentence = text
    .split(/(?<=[。！？!?])\s*/u)
    .map((part) => part.trim())
    .find((part) => part.length >= 12 && part.length <= maxLength);
  if (sentence) return sentence;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function looksLikeMachineOnlySignalText(value?: string | null) {
  return /Location in headline|Source country match|Local news source|High Goldstein intensity|Goldstein|^\d+\s+events? at location$/iu.test(
    normalizeText(value),
  );
}

function looksLikeLocationOnlyTitle(title?: string | null) {
  const normalized = normalizeText(title);
  if (!normalized || normalized.length > 96) return false;
  const parts = normalized.split(/[，,]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return !/\b(kill|killed|seize|seized|launch|launched|strike|strikes|attack|attacks|warn|warns|approve|approves|report|reports|say|says|face|faces|rise|falls?|arrest|arrests|fire|fires|outbreak|protest|clash|court|indict|convict)\b/iu.test(
    normalized,
  );
}

function hasLongLatinFragment(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (/[A-Za-z]{4,}(?:[\s/-]+[A-Za-z]{2,}){1,}/.test(normalized)) return true;
  const latinChars = (normalized.match(/[A-Za-z]/g) || []).length;
  const visibleChars = normalized.replace(/\s+/g, '').length || 1;
  return latinChars / visibleChars >= 0.28;
}

function readablePublicLocation(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return text;
  const exact: Record<string, string> = {
    'buni yadi': '布尼亚迪',
    israel: '以色列',
    'moscow sheremetyevo': '莫斯科谢列梅捷沃',
    moscow: '莫斯科',
    lagos: '拉各斯',
    'jordan valley': '约旦河谷',
    nigeria: '尼日利亚',
    gaza: '加沙',
    'gaza strip': '加沙地带',
    'west bank': '约旦河西岸',
  };
  const mapped = exact[text.toLowerCase()];
  if (mapped) return mapped;
  const translated = text
    .replace(/\bIsrael\b/giu, '以色列')
    .replace(/\bNigeria\b/giu, '尼日利亚')
    .replace(/\bMoscow\b/giu, '莫斯科')
    .replace(/\bLagos\b/giu, '拉各斯')
    .replace(/\bJordan Valley\b/giu, '约旦河谷')
    .replace(/\bWest Bank\b/giu, '约旦河西岸')
    .replace(/\bGaza Strip\b/giu, '加沙地带')
    .replace(/\bGaza\b/giu, '加沙')
    .trim();
  return hasLongLatinFragment(translated) && !/[\u3400-\u9fff]/u.test(translated) ? '' : translated;
}

function choosePublicReadableTitle(signal: PublicSignalQualityRow) {
  const title = normalizeText(signal.title);
  const candidates = [
    signal.display_title,
    signal.display_summary,
    signal.summary,
    title,
  ].map((candidate) => normalizeText(candidate));
  const readableCandidates = candidates.filter(
    (candidate) =>
      candidate.length >= 12 &&
      !looksLikeTemplatedSignalCopy(candidate) &&
      !looksLikeMachineOnlySignalText(candidate) &&
      !looksLikeLocationOnlyTitle(candidate) &&
      !hasLongLatinFragment(candidate),
  );
  const readable =
    readableCandidates.find((candidate) => /[\u3400-\u9fff]/u.test(candidate)) ||
    readableCandidates[0] ||
    (!looksLikeMachineOnlySignalText(title) && !looksLikeLocationOnlyTitle(title) && !hasLongLatinFragment(title) ? title : '');
  return compactPublicTitle(readable);
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
  const displaySummary = looksLikeTemplatedSignalCopy(signal.display_summary) ? '' : sanitizePublicNarrativeText(signal.display_summary);
  const fallbackTitle =
    looksLikeTemplatedSignalCopy(signal.title) || looksLikeTemplatedSignalCopy(signal.display_title)
      ? compactPublicTitle(hasConcreteEventText(signal.summary) ? signal.summary : signal.source_name || '信源更新')
      : '';
  const readableTitle =
    displaySummary && /[\u3400-\u9fff]/u.test(displaySummary) && !hasLongLatinFragment(displaySummary)
      ? compactPublicTitle(displaySummary)
      : choosePublicReadableTitle(signal);
  const next = {
    ...signal,
    title: readableTitle || fallbackTitle || signal.title,
    display_title: readableTitle || fallbackTitle || signal.display_title,
    display_summary: displaySummary || (hasConcreteEventText(signal.summary) ? sanitizePublicNarrativeText(signal.summary) : ''),
    location_name: readablePublicLocation(signal.location_name),
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
  return /catalog-source|monitor-snapshot|Bundle Feed|信源更新|信源包|世界新闻更新|本轮前几条标题|该分类收录约|当前样本累计|结构化更新|行情快照|宏观读数快照|structured snapshot|rss snapshot|source:market-snapshot|Location in headline|Source country match|High Goldstein intensity|Local news source/i.test(text);
}

export function isPublicEventSignal(signal: PublicSignalQualityRow): boolean {
  if (isSourceSnapshotLikeSignal(signal)) return false;
  const title = normalizeText(signal.display_title || signal.title || '');
  const summary = normalizeText(signal.display_summary || signal.summary || '');
  if ((looksLikeTemplatedSignalCopy(title) || looksLikeTemplatedSignalCopy(summary)) && !hasConcreteEventText(signal.summary)) {
    return false;
  }
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
