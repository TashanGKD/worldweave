import type {
  LiveBenchAggregateVote,
  LiveQuestionSide,
  LiveQuestionStatus,
  WorldScene,
  WorldStateNode,
} from '@/lib/world/types';

const ALERT_HIGH_HOURS = 18;
const ALERT_ELEVATED_HOURS = 12;
const ALERT_MONITORING_HOURS = 8;

export function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function formatTime(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatBrierScore(value?: number | null) {
  return typeof value === 'number' ? value.toFixed(3) : '--';
}

const REGION_LABELS: Record<string, string> = {
  'middle east': '中东',
  europe: '欧洲',
  asia: '亚洲',
  africa: '非洲',
  oceania: '大洋洲',
  'north america': '北美',
  'south america': '南美',
  global: '全球',
  lebanon: '黎巴嫩',
  kenya: '肯尼亚',
  'west bank': '约旦河西岸',
};

export function regionDisplayLabel(value?: string | null) {
  if (!value) return '';
  const trimmed = String(value).trim();
  return REGION_LABELS[trimmed.toLowerCase()] || trimmed;
}

export function cleanPresentationText(value?: string | null) {
  if (!value) return '';
  return String(value)
    .replace(/^Inkwell\s+/gi, '')
    .replace(/^Signal Arena\s+/gi, '')
    .replace(/\bworld-monitor\b/gi, '')
    .replace(/\bworld monitor\b/gi, '')
    .replace(/\bWorld Monitor\b/gi, '')
    .replace(/\bInkwell\b/gi, '')
    .replace(/\bShunyaNet Sentinel\b/gi, '')
    .replace(/\b[A-Za-z][A-Za-z\s-]*Bundle Feed\s*\d+\s*信源更新\b/giu, '信源包消息')
    .replace(/\b[A-Za-z][A-Za-z\s-]*Bundle Feed\s*\d+\b/giu, '信源包')
    .replace(/\bBundle Feed\s*\d+\s*信源更新\b/giu, '信源包消息')
    .replace(/\bGlobal Feed\b/gi, '全球消息')
    .replace(/\bMiddle East\b/gi, '中东')
    .replace(/\bEurope\b/gi, '欧洲')
    .replace(/\bNorth America\b/gi, '北美')
    .replace(/\bSouth America\b/gi, '南美')
    .replace(/\bStrait of Hormuz\b/gi, '霍尔木兹海峡')
    .replace(/\bGaza Strip\b/gi, '加沙地带')
    .replace(/\bGaza\b/gi, '加沙')
    .replace(/\bIranian coastline\b/gi, '伊朗沿岸')
    .replace(/\bIranian regime governmental centers?\b/gi, '伊朗政府中心')
    .replace(/\bNearby Iranian positions?\b/gi, '周边伊朗据点')
    .replace(/\bunspecified locations?\b/gi, '未指明地点')
    .replace(/\bimplied operational area\b/gi, '相关行动区域')
    .replace(/\bArabian Sea\b/gi, '阿拉伯海')
    .replace(/\bGulf of Oman\b/gi, '阿曼湾')
    .replace(/\bSea of Japan\b/gi, '日本海')
    .replace(/\bEast Sea\b/gi, '东海')
    .replace(/\bNorth Korea\b/gi, '朝鲜')
    .replace(/\bSouth Africa\b/gi, '南非')
    .replace(/\bWest Bank\b/gi, '约旦河西岸')
    .replace(/\bRussia\b/gi, '俄罗斯')
    .replace(/\bUkraine\b/gi, '乌克兰')
    .replace(/\bIsrael\b/gi, '以色列')
    .replace(/\bLebanon\b/gi, '黎巴嫩')
    .replace(/\bIran\b/gi, '伊朗')
    .replace(/\bNiger\b/gi, '尼日尔')
    .replace(/\bKyiv\b/gi, '基辅')
    .replace(/\bGoogle\b/gi, '谷歌')
    .replace(/\bLouisiana\b/gi, '路易斯安那州')
    .replace(/\bUpdate on Ukraine war,\s*day\s*\d+,\s*is active conflict\b/gi, '乌克兰战况更新，交火仍在持续')
    .replace(/\bFrontline situation in Ukraine war,\s*active combat\b/gi, '乌克兰前线交火持续')
    .replace(/\bWar-related treason sentencing in Ukraine\b/gi, '乌克兰涉战案件有新进展')
    .replace(/\bMilitary warning\/anniversary,\s*high tension\b/gi, '军方警示与周年节点叠加，局势紧张')
    .replace(/\bRenewed violence in Manipur,\s*India\b/gi, '印度曼尼普尔再次发生暴力冲突')
    .replace(/\bTerrorist attack on military base,\s*soldiers killed\b/gi, '军事基地遭袭，已有士兵伤亡')
    .replace(/\bRussian attack on Ukrainian city,\s*war event\b/gi, '乌克兰城市遭袭，战事仍在延续')
    .replace(/\bDrone attack on Russian logistics\b/gi, '俄罗斯后勤设施遭无人机袭击')
    .replace(/\bactive war zone\b/gi, '交战区域')
    .replace(/\bactive combat\b/gi, '前线交火')
    .replace(/\bactive conflict\b/gi, '交火仍在持续')
    .replace(/\bcritical\b/gi, '高风险')
    .replace(/\bhigh tension\b/gi, '局势紧张')
    .replace(/\battack Iran\b/gi, '攻击伊朗')
    .replace(/我现在偏向赞成/gu, '当前偏向赞成')
    .replace(/我现在偏向不赞成/gu, '当前偏向不赞成')
    .replace(/我现在更看重的是/gu, '当前更需要核对')
    .replace(/我现在最看重的依据是/gu, '当前最关键的依据是')
    .replace(/我现在最看重的是/gu, '当前最关键的是')
    .replace(/我先给出一版保守判断/gu, '暂按保守口径记录')
    .replace(/在我看到/gu, '在看到')
    .replace(/我不会轻易/gu, '不宜轻易')
    .replace(/这边的([^。]{1,16})线先记成一笔续写。?/gu, '$1有相关报道。')
    .replace(/先把地理锚点按住，.{0,2}看它是不是会往([^。]+?)外溢。?/gu, '可能影响$1。')
    .replace(/这一笔声量起得不低，适合先压住。?/gu, '相关报道较集中。')
    .replace(/先轻轻记下，不急着加重语气。?/gu, '暂按一般报道处理。')
    .replace(/它未必最显眼，但这条线现在值得先补一笔。?/gu, '可作为补充材料。')
    .replace(/值得作为背景线索继续观察/gu, '可以作为背景资料参考')
    .replace(/续写/gu, '更新')
    .replace(/又往上拱了一格/gu, '上升')
    .replace(/又绷紧了一点/gu, '风险上升')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanNarrativeText(value?: string | null) {
  if (!value) return '';
  return cleanPresentationText(String(value))
    .replace(/^我的看法是[，,:：]?\s*/u, '')
    .replace(/^我这次真正想判断的是[，,:：]?\s*/u, '')
    .replace(/^我这次要判断的是[，,:：]?\s*/u, '')
    .replace(/^接下来我只盯两件事[，,:：]?\s*/u, '接下来只看两件事：')
    .replace(/^接下来我只看两件事[，,:：]?\s*/u, '接下来只看两件事：')
    .replace(/^后面我只看/u, '接下来只看')
    .replace(/这更像预期被重新拎了一下，不急着把影响讲满/gu, '这次更像旧压力重新抬头，但还要看会不会继续扩散')
    .replace(/映射还没完全稳定/gu, '这条线目前还缺更稳的旁证')
    .replace(/映射还没稳定/gu, '这条线目前还缺更稳的旁证')
    .replace(/World Monitor 这条信源还在\s*观察池\s*里[，,。]?\s*/giu, '')
    .replace(/信源(?:可靠性)?(?:是|还在)?\s*观察池\/?unmapped-?信源[，,。]?\s*/giu, '')
    .replace(/当前这条信源还没有和 source catalog 中的稳定映射完全对上，先按观察中信源处理。/giu, '这条消息目前还缺更稳的侧面印证。')
    .replace(/\bmention_?count\s*=\s*\d+/giu, '')
    .replace(/\bintensity\s*=\s*\d+/giu, '')
    .replace(/\bcoverage_?gap\s*=\s*\d+/giu, '')
    .replace(/\b(?:severity|relevance|exploration|hotspot|confidence)_?score\s*=\s*[0-9.]+/giu, '')
    .replace(/\bseverity\s*=\s*\d+\s*(?:\([^)]*\))?/giu, '')
    .replace(/\bwatchlist\b/giu, '旁证不足')
    .replace(/\bmonitoring\b/giu, '持续观察')
    .replace(/\bstable source\b/giu, '稳定信源')
    .replace(/\bsource\b/giu, '信源')
    .replace(/\(\s*\)/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[，,]\s*[，,]/gu, '，')
    .replace(/[。]\s*[。]/gu, '。')
    .trim();
}

export function compactText(value?: string | null, max = 160) {
  const text = cleanNarrativeText(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function sceneDisplayLabel(scene: WorldScene) {
  const labels: Record<string, string> = {
    global: '地缘',
    war: '冲突',
    technology: '科技',
    capacity: '产能与供应链',
    finance: '市场',
    health: '公共卫生',
    'weak-signal': '弱信号',
    'tech-ai': 'AI',
    'geo-politics-daily': '地缘',
    'technology-daily': 'AI',
    'ai-daily': 'AI',
  };
  return labels[scene] || scene;
}

export function severityLabel(severity: number) {
  if (severity >= 4) return '严重';
  if (severity >= 3) return '高关注';
  return '普通';
}

export function severityTone(severity: number) {
  if (severity >= 4) return 'border-red-200 bg-red-50 text-red-700';
  if (severity >= 3) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function severitySoftTone(severity: number) {
  if (severity >= 4) return 'border-red-200/80 bg-white text-red-700';
  if (severity >= 3) return 'border-amber-200/80 bg-white text-amber-700';
  return 'border-slate-200/80 bg-white text-slate-600';
}

export function reliabilityTone(tier?: string) {
  if (tier === 'stable') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tier === 'watchlist') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (tier === 'blocked_or_unknown') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function reliabilityLabel(tier?: string) {
  if (tier === 'stable') return '稳定信源';
  if (tier === 'watchlist') return '待核实';
  if (tier === 'blocked_or_unknown') return '受限';
  return '待定';
}

export function alignmentTagLabel(tag: string) {
  const labels: Record<string, string> = {
    'geo:mapped': '落点',
    'geo:unmapped': '关联点',
    'severity:severe': '严重',
    'severity:elevated': '高关注',
    'severity:normal': '普通',
    'severity:background': '背景',
  };

  if (tag.startsWith('scene:')) return sceneDisplayLabel(tag.replace(/^scene:/, '') as WorldScene);
  if (tag.startsWith('region:')) return regionDisplayLabel(tag.replace(/^region:/, ''));
  if (tag.startsWith('feed:')) return tag.replace(/^feed:/, '');
  if (tag.startsWith('wm:intensity:')) return `强度 ${tag.replace(/^wm:intensity:/, '')}`;
  if (tag.startsWith('wm:mentions:')) {
    const mentionLabel = tag.replace(/^wm:mentions:/, '');
    const mentionLabels: Record<string, string> = {
      single: '单点提及',
      cluster: '多点提及',
      burst: '密集提及',
    };
    return mentionLabels[mentionLabel] || `提及 ${mentionLabel}`;
  }
  return labels[tag] || tag;
}

export function visibleAlignmentTags(tags: string[]) {
  return tags.filter((tag) => {
    if (!tag) return false;
    if (tag.startsWith('feed:')) return false;
    if (tag.startsWith('type:')) return false;
    if (tag.startsWith('source:')) return false;
    if (/^wm:(briefing|summary)-changed$/i.test(tag)) return false;
    if (/^wm:(updated|created)$/i.test(tag)) return false;
    if (tag === 'model:aligned') return false;
    if (/^severity:/.test(tag)) return true;
    if (/^geo:/.test(tag)) return true;
    if (/^wm:(intensity|mentions):/.test(tag)) return true;
    return false;
  });
}

export function hasOpenableSourceUrl(url?: string | null) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

export function signalDetailHref(id?: string) {
  return id ? `/signals/${encodeURIComponent(id)}` : '#';
}

export function signalOpenHref(id: string, url?: string | null) {
  return hasOpenableSourceUrl(url) ? url! : signalDetailHref(id);
}

export function worldHref(href: string, scene: WorldScene = 'global') {
  if (!href || href.startsWith('#') || /^https?:\/\//.test(href)) return href;
  const url = new URL(href, 'http://local.world');
  if (scene !== 'global' && !url.searchParams.has('scene')) {
    url.searchParams.set('scene', scene);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function worldMountedHref(href: string, scene: WorldScene = 'global') {
  const normalized = worldHref(href, scene);
  if (!normalized || normalized.startsWith('#') || /^https?:\/\//.test(normalized)) return normalized;
  return normalized === '/worldweave' || normalized.startsWith('/worldweave/')
    ? normalized
    : `/worldweave${normalized}`;
}

export function worldHomeHref(scene: WorldScene = 'global', hash = '') {
  const normalizedHash = hash && !hash.startsWith('#') ? `#${hash}` : hash;
  return worldHref(`/worldweave/${normalizedHash}`, scene);
}

export function liveQuestionStatusLabel(status: LiveQuestionStatus) {
  if (status === 'resolved') return '已结算';
  if (status === 'watchlist') return '待观察';
  return '待结算';
}

export function liveQuestionStatusTone(status: LiveQuestionStatus) {
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'watchlist') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export function voteSideLabel(side?: LiveQuestionSide | null) {
  if (side === 'yes') return '是';
  if (side === 'no') return '不是';
  return '未表态';
}

export function voteSideTone(side?: LiveQuestionSide | null) {
  if (side === 'yes') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (side === 'no') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

export function officialOutcomeLabel(side?: LiveQuestionSide | null) {
  if (side === 'yes') return '官方结果：是';
  if (side === 'no') return '官方结果：不是';
  return '官方结果待回写';
}

export function aggregateProbabilityLabel(value?: number | null) {
  return typeof value === 'number' ? formatPercent(value) : '--';
}

export function aggregateSideSummary(aggregate: LiveBenchAggregateVote) {
  if (aggregate.side === 'yes') return '当前模型总票偏向“是”';
  if (aggregate.side === 'no') return '当前模型总票偏向“不是”';
  return '当前仍在汇票';
}

export function shellCardClass() {
  return 'overflow-hidden rounded-[34px] border border-white/80 bg-white/86 shadow-[0_18px_46px_rgba(15,23,42,0.055)] backdrop-blur';
}

export function markIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className="h-8 w-8">
      <circle cx="14" cy="14" r="12.5" fill="#0f172a" />
      <circle cx="14" cy="14" r="7.4" fill="none" stroke="#f8fafc" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="2.4" fill="#f8fafc" />
      <path
        d="M4.8 14h18.4M14 4.8c3.1 2.7 4.9 5.8 4.9 9.2S17.1 20.5 14 23.2c-3.1-2.7-4.9-5.8-4.9-9.2S10.9 7.5 14 4.8Z"
        fill="none"
        stroke="#f8fafc"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isFreshAlertTime(value: string, hours = 24) {
  const ageHours = (Date.now() - new Date(value).getTime()) / 36e5;
  return ageHours <= hours;
}

function hasAlignmentTag(tags: string[] | undefined, predicate: (tag: string) => boolean) {
  return Array.isArray(tags) && tags.some(predicate);
}

function hasEscalationMarker(node: WorldStateNode) {
  return (
    node.severity >= 5 ||
    (typeof node.intensity === 'number' && node.intensity >= 4) ||
    (typeof node.mention_count === 'number' && node.mention_count >= 20) ||
    hasAlignmentTag(node.alignment_tags, (tag) => /^wm:(briefing|summary)-changed$/.test(tag))
  );
}

function hasSeverityAlignment(node: WorldStateNode, level: 'elevated' | 'severe') {
  return hasAlignmentTag(node.alignment_tags, (tag) => tag === `severity:${level}`);
}

function hasSceneAlertTag(node: WorldStateNode) {
  const tags = [...(node.alignment_tags || []), ...(node.tags || [])];
  const sceneTags: Record<string, string[]> = {
    war: ['security', 'conflict', 'outbreak', 'supply-chain', 'policy', 'incident'],
    technology: ['technology', 'ai', 'research', 'policy', 'outbreak', 'protest'],
    capacity: ['capacity', 'supply-chain', 'shipping', 'energy', 'incident', 'policy'],
    finance: ['finance', 'market', 'policy', 'monitor-snapshot', 'anchor'],
    health: ['health', 'outbreak', 'biosecurity', 'incident', 'clinical'],
  };
  const allowedTags = sceneTags[node.scene] || ['security', 'conflict', 'outbreak', 'supply-chain', 'policy'];
  return tags.some((tag) => allowedTags.includes(tag));
}

function alertFreshnessHours(node: WorldStateNode) {
  if (node.display_level === 'high' || node.severity >= 4 || hasSeverityAlignment(node, 'severe')) {
    return ALERT_HIGH_HOURS;
  }
  if (node.display_level === 'elevated' || node.severity >= 3 || hasSeverityAlignment(node, 'elevated')) {
    return ALERT_ELEVATED_HOURS;
  }
  return ALERT_MONITORING_HOURS;
}

export function isAlertBoardCandidate(node: WorldStateNode) {
  const freshnessHours = alertFreshnessHours(node);
  if (!isFreshAlertTime(node.updated_at || node.published_at, freshnessHours)) {
    return false;
  }

  const hasSceneTag = hasSceneAlertTag(node);
  const hasStrongSeverity = node.severity >= 4 || hasSeverityAlignment(node, 'severe');
  const hasElevatedSeverity = node.severity >= 3 || hasSeverityAlignment(node, 'elevated');

  if (node.display_level === 'high') {
    return node.severity >= 4 || node.hotspot_score >= 0.58 || hasEscalationMarker(node) || hasSceneTag;
  }

  if (node.display_level === 'elevated') {
    return hasStrongSeverity || hasEscalationMarker(node) || (hasElevatedSeverity && hasSceneTag) || node.hotspot_score >= 0.42;
  }

  if (node.display_level === 'monitoring') {
    return (
      hasStrongSeverity ||
      hasEscalationMarker(node) ||
      (node.scene === 'health' && hasElevatedSeverity) ||
      (node.scene === 'finance' && node.severity >= 2 && node.hotspot_score >= 0.44) ||
      (hasSceneTag && node.severity >= 3)
    );
  }

  return false;
}
