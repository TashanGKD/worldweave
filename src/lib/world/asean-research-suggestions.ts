const ASEAN_RESEARCH_QUESTION_POOL = [
  '未来一年马来西亚燃油价格若继续波动，哪些数据中心成本项最需要复核？',
  '越南、泰国和印尼的数据中心扩张，分别卡在哪些电力供需和电网承载问题上？',
  '新加坡、马来西亚和泰国谁更适合作为广西算力服务出海的第一批合作入口？',
  '东盟哪些国家的绿电供给更适合支撑长期算力合作，哪些仍需谨慎推进？',
  '按网络设施、电力供应和市场需求三类线索，广西应优先跟进哪些东盟国家？',
  '未来三年东盟哪些国家可能出现算力供给缺口，广西可以提供哪些协同支撑？',
  '马来西亚能源成本预测结果，如何辅助判断数据中心电力成本压力？',
  '越南和泰国的产业增长，会不会放大数据中心用电和绿电采购压力？',
  '印尼、菲律宾和越南的海缆与网络设施变化，对算力服务落点有什么影响？',
  '哪些东盟国家适合先做绿色算力试点，哪些更适合只保留项目线索观察？',
  '如果燃油价格回落但用电需求上升，马来西亚数据中心成本压力会怎么变化？',
  '新加坡外溢需求向马来西亚、印尼和泰国转移时，广西应重点看哪些指标？',
  '哪些国家同时具备市场需求、网络设施和绿电支撑，适合进入出海优先清单？',
  '电力供需压力、绿电占比和燃料价格三类数据，能否解释东盟算力落点差异？',
  '东盟主要国家近一年政策和项目线索中，哪些具体事件最值得纳入后续研判？',
  '广西在跨境算力合作中，应优先补齐哪些可验证来源和月度数据？',
  '马来西亚、越南、泰国的电力约束，分别会怎样影响本地数据中心招商？',
  '哪些东盟国家适合推进能源成本跟踪模型，哪些目前只能做综合排序？',
];

function dateKeyInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDailyAseanResearchQuestions(date = new Date(), limit = 3) {
  const random = seededRandom(hashString(dateKeyInShanghai(date)));
  return ASEAN_RESEARCH_QUESTION_POOL
    .map((question) => ({ question, rank: random() }))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, limit)
    .map((item) => item.question);
}
