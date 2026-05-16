export type SignalNormalization = {
  isAiRelated?: boolean;
  lowInformation?: boolean;
  displayTitleZh?: string;
  displaySummaryZh?: string;
  eventType?: string;
  dailyBucket?: 'geo' | 'ai' | 'other' | 'ignore';
  tagsZh?: string[];
  scene?: 'tech-ai' | 'geo-politics-daily' | 'global' | 'ignore';
  needsReview?: boolean;
};

function cleanText(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}

function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, 6);
  return tags.length ? [...new Set(tags)] : undefined;
}

export function buildSignalNormalizationPromptPrefix() {
  return [
    '把下面的新信源信号标准化，输出给世界脉络前端使用。',
    '你只做三类模型任务：中文可读化、AI 强相关二分类、必要标签。',
    '代码会负责最终分数、排序、阈值和是否精选；你不要输出评分、推荐理由或长分析。',
    '',
    '每项必须返回这些字段：',
    '- id: 原样返回。',
    '- isAiRelated: boolean。只有强相关人工智能、机器学习、大模型、Agent、模型评测、AI 产品、AI 工具、AI 开源、AI 芯片或 AI 产业时才为 true。',
    '- lowInformation: boolean。只有地点、来源名、模板句、标题清单、结构化快照、行情快照、无具体事件、无法判断发生了什么时必须为 true。',
    '- displayTitleZh: 面向中文用户的具体事实标题，18 到 42 个汉字左右；不要写“信源更新”“信号更新”“冲突强度上升”。',
    '- displaySummaryZh: 一句自然中文，说明发生了什么、主体是谁、数量/地点/影响是什么；不要复述标题清单。',
    '- eventType: 简短英文枚举，如 conflict, diplomacy, public-health, ai-model, ai-agent, ai-product, ai-infra, chip, market, source-snapshot, other。',
    '- dailyBucket: geo | ai | other | ignore。',
    '- tagsZh: 2 到 5 个中文短标签。',
    '- scene: tech-ai | geo-politics-daily | global | ignore。',
    '- needsReview: boolean。事实不充分、来源疑似模板或需要人工确认时为 true。',
    '',
    '低信息规则：',
    '- 如果看不出具体事件或具体 AI 动态，lowInformation=true，dailyBucket=ignore，scene=ignore。',
    '- 不要为了通过低信息检查而编造事实；不知道就标 lowInformation。',
    '- 如果原文只有地点串、来源名、RSS 包名、标题列表、接口样本摘要，必须低信息。',
    '',
    '输出格式：',
    '只返回 JSON 数组；不要输出解释、Markdown、<think> 或 JSON 之外内容。',
  ].join('\n');
}

export function sanitizeSignalNormalization(value: Record<string, unknown>): SignalNormalization | null {
  const normalized: SignalNormalization = {};
  if (typeof value.isAiRelated === 'boolean') normalized.isAiRelated = value.isAiRelated;
  if (typeof value.lowInformation === 'boolean') normalized.lowInformation = value.lowInformation;
  if (typeof value.needsReview === 'boolean') normalized.needsReview = value.needsReview;

  normalized.displayTitleZh = cleanText(value.displayTitleZh, 80);
  normalized.displaySummaryZh = cleanText(value.displaySummaryZh, 220);
  normalized.eventType = cleanText(value.eventType, 40);
  normalized.tagsZh = cleanTags(value.tagsZh);

  if (value.dailyBucket === 'geo' || value.dailyBucket === 'ai' || value.dailyBucket === 'other' || value.dailyBucket === 'ignore') {
    normalized.dailyBucket = value.dailyBucket;
  }
  if (value.scene === 'tech-ai' || value.scene === 'geo-politics-daily' || value.scene === 'global' || value.scene === 'ignore') {
    normalized.scene = value.scene;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
