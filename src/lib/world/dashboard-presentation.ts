import { cleanPresentationText, compactText, sceneDisplayLabel } from '@/components/world-ui';
import type { WorldScene, WorldStateNode } from '@/lib/world/types';

export type DashboardSignalLike = {
  title?: string | null;
  summary?: string | null;
  display_title?: string | null;
  display_summary?: string | null;
  scene: WorldScene;
  source_name: string;
  source_url?: string;
  location_name?: string | null;
  country?: string | null;
  tags: string[];
  alignment_tags?: string[];
  severity: number;
  relevance_score?: number;
  hotspot_score: number;
  exploration_score: number;
};
export type ReadableSignalInput = {
  title?: string | null;
  display_title?: string | null;
  summary?: string | null;
  display_summary?: string | null;
  source_name?: string | null;
  scene?: string | null;
  location_name?: string | null;
  tags?: string[] | null;
};

function extractQuotedHeadlines(value?: string | null) {
  const text = cleanPresentationText(value);
  const matches = Array.from(text.matchAll(/《([^》]{4,120})》/gu)).map((match) => match[1].trim());
  return matches.filter(Boolean);
}

function isGenericWorldTitle(value?: string | null) {
  const text = cleanPresentationText(value);
  if (!text) return true;
  return (
    /信源包|信源更新|世界新闻更新|RSS\s*.*更新|Bundle Feed|Source Feed|Global Feed/i.test(text) ||
    /news brief|no specific event|Ebola virus disease|Location mention only|Low significance administrative ban/i.test(text) ||
    /[·:：-]\s*(冲突强度上升|航运风险上升|信号更新|精选更新)$/u.test(text) ||
    /^(冲突|科技|市场|公共卫生|产能|供应链)\s*[·:：-]\s*(冲突强度上升|航运风险上升|信号更新|精选更新)/u.test(text)
  );
}

function compactSourceName(value?: string | null) {
  const text = cleanPresentationText(value);
  if (!text) return '信源';
  if (/AI HOT/i.test(text)) return 'AI HOT';
  const sentinelMatch = text.match(/ShunyaNet Sentinel\s+(.+?)\s+Bundle/i);
  if (sentinelMatch?.[1]) return `${sentinelMatch[1].replace(/Watch$/i, '').trim()}观察`;
  return text.replace(/^www\./iu, '').replace(/\s*\(RSS.*?\)\s*/u, '').replace(/\s+Feed\s+\d+$/iu, '').trim();
}

function localizeKnownHeadline(value: string) {
  return cleanPresentationText(value)
    .replace(/^(?:Ukraine|乌克兰) war:\s*Zelensky orders retaliation for Kyiv deaths\.?$/iu, '乌克兰称将回应基辅遇袭造成的死亡事件')
    .replace(/^(?:Ukraine|乌克兰) war:\s*Zelensky orders retaliation after Kyiv deaths\.?$/iu, '乌克兰称将回应基辅遇袭造成的死亡事件')
    .replace(/^Death toll in attack on Kyiv apartment building now stands at (\d+)$/iu, '基辅公寓楼遭袭死亡人数升至 $1 人')
    .replace(/^How Xi-Trump summit failed to yield Iran war breakthrough$/iu, '习特会未能推动伊朗战争取得突破')
    .replace(/^New outbreak of Ebola kills (\d+) in eastern DR Congo$/iu, '刚果（金）东部新一轮埃博拉疫情已造成 $1 人死亡')
    .replace(/^New Ebola outbreak confirmed in remote Congo province\.?$/iu, '刚果偏远省份确认新一轮埃博拉疫情')
    .replace(/^Government failure to respond to report\.?$/iu, '政府未回应相关报告引发关注')
    .replace(/^Massacre of Nigerian Christians\.?$/iu, '尼日利亚基督徒遭大规模杀害')
    .replace(/^Massacres and kidnappings targeting Christians\.?$/iu, '针对基督徒的屠杀和绑架事件')
    .replace(/^Russia and Ukraine report massive air attacks overnight\.?$/iu, '俄乌双方通报夜间大规模空袭')
    .replace(/^俄罗斯 and 乌克兰 report massive air attacks overnight\.?$/iu, '俄乌双方通报夜间大规模空袭')
    .replace(/^Nigerian state bombs own citizens in civilian front\.?$/iu, '尼日利亚一州被指轰炸本国平民区域')
    .replace(/^Ukrainian air forces detail Russian night attack in Bryansk\.?$/iu, '乌克兰空军通报布良斯克夜间袭击细节')
    .replace(/^Suicide attack killing (\d+) security personnel[，,]?\s*(?:critical|high risk|高风险)?$/iu, '自杀式袭击造成 $1 名安全人员死亡')
    .replace(/^Suicide attack on police station in (?:Pakistan|巴基斯坦):\s*(\d+) dead\.?$/iu, '巴基斯坦警察局遭自杀式袭击，造成 $1 人死亡')
    .replace(/^Mass casualty gang clash$/iu, '帮派冲突造成重大伤亡')
    .replace(/^Mass slaughter of Christians[，,]?\s*(?:high risk|高风险)?\s*security event\.?$/iu, '尼日利亚出现针对基督徒的大规模暴力事件')
    .replace(/^Settler arson attack\.?$/iu, '定居者纵火袭击')
    .replace(/^Settler arson and vandalism\.?$/iu, '定居者纵火并破坏财物')
    .replace(/^Ukraine invasion update\.?$/iu, '乌克兰战事更新')
    .replace(/^乌克兰 invasion update\.?$/iu, '乌克兰战事更新')
    .replace(/^Russo-(?:Ukraine|乌克兰) war update\.?$/iu, '俄乌战争更新')
    .replace(/^Gang clashes with mass casualties\.?$/iu, '帮派冲突造成大量伤亡')
    .replace(/^Gang clashes in Haiti leave over (\d+) dead in five days\.?$/iu, '海地帮派冲突五天内造成 $1 多人死亡')
    .replace(/^Gang clashes in Haiti kill nearly (\d+) over weekend\.?$/iu, '海地周末帮派冲突造成近 $1 人死亡')
    .replace(/^Gang clashes killing (\d+)\.?$/iu, '帮派冲突造成 $1 人死亡')
    .replace(/^Suicide terror attack on train station in (?:Russia|俄罗斯)\.?$/iu, '俄罗斯火车站遭自杀式恐怖袭击')
    .replace(/^Suicide attack on army gathering in Bajaur[，,]\s*(\d+) soldiers killed\.?$/iu, '巴焦尔军方集会遭自杀式袭击，造成 $1 名士兵死亡')
    .replace(/^New Ebola outbreak in Congo\.?$/iu, '刚果出现新一轮埃博拉疫情')
    .replace(/^Bolivia miners clash with police[，,]\s*president under fire\.?$/iu, '玻利维亚矿工与警方冲突，总统承压')
    .replace(/^Military evacuation warning in (?:Lebanon|黎巴嫩)\.?$/iu, '黎巴嫩出现军事疏散警告')
    .replace(/^Summary of military operations including bombing Kyiv\.?$/iu, '涉及基辅轰炸的军事行动更新')
    .replace(/^State bombing civilians[，,]\s*high severity\.?$/iu, '平民区遭轰炸，严重程度较高')
    .replace(/^Report of Saudi\/UAE attacking (?:Iran|伊朗)$/iu, '沙特/阿联酋可能袭击伊朗的报告')
    .replace(/^(?:Iran|伊朗) uses (?:Pakistan|巴基斯坦) land corridor due to naval pressure$/iu, '海上压力下，伊朗转向巴基斯坦陆路走廊')
    .replace(/^Political executions in (?:Iran|伊朗)$/iu, '伊朗政治处决动向')
    .replace(/^Trump says China wants to keep buying oil from (?:Iran|伊朗)\.?$/iu, '特朗普称中国仍希望购买伊朗石油')
    .replace(/^Iran news brief，?no specific event\.?$/iu, '伊朗新闻简报暂无具体事件')
    .replace(/^Gang clashes kill at least (\d+) in Port-au-Prince suburbs$/iu, '太子港郊区帮派冲突造成至少 $1 人死亡')
    .replace(/^Weapons cache seized in Canberra including 3D-printed guns.*$/iu, '堪培拉查获武器藏匿点，包括 3D 打印枪支')
    .replace(/^Boko Haram:\s*High casualties from Chadian airstrikes$/iu, '乍得空袭造成博科圣地高伤亡')
    .replace(/^Israeli strikes kill(?:ing)? civilians in\s+(.+)$/iu, '以军袭击造成$1平民伤亡')
    .replace(/^Mass drone interception over Kursk$/iu, '库尔斯克上空发生大规模无人机拦截')
    .replace(/^Russia attacks Kyiv a third day, flattening apartment block, killing 5$/iu, '俄罗斯连续第三天袭击基辅，公寓楼被毁并造成 5 人死亡')
    .replace(/^Armed clashes with dozens killed$/iu, '武装冲突造成数十人死亡')
    .replace(/^Massive Russian drone attack on Ukraine$/iu, '俄罗斯对乌克兰发动大规模无人机袭击')
    .replace(/^Israeli strikes kill 22 in Lebanon$/iu, '以军袭击黎巴嫩造成 22 人死亡')
    .replace(/^Child killed in missile strike$/iu, '导弹袭击造成儿童死亡')
    .replace(/^Ship seized off UAE's Fujairah being pulled toward Iranian waters$/iu, '阿联酋富查伊拉外海被扣船只被拖向伊朗水域')
    .replace(/^Iran .*?close.*?developing nuclear weapons.*$/iu, '美国官员称伊朗接近发展核武能力')
    .replace(/^A Sprawling .*?War Explodes$/iu, '中东大范围冲突升级')
    .replace(/^Iraq in the Vise$/iu, '伊拉克夹在多方压力之间');
}

function isLowInformationSignalSummary(value?: string | null) {
  const text = cleanPresentationText(value);
  if (!text) return true;
  return (
    text.length < 18 ||
    /^(elevated|high|medium|low)\s+[\w\s/-]+incident\.?$/iu.test(text) ||
    /^(conflict|crime|security|market|public health|technology|ai)\s*(risk|incident|signal|update)?\.?$/iu.test(text) ||
    /^(冲突|治安|安全|市场|公共卫生|科技|AI)\s*(风险|事件|信号|更新)?$/u.test(text)
  );
}

function isHeadlineLikeSignalSummary(value?: string | null) {
  const text = cleanPresentationText(value);
  if (!text) return false;
  if (/[。！？；]/u.test(text)) return false;
  return (
    text.length <= 90 &&
    /^(Israeli|Russian|Massive|Active|Boko Haram|Weapons|Ship|Iran|Day \d+|[0-9]+\s+killed|.+?\s+seized\s+in\s+)/iu.test(text)
  );
}

function localizeCasualtyPhrase(value: string) {
  const text = cleanPresentationText(value);
  return text
    .replace(/^(\d+)\s+security personnel$/iu, '$1 名安全人员死亡')
    .replace(/^at least (\d+)$/iu, '至少 $1 人死亡')
    .replace(/^civilians$/iu, '平民伤亡')
    .replace(/^nearly a dozen civilians$/iu, '近十二名平民死亡')
    .replace(/^12 people including children$/iu, '12 人死亡，其中包括儿童')
    .replace(/^multiple casualties$/iu, '多人伤亡');
}

function readableSignalFactFromTitle(signal: ReadableSignalInput) {
  const title = cleanPresentationText(signal.title || signal.display_title);
  const summary = cleanPresentationText(signal.display_summary || signal.summary);
  const source = compactSourceName(signal.source_name);
  const location = cleanPresentationText(signal.location_name);
  const factText = !isGenericWorldTitle(title) ? title : summary || title;
  const readableTitle = localizeKnownHeadline(factText);

  if (/Weapons cache seized in Canberra including 3D-printed guns/i.test(factText)) {
    return `${source} 报道：堪培拉查获一处武器藏匿点，其中包括 3D 打印枪支，属于治安和公共安全风险信号。`;
  }
  const ebola = factText.match(/^New outbreak of Ebola kills (\d+) in eastern DR Congo$/iu);
  if (ebola) {
    return `${source} 报道：刚果（金）东部出现新一轮埃博拉疫情，已造成 ${ebola[1]} 人死亡，约 246 例病例被报告。`;
  }
  const kyivDeath = factText.match(/^Death toll in attack on Kyiv apartment building now stands at (\d+)$/iu);
  if (kyivDeath) {
    return `${source} 报道：基辅一栋公寓楼遭袭后的死亡人数升至 ${kyivDeath[1]} 人，乌克兰方面称死者包括儿童。`;
  }
  if (/How Xi-Trump summit failed to yield Iran war breakthrough/i.test(factText)) {
    return `${source} 报道：美国希望中国在霍尔木兹海峡受阻问题上加大介入，但相关会晤未能带来伊朗战争突破。`;
  }
  const suicide = factText.match(/^Suicide attack killing (\d+) security personnel/i);
  if (suicide) {
    return `${source} 报道：自杀式袭击造成 ${suicide[1]} 名安全人员死亡，属于高强度安全事件。`;
  }
  if (/Mass casualty gang clash/i.test(factText)) {
    return `${source} 报道：海地帮派冲突造成重大伤亡，后续重点看官方伤亡更新和治安部署。`;
  }
  if (/Report of Saudi\/UAE attacking (?:Iran|伊朗)/i.test(factText)) {
    return `${source} 报道：出现沙特/阿联酋可能袭击伊朗的线索，仍需第二来源和官方回应确认。`;
  }
  if (/(?:Iran|伊朗) uses (?:Pakistan|巴基斯坦) land corridor due to naval pressure/i.test(factText)) {
    return `${source} 报道：受海上压力影响，伊朗相关运输可能转向巴基斯坦陆路走廊。`;
  }
  if (/Political executions in (?:Iran|伊朗)/i.test(factText)) {
    return `${source} 报道：伊朗出现政治处决相关动向，后续重点看司法口径和国际反应。`;
  }
  if (/Trump says China wants to keep buying oil from (?:Iran|伊朗)/i.test(factText)) {
    return `${source} 报道：特朗普称中国仍希望购买伊朗石油，后续看制裁执行和能源流向变化。`;
  }
  const seized = factText.match(/^(.+?) seized in (.+?) including (.+)$/iu);
  if (seized) {
    return `${source} 报道，${seized[2]} 查获 ${seized[1]}，其中包括 ${seized[3]}。`;
  }
  const israeliKill = factText.match(/^Israeli(?:\s+drone)?\s+strikes?\s+kill(?:s|ed|ing)?\s+(.+?)\s+in\s+(.+)$/iu);
  if (israeliKill) {
    return `${source} 报道：以军袭击在${israeliKill[2]}造成${localizeCasualtyPhrase(israeliKill[1])}。`;
  }
  const kill = factText.match(/^(.+?) kill(?:s|ed)? (.+?) in (.+)$/iu);
  if (kill) {
    return `${source} 报道，${kill[1]}在 ${kill[3]} 造成${kill[2]}。`;
  }
  const russianBombardment = factText.match(/^Active Russian bombardment of (.+?),?\s*(.+)$/iu);
  if (russianBombardment) {
    return `${source} 报道：俄罗斯持续轰炸 ${russianBombardment[1]}，造成${localizeCasualtyPhrase(russianBombardment[2])}。`;
  }
  const highCasualties = factText.match(/^(.+?):\s*High casualties from (.+)$/iu);
  if (highCasualties) {
    return `${source} 报道，${highCasualties[1]} 相关事件出现高伤亡，直接原因是 ${highCasualties[2]}。`;
  }
  if (readableTitle && !isGenericWorldTitle(readableTitle)) {
    return `${source} 报道：${readableTitle}。`;
  }
  if (location && location !== 'Global Feed' && !isGenericWorldTitle(location)) {
    return `${source} 在 ${location} 有更新；当前摘要不足，需要打开原文确认细节。`;
  }
  return `${source} 有更新；当前摘要不足，需要打开原文确认细节。`;
}

export function readableSignalTitle(signal: ReadableSignalInput) {
  const rawTitle = cleanPresentationText(signal.title);
  const displayTitle = cleanPresentationText(signal.display_title);
  const rawSummary = cleanPresentationText(signal.summary || signal.display_summary);
  const quoted = extractQuotedHeadlines(rawSummary);

  if (quoted.length > 0 && (isGenericWorldTitle(rawTitle) || isGenericWorldTitle(displayTitle))) {
    return `${compactSourceName(signal.source_name)}：${localizeKnownHeadline(quoted[0])}`;
  }

  const summaryCandidate = rawSummary
    .split(/(?<=[。！？!?])\s*/u)
    .find((part) => part.trim().length > 4);
  const preferred =
    !isGenericWorldTitle(displayTitle)
      ? displayTitle
      : !isGenericWorldTitle(rawTitle)
        ? rawTitle
        : summaryCandidate && !isGenericWorldTitle(summaryCandidate)
          ? summaryCandidate
          : rawTitle || displayTitle;
  return compactText(localizeKnownHeadline(preferred || compactSourceName(signal.source_name)), 72);
}

export function readableSignalSummary(signal: ReadableSignalInput, max = 150) {
  const title = readableSignalTitle(signal);
  const rawSummary = cleanPresentationText(signal.display_summary || signal.summary);
  const quoted = extractQuotedHeadlines(rawSummary);

  if (quoted.length > 0) {
    return compactText(`本轮更新包括：${quoted.slice(0, 3).map(localizeKnownHeadline).join('；')}。`, max);
  }

  if (localizeKnownHeadline(rawSummary) !== rawSummary) {
    return compactText(readableSignalFactFromTitle({ ...signal, title: rawSummary, display_title: rawSummary }), max);
  }

  const reportedHeadline = rawSummary.match(/^(.{0,80}?报道[:：]\s*)(.+?)[。.]?$/u);
  if (reportedHeadline?.[2]) {
    const localizedHeadline = localizeKnownHeadline(reportedHeadline[2]);
    if (localizedHeadline !== reportedHeadline[2]) {
      return compactText(`${reportedHeadline[1]}${localizedHeadline}。`, max);
    }
  }

  if (
    isLowInformationSignalSummary(rawSummary) ||
    isHeadlineLikeSignalSummary(rawSummary) ||
    rawSummary === cleanPresentationText(signal.title) ||
    rawSummary === cleanPresentationText(signal.display_title) ||
    rawSummary === title
  ) {
    return compactText(readableSignalFactFromTitle(signal), max);
  }

  return compactText(rawSummary, max);
}

export function readableSignalSourceLine(signal: ReadableSignalInput) {
  const parts = [
    compactSourceName(signal.source_name),
    cleanPresentationText(signal.location_name),
    sceneDisplayLabel((signal.scene || 'global') as WorldScene),
  ].filter((part, index, array) => part && array.indexOf(part) === index);
  return parts.join(' · ');
}

export function mainWorldSignalRank(signal: DashboardSignalLike) {
  const catalogPenalty = signal.tags.some((tag) => /catalog-source/i.test(tag)) || /Bundle Feed/i.test(signal.source_name) ? 2 : 0;
  const genericPenalty = isGenericWorldTitle(signal.title) || isGenericWorldTitle(signal.display_title) ? 1 : 0;
  return catalogPenalty + genericPenalty;
}

export function mainWorldSignalPriority(signal: DashboardSignalLike) {
  const haystack = `${signal.scene} ${(signal.tags || []).join(' ')} ${signal.title} ${signal.summary || ''}`;
  const topicBoost = /(war|conflict|diplomacy|sanction|military|health|outbreak|ai|technology|chip|semiconductor|market|macro|shipping|energy|冲突|外交|制裁|军事|公共卫生|科技|芯片|市场|航运|能源)/iu.test(haystack)
    ? 0.2
    : 0;
  const localCrimePenalty = /(gangster|rape|assault|prison|local-news|crime)/iu.test(haystack) ? 0.28 : 0;
  return (
    signal.severity * 0.18 +
    (signal.relevance_score || 0) * 0.34 +
    signal.hotspot_score * 0.24 +
    signal.exploration_score * 0.12 +
    topicBoost -
    localCrimePenalty
  );
}

export function techAiRelevanceScore(signal: DashboardSignalLike) {
  const haystack = [
    signal.title,
    signal.summary || '',
    signal.display_title,
    signal.display_summary,
    signal.source_name,
    signal.source_url || '',
    signal.tags.join(' '),
    (signal.alignment_tags || []).join(' '),
  ].join(' ').toLowerCase();
  const sourceHaystack = [signal.source_name, signal.source_url || '', (signal.alignment_tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
  const contentHaystack = [signal.title, signal.summary || '', signal.display_title, signal.display_summary]
    .join(' ')
    .toLowerCase();
  let score = 0;

  if (/(ai hot|aihot|source:aihot)/i.test(sourceHaystack)) {
    score += 4.5;
  } else if (/model:ai-related/i.test(sourceHaystack)) {
    score += 3;
  } else if (/model:not-ai-related/i.test(sourceHaystack)) {
    score -= 4;
  } else if (/(inkwell ai|新智元|智猩猩|ai工程化|机器之心|量子位|aigc|ai科技评论|ai信息gap|深度学习与nlp|玄姐聊agi|袋鼠帝ai)/i.test(sourceHaystack)) {
    score += 1.5;
  }
  if (/(openai|anthropic|claude|hugging face|berkeley rdi|deepmind|google ai|meta ai|mistral|xai|qwen|deepseek)/i.test(haystack)) {
    score += 3;
  }
  if (/(^|[^a-z])(ai|llm|agentic|chatgpt|gemini|codex|aigc|transformer|diffusion|multimodal|neural)([^a-z]|$)|人工智能|大模型|智能体|多模态|生成式|推理模型|基础模型|模型训练|模型推理/.test(contentHaystack)) {
    score += 3;
  }
  if (/(machine learning|deep learning|agent|model|inference|fine[-\s]?tuning|embedding|prompt|eval|benchmark|机器学习|深度学习|模型|推理|训练|提示词|评测|基准)/i.test(contentHaystack)) {
    score += 2;
  }
  if (/(gpu|nvidia|chip|semiconductor|datacenter|data center|算力|芯片|数据中心|开源|arxiv|github|mcp|workflow|tool|skill)/i.test(contentHaystack)) {
    score += 1;
  }
  if (
    !/(ai hot|aihot|source:aihot)/i.test(sourceHaystack) &&
    /(we-mp-rss|source:wechat|feed:)/i.test(sourceHaystack) &&
    !/(\bai\b|\bllm\b|openai|anthropic|claude|chatgpt|gemini|codex|agent|agentic|model|inference|benchmark|aigc|人工智能|大模型|智能体|模型|推理|训练|评测|算力|芯片|开源)/i.test(contentHaystack)
  ) {
    score -= 3;
  }
  if (/(world monitor|shunyanet|guardian world|npr news|rssallnews|signal arena|livebench)/i.test(haystack)) {
    score -= 2;
  }
  if (/(war|conflict|missile|ceasefire|sanction|shipping|oil|gas|drug|device|medical|health|quantum computing|冲突|军事|制裁|航运|原油|天然气|药品|医疗|公共卫生|量子计算)/i.test(haystack)) {
    score -= 1.5;
  }

  return score;
}

export function isTrustedTechAiDashboardSignal(signal: DashboardSignalLike) {
  const content = [signal.title, signal.summary || '', signal.display_title, signal.display_summary].join(' ');
  if (/发送失败|违反相关法律法规|查看对应规则|内容无法显示|已被删除|不可见/u.test(content)) return false;
  return techAiRelevanceScore(signal) >= 3;
}

export function techAiSignalRank(signal: DashboardSignalLike) {
  const haystack = [signal.source_name, signal.source_url || '', signal.tags.join(' '), (signal.alignment_tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
  if (/(ai hot|aihot|source:aihot)/.test(haystack)) return 0;
  if (/inkwell ai/.test(haystack)) return 1;
  if (/openai|anthropic|claude|hugging face|berkeley rdi/.test(haystack)) return 2;
  if (/新智元|智猩猩|ai工程化|机器之心|量子位|aigc|ai科技评论|ai信息gap|深度学习与nlp/.test(haystack)) return 3;
  return Math.max(3, 8 - techAiRelevanceScore(signal));
}

export function dashboardSignalMatchesScene(signal: DashboardSignalLike, scene: WorldScene) {
  if (scene === 'global') {
    return true;
  }
  if (scene === 'geo-politics-daily') {
    const sourceHaystack = `${signal.source_name} ${signal.source_url || ''} ${signal.tags.join(' ')} ${(signal.alignment_tags || []).join(' ')}`;
    if (/(ai hot|aihot|source:aihot)/iu.test(sourceHaystack)) return false;
    const haystack = `${signal.scene} ${signal.title} ${signal.summary || ''} ${signal.tags.join(' ')}`;
    return !/(kim kardashian|celebrity|defamation|entertainment|local-news|quiz|reality show|mbappe|real madrid|football|soccer|sports|news brief|no specific event|location mention only|children driving incident|low significance administrative ban|名人|娱乐|诽谤|问答|测验|真人秀|足球|体育)/iu.test(haystack);
  }
  if (scene === 'tech-ai') {
    const haystack = [
      signal.scene,
      signal.title,
      signal.summary || '',
      signal.display_title,
      signal.display_summary,
      signal.source_name,
      signal.tags.join(' '),
    ].join(' ');
    return /\b(ai|llm|ml)\b|aihot|openai|anthropic|claude|gemini|deepseek|qwen|kimi|minimax|agent|model|nvidia|semiconductor|chip|arxiv|hugging ?face|人工智能|大模型|模型|智能体|英伟达|芯片|半导体/iu.test(
      haystack,
    );
  }
  return true;
}

export function dashboardNodeMatchesScene(node: WorldStateNode, scene: WorldScene) {
  if (scene === 'tech-ai') {
    const haystack = `${node.scene} ${node.title} ${node.summary} ${node.display_title} ${node.display_summary} ${node.source_name} ${node.tags.join(' ')}`;
    return /\bai\b|llm|model|agent|openai|anthropic|claude|gemini|nvidia|人工智能|大模型|模型|智能体|英伟达/iu.test(haystack);
  }
  if (scene === 'geo-politics-daily' || scene === 'global') {
    const haystack = `${node.scene} ${node.title} ${node.summary} ${node.tags.join(' ')}`;
    return !/(kim kardashian|celebrity|defamation|entertainment|local-news|quiz|reality show|mbappe|real madrid|football|soccer|sports|news brief|no specific event|location mention only|children driving incident|low significance administrative ban|名人|娱乐|诽谤|问答|测验|真人秀|足球|体育)/iu.test(haystack);
  }
  return true;
}

function readableTagLabel(tag: string) {
  const normalized = tag.trim().toLowerCase();
  const labels: Record<string, string> = {
    conflict: '冲突',
    global: '全球',
    news: '新闻',
    rss: 'RSS',
    'rss-item': 'RSS',
    technology: '科技',
    ai: 'AI',
    aihot: 'AI Hot',
    'ai-news': 'AI',
    'daily:ai': 'AI',
    'daily:geo': '地缘',
    'ai-products': 'AI 产品',
    'ai-agents': 'Agent',
    'ai-research': '论文',
    'category:ai-daily': 'AI 日报',
    'category:technology-daily': '科技',
    'aihot:category:ai-products': 'AI 产品',
    'aihot:category:ai-agents': 'Agent',
    'aihot:category:ai-research': '论文',
    'source-feed': '信源池',
    'we-mp-rss': '公众号',
    health: '公共卫生',
    outbreak: '疫情',
    security: '安全',
    diplomacy: '外交',
    sanction: '制裁',
    military: '军事',
    research: '研究',
    literature: '论文',
  };
  if (labels[normalized]) return labels[normalized];
  if (/^feed:|^type:|^source:/.test(normalized)) return '';
  if (/^daily:|^category:|^aihot:category:/.test(normalized)) return '';
  if (/use conventional military force|physically assault|security personnel|suicide bomber/i.test(tag)) return '';
  if (/^[A-Z\s-]{4,}$/.test(tag)) return '';
  if (/^[a-z0-9-]+-rss$/.test(normalized)) return '';
  return cleanPresentationText(tag).slice(0, 24);
}

export function readableSignalTags(tags: string[] | undefined | null, limit = 3) {
  return [...new Set((tags || []).map(readableTagLabel).filter(Boolean))].slice(0, limit);
}
