import type { WorldScene } from './types';
import type { AseanDatasetMetric, AseanDatasetSourceHealth } from './asean-dataset-metrics';

export type AseanSignalLike = {
  id?: string | null;
  title?: string | null;
  summary?: string | null;
  display_title?: string | null;
  display_summary?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  published_at?: string | null;
  publishedAt?: string | null;
  location_name?: string | null;
  locationName?: string | null;
  country?: string | null;
  region?: string | null;
  scene?: WorldScene | null;
  tags?: string[] | null;
  alignment_tags?: string[] | null;
  alignmentTags?: string[] | null;
  severity?: number | null;
  relevance_score?: number | null;
  hotspot_score?: number | null;
};

export type AseanTopicKey =
  | 'trade_supply_chain'
  | 'maritime_security'
  | 'politics_security'
  | 'health_climate'
  | 'market_macro'
  | 'technology_infrastructure';

export type AseanForecastQuestion = {
  question_id: string;
  title: string;
  topic: AseanTopicKey;
  country_scope: string[];
  metric: string;
  unit: string;
  target_window: string;
  range_options: string[];
  resolution_source: string;
  resolution_rule: string;
  why_now: string;
  evidence_signal_ids: string[];
};

export type AseanResearchBlueprint = {
  key: string;
  title: string;
  topic: AseanTopicKey;
  metric: string;
  target_window: string;
  range_options: string[];
  primary_resolution_sources: string[];
  admission_rule: string;
};

export type AseanTopicSignalCard = {
  id: string;
  title: string;
  summary: string;
  source_name: string | null;
  source_url: string | null;
  source_category: AseanSourceCategory;
  published_at: string | null;
  country_scope: string[];
  topic: AseanTopicKey;
  score: number;
  related_signal_count: number;
  credibility_score?: number;
  credibility_level?: 'high' | 'medium' | 'watch';
  urgency_level?: 'high' | 'elevated' | 'monitoring';
  dedupe_key?: string;
  verification_flags?: string[];
  conflict_group?: string | null;
  evidence_sources?: AseanSignalEvidenceSource[];
  evidence_signal_ids?: string[];
};

export type AseanTopicCluster = {
  key: AseanTopicKey;
  title: string;
  signal_count: number;
  country_scope: string[];
  signal_ids: string[];
};

export type AseanTopicSource = {
  name: string;
  category: string;
  scope: string;
  url: string;
  status: 'active' | 'candidate';
  source_type?: 'webpage' | 'pdf' | 'rss' | 'api-json' | 'csv' | 'github';
  priority?: 'p0' | 'p1' | 'p2';
  ingestion?: 'static-anchor' | 'polling' | 'dataset' | 'search-seed';
  dedupe_key?: string;
  topic_tags?: AseanTopicKey[];
  verification?: string;
};

export type AseanSourceCategory = 'official' | 'regional_organization' | 'international_organization' | 'corporate_official' | 'media' | 'monitoring';

export type AseanSignalEvidenceSource = {
  name: string;
  url: string | null;
  category: AseanSourceCategory;
};

export type AseanSourceBreakdown = {
  category: AseanSourceCategory;
  label: string;
  count: number;
  sources: Array<{ name: string; count: number; url: string | null }>;
};

export type AseanTimelineItem = {
  id: string;
  kind: 'signal' | 'metric';
  title: string;
  summary: string;
  source_name: string | null;
  source_url: string | null;
  published_at: string | null;
  country_scope: string[];
  topic: AseanTopicKey;
  credibility_score: number;
  conflict_group: string | null;
};

export type AseanValidationSummary = {
  source_count: number;
  official_or_institutional_source_count: number;
  dataset_metric_count: number;
  dedupe_collapsed_count: number;
  multi_source_cluster_count: number;
  possible_conflict_count: number;
  method: string[];
};

export type AseanCollectionAxis = {
  key: string;
  label: string;
  description: string;
  source_count: number;
  active_source_count: number;
  signal_count: number;
  metric_count: number;
  primary_topics: AseanTopicKey[];
  status: 'covered' | 'building' | 'thin';
};

export type AseanSourceProcessingProfile = {
  name: string;
  category: string;
  scope: string;
  url: string;
  source_type: AseanTopicSource['source_type'];
  ingestion: AseanTopicSource['ingestion'];
  priority: AseanTopicSource['priority'];
  status: AseanTopicSource['status'];
  health: 'contributing' | 'ready' | 'degraded' | 'candidate';
  signal_count: number;
  metric_count: number;
  contribution_count: number;
  latest_seen_at: string | null;
  topic_tags: AseanTopicKey[];
  selected_for_polling: boolean;
  selected_for_dataset: boolean;
  run_selected: boolean;
  handling: string;
  issue: string | null;
};

export type AseanSourceProcessingSummary = {
  total_source_count: number;
  active_source_count: number;
  candidate_source_count: number;
  contributing_source_count: number;
  degraded_source_count: number;
  dataset_source_count: number;
  polling_source_count: number;
  static_anchor_count: number;
  selected_polling_source_count: number;
  selected_dataset_source_count: number;
  run_selected_source_count: number;
  selected_contributing_source_count: number;
  selected_no_contribution_source_count: number;
  ready_unselected_source_count: number;
  profiles: AseanSourceProcessingProfile[];
};

export type AseanCountRow = {
  label: string;
  count: number;
};

export type AseanGraphNodeType = 'country' | 'external_actor' | 'issue' | 'event_cluster' | 'route_or_asset' | 'forecast_question';
export type AseanGraphRelation =
  | 'located_in'
  | 'involves'
  | 'affects'
  | 'related_to_issue'
  | 'supports_question'
  | 'supply_chain_link';
export type AseanGraphConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' | 'TEMPLATE';

export type AseanGraphNode = {
  id: string;
  label: string;
  type: AseanGraphNodeType;
  community: AseanTopicKey | 'regional_context';
  confidence: AseanGraphConfidence;
  weight: number;
  country_scope?: string[];
  issue?: AseanTopicKey;
  evidence_signal_ids?: string[];
  x?: number;
  y?: number;
};

export type AseanGraphEdge = {
  source: string;
  target: string;
  relation: AseanGraphRelation;
  confidence: AseanGraphConfidence;
  weight: number;
  evidence_signal_ids: string[];
};

export type AseanGraph = {
  nodes: AseanGraphNode[];
  edges: AseanGraphEdge[];
  constraints: {
    ontology_version: string;
    max_nodes: number;
    time_window_days: number;
    allowed_node_types: AseanGraphNodeType[];
    allowed_relations: AseanGraphRelation[];
    hub_policy: string;
  };
};

const ASEAN_COUNTRIES = [
  { key: 'indonesia', label: '印尼', pattern: /(indonesia|jakarta|印尼|印度尼西亚)/iu },
  { key: 'malaysia', label: '马来西亚', pattern: /(malaysia|kuala lumpur|马来西亚|吉隆坡)/iu },
  { key: 'singapore', label: '新加坡', pattern: /(singapore|新加坡)/iu },
  { key: 'thailand', label: '泰国', pattern: /(thailand|bangkok|泰国|曼谷)/iu },
  { key: 'vietnam', label: '越南', pattern: /(vietnam|hanoi|越南|河内)/iu },
  { key: 'philippines', label: '菲律宾', pattern: /(philippines|manila|菲律宾|马尼拉)/iu },
  { key: 'myanmar', label: '缅甸', pattern: /(myanmar|burma|yangon|缅甸|仰光)/iu },
  { key: 'cambodia', label: '柬埔寨', pattern: /(cambodia|phnom penh|柬埔寨|金边)/iu },
  { key: 'laos', label: '老挝', pattern: /(laos|lao pdr|vientiane|老挝|万象)/iu },
  { key: 'brunei', label: '文莱', pattern: /(brunei|文莱)/iu },
  { key: 'timor-leste', label: '东帝汶', pattern: /(timor-leste|east timor|dili|东帝汶|帝力)/iu },
];

const ASEAN_REGION_PATTERN = /(\basean\b|东盟|\bsoutheast asia\b|\bsouth-east asia\b|东南亚|\brcep\b|\bmekong\b|湄公河|\bmalacca\b|马六甲|\bsouth china sea\b|南海)/iu;

const TOPIC_DEFINITIONS: Record<AseanTopicKey, { title: string; pattern: RegExp }> = {
  trade_supply_chain: {
    title: '贸易与供应链',
    pattern: /(\btariffs?\b|\btrade\b|\bexports?\b|\bimports?\b|\bsupply chain\b|\bsemiconductors?\b|\bchips?\b|\bevs?\b|\bbatter(?:y|ies)\b|\bnickel\b|\bpalm oil\b|\brubber\b|\brice\b|\bmanufacturing\b|关税|贸易|出口|进口|供应链|半导体|芯片|电动车|电池|镍|棕榈油|大米|制造业)/iu,
  },
  maritime_security: {
    title: '海上通道与安全',
    pattern: /(\bsouth china sea\b|\bmaritime\b|\bnaval\b|\bcoast guard\b|\bshipping\b|\bvessels?\b|\bstraits?\b|\bmalacca\b|\bpatrols?\b|\bexercises?\b|南海|海上|海警|海军|航运|船只|海峡|马六甲|巡逻|军演)/iu,
  },
  politics_security: {
    title: '政治与安全',
    pattern: /(\belections?\b|\bministers?\b|\bparliament\b|\bcoup\b|\bconflicts?\b|\bborders?\b|\binsurgents?\b|\bmilitary\b|\bdiplomacy\b|\bsummits?\b|\bprotests?\b|选举|部长|议会|政变|冲突|边境|武装|军方|外交|峰会|抗议)/iu,
  },
  health_climate: {
    title: '公共卫生与气候',
    pattern: /(\bdengue\b|\bhaze\b|\bfloods?\b|\btyphoons?\b|\bearthquakes?\b|\bvolcano(?:es)?\b|\btsunami\b|\bstorms?\b|\bcyclones?\b|\bwildfires?\b|\bdroughts?\b|\bheat\b|\bdiseases?\b|\boutbreaks?\b|\bclimate\b|\bair pollution\b|\bdisasters?\b|登革热|烟霾|洪水|台风|地震|火山|海啸|风暴|气旋|野火|火灾|干旱|高温|疫情|疾病|气候|空气污染|灾害)/iu,
  },
  market_macro: {
    title: '市场与宏观',
    pattern: /(\bcurrencies?\b|\binflation\b|\bgdp\b|\brates?\b|\bcentral banks?\b|\bmarkets?\b|\bstocks?\b|\bbonds?\b|\binvestments?\b|\bfdi\b|\btourism\b|\bvisas?\b|汇率|通胀|利率|央行|市场|股市|债券|投资|外资|旅游|签证)/iu,
  },
  technology_infrastructure: {
    title: '科技与基础设施',
    pattern: /(\bdata centers?\b|\bai\b|\bcloud\b|\btelecom\b|\b5g\b|\brail\b|\bports?\b|\bpower\b|\bgrids?\b|\binfrastructure\b|数据中心|人工智能|云|电信|5g|铁路|港口|电力|电网|基础设施)/iu,
  },
};

const ASEAN_TOPIC_ORDER: AseanTopicKey[] = [
  'maritime_security',
  'trade_supply_chain',
  'politics_security',
  'health_climate',
  'market_macro',
  'technology_infrastructure',
];

export const ASEAN_TOPIC_TITLES: Record<AseanTopicKey, string> = Object.fromEntries(
  Object.entries(TOPIC_DEFINITIONS).map(([key, value]) => [key, value.title]),
) as Record<AseanTopicKey, string>;

const COLLECTION_AXIS_DEFINITIONS: Array<{
  key: string;
  label: string;
  description: string;
  primary_topics: AseanTopicKey[];
  pattern: RegExp;
}> = [
  {
    key: 'energy_power',
    label: '能源电力',
    description: '电价、电网、跨境电力、新能源、燃料和供电可靠性。',
    primary_topics: ['technology_infrastructure', 'market_macro', 'health_climate'],
    pattern: /(electricity|power|grid|energy|renewable|solar|wind|hydro|lng|fuel|tariff|net metering|green power|clean energy|电力|电价|电网|能源|新能源|可再生|光伏|风电|水电|燃料|绿电|清洁能源)/iu,
  },
  {
    key: 'compute_data_center',
    label: '算力与数据中心',
    description: 'AI算力、数据中心、云服务、GPU供给、通信和数字基础设施。',
    primary_topics: ['technology_infrastructure', 'trade_supply_chain', 'market_macro'],
    pattern: /(data centers?|datacentres?|compute|computing|gpu|cloud|ai|artificial intelligence|telecom|5g|digital infrastructure|数据中心|算力|智算|gpu|云|人工智能|通信|数字基础设施)/iu,
  },
  {
    key: 'maritime_ports',
    label: '港口航运与通道',
    description: '南海、马六甲、港口、船流、航运扰动和通道安全。',
    primary_topics: ['maritime_security', 'trade_supply_chain', 'market_macro'],
    pattern: /(south china sea|malacca|maritime|shipping|vessel|ship|port|ais|chokepoint|strait|naval|coast guard|南海|马六甲|海上|航运|船舶|船只|港口|通道|海峡|海警|海军)/iu,
  },
  {
    key: 'industry_trade',
    label: '贸易与产业链',
    description: '关税、供应链迁移、半导体、电池、关键矿产、制造业和投资项目。',
    primary_topics: ['trade_supply_chain', 'market_macro', 'technology_infrastructure'],
    pattern: /(trade|tariff|supply chain|semiconductor|chip|battery|nickel|ev|manufacturing|investment|industrial|export|import|贸易|关税|供应链|半导体|芯片|电池|镍|电动车|制造业|产业|投资|出口|进口)/iu,
  },
  {
    key: 'macro_investment',
    label: '宏观与投资',
    description: 'GDP、FDI、通胀、汇率、利率、旅游、资本流动和市场政策。',
    primary_topics: ['market_macro', 'trade_supply_chain'],
    pattern: /(gdp|fdi|inflation|currency|exchange rate|interest rate|central bank|tourism|visa|capital flow|market|宏观|gdp|外资|通胀|汇率|利率|央行|旅游|签证|资本流动|市场)/iu,
  },
  {
    key: 'public_risk',
    label: '公共风险与灾害',
    description: '地震、洪水、台风、火灾、烟霾、公共卫生和气候风险。',
    primary_topics: ['health_climate', 'technology_infrastructure'],
    pattern: /(gdacs|usgs|eonet|earthquake|flood|typhoon|storm|wildfire|haze|drought|dengue|outbreak|health|climate|disaster|地震|洪水|台风|风暴|野火|火灾|烟霾|干旱|登革热|疫情|公共卫生|气候|灾害)/iu,
  },
  {
    key: 'political_security',
    label: '政治安全与政策',
    description: '选举、边境、冲突、外交、安全合作、抗议和监管政策。',
    primary_topics: ['politics_security', 'maritime_security'],
    pattern: /(election|border|conflict|military|security|diplomacy|minister|summit|protest|riot|regulation|policy|acled|gdelt|选举|边境|冲突|军方|安全|外交|部长|峰会|抗议|监管|政策)/iu,
  },
];

export const ASEAN_SOURCE_POOL: AseanTopicSource[] = [
  {
    name: '中国政府网',
    category: '中央权威发布',
    scope: '中国—东盟人工智能合作、部长级会议、国家层面政策表述',
    url: 'https://www.gov.cn/yaowen/liebiao/202509/content_7041560.htm',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure', 'politics_security'],
  },
  {
    name: '广西通信管理局',
    category: '广西数字基础设施',
    scope: '广西—东盟人工智能应用生态、智算产业园、跨境合作成果',
    url: 'https://gxca.miit.gov.cn/xwdt/gzdt/art/2025/art_f0d11ad1e3304bc68d92d6513f1d8dc7.html',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure'],
  },
  {
    name: '一带一路能源合作网',
    category: '能源电力合作',
    scope: '中国—东盟清洁能源合作、跨境电力、智慧电网和能源AI应用',
    url: 'https://obor.nea.gov.cn/detail/22392.html',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure'],
  },
  {
    name: '商务部对外投资绿色指南',
    category: '经贸与绿色产业',
    scope: '东盟绿色经济、可持续能源、产业链合作和对外投资风险提示',
    url: 'https://www.mofcom.gov.cn/dl/gbdqzn/upload/lvse-dongmeng.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['trade_supply_chain', 'technology_infrastructure'],
  },
  {
    name: '中国—东盟人工智能计算中心',
    category: '算力基础设施',
    scope: '智算中心、算力服务、项目申报、东盟场景应用和国产算力生态',
    url: 'https://ca-aicc.com/index.html',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure'],
  },
  {
    name: '中国电力网',
    category: '电力行业信息',
    scope: '南方电网、广西电网、中国—东盟能源人工智能创新合作中心和跨境电力合作',
    url: 'https://www.chinapower.org.cn/index.php/detail/450706.html',
    status: 'active',
    source_type: 'webpage',
    priority: 'p1',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure'],
  },
  {
    name: '中国日报广西频道',
    category: '公开媒体报道',
    scope: '中国—东盟人工智能计算中心、广西数字经济、算力服务和应用场景',
    url: 'https://gx.chinadaily.com.cn/a/202310/07/WS6521201ba310936092f24e6b.html',
    status: 'active',
    source_type: 'webpage',
    priority: 'p1',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure'],
  },
  {
    name: 'ASEAN Centre for Energy',
    category: '东盟能源合作',
    scope: 'APAEC、东盟电网、区域能源展望、可再生能源、能效和跨境能源合作',
    url: 'https://aseanenergy.org/press-release/asean-ministers-endorse-apaec-2026-2030-to-advance-regional-energy-cooperation',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 HTML; RSS endpoints unavailable, use as official static anchor',
  },
  {
    name: 'ACE ASEAN Power Grid Updates 2025',
    category: '东盟电网专题',
    scope: '东盟电网项目更新、跨境电力互联、区域输电通道和电力市场合作',
    url: 'https://aseanenergy.org/publications/asean-power-grid-updates-2025/',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 HTML; PDF direct URL unstable, use publication page as official anchor',
  },
  {
    name: 'ACE ASEAN Energy Statistics Leaflet 2025',
    category: '东盟能源统计',
    scope: '东盟能源供需、发电结构、电力指标和区域能源统计摘要',
    url: 'https://aseanenergy.org/publications/asean-energy-statistics-leaflet-2025',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 HTML; PDF direct URL unstable, use publication page as official anchor',
  },
  {
    name: 'Singapore IMDA Green DC Roadmap',
    category: '数据中心与绿色算力',
    scope: '新加坡绿色数据中心路线图、算力扩容、能源效率、液冷和可持续数字基础设施',
    url: 'https://www.imda.gov.sg/how-we-can-help/green-dc-roadmap',
    status: 'active',
    source_type: 'webpage',
    priority: 'p0',
    ingestion: 'static-anchor',
    topic_tags: ['technology_infrastructure', 'health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 HTML',
  },
  {
    name: 'ASEAN Sustainable Data Centre Guide',
    category: '东盟数据中心规范',
    scope: '东盟可持续数据中心发展指南，覆盖绿色数据中心、能源效率、基础设施规划和区域数字经济协同',
    url: 'https://asean.org/wp-content/uploads/2026/01/2.-ASEAN-Guide-for-Sustainable-Data-Centre-Development_Dec-2025-Final.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'health_climate', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 1.8 MB',
  },
  {
    name: 'ASEAN Digital Masterplan 2030',
    category: '东盟数字基础设施规划',
    scope: '东盟数字总体规划2030，覆盖AI能力、数据治理、数字基础设施、绿色数字化和区域数字经济协同',
    url: 'https://asean.org/wp-content/uploads/2026/01/ASEAN-Digital-Master-Plan-2030-final-2026.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'trade_supply_chain', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 10.3 MB',
  },
  {
    name: 'ASEAN Digital Economy Framework Agreement Summary',
    category: '东盟数字经济框架',
    scope: 'DEFA公开摘要，覆盖跨境数字贸易、数据流动、数字身份、支付和数字经济规则协调',
    url: 'https://asean.org/wp-content/uploads/2023/10/ASEAN-Digital-Economy-Framework-Agreement-Public-Summary_Final-published-version-1.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'trade_supply_chain', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 3.6 MB',
  },
  {
    name: 'ASEAN Guide on AI Governance and Ethics',
    category: '东盟AI治理',
    scope: '东盟AI治理与伦理指南，覆盖可信AI、风险治理、组织治理、数据治理和区域政策协调',
    url: 'https://asean.org/wp-content/uploads/2024/02/ASEAN-Guide-on-AI-Governance-and-Ethics_beautified_201223_v2.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'politics_security', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 4.2 MB',
  },
  {
    name: 'ASEAN Expanded AI Guide on Generative AI',
    category: '东盟生成式AI治理',
    scope: '东盟生成式AI治理扩展指南，覆盖生成式AI风险、应用责任、治理流程和区域政策实践',
    url: 'https://asean.org/wp-content/uploads/2025/01/Expanded-ASEAN-Guide-on-AI-Governance-and-Ethics-Generative-AI.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'politics_security', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 2.9 MB; Node fetch may intermittently fail, PowerShell/browser-style request succeeded',
  },
  {
    name: 'ASEAN Responsible AI Roadmap 2025-2030',
    category: '东盟AI路线图',
    scope: '东盟负责任AI路线图，覆盖2025-2030年区域AI治理、能力建设、产业落地和跨境协作方向',
    url: 'https://asean.org/wp-content/uploads/2025/02/ASEAN-Responsible-AI-Roadmap-Final.docx.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p0',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+publication version',
    topic_tags: ['technology_infrastructure', 'politics_security', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 12.0 MB',
  },
  {
    name: 'ASEAN News RSS',
    category: '东盟官方动态',
    scope: '东盟官方新闻、会议、东盟—中国、南海、成员国加入和区域合作',
    url: 'https://asean.org/category/news/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['politics_security', 'maritime_security', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'Singapore MPA Media Releases RSS',
    category: '成员国海事与港口',
    scope: '新加坡海事及港务管理局新闻稿，覆盖港口运行、航运通道、海事安全、脱碳和区域海事合作',
    url: 'https://www.mpa.gov.sg/feeds/media-releases',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['maritime_security', 'trade_supply_chain', 'technology_infrastructure'],
    verification: '2026-05-25 live probe: HTTP 200 RSS, 159 KB; official Singapore MPA feed',
  },
  {
    name: 'CSIS AMTI RSS',
    category: '南海与海事安全研究',
    scope: 'Asia Maritime Transparency Initiative围绕南海、海事安全、航行自由和区域安全态势的公开研究更新；作为海上通道专题补充源',
    url: 'http://amti.csis.org/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['maritime_security', 'politics_security'],
    verification: '2026-05-25 live probe: HTTP endpoint returns 200 RSS in local Node runtime; HTTPS endpoint reset locally, so use HTTP feed endpoint with source-category distinction and cross-source validation',
  },
  {
    name: 'ReCAAP ISC Alerts',
    category: '区域海盗与海上抢劫预警',
    scope: '亚洲反海盗及武装劫船区域合作协定信息共享中心警报、更新和建议，重点覆盖马六甲海峡、新加坡海峡及区域海上安全事件',
    url: 'https://www.recaap.org/alerts',
    status: 'active',
    source_type: 'webpage',
    priority: 'p1',
    ingestion: 'static-anchor',
    dedupe_key: 'alert pdf url+publication date',
    topic_tags: ['maritime_security', 'politics_security', 'trade_supply_chain'],
    verification: '2026-05-25 live probe: HTTP 200 HTML, alerts page exposes 2025-2026 PDF advisories including Malacca and Singapore Straits sea robbery incidents',
  },
  {
    name: 'ASEANstats RSS',
    category: '东盟统计指标',
    scope: '东盟宏观统计、贸易、人口、国民账户和统计协调会议',
    url: 'https://www.aseanstats.org/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['market_macro', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'AMRO RSS',
    category: '区域宏观监测',
    scope: '东盟与中日韩宏观经济监测、金融稳定、气候倡议和区域政策评估',
    url: 'https://amro-asia.org/feed',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['market_macro', 'trade_supply_chain', 'health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'ADB SEADS',
    category: '区域发展与绿色转型',
    scope: '东南亚绿色转型、能源、产业、区域发展和东盟营商环境',
    url: 'https://seads.adb.org/rss.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'market_macro', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'ADB News RSS',
    category: '区域发展机构',
    scope: 'ADB东南亚项目、跨境清洁能源、基础设施融资和区域合作',
    url: 'https://www.adb.org/rss/news',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 20 items',
  },
  {
    name: 'AHA Centre',
    category: '东盟灾害与公共风险',
    scope: '东盟灾害、应急、洪水、台风、地震和区域公共风险',
    url: 'https://ahacentre.org/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['health_climate', 'politics_security'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 5 items',
  },
  {
    name: 'Mekong River Commission',
    category: '湄公河水资源与气候风险',
    scope: '湄公河水资源、监测、跨境水治理和气候风险',
    url: 'https://www.mrcmekong.org/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p0',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['health_climate', 'politics_security'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'ASEAN Centre for Biodiversity RSS',
    category: '生态环境与公共风险',
    scope: '东盟生物多样性、生态环境治理、气候适应和区域自然资本保护',
    url: 'https://www.aseanbiodiversity.org/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 4 items',
  },
  {
    name: 'GDACS',
    category: '灾害预警',
    scope: '东盟自然灾害、地震、洪水、热带气旋和森林火灾预警',
    url: 'https://www.gdacs.org/xml/rss.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'guid+pubDate',
    topic_tags: ['health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 63 items; must filter ASEAN country names or coordinates',
  },
  {
    name: 'Open Development Mekong CKAN',
    category: '湄公河公共数据',
    scope: '湄公河能源、基础设施、环境和国家级开放数据集',
    url: 'https://data.opendevelopmentmekong.net/api/3/action/package_search?q=energy&rows=5',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'dataset id/name+metadata_modified',
    topic_tags: ['technology_infrastructure', 'health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, energy query returned CKAN datasets',
  },
  {
    name: 'World Bank ASEAN GDP',
    category: '宏观基础变量',
    scope: '东盟11国GDP，用于市场容量、算力需求和国家权重评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/NY.GDP.MKTP.CD?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON',
  },
  {
    name: 'World Bank ASEAN Electricity Access',
    category: '能源基础变量',
    scope: '东盟11国电力可及性，用于能源基础设施成熟度评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/EG.ELC.ACCS.ZS?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 JSON',
  },
  {
    name: 'World Bank ASEAN Internet Users',
    category: '数字基础变量',
    scope: '东盟11国互联网使用率，用于数字基础设施和AI应用市场评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/IT.NET.USER.ZS?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON',
  },
  {
    name: 'World Bank ASEAN Electric Power Consumption',
    category: '能源基础变量',
    scope: '东盟11国人均用电量，用于电力需求、数据中心承载能力和产业活动强度评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/EG.USE.ELEC.KH.PC?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 20 non-null rows for 2022-2024',
  },
  {
    name: 'World Bank ASEAN Secure Internet Servers',
    category: '数字基础变量',
    scope: '东盟11国每百万人安全互联网服务器数量，用于数字基础设施成熟度和云服务环境评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/IT.NET.SECR.P6?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 22 non-null rows for 2023-2026',
  },
  {
    name: 'World Bank ASEAN High-Technology Exports',
    category: '产业技术变量',
    scope: '东盟11国高技术出口额，用于半导体、电子制造、AI产业链和技术贸易评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/TX.VAL.TECH.CD?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['trade_supply_chain', 'technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 19 non-null rows for 2023-2026',
  },
  {
    name: 'World Bank ASEAN FDI Net Inflows',
    category: '投资基础变量',
    scope: '东盟11国外商直接投资净流入，用于数据中心、制造业和跨境产业布局评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/BX.KLT.DINV.CD.WD?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['trade_supply_chain', 'market_macro', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 22 non-null rows for 2023-2026',
  },
  {
    name: 'World Bank ASEAN Trade Openness',
    category: '贸易基础变量',
    scope: '东盟11国货物和服务贸易占GDP比重，用于供应链开放度和区域联通性评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/NE.TRD.GNFS.ZS?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['trade_supply_chain', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 18 non-null rows for 2023-2026',
  },
  {
    name: 'World Bank ASEAN Renewable Electricity Output',
    category: '绿电基础变量',
    scope: '东盟11国可再生电力输出占总发电量比重，用于绿电支撑和能源结构评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/EG.ELC.RNEW.ZS?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-06 live probe: World Bank API indicator is reachable and returns ASEAN annual rows',
  },
  {
    name: 'World Bank ASEAN Renewable Energy Consumption',
    category: '绿电基础变量',
    scope: '东盟11国可再生能源占终端能源消费比重，用于能源结构和绿电替代空间评估',
    url: 'https://api.worldbank.org/v2/country/IDN;MYS;SGP;THA;VNM;PHL;MMR;KHM;LAO;BRN;TLS/indicator/EG.FEC.RNEW.ZS?format=json&per_page=200&date=2017:2026',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'indicator+countryiso3code+date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-06 live probe: World Bank API indicator is reachable and returns ASEAN annual rows',
  },
  {
    name: 'Our World in Data Energy Dataset',
    category: '能源电力核心变量',
    scope: '东盟国家年度电力需求、发电量、可再生发电量、可再生电力占比、化石电力占比和净电力进口；数据集汇总 Ember、Energy Institute、EIA 等公开能源数据',
    url: 'https://owid-public.owid.io/data/energy/owid-energy-data.csv',
    status: 'active',
    source_type: 'csv',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'country+year+metric',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-04 live probe: HTTP 200 CSV, header includes electricity_generation/electricity_demand/renewables_share_elec/net_elec_imports',
  },
  {
    name: 'WRI Global Power Plant Database ASEAN',
    category: '电力基础设施',
    scope: '世界资源研究所全球电厂库，筛选东盟国家电厂容量、坐标、主燃料和投运年份，用于电力基础设施与绿电支撑静态特征',
    url: 'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv',
    status: 'active',
    source_type: 'csv',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'country+plant+fuel+capacity',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-06 live probe: HTTP 200 CSV, ASEAN subset has 877 plants across 10 countries; no Timor-Leste records',
  },
  {
    name: 'Malaysia OpenAPI Fuel Price',
    category: '成员国能源价格',
    scope: '马来西亚燃油价格时间序列，作为能源成本变量',
    url: 'https://api.data.gov.my/data-catalogue?id=fuelprice&limit=500&sort=-date',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'date',
    topic_tags: ['market_macro', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, 923 rows, latest 2026-05-21',
  },
  {
    name: 'Malaysia OpenAPI Electricity Supply',
    category: '成员国电力供给',
    scope: '马来西亚月度电力供给，按总量、本地和进口分类观察电力供给能力',
    url: 'https://api.data.gov.my/data-catalogue?id=electricity_supply&limit=500&sort=-date',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'date+sector',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, latest monthly rows returned with sort=-date',
  },
  {
    name: 'Malaysia OpenAPI Electricity Consumption',
    category: '成员国电力消费',
    scope: '马来西亚月度电力消费，按部门分类观察工业、商业和居民用电需求',
    url: 'https://api.data.gov.my/data-catalogue?id=electricity_consumption&limit=500&sort=-date',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'date+sector',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, latest monthly rows returned with sort=-date',
  },
  {
    name: 'Malaysia OpenAPI Industrial Production Index',
    category: '成员国产业景气',
    scope: '马来西亚工业生产指数及分行业指数，可作为制造业负荷、产业活动和能源需求代理变量',
    url: 'https://api.data.gov.my/data-catalogue?id=ipi_1d&limit=30&sort=-date',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'date+section+series',
    topic_tags: ['market_macro', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, latest rows include 2026-03 section-level indices',
  },
  {
    name: 'Philippines PSA OpenSTAT Energy',
    category: '成员国能源统计',
    scope: '菲律宾官方能源统计目录，覆盖终端能源消费、一次能源供给和电力相关行业统计',
    url: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2F/ELE',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'table id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, returns PXWeb energy table list with updated timestamps',
  },
  {
    name: 'Philippines PSA OpenSTAT ICT',
    category: '成员国数字经济统计',
    scope: '菲律宾信息社会统计目录，覆盖ICT产业、信息经济和BPM活动相关指标',
    url: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/3F',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'table id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, returns information society table list with updated timestamps',
  },
  {
    name: 'Philippines PSA OpenSTAT Approved Investment',
    category: '成员国产业投资统计',
    scope: '菲律宾外资批准投资，按投资促进机构、来源国、行业和地区观察产业与资本流向',
    url: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2B/FI',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'table id+updated',
    topic_tags: ['trade_supply_chain', 'market_macro', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, returns approved foreign investment table list with 2026 updates',
  },
  {
    name: 'Singapore Data.gov Electricity Generation And Consumption',
    category: '成员国电力数据',
    scope: '新加坡能源市场管理局发布的年度发电与用电数据，用于数据中心与电力约束评估',
    url: 'https://data.gov.sg/api/action/datastore_search?resource_id=d_3745e3aa98ff3c4bcfcb8e1f6dffef42&limit=50',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'resource_id+DataSeries+year',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON; metadata reports Source: Energy Market Authority',
  },
  {
    name: 'Singapore Data.gov Electricity Accounts by Sub-sector',
    category: '成员国电力需求',
    scope: '新加坡按行业和子行业统计的用电账户数量，可作为信息通信、工业和商业用电需求侧代理指标',
    url: 'https://data.gov.sg/api/action/datastore_search?resource_id=d_74c62b93a04692590dd427cdd5bc0998&limit=50&sort=year%20desc',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'resource_id+year+sector+sub_sector',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, fields include year/sector/sub_sector/number_of_electricity_accounts',
  },
  {
    name: 'Singapore Data.gov Monthly Electricity Tariffs',
    category: '成员国电力价格',
    scope: '新加坡低压用户月度电价，可作为数据中心和算力设施用电成本的基准变量',
    url: 'https://data.gov.sg/api/action/datastore_search?resource_id=d_02ab8363afcfd8a507679e5ba2738cd4&limit=50&sort=month%20desc',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'resource_id+month',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, records include month and tariff_cent_per_kwh',
  },
  {
    name: 'Singapore Data.gov Electricity Tariff Components',
    category: '成员国电价结构',
    scope: '新加坡年度电价构成，覆盖能源成本、电网费用和市场管理费用等成本拆分',
    url: 'https://data.gov.sg/api/action/datastore_search?resource_id=d_b0b8f7a72f94e983fe42038b9aa4a464&limit=50&sort=year%20desc',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'resource_id+year',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, records include energy/grid/market support cost components',
  },
  {
    name: 'Thailand EPPO National Electricity Use by Sector',
    category: '成员国电力需求',
    scope: '泰国能源政策与规划办公室发布的全国按部门月度用电量，覆盖居民、工业、商业等部门，用于电力瓶颈和需求侧代理模型',
    url: 'https://catalog.eppo.go.th/dataset/eebd7a61-c58e-4b82-93d9-3d24cc1aa780/resource/d3a101dd-a2f7-4ed4-a122-4f21c0038db3/download/dataset_11_37.csv',
    status: 'active',
    source_type: 'csv',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'year+month+sector',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-06 live probe: HTTP 200 CSV, 2037 monthly rows from 2002 to 2026-03 with Sector and Quantity fields',
  },
  {
    name: 'PeeringDB Facilities Singapore',
    category: '数据中心与网络设施',
    scope: '新加坡公开互联设施、数据中心和网络节点位置，用于算力承载能力与网络联通度代理变量',
    url: 'https://www.peeringdb.com/api/fac?country=SG&limit=200',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'facility id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-05 live probe: HTTP 200 JSON, 46 facility records',
  },
  {
    name: 'PeeringDB Facilities Malaysia',
    category: '数据中心与网络设施',
    scope: '马来西亚公开互联设施、数据中心和网络节点位置，用于算力承载能力与网络联通度代理变量',
    url: 'https://www.peeringdb.com/api/fac?country=MY&limit=200',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'facility id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-05 live probe: HTTP 200 JSON, 43 facility records',
  },
  {
    name: 'PeeringDB Facilities Thailand',
    category: '数据中心与网络设施',
    scope: '泰国公开互联设施、数据中心和网络节点位置，用于算力承载能力与网络联通度代理变量',
    url: 'https://www.peeringdb.com/api/fac?country=TH&limit=200',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'facility id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-05 live probe: HTTP 200 JSON, 40 facility records',
  },
  {
    name: 'PeeringDB Facilities Vietnam',
    category: '数据中心与网络设施',
    scope: '越南公开互联设施、数据中心和网络节点位置，用于算力承载能力与网络联通度代理变量',
    url: 'https://www.peeringdb.com/api/fac?country=VN&limit=200',
    status: 'active',
    source_type: 'api-json',
    priority: 'p0',
    ingestion: 'dataset',
    dedupe_key: 'facility id+updated',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-06-05 live probe: HTTP 200 JSON, 15 facility records',
  },
  {
    name: 'Thailand EPPO Quarterly Energy RSS',
    category: '成员国能源状态',
    scope: '泰国能源政策与规划办公室季度能源状态，覆盖能源、电力、燃料和经济活动相关变化',
    url: 'https://eppo.go.th/index.php/th/energy-information/energy-status/quarter?category_id=569&isc=1&issearch=1&orders[publishUp]=publishUp&format=feed&type=rss',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 Thai-language quarterly energy status items',
  },
  {
    name: 'Timor-Leste Government RSS',
    category: '成员国政府发布',
    scope: '东帝汶加入东盟进程、能源项目、双边合作和政府政策发布',
    url: 'https://timor-leste.gov.tl/?s=energy&feed=rss2&lang=en',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['politics_security', 'technology_infrastructure', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items; search feed includes ASEAN accession and Woodside Energy items',
  },
  {
    name: 'ANTARA Business & Investment RSS',
    category: '成员国官方媒体',
    scope: '印尼商业投资、产业政策、AI人才、基础设施和区域贸易动态；作为印尼专题补充源',
    url: 'https://en.antaranews.com/rss/business-investment.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['trade_supply_chain', 'market_macro', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 50 items; state news agency feed, business/investment focused but requires topic filtering',
  },
  {
    name: 'Cambodia CDC RSS',
    category: '成员国投资促进',
    scope: '柬埔寨发展理事会投资促进、项目审批、产业投资和企业服务动态；仅作柬埔寨专题补充源',
    url: 'https://cdc.gov.kh/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p2',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['trade_supply_chain', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items; many personnel/service updates, keep low priority and strict filtering',
  },
  {
    name: 'Open Development Cambodia Electricity',
    category: '成员国开放数据',
    scope: '柬埔寨电力、能源基础设施、法规与公共数据集，用于能源电力专题补充',
    url: 'https://data.opendevelopmentcambodia.net/api/3/action/package_search?q=electricity&rows=10',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'dataset id/name+metadata_modified',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 JSON, electricity query returned CKAN datasets; regional mirror may include Mekong-wide records',
  },
  {
    name: 'MIDA',
    category: '成员国投资促进',
    scope: '马来西亚投资、数据中心、半导体、能源项目和外资产业链',
    url: 'https://www.mida.gov.my/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['trade_supply_chain', 'technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'VietnamPlus',
    category: '成员国官方媒体',
    scope: '越南宏观、能源、电力、数字经济和区域合作',
    url: 'https://en.vietnamplus.vn/rss/home.rss',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['market_macro', 'technology_infrastructure', 'politics_security'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 50 items',
  },
  {
    name: 'US-ASEAN Business Council RSS',
    category: '区域商务组织',
    scope: '美国—东盟企业合作、产业投资、数字经济和供应链政策动态；仅作专题低优先级补充',
    url: 'https://www.usasean.org/rss.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p2',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['trade_supply_chain', 'technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items; mixed newsletter/corporate content, strict filtering required',
  },
  {
    name: 'ASEAN-BAC Malaysia RSS',
    category: '区域工商咨询',
    scope: '东盟商务咨询理事会马来西亚轮值期企业合作、数字经济、贸易便利化和产业活动；仅作专题低优先级补充',
    url: 'https://aseanbac.com.my/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p2',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['trade_supply_chain', 'technology_infrastructure'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items; mixed event/corporate content, strict filtering required',
  },
  {
    name: 'OpenGov Asia',
    category: '数字政府与AI政策',
    scope: '东盟数字政府、人工智能应用、网络安全和公共部门数字化',
    url: 'https://www.opengovasia.com/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'politics_security'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 16 items',
  },
  {
    name: 'Eco-Business',
    category: '能源气候公开报道',
    scope: '东南亚能源、电网、气候、绿色金融和可持续产业',
    url: 'https://www.eco-business.com/feeds/news/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'health_climate', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 20 items',
  },
  {
    name: 'Energy Tracker Asia',
    category: '能源转型公开报道',
    scope: '亚洲能源转型、可再生能源、LNG和东盟能源市场',
    url: 'https://energytracker.asia/feed/',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'Brunei Department of Energy Efficiency Handbook',
    category: '成员国能源政策',
    scope: '文莱能源效率、节能政策、建筑和产业用能管理，可作为绿色电力与用能约束评估锚点',
    url: 'https://www.energy.gov.bn/wp-content/uploads/2025/09/2025-EEC-HANDBOOK-ENGLISH.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p1',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+revision date',
    topic_tags: ['technology_infrastructure', 'health_climate'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 1.2 MB',
  },
  {
    name: 'Brunei Department of Energy Net Metering Guideline',
    category: '成员国新能源政策',
    scope: '文莱净计量、分布式光伏和可再生能源并网规则，可作为新能源消纳与电力市场评估锚点',
    url: 'https://www.energy.gov.bn/wp-content/uploads/2025/10/2025-Net-metering-Guideline-ENG-FINAL-vF.pdf',
    status: 'active',
    source_type: 'pdf',
    priority: 'p1',
    ingestion: 'static-anchor',
    dedupe_key: 'document url+revision date',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: '2026-05-22 live probe: HTTP 200 PDF, 6.4 MB',
  },
  {
    name: 'Business Times ASEAN Business',
    category: '东盟商业与宏观',
    scope: '东盟宏观、企业投资、产业链、供应链和区域商业趋势',
    url: 'https://www.businesstimes.com.sg/rss/asean-business',
    status: 'active',
    source_type: 'rss',
    priority: 'p2',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['market_macro', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 43 items',
  },
  {
    name: 'Bangkok Post Business',
    category: '成员国商业媒体',
    scope: '泰国商业、投资、供应链和能源市场',
    url: 'https://www.bangkokpost.com/rss/data/business.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p2',
    ingestion: 'polling',
    dedupe_key: 'link+pubDate',
    topic_tags: ['market_macro', 'trade_supply_chain'],
    verification: '2026-05-22 live probe: HTTP 200 RSS, 10 items',
  },
  {
    name: 'GDACS Disaster Alerts RSS',
    category: '公共风险与灾害监测',
    scope: '联合国协调的全球灾害预警，覆盖地震、洪水、热带气旋、火山、野火等；用于东盟公共风险和关键基础设施扰动图层',
    url: 'https://www.gdacs.org/xml/rss.xml',
    status: 'active',
    source_type: 'rss',
    priority: 'p1',
    ingestion: 'polling',
    dedupe_key: 'guid+pubDate+eventtype',
    topic_tags: ['health_climate', 'technology_infrastructure'],
    verification: '2026-05-23 live probe: HTTP 200 RSS/XML, 201 KB; WorldMonitor uses GDACS for real-time disaster alerts and filters low-severity green alerts',
  },
  {
    name: 'USGS Earthquake GeoJSON M4.5+',
    category: '地震与公共风险数据',
    scope: '全球4.5级以上地震GeoJSON数据，可按东盟范围裁剪并进入公共风险、港口通道和能源设施扰动监测',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
    status: 'active',
    source_type: 'api-json',
    priority: 'p1',
    ingestion: 'dataset',
    dedupe_key: 'event id+updated',
    topic_tags: ['health_climate', 'technology_infrastructure'],
    verification: '2026-05-23 live probe: HTTP 200 GeoJSON, 58 KB; WorldMonitor uses USGS for M4.5+ earthquake layer with frequent refresh',
  },
  {
    name: 'NASA EONET Open Events',
    category: '地球观测公共事件',
    scope: 'NASA地球观测自然事件，覆盖风暴、火灾、洪水、火山、海冰和其他自然事件；用于东盟灾害、气候和基础设施风险补充',
    url: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10',
    status: 'active',
    source_type: 'api-json',
    priority: 'p2',
    ingestion: 'dataset',
    dedupe_key: 'event id+geometry date',
    topic_tags: ['health_climate', 'technology_infrastructure'],
    verification: '2026-05-23 live probe: HTTP 200 JSON, 7 KB; WorldMonitor uses EONET for open natural-event layers and filters stale wildfire events',
  },
  {
    name: 'GDELT Doc ASEAN Query',
    category: '全球事件与公开报道检索',
    scope: '围绕东盟、南海、供应链、抗议和安全事件进行低频增量检索；适合补足新闻面覆盖，不直接作为单一事实结论',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc',
    status: 'candidate',
    source_type: 'api-json',
    priority: 'p2',
    ingestion: 'search-seed',
    dedupe_key: 'url+seendate',
    topic_tags: ['politics_security', 'maritime_security', 'trade_supply_chain', 'market_macro'],
    verification: '2026-05-23 live probe: API reachable but returned 429 under ad-hoc query; only use scheduled low-rate cache with strict dedupe',
  },
  {
    name: 'IMF PortWatch',
    category: '港口与通道态势',
    scope: '港口和关键通道贸易流量监测，可用于马六甲、南海周边港口、供应链和航运通道扰动专题；先作为静态锚点和后续接口接入候选',
    url: 'https://portwatch.imf.org/',
    status: 'candidate',
    source_type: 'webpage',
    priority: 'p2',
    ingestion: 'static-anchor',
    dedupe_key: 'port/chokepoint+date',
    topic_tags: ['maritime_security', 'trade_supply_chain', 'market_macro'],
    verification: 'WorldMonitor data-source docs list IMF PortWatch as chokepoint transit intelligence; exact API contract should be verified before production polling',
  },
  {
    name: 'OpenSky Network States API',
    category: '航空态势候选',
    scope: 'ADS-B航空器状态数据，可用于东盟重点机场和空域通行图层；公开接口有频率和认证限制，不能作为当前默认图层',
    url: 'https://opensky-network.org/api/states/all',
    status: 'candidate',
    source_type: 'api-json',
    priority: 'p2',
    ingestion: 'dataset',
    dedupe_key: 'icao24+time_position',
    topic_tags: ['technology_infrastructure', 'politics_security'],
    verification: 'WorldMonitor data-source docs list OpenSky/Wingbits for live ADS-B aircraft positions; ASEAN专题需先评估频率、认证和数据合规',
  },
  {
    name: 'AviationStack Flights API',
    category: '机场与航班运行候选',
    scope: '机场航班、延误和取消率，可用于新加坡、曼谷、吉隆坡、雅加达、马尼拉等重点机场运行态势；需要API key',
    url: 'https://aviationstack.com/documentation',
    status: 'candidate',
    source_type: 'api-json',
    priority: 'p2',
    ingestion: 'dataset',
    dedupe_key: 'flight iata+flight date+airport',
    topic_tags: ['technology_infrastructure', 'market_macro'],
    verification: 'WorldMonitor data-source docs list AviationStack for airport flight records; requires key and quota before接入',
  },
  {
    name: 'OWID energy-data',
    category: 'GitHub开源数据备选',
    scope: '能源消费、电力结构、GDP相关指标；仅作为内部数据处理备选，不作为国内展示主源',
    url: 'https://github.com/owid/energy-data',
    status: 'candidate',
    source_type: 'github',
    priority: 'p2',
    ingestion: 'dataset',
    topic_tags: ['technology_infrastructure', 'market_macro'],
  },
  {
    name: 'datasets/geo-countries',
    category: 'GitHub地图数据备选',
    scope: '国家边界GeoJSON数据；仅用于技术校验和地图处理备选',
    url: 'https://github.com/datasets/geo-countries',
    status: 'candidate',
    source_type: 'github',
    priority: 'p2',
    ingestion: 'dataset',
  },
];

const ASEAN_INITIAL_SIGNAL_CARDS: AseanTopicSignalCard[] = [
  {
    id: 'asean-seed-apaec-2026-2030',
    title: '东盟能源合作进入APAEC 2026-2030实施周期',
    summary: '东盟能源部长已认可APAEC 2026-2030作为区域能源合作蓝图，重点覆盖东盟电网、可再生能源、能效、区域能源政策规划等方向。',
    source_name: 'ASEAN Centre for Energy',
    source_url: 'https://aseanenergy.org/press-release/asean-ministers-endorse-apaec-2026-2030-to-advance-regional-energy-cooperation',
    source_category: 'regional_organization',
    published_at: '2025-10-16T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 3,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-adb-power-grid',
    title: 'ADB支持东盟电网跨境输电和清洁电力互联',
    summary: 'ADB围绕东盟电网提供项目准备和融资支持，重点服务跨境能源与输电基础设施，支撑区域电力互联和清洁能源采购。',
    source_name: 'Asian Development Bank',
    source_url: 'https://www.adb.org/where-we-work/southeast-asia/asean-power-grid',
    source_category: 'regional_organization',
    published_at: null,
    country_scope: ['新加坡', '泰国', '印尼', '马来西亚'],
    topic: 'technology_infrastructure',
    score: 6,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-recaap-malacca-singapore-straits-2026',
    title: 'ReCAAP提示马六甲海峡和新加坡海峡海上抢劫风险',
    summary: 'ReCAAP ISC警报页面披露2026年马六甲海峡和新加坡海峡海上抢劫事件建议，相关线索用于跟踪东盟海上通道、港口运行和供应链安全风险。',
    source_name: 'ReCAAP ISC Alerts',
    source_url: 'https://www.recaap.org/alerts',
    source_category: 'regional_organization',
    published_at: '2026-03-19T00:00:00Z',
    country_scope: ['新加坡', '马来西亚', '印尼'],
    topic: 'maritime_security',
    score: 7,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-digital-masterplan-2030',
    title: 'ASEAN Digital Master Plan 2030将AI能力和绿色数字化纳入区域议程',
    summary: '东盟数字总体规划2030把AI能力、数字主权、跨境数据、绿色和AI驱动的数字化转型作为区域数字经济建设的重要方向。',
    source_name: 'ASEAN',
    source_url: 'https://asean.org/wp-content/uploads/2026/01/ASEAN-Digital-Master-Plan-2030-final-2026.pdf',
    source_category: 'regional_organization',
    published_at: '2026-01-01T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 2,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-guangxi-ai-plus',
    title: '中国—东盟人工智能部长圆桌会议宣布启动建设应用合作中心',
    summary: '国家发展改革委、广西壮族自治区人民政府联合主办会议，围绕人工智能发展基础、开源开放服务、产业合作对接和人才培育推动务实项目落地。',
    source_name: '中国政府网',
    source_url: 'https://www.gov.cn/yaowen/liebiao/202509/content_7041560.htm',
    source_category: 'official',
    published_at: '2025-09-18T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 5,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-nanning-ai-cluster',
    title: '广西举办中国（广西）—东盟人工智能应用生态交流会',
    summary: '会议聚焦人工智能和实体经济融合，发布超30项跨境AI合作成果，形成超50项合作签约，并在南宁五象云谷AI智算产业园集中展示生态应用。',
    source_name: '广西通信管理局',
    source_url: 'https://gxca.miit.gov.cn/xwdt/gzdt/art/2025/art_f0d11ad1e3304bc68d92d6513f1d8dc7.html',
    source_category: 'official',
    published_at: '2025-09-28T00:00:00Z',
    country_scope: ['越南', '泰国', '新加坡', '老挝', '缅甸', '菲律宾'],
    topic: 'technology_infrastructure',
    score: 6,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-ca-aicc-compute-center',
    title: '中国—东盟人工智能计算中心提供面向广西和东盟场景的算力服务',
    summary: '中国—东盟人工智能计算中心围绕项目申报、训练推理算力和应用场景服务，是广西面向东盟人工智能合作的重要算力基础设施。',
    source_name: '中国—东盟人工智能计算中心',
    source_url: 'https://ca-aicc.com/index.html',
    source_category: 'official',
    published_at: '2025-01-12T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 5,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-aseanstats-key-figures-2025',
    title: 'ASEANstats发布2025年东盟关键统计，纳入东帝汶相关覆盖',
    summary: 'ASEANstats将宏观经济、贸易投资、人口和环境指标作为区域比较分析的基础数据，并在2025年关键统计中扩展东帝汶相关覆盖。',
    source_name: 'ASEANstats',
    source_url: 'https://www.aseanstats.org/',
    source_category: 'regional_organization',
    published_at: '2025-11-01T00:00:00Z',
    country_scope: ['东盟', '东帝汶'],
    topic: 'market_macro',
    score: 4,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-singapore-green-dc-roadmap',
    title: '新加坡绿色数据中心路线图提出新增算力容量和能效要求',
    summary: 'IMDA绿色数据中心路线图围绕新增数据中心容量、绿色能源、热带数据中心能效标准和AI算力需求，为东盟算力节点评估提供政策依据。',
    source_name: 'Singapore IMDA',
    source_url: 'https://www.imda.gov.sg/how-we-can-help/green-dc-roadmap',
    source_category: 'official',
    published_at: '2025-09-11T00:00:00Z',
    country_scope: ['新加坡', '东盟'],
    topic: 'technology_infrastructure',
    score: 5,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-china-asean-clean-energy',
    title: '中国—东盟清洁能源合作中心推进区域能源转型研究和标准互认',
    summary: '一带一路能源合作网信息显示，中国—东盟清洁能源合作中心围绕新能源开发、储能技术、智慧电网、标准互认和信息共享开展合作。',
    source_name: '一带一路能源合作网',
    source_url: 'https://obor.nea.gov.cn/detail/22392.html',
    source_category: 'official',
    published_at: '2025-11-17T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 4,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-csg-cross-border-power',
    title: '南方电网与东盟国家跨境双向电力贸易形成长期基础',
    summary: '公开报道显示，南方电网通过与东盟国家电网相连，累计实现跨境双向电力贸易近700亿千瓦时，是评估区域电力互联和绿色算力协同的重要依据。',
    source_name: '一带一路能源合作网',
    source_url: 'https://obor.nea.gov.cn/detail/19712.html',
    source_category: 'official',
    published_at: '2023-10-19T00:00:00Z',
    country_scope: ['越南', '老挝', '缅甸', '东盟'],
    topic: 'technology_infrastructure',
    score: 4,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-mofcom-green-asean',
    title: '商务部绿色指南将东盟列为绿色经济和可持续能源合作重点区域',
    summary: '商务部对外投资合作国别绿色指南覆盖东盟绿色经济、环保、可持续能源等产业，为企业侧投资、项目筛选和风险核验提供公开依据。',
    source_name: '商务部',
    source_url: 'https://www.mofcom.gov.cn/dl/gbdqzn/upload/lvse-dongmeng.pdf',
    source_category: 'official',
    published_at: '2025-12-01T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'trade_supply_chain',
    score: 4,
    related_signal_count: 1,
  },
  {
    id: 'asean-seed-chinapower-energy-ai',
    title: '广西电网参与中国—东盟能源人工智能创新合作中心建设',
    summary: '电力行业公开报道显示，南方电网广西电网公司与广西合作共建中国—东盟能源人工智能创新合作中心，方向包括电力行业AI应用和区域协同。',
    source_name: '中国电力网',
    source_url: 'https://www.chinapower.org.cn/index.php/detail/450706.html',
    source_category: 'media',
    published_at: '2025-09-30T00:00:00Z',
    country_scope: ['东盟'],
    topic: 'technology_infrastructure',
    score: 4,
    related_signal_count: 1,
  },
];

const ASEAN_COUNTRY_POSITIONS: Record<string, { x: number; y: number }> = {
  印尼: { x: 52, y: 78 },
  马来西亚: { x: 42, y: 66 },
  新加坡: { x: 43, y: 72 },
  泰国: { x: 39, y: 42 },
  越南: { x: 59, y: 43 },
  菲律宾: { x: 76, y: 48 },
  缅甸: { x: 31, y: 30 },
  柬埔寨: { x: 50, y: 49 },
  老挝: { x: 48, y: 35 },
  文莱: { x: 57, y: 67 },
  东帝汶: { x: 72, y: 86 },
};

const EXTERNAL_ACTORS = [
  { id: 'actor:china', label: '中国', x: 63, y: 17 },
  { id: 'actor:us', label: '美国', x: 88, y: 24 },
  { id: 'actor:japan', label: '日本', x: 81, y: 18 },
  { id: 'actor:eu', label: '欧盟', x: 18, y: 18 },
  { id: 'actor:india', label: '印度', x: 20, y: 42 },
  { id: 'actor:australia', label: '澳大利亚', x: 74, y: 93 },
];

const EXTERNAL_ACTOR_ISSUE_LINKS: Array<{ actor: (typeof EXTERNAL_ACTORS)[number]['id']; issue: AseanTopicKey; weight: number }> = [
  { actor: 'actor:china', issue: 'maritime_security', weight: 0.36 },
  { actor: 'actor:china', issue: 'trade_supply_chain', weight: 0.34 },
  { actor: 'actor:us', issue: 'maritime_security', weight: 0.34 },
  { actor: 'actor:us', issue: 'technology_infrastructure', weight: 0.3 },
  { actor: 'actor:japan', issue: 'trade_supply_chain', weight: 0.32 },
  { actor: 'actor:japan', issue: 'technology_infrastructure', weight: 0.28 },
  { actor: 'actor:australia', issue: 'politics_security', weight: 0.3 },
  { actor: 'actor:india', issue: 'maritime_security', weight: 0.28 },
  { actor: 'actor:eu', issue: 'trade_supply_chain', weight: 0.3 },
  { actor: 'actor:eu', issue: 'market_macro', weight: 0.24 },
];

const ROUTE_ASSETS = [
  { id: 'asset:south-china-sea', label: '南海', issue: 'maritime_security' as AseanTopicKey, x: 66, y: 55 },
  { id: 'asset:malacca', label: '马六甲海峡', issue: 'maritime_security' as AseanTopicKey, x: 39, y: 72 },
  { id: 'asset:mekong', label: '湄公河', issue: 'health_climate' as AseanTopicKey, x: 49, y: 39 },
  { id: 'asset:nickel', label: '镍与电池链', issue: 'trade_supply_chain' as AseanTopicKey, x: 58, y: 83 },
];

function compactText(value?: string | null) {
  return (value || '').replace(/\s+/gu, ' ').trim();
}

function visibleSignalText(signal: AseanSignalLike) {
  return [
    signal.title,
    signal.summary,
    signal.display_title,
    signal.display_summary,
    signal.source_name,
    signal.source_url,
    signal.location_name,
    signal.locationName,
    signal.country,
    signal.region,
  ]
    .filter(Boolean)
    .join(' ');
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}

function isLocationOnlyTitle(value: string) {
  const text = compactText(value);
  if (!text || text.length > 40) return false;
  return ASEAN_COUNTRIES.some((country) => country.pattern.test(text)) || ASEAN_REGION_PATTERN.test(text);
}

function isMeaningfulForeignTitle(value: string) {
  const text = compactText(value);
  if (!text || containsCjk(text) || text.length < 14) return false;
  if (/^(news|update|rss|asean|southeast asia)$/iu.test(text)) return false;
  return /[a-z][a-z]/iu.test(text) && /\s/u.test(text);
}

function sourceTitleForDisplay(signal: AseanSignalLike) {
  const title = compactText(signal.title || signal.display_title).replace(/^publication:\s*/iu, '');
  if (!isMeaningfulForeignTitle(title)) return '';
  return title.length > 94 ? `${title.slice(0, 92)}...` : title;
}

function sourceLabelForSignal(signal: AseanSignalLike) {
  const source = compactText(signal.source_name || signal.source_url)
    .replace(/^秘塔搜索\s*·\s*/u, '')
    .replace(/^https?:\/\//iu, '')
    .replace(/^www\./iu, '');
  if (!source) return '';
  if (/mofcom|商务部|经贸/iu.test(source)) return '经贸部门';
  if (/antara/iu.test(source)) return 'ANTARA';
  if (/recaap/iu.test(source)) return 'ReCAAP';
  if (/asean centre for energy|aseanenergy/iu.test(source)) return '东盟能源中心';
  if (/adb|asian development bank/iu.test(source)) return '亚行';
  if (/aseanstats/iu.test(source)) return 'ASEANstats';
  if (/asean\.org|asean secretariat/iu.test(source)) return '东盟秘书处';
  if (/world bank/iu.test(source)) return '世界银行';
  if (/amro/iu.test(source)) return 'AMRO';
  if (/mekong|mrc/iu.test(source)) return '湄公河委员会';
  if (/gdacs/iu.test(source)) return 'GDACS';
  return source.split(/[/?#]/u)[0].slice(0, 18);
}

function sourcedScopeLabel(signal: AseanSignalLike) {
  const scope = scopeLabelForSignal(signal);
  const source = sourceLabelForSignal(signal);
  return source ? `${scope} · ${source}` : scope;
}

function sourceSpecificAseanTitle(signal: AseanSignalLike) {
  const url = compactText(signal.source_url || '').toLowerCase();
  const text = visibleSignalText(signal);
  const sourceScope = sourcedScopeLabel(signal);
  if (/liangqing\.gov\.cn\/lqzx\/bmdt\/2025bmdt\/t6423566/.test(url)) {
    return `${sourceScope}：良庆区智能终端芯片产业集群入选国家级名单`;
  }
  if (/tzcjj\.gxzf\.gov\.cn\/gzdt\/t26078717/.test(url)) {
    return `${sourceScope}：广西与道客网络对接AI算力一体化和东盟AI合作`;
  }
  if (/gxzf\.gov\.cn\/zt\/jd\/.*t27274450/.test(url)) {
    return `${sourceScope}：广西2025年电力市场化交易电量超1200亿千瓦时`;
  }
  if (/swt\.gxzf\.gov\.cn\/zt\/jjdm\/jmdt\/t9878169/.test(url)) {
    return `${sourceScope}：广西依托中国—东盟信息港推进数字丝路合作`;
  }
  if (/swt\.gxzf\.gov\.cn\/zfxxgk\/fdzdgknr\/zwdt\/gxsw\/t26053701/.test(url)) {
    return `${sourceScope}：广西自贸试验区以数字贸易改革推动跨境电商和南A中心建设`;
  }
  if (/zmqzcyyq\.gxzf\.gov\.cn\/xwzx\/mtbd\/t26162217/.test(url)) {
    return `${sourceScope}：钦州华为云计算及中国—东盟AI创新合作中心亮相`;
  }
  if (/kjt\.gxzf\.gov\.cn\/dtxx_59340\/kjdt\/t20723455/.test(url)) {
    return `${sourceScope}：南A中心推进算力服务体系和数据中心调度平台建设`;
  }
  if (/中国—东盟信息港|数字丝路/.test(text)) return `${sourceScope}：中国—东盟信息港和数字丝路建设进展`;
  return '';
}

function scopeLabelForSignal(signal: AseanSignalLike) {
  const countries = aseanCountryScope(signal).filter((country) => country !== '东盟');
  if (countries.length === 0) return '东盟区域';
  return countries.slice(0, 3).join('、');
}

function topicLabelForSignal(signal: AseanSignalLike) {
  return TOPIC_DEFINITIONS[aseanTopicKeyForSignal(signal)].title;
}

function formalAseanTitle(signal: AseanSignalLike) {
  const text = visibleSignalText(signal).toLowerCase();
  const scope = scopeLabelForSignal(signal);
  const sourceScope = sourcedScopeLabel(signal);
  const sourceSpecificTitle = sourceSpecificAseanTitle(signal);
  if (sourceSpecificTitle) return sourceSpecificTitle;
  if (/(source:asean-dataset|公开数据接口返回|world bank asean|malaysia openapi|singapore data\.gov|psa openstat)/i.test(text)) {
    if (/(high-technology exports|高技术出口)/i.test(text)) return `${scope}高技术出口指标更新`;
    if (/(trade openness|贸易开放度)/i.test(text)) return `${scope}贸易开放度指标更新`;
    if (/(gdp|国内生产总值)/i.test(text)) return `${scope}GDP指标更新`;
    if (/(fdi|外商直接投资|净流入)/i.test(text)) return `${scope}FDI净流入指标更新`;
    if (/(electric power consumption|人均用电量)/i.test(text)) return `${scope}人均用电量指标更新`;
    if (/(electricity access|电力可及率)/i.test(text)) return `${scope}电力可及率指标更新`;
    if (/(internet users|互联网使用率)/i.test(text)) return `${scope}互联网使用率指标更新`;
    if (/(fuel price|柴油|汽油|ron|燃油价格)/i.test(text)) return `${scope}能源价格指标更新`;
    if (/(industrial production|工业生产)/i.test(text)) return `${scope}工业运行指标更新`;
    return `${scope}${topicLabelForSignal(signal)}指标更新`;
  }
  if (/(earthquake|地震)/i.test(text)) return `${scope}地震风险提示`;
  if (/(volcano|eruption|火山)/i.test(text)) return `${scope}火山活动提示`;
  if (/(flood|typhoon|cyclone|storm|wildfire|tsunami|drought|洪水|台风|气旋|风暴|野火|火灾|海啸|干旱)/i.test(text)) return `${scope}自然灾害风险提示`;
  if (/(covid|coronavirus|新冠|virus activity|disease outbreak)/i.test(text)) return '东南亚公共卫生监测动态';
  if (/(human trafficking|cyber slavery|forced labor|trafficking|人口贩运|强迫劳动|网络诈骗)/i.test(text)) return `${sourceScope}：跨境人口贩运和网络诈骗风险提示`;
  if (/(border shooting|border tensions?|frontali|边境|border)/i.test(text) && /(thailand|thai|cambodia|柬埔寨|泰国)/i.test(text)) return '柬埔寨、泰国边境安全事件';
  if (/(rohingya|arakan|若开|human rights|人权)/i.test(text)) return '缅甸若开邦安全与人权动态';
  if (/(armed clash|clashes with troops|rebels?|insurgent|npa|military|troops|武装|军方|冲突)/i.test(text)) return `${sourceScope}：安全形势及武装冲突动态`;
  if (/(anti-scam|scam|诈骗)/i.test(text)) return `${sourceScope}：反诈骗执法协作动态`;
  if (/(中国.?东盟信息港|国际通信节点|云计算中心|跨境通信节点)/i.test(text)) return `${sourceScope}：中国—东盟信息港跨境通信和云计算基础设施进展`;
  if (/(南a中心|南宁.?东盟人工智能|人工智能应用合作中心|第一批40个|展示中心|东盟语料库|可信数据空间)/i.test(text)) return `${sourceScope}：南A中心披露AI项目签约、展示中心和语料库建设进展`;
  if (/(华为云计算及大数据中心|钦州.*人工智能创新合作中心|钦州.*云计算)/i.test(text)) return `${sourceScope}：钦州华为云计算及中国—东盟AI合作中心进展`;
  if (/(绿色算力|新能源优势|储能|低成本、高能效)/i.test(text)) return `${sourceScope}：广西绿色算力中心和储能产业链服务东盟市场`;
  if (/(智慧电网|跨境电力|清洁能源|绿色能源)/i.test(text)) return `${sourceScope}：中国—东盟智慧电网和清洁能源协同进展`;
  if (/(openai|artificial intelligence|\bai\b|人工智能|data center|cloud|信息港|云计算|数据中心|数字技术|通信节点|海缆|光缆)/i.test(text)) return `${sourceScope}：人工智能与数字基础设施进展`;
  if (/(emergency loan|prime minister|president|parliament|minister|policy|summit|conference|议会|总统|总理|部长|政策|会议)/i.test(text)) return `${sourceScope}：政治与政策议程动态`;
  if (/\b(trains?|rail|ports?|airports?|transport)\b|铁路|港口|机场|航运|交通/i.test(text)) return `${sourceScope}：交通与基础设施风险提示`;
  if (/(tariff|trade|export|import|supply chain|investment|关税|贸易|出口|进口|供应链|投资)/i.test(text)) return `${sourceScope}：贸易投资与供应链变化`;
  return `${sourceScope}：${topicLabelForSignal(signal)}公开线索`;
}

function formalAseanSummary(signal: AseanSignalLike) {
  const text = visibleSignalText(signal).toLowerCase();
  const scope = scopeLabelForSignal(signal);
  const topic = topicLabelForSignal(signal);
  const metricSummary = compactText(signal.summary);
  if (/(source:asean-dataset|公开数据接口返回|world bank asean|malaysia openapi|singapore data\.gov|psa openstat)/i.test(text)) {
    return metricSummary.replace(/该指标用于补充[^。]*。/u, '用于国家指标对比和专题研判。');
  }
  if (/(earthquake|地震)/i.test(text)) {
    return `公开灾害监测显示${scope}出现地震事件，需结合震级、影响人口和基础设施暴露度研判后续风险。`;
  }
  if (/(volcano|eruption|火山)/i.test(text)) {
    return `公开灾害监测显示${scope}存在火山活动线索，需关注航空、港口、能源设施和周边居民影响。`;
  }
  if (/(flood|typhoon|cyclone|storm|wildfire|tsunami|drought|洪水|台风|气旋|风暴|野火|火灾|海啸|干旱)/i.test(text)) {
    return `公开灾害监测显示${scope}存在自然灾害风险，关联交通通道、供电可靠性和应急响应能力。`;
  }
  if (/(covid|coronavirus|新冠|virus activity|disease outbreak)/i.test(text)) {
    return '公开卫生监测显示，东南亚及周边区域相关指标上行，涉及公共卫生响应、跨境流动和医疗资源压力。';
  }
  if (/(human trafficking|cyber slavery|forced labor|trafficking|人口贩运|强迫劳动|网络诈骗)/i.test(text)) {
    return `公开报道涉及${scope}相关跨境人口贩运、强迫劳动或网络诈骗风险，关联执法协作和人员保护。`;
  }
  if (/(border shooting|border tensions?|frontali|边境|border)/i.test(text) && /(thailand|thai|cambodia|柬埔寨|泰国)/i.test(text)) {
    return '柬泰边境相关安全事件见诸公开报道，涉及双方通报、边境管控和区域外溢影响。';
  }
  if (/(rohingya|arakan|若开|human rights|人权)/i.test(text)) {
    return '缅甸若开邦相关安全和人权问题仍有公开报道，涉及地区稳定、人道风险和国际组织反应。';
  }
  if (/(armed clash|clashes with troops|rebels?|insurgent|npa|military|troops|武装|军方|冲突)/i.test(text)) {
    return `${scope}出现武装冲突或安全事件线索，涉及安全管控和社会稳定影响。`;
  }
  if (/(anti-scam|scam|诈骗)/i.test(text)) {
    return `${scope}反诈骗议题出现新的执法或协作信息，涉及区域公共安全治理。`;
  }
  if (/(openai|artificial intelligence|\bai\b|人工智能|data center|cloud|信息港|云计算|数据中心|数字技术|通信节点|海缆|光缆|算力)/i.test(text)) {
    return `${scope}出现人工智能、算力基础设施或数据中心相关线索，重点关注建设进度、能源约束和产业协同。`;
  }
  if (/(energy|electricity|power grid|renewable|tariff|电力|能源|新能源|电价|电网|绿电)/i.test(text)) {
    return `${scope}能源电力相关政策、项目或价格线索更新，重点关注供需缺口和区域协同条件。`;
  }
  if (/(tariff|trade|export|import|supply chain|investment|关税|贸易|出口|进口|供应链|投资)/i.test(text)) {
    return `${scope}贸易投资或供应链信息更新，重点关注通道安全、产业配套和政策约束。`;
  }
  if (topic === 'market_macro') {
    return `公开数据或机构材料显示${scope}宏观经济和市场指标出现更新，可用于区域比较和趋势研判。`;
  }
  if (topic === 'health_climate') {
    return `${scope}公共卫生、气候或自然风险信息更新，重点关注影响范围和应急响应能力。`;
  }
  return `${scope}${topic}相关公开信息更新，保留来源、时间和同类线索用于后续研判。`;
}

function isGenericAseanTitle(value: string) {
  return /事项$|线索$|相关动态更新$|动态更新$|公开信息更新$/u.test(compactText(value));
}

function isWeakAseanSummary(value: string) {
  const text = compactText(value).slice(0, 240);
  return (
    !text ||
    /公开信息涉及/u.test(text) ||
    /公开信息显示/u.test(text) ||
    /公开信息涉及[^。]*事项。/u.test(text) ||
    /需结合来源级别|同类线索持续核验/u.test(text) ||
    /线索。/u.test(text.slice(0, 40)) ||
    /图源公众号|远眺|!\s|\s!\s/u.test(text) ||
    /新引擎|点燃|赋能|助力/u.test(text)
  );
}

function leadershipTitle(signal: AseanSignalLike) {
  const title = compactText(signal.display_title || signal.title);
  const summary = compactText(signal.display_summary || signal.summary);
  const foreignTitle = sourceTitleForDisplay(signal);
  if (!containsCjk(title) && foreignTitle) return foreignTitle;
  if (!containsCjk(title) || isLocationOnlyTitle(title) || title.length < 8) return formalAseanTitle(signal);
  if (isGenericAseanTitle(title)) return formalAseanTitle(signal);
  if (summary && (isLocationOnlyTitle(title) || title.length < 8)) return summary;
  if (title) return title;
  return summary || formalAseanTitle(signal);
}

function leadershipSummary(signal: AseanSignalLike) {
  const summary = compactText(signal.display_summary || signal.summary);
  const title = compactText(signal.display_title || signal.title);
  const foreignTitle = sourceTitleForDisplay(signal);
  if (!containsCjk(summary)) return formalAseanSummary(signal);
  if (isWeakAseanSummary(summary)) {
    const formal = formalAseanSummary(signal);
    return foreignTitle ? `${formal} 来源标题：${foreignTitle}。` : formal;
  }
  if (summary && summary !== title) return summary;
  return containsCjk(title) ? title : formalAseanSummary(signal);
}

function signalText(signal: AseanSignalLike) {
  const tags = Array.isArray(signal.tags) ? signal.tags.join(' ') : '';
  const alignmentTags = Array.isArray(signal.alignment_tags)
    ? signal.alignment_tags.join(' ')
    : Array.isArray(signal.alignmentTags)
      ? signal.alignmentTags.join(' ')
      : '';
  return [
    signal.title,
    signal.summary,
    signal.display_title,
    signal.display_summary,
    signal.source_name,
    signal.source_url,
    signal.location_name,
    signal.locationName,
    signal.country,
    signal.region,
    signal.scene,
    tags,
    alignmentTags,
  ]
    .filter(Boolean)
    .join(' ');
}

export function aseanCountryScope(signal: AseanSignalLike) {
  const text = signalText(signal);
  const countries = ASEAN_COUNTRIES.filter((country) => country.pattern.test(text)).map((country) => country.label);
  if (ASEAN_REGION_PATTERN.test(text)) countries.unshift('东盟');
  return Array.from(new Set(countries));
}

export function aseanTopicKeyForSignal(signal: AseanSignalLike): AseanTopicKey {
  const text = visibleSignalText(signal);
  for (const [key, definition] of Object.entries(TOPIC_DEFINITIONS) as Array<[AseanTopicKey, (typeof TOPIC_DEFINITIONS)[AseanTopicKey]]>) {
    if (definition.pattern.test(text)) return key;
  }
  return 'politics_security';
}

function hasAseanTopicSignal(signal: AseanSignalLike) {
  const text = visibleSignalText(signal);
  return Object.values(TOPIC_DEFINITIONS).some((definition) => definition.pattern.test(text));
}

function hasLeadershipScale(signal: AseanSignalLike) {
  const visibleText = visibleSignalText(signal);
  const lower = visibleText.toLowerCase();
  const countries = aseanCountryScope(signal).filter((country) => country !== '东盟');
  const regional = ASEAN_REGION_PATTERN.test(visibleText);
  const crossBorder = countries.length >= 2;
  const officialOrInstitutional =
    classifyAseanSource(signal) !== 'media' ||
    /\b(asean|who|adb|un|world bank|imf|government|ministry|minister|president|prime minister|parliament|central bank|policy|summit|conference)\b|政府|部长|总统|总理|议会|央行|政策|峰会|会议/iu.test(visibleText);
  const strategicEvent =
    /\b(border|military|troops|armed|clash|conflict|insurgent|rebel|massacre|rohingya|human trafficking|cyber slavery|forced labor|scam|outbreak|dengue|covid|earthquake|flood|typhoon|cyclone|storm|wildfire|volcano|tsunami|haze|drought|tariff|trade|investment|supply chain|data center|artificial intelligence|openai)\b|边境|军方|武装|冲突|人口贩运|网络诈骗|疫情|登革热|地震|洪水|台风|气旋|风暴|野火|火灾|火山|海啸|烟霾|干旱|关税|贸易|投资|供应链|人工智能/iu.test(visibleText);
  const localNoise =
    /\b(traffic collision|traffic|street criminals|student charged|femicide|rice queue|shootout|warning shots|wildlife|elephant|carpark|forearm fracture|local police incident|lalu lintas|curanmor|resident shoots|armed suspect|accident)\b|地方治安|交通事故|性别暴力|枪击案|野生动物|学生|停车场/iu.test(lower);
  if (localNoise && !regional && !crossBorder && !officialOrInstitutional) return false;
  return regional || crossBorder || officialOrInstitutional || strategicEvent;
}

export function aseanSignalScore(signal: AseanSignalLike) {
  const text = visibleSignalText(signal);
  const countryMatches = aseanCountryScope(signal);
  let score = 0;
  if (countryMatches.includes('东盟')) score += 3;
  score += countryMatches.filter((country) => country !== '东盟').length * 2;
  if (Object.values(TOPIC_DEFINITIONS).some((definition) => definition.pattern.test(text))) score += 1;
  if (/(scene:asean|daily:asean|asean|southeast-asia|southeastasia|东盟|东南亚)/iu.test(text)) score += 2;
  return score;
}

export function isAseanSignal(signal: AseanSignalLike) {
  const tags = [...(signal.tags || []), ...(signal.alignment_tags || []), ...(signal.alignmentTags || [])].join(' ');
  if (/source:asean-public-risk/iu.test(tags)) {
    return aseanSignalScore(signal) >= 2 && hasAseanTopicSignal(signal);
  }
  return aseanSignalScore(signal) >= 2 && hasAseanTopicSignal(signal) && hasLeadershipScale(signal);
}

function classifyAseanSource(signal: AseanSignalLike): AseanSourceCategory {
  const text = [
    signal.source_name,
    signal.source_url,
    signal.title,
    signal.summary,
    signal.display_title,
    signal.display_summary,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/(asean\.org|aseanstats|mfa\.gov\.cn|mofcom\.gov\.cn|customs\.gov\.cn|gov\.|go\.|gob\.|go\.id|go\.th|gov\.sg|gov\.my|gov\.ph|gov\.vn)/i.test(text)) {
    return 'official';
  }
  if (/(adb\.org|asean secretariat|aseanstats)/i.test(text)) return 'regional_organization';
  if (/(who\.int|un\.org|unocha|world bank|imf\.org|oecd\.org|gdacs|usgs|earthquake\.usgs\.gov|nasa|eonet|gsfc\.nasa\.gov)/i.test(text)) return 'international_organization';
  if (/(openai\.com|microsoft\.com|google\.com|amazon\.com|aws\.amazon\.com|meta\.com|nvidia\.com)/i.test(text)) return 'corporate_official';
  if (/(world monitor|source:world-monitor)/i.test(text)) return 'monitoring';
  return 'media';
}

function signalTime(signal: AseanSignalLike) {
  const value = signal.published_at || signal.publishedAt || null;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function cardTime(card: AseanTopicSignalCard) {
  const time = card.published_at ? new Date(card.published_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortAseanSignalCards(cards: AseanTopicSignalCard[]) {
  return [...cards].sort((left, right) => cardTime(right) - cardTime(left) || right.score - left.score || right.related_signal_count - left.related_signal_count);
}

function normalizeDedupeText(value: string) {
  return compactText(value)
    .toLowerCase()
    .replace(/[“”"'‘’`]/gu, '')
    .replace(/[，。；：、,.!?;:()[\]{}<>]/gu, ' ')
    .replace(/\b(update|updates|news|rss|line|signal|report|statement|press release)\b/giu, ' ')
    .replace(/(线索|公开信息|相关事项|更新至\d{4}(?:-\d{2})?(?:-\d{2})?|发布|报道|显示)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function signatureTerms(value: string) {
  const text = normalizeDedupeText(value);
  const terms = [
    '人工智能',
    '数据中心',
    '算力',
    '电力',
    '电网',
    '新能源',
    '能源',
    '贸易',
    '供应链',
    '关税',
    '投资',
    '南海',
    '马六甲',
    '边境',
    '冲突',
    '登革热',
    '烟霾',
    '洪水',
    '台风',
    'gdp',
    'fdi',
    'tariff',
    'trade',
    'supply chain',
    'data center',
    'electricity',
    'power',
    'grid',
    'renewable',
    'ai',
    'south china sea',
    'malacca',
  ].filter((term) => text.includes(term));
  if (terms.length) return terms.slice(0, 4).join(',');
  return text
    .split(' ')
    .filter((term) => term.length >= 3)
    .slice(0, 6)
    .join(' ');
}

function displayCardKey(card: AseanTopicSignalCard) {
  const countries = card.country_scope.filter((country) => country !== '东盟').slice(0, 3).join(',');
  return [card.topic, countries || '东盟', signatureTerms(`${card.title} ${card.summary}`)].join('|');
}

function verificationFlagsForSignal(signal: AseanSignalLike, sourceCategory: AseanSourceCategory) {
  const flags: string[] = [];
  const tags = [...(signal.tags || []), ...(signal.alignment_tags || []), ...(signal.alignmentTags || [])].join(' ');
  if (sourceCategory !== 'media') flags.push('权威来源');
  if (/source:asean-dataset|dataset|metric/iu.test(tags)) flags.push('数据接口');
  if (/source:asean-feed|rss|polling/iu.test(tags)) flags.push('稳定轮询');
  if (/priority:p0|p0/iu.test(tags)) flags.push('核心信源');
  if (aseanCountryScope(signal).filter((country) => country !== '东盟').length >= 2) flags.push('跨国关联');
  return Array.from(new Set(flags)).slice(0, 4);
}

function credibilityForSignal(signal: AseanSignalLike, sourceCategory: AseanSourceCategory) {
  let score = 50;
  if (sourceCategory === 'official') score += 24;
  if (sourceCategory === 'regional_organization' || sourceCategory === 'international_organization') score += 20;
  if (sourceCategory === 'corporate_official') score += 12;
  if (sourceCategory === 'monitoring') score += 10;
  if (sourceCategory === 'media') score += 2;
  const tags = [...(signal.tags || []), ...(signal.alignment_tags || []), ...(signal.alignmentTags || [])].join(' ');
  if (/source:asean-dataset|dataset|metric/iu.test(tags)) score += 12;
  if (/source:asean-feed|rss|polling/iu.test(tags)) score += 6;
  if (/priority:p0|p0/iu.test(tags)) score += 6;
  if (signal.source_url) score += 4;
  if (signal.published_at || signal.publishedAt) score += 3;
  const bounded = Math.max(0, Math.min(100, score));
  return {
    score: bounded,
    level: bounded >= 78 ? 'high' : bounded >= 62 ? 'medium' : 'watch',
  } as const;
}

function conflictGroupForCard(card: Pick<AseanTopicSignalCard, 'topic' | 'country_scope' | 'title' | 'summary'>) {
  const text = `${card.title} ${card.summary}`;
  const countries = card.country_scope.filter((country) => country !== '东盟').slice(0, 2).join(',');
  if (!countries) return null;
  if (/(上升|增加|增长|扩张|新增|升级|紧张|短缺|风险|rise|increase|growth|expand|shortage|tension|risk)/iu.test(text)) {
    return `${card.topic}:${countries}:up`;
  }
  if (/(下降|减少|放缓|缓解|改善|降温|回落|fall|decline|decrease|ease|improve|slowdown)/iu.test(text)) {
    return `${card.topic}:${countries}:down`;
  }
  return null;
}

function evidenceSourcesForCard(card: Pick<AseanTopicSignalCard, 'source_name' | 'source_url' | 'source_category' | 'evidence_sources'>) {
  const sources = [
    ...(card.evidence_sources || []),
    ...(card.source_name
      ? [
          {
            name: card.source_name,
            url: card.source_url || null,
            category: card.source_category,
          },
        ]
      : []),
  ];
  if (!sources.length) {
    sources.push({ name: '未标注来源', url: null, category: card.source_category });
  }
  const unique = new Map<string, AseanSignalEvidenceSource>();
  for (const source of sources) {
    const name = compactText(source.name).slice(0, 120);
    if (!name) continue;
    const key = `${name}|${source.url || ''}|${source.category}`;
    if (!unique.has(key)) unique.set(key, { name, url: source.url || null, category: source.category });
  }
  return Array.from(unique.values());
}

function evidenceIdsForCard(card: Pick<AseanTopicSignalCard, 'id' | 'evidence_signal_ids'>) {
  return Array.from(new Set([...(card.evidence_signal_ids || []), card.id].filter(Boolean))).slice(0, 24);
}

function strongerUrgency(left?: AseanTopicSignalCard['urgency_level'], right?: AseanTopicSignalCard['urgency_level']) {
  const rank = { high: 3, elevated: 2, monitoring: 1 };
  if (!left) return right;
  if (!right) return left;
  return rank[right] > rank[left] ? right : left;
}

export function toAseanSignalCard(signal: AseanSignalLike): AseanTopicSignalCard {
  const sourceCategory = classifyAseanSource(signal);
  const base = {
    id: String(signal.id || ''),
    title: leadershipTitle(signal),
    summary: leadershipSummary(signal),
    source_name: signal.source_name || null,
    source_url: signal.source_url || null,
    source_category: sourceCategory,
    published_at: signal.published_at || signal.publishedAt || null,
    country_scope: aseanCountryScope(signal),
    topic: aseanTopicKeyForSignal(signal),
    score: aseanSignalScore(signal),
    related_signal_count: 1,
    evidence_sources: signal.source_name
      ? [
          {
            name: signal.source_name,
            url: signal.source_url || null,
            category: sourceCategory,
          },
        ]
      : [],
    evidence_signal_ids: signal.id ? [String(signal.id)] : [],
  };
  const credibility = credibilityForSignal(signal, sourceCategory);
  const dedupeKey = displayCardKey({
    ...base,
    credibility_score: credibility.score,
    credibility_level: credibility.level,
    dedupe_key: '',
    verification_flags: [],
    conflict_group: null,
  });
  return {
    ...base,
    credibility_score: credibility.score,
    credibility_level: credibility.level,
    dedupe_key: dedupeKey,
    verification_flags: verificationFlagsForSignal(signal, sourceCategory),
    conflict_group: conflictGroupForCard(base),
  };
}

function dedupeDisplaySignalCards(cards: AseanTopicSignalCard[], limit: number) {
  const grouped = new Map<string, AseanTopicSignalCard>();
  for (const card of cards) {
    const key = displayCardKey(card);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, card);
      continue;
    }
    grouped.set(key, {
      ...current,
      score: Math.max(current.score, card.score),
      related_signal_count: current.related_signal_count + card.related_signal_count,
      credibility_score: Math.max(current.credibility_score || 0, card.credibility_score || 0),
      credibility_level: (current.credibility_score || 0) >= (card.credibility_score || 0) ? current.credibility_level : card.credibility_level,
      urgency_level: strongerUrgency(current.urgency_level, card.urgency_level),
      verification_flags: Array.from(new Set([...(current.verification_flags || []), ...(card.verification_flags || [])])).slice(0, 5),
      conflict_group: current.conflict_group || card.conflict_group || null,
      evidence_sources: evidenceSourcesForCard(current).concat(evidenceSourcesForCard(card)).filter((source, index, sources) => {
        const key = `${source.name}|${source.url || ''}|${source.category}`;
        return sources.findIndex((item) => `${item.name}|${item.url || ''}|${item.category}` === key) === index;
      }),
      evidence_signal_ids: Array.from(new Set([...evidenceIdsForCard(current), ...evidenceIdsForCard(card)])).slice(0, 32),
    });
  }
  return sortAseanSignalCards(Array.from(grouped.values())).slice(0, limit);
}

export function buildAseanTopicClusters(signals: AseanSignalLike[]): AseanTopicCluster[] {
  const buckets = new Map<AseanTopicKey, AseanTopicSignalCard[]>();
  for (const signal of signals) {
    const card = toAseanSignalCard(signal);
    if (!card.id) continue;
    buckets.set(card.topic, [...(buckets.get(card.topic) || []), card]);
  }
  return Array.from(buckets.entries())
    .map(([key, cards]) => ({
      key,
      title: TOPIC_DEFINITIONS[key].title,
      signal_count: cards.length,
      country_scope: Array.from(new Set(cards.flatMap((card) => card.country_scope))).slice(0, 8),
      signal_ids: cards.map((card) => card.id).slice(0, 12),
    }))
    .sort((left, right) => right.signal_count - left.signal_count);
}

function buildAseanTopicClustersFromCards(cards: AseanTopicSignalCard[]): AseanTopicCluster[] {
  const buckets = new Map<AseanTopicKey, AseanTopicSignalCard[]>();
  for (const card of cards) {
    buckets.set(card.topic, [...(buckets.get(card.topic) || []), card]);
  }
  return Array.from(buckets.entries())
    .map(([key, bucketCards]) => ({
      key,
      title: TOPIC_DEFINITIONS[key].title,
      signal_count: bucketCards.reduce((sum, card) => sum + Math.max(1, card.related_signal_count), 0),
      country_scope: Array.from(new Set(bucketCards.flatMap((card) => card.country_scope))).slice(0, 8),
      signal_ids: bucketCards.map((card) => card.id).slice(0, 12),
    }))
    .sort((left, right) => right.signal_count - left.signal_count);
}

export function buildAseanTopicCounts(signalCards: AseanTopicSignalCard[]) {
  const countryMap = new Map<string, number>();
  const topicMap = new Map<AseanTopicKey, number>();
  for (const card of signalCards) {
    topicMap.set(card.topic, (topicMap.get(card.topic) || 0) + 1);
    for (const country of card.country_scope) {
      if (country === '东盟') continue;
      countryMap.set(country, (countryMap.get(country) || 0) + 1);
    }
  }
  return {
    country_counts: Array.from(countryMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN')),
    topic_counts: ASEAN_TOPIC_ORDER.map((key) => ({ key, label: TOPIC_DEFINITIONS[key].title, count: topicMap.get(key) || 0 })),
  };
}

export function buildAseanSourceBreakdown(signalCards: AseanTopicSignalCard[]): AseanSourceBreakdown[] {
  const labels: Record<AseanSourceCategory, string> = {
    official: '政府与官方发布',
    regional_organization: '区域组织与发展机构',
    international_organization: '国际组织',
    corporate_official: '企业正式发布',
    media: '公开媒体报道',
    monitoring: '监测系统归集',
  };
  const buckets = new Map<AseanSourceCategory, Map<string, { count: number; url: string | null }>>();
  for (const card of signalCards) {
    for (const source of evidenceSourcesForCard(card)) {
      const bucket = buckets.get(source.category) || new Map<string, { count: number; url: string | null }>();
      const current = bucket.get(source.name) || { count: 0, url: source.url || null };
      bucket.set(source.name, { count: current.count + 1, url: current.url || source.url || null });
      buckets.set(source.category, bucket);
    }
  }
  const order: AseanSourceCategory[] = ['official', 'regional_organization', 'international_organization', 'corporate_official', 'media', 'monitoring'];
  return order.map((category) => {
    const bucket = buckets.get(category) || new Map<string, { count: number; url: string | null }>();
    const sources = Array.from(bucket.entries())
      .map(([name, value]) => ({ name, count: value.count, url: value.url }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    return {
      category,
      label: labels[category],
      count: sources.reduce((sum, source) => sum + source.count, 0),
      sources: sources.slice(0, 6),
    };
  });
}

function urgencyForCard(card: AseanTopicSignalCard): AseanTopicSignalCard['urgency_level'] {
  const text = `${card.title} ${card.summary}`;
  const dataUpdate = /指标更新|公开数据接口|最新可用口径|World Bank ASEAN|GDP|FDI净流入|贸易开放度|高技术出口|互联网使用率|安全互联网服务器密度|电力可及率|人均用电量/iu.test(text);
  const incident = /地震|洪水|台风|热带气旋|火山|火灾|灾害|预警|冲突|军事|袭击|制裁|停电|中断|封锁|南海|马六甲|earthquake|flood|typhoon|cyclone|disaster|warning|alert|conflict|military|attack|sanction|outage|disruption|south china sea|malacca/iu.test(text);
  const hardPressure = /短缺|缺口|受限|限制|下降|下滑|飙升|扰动|紧张|负荷高峰|供给不足|电力供给|GPU供给|算力缺口|shortage|constraint|restriction|decline|surge|disruption|outage|power gap|compute gap/iu.test(text);
  const pressure = /上涨|波动|风险|负荷|需求|电价|燃油价格|能源价格|GPU|算力|数据中心|tariff|price|risk|volatility|demand|load|data center|compute/iu.test(text);
  const riskTopic = card.topic === 'maritime_security' || card.topic === 'politics_security' || card.topic === 'health_climate';
  if (dataUpdate && !incident && !hardPressure) return 'monitoring';
  if (card.conflict_group && incident) return 'high';
  if (incident && riskTopic && card.score >= 5) return 'high';
  if ((riskTopic && card.score >= 8) || (card.topic === 'market_macro' && card.score >= 10)) return 'high';
  if ((incident || hardPressure) && (riskTopic || card.score >= 6)) return 'elevated';
  if (pressure && !dataUpdate) return 'elevated';
  return 'monitoring';
}

function normalizeAseanCard(card: AseanTopicSignalCard): AseanTopicSignalCard {
  const sourceCategory = card.source_category;
  const sourceCredibility =
    sourceCategory === 'official'
      ? 88
      : sourceCategory === 'regional_organization' || sourceCategory === 'international_organization'
        ? 84
        : sourceCategory === 'corporate_official'
          ? 74
          : sourceCategory === 'monitoring'
            ? 70
            : 58;
  const credibilityScore = card.credibility_score ?? Math.min(100, sourceCredibility + Math.min(8, card.score));
  const normalized: AseanTopicSignalCard = {
    ...card,
    credibility_score: credibilityScore,
    credibility_level: card.credibility_level ?? (credibilityScore >= 78 ? 'high' : credibilityScore >= 62 ? 'medium' : 'watch'),
    urgency_level: card.urgency_level ?? urgencyForCard({ ...card, credibility_score: credibilityScore }),
    dedupe_key: card.dedupe_key || displayCardKey({ ...card, credibility_score: credibilityScore }),
    verification_flags:
      card.verification_flags ||
      [
        sourceCategory === 'media' ? '公开报道' : '权威来源',
        card.source_url ? '可追溯链接' : '待补链接',
        card.country_scope.length > 1 ? '跨域关联' : '单域线索',
      ],
    conflict_group: card.conflict_group ?? conflictGroupForCard(card),
    evidence_sources: evidenceSourcesForCard(card),
    evidence_signal_ids: evidenceIdsForCard(card),
  };
  return normalized;
}

function isDatasetMetricCard(card: Pick<AseanTopicSignalCard, 'title' | 'summary' | 'source_name' | 'verification_flags'>) {
  const text = [
    card.title,
    card.summary,
    card.source_name,
    ...(card.verification_flags || []),
  ].filter(Boolean).join(' ');
  return /指标更新|公开数据接口|最新可用口径|数据接口|World Bank ASEAN|Malaysia OpenAPI|Singapore Data\.gov|PSA OpenSTAT|Our World in Data Energy Dataset/iu.test(text);
}

function buildAseanTimeline(signalCards: AseanTopicSignalCard[]): AseanTimelineItem[] {
  const signalItems: AseanTimelineItem[] = signalCards.filter((card) => !isDatasetMetricCard(card)).slice(0, 32).map((card) => ({
    id: card.id,
    kind: 'signal',
    title: card.title,
    summary: card.summary,
    source_name: card.source_name,
    source_url: card.source_url,
    published_at: card.published_at,
    country_scope: card.country_scope,
    topic: card.topic,
    credibility_score: card.credibility_score || 50,
    conflict_group: card.conflict_group || null,
  }));
  return signalItems
    .sort((left, right) => {
      const leftTime = left.published_at ? new Date(left.published_at).getTime() : 0;
      const rightTime = right.published_at ? new Date(right.published_at).getTime() : 0;
      return rightTime - leftTime || right.credibility_score - left.credibility_score;
    })
    .slice(0, 36);
}

function buildAseanValidationSummary(
  rawCards: AseanTopicSignalCard[],
  dedupedCards: AseanTopicSignalCard[],
  datasetMetrics: AseanDatasetMetric[],
): AseanValidationSummary {
  const cardSources = dedupedCards.flatMap(evidenceSourcesForCard);
  const sourceNames = new Set(cardSources.map((source) => source.name).filter(Boolean));
  const officialOrInstitutional = cardSources.filter((source) =>
    ['official', 'regional_organization', 'international_organization', 'corporate_official'].includes(source.category),
  );
  const multiSourceClusters = dedupedCards.filter((card) => card.related_signal_count > 1);
  const groupedConflicts = new Map<string, Set<string>>();
  for (const card of dedupedCards) {
    if (!card.conflict_group) continue;
    const base = card.conflict_group.replace(/:(up|down)$/u, '');
    const direction = card.conflict_group.endsWith(':up') ? 'up' : 'down';
    const directions = groupedConflicts.get(base) || new Set<string>();
    directions.add(direction);
    groupedConflicts.set(base, directions);
  }
  const possibleConflictCount = Array.from(groupedConflicts.values()).filter((directions) => directions.size > 1).length;
  return {
    source_count: sourceNames.size,
    official_or_institutional_source_count: new Set(officialOrInstitutional.map((source) => source.name).filter(Boolean)).size,
    dataset_metric_count: datasetMetrics.length,
    dedupe_collapsed_count: Math.max(0, rawCards.length - dedupedCards.length),
    multi_source_cluster_count: multiSourceClusters.length,
    possible_conflict_count: possibleConflictCount,
    method: [
      '按链接、专题、国家范围和主题词进行专题内相似合并。',
      '官方、区域组织、国际组织和数据接口优先进入高可信层。',
      '同一国家同一议题出现方向相反的指标或事件时标记为待复核冲突组。',
      'API/数据集型信源抽取为指标线索，与新闻和公告共同进入时间线。',
    ],
  };
}

function buildAseanCollectionAxes(
  signalCards: AseanTopicSignalCard[],
  datasetMetrics: AseanDatasetMetric[],
  sourcePool: AseanTopicSource[],
): AseanCollectionAxis[] {
  return COLLECTION_AXIS_DEFINITIONS.map((axis) => {
    const sourceMatches = sourcePool.filter((source) => {
      const sourceText = [source.name, source.category, source.scope, source.url, ...(source.topic_tags || [])].join(' ');
      return axis.pattern.test(sourceText) || (source.topic_tags || []).some((tag) => axis.primary_topics.includes(tag));
    });
    const signalMatches = signalCards.filter((card) => {
      const signalText = [card.title, card.summary, card.source_name, card.source_url, ...card.country_scope, card.topic].join(' ');
      return axis.pattern.test(signalText) || axis.primary_topics.includes(card.topic);
    });
    const metricMatches = datasetMetrics.filter((metric) => {
      const metricText = [metric.label, metric.country, metric.source_name, metric.source_url, metric.topic].join(' ');
      return axis.pattern.test(metricText) || axis.primary_topics.includes(metric.topic);
    });
    const activeSourceCount = sourceMatches.filter((source) => source.status === 'active').length;
    const status: AseanCollectionAxis['status'] =
      activeSourceCount >= 6 && (signalMatches.length >= 4 || metricMatches.length >= 4)
        ? 'covered'
        : activeSourceCount >= 3
          ? 'building'
          : 'thin';
    return {
      key: axis.key,
      label: axis.label,
      description: axis.description,
      source_count: sourceMatches.length,
      active_source_count: activeSourceCount,
      signal_count: signalMatches.length,
      metric_count: metricMatches.length,
      primary_topics: axis.primary_topics,
      status,
    };
  });
}

function sourceHandling(source: AseanTopicSource) {
  if (source.status === 'candidate') return '候选保留，不进入专题主流程。';
  if (source.ingestion === 'dataset') return '按接口缓存抽取指标，进入专题时间线和国家对比。';
  if (source.ingestion === 'polling') return '按RSS/Atom轮询抽取事件线索，进入时间线和图谱关系。';
  if (source.ingestion === 'static-anchor') return '作为政策、制度或长期事实锚点，用于校验和专题背景。';
  if (source.ingestion === 'search-seed') return '作为增量检索关键词和搜索种子，不直接作为事实结论。';
  return '按专题信源池规则处理。';
}

function selectedPollingSourceNames() {
  const limit = Math.min(24, Math.max(1, Number(process.env.WORLD_ASEAN_SOURCE_FEED_LIMIT || 18)));
  return new Set(
    ASEAN_SOURCE_POOL.filter((source) => source.status === 'active' && source.ingestion === 'polling' && source.source_type === 'rss')
      .filter((source) => source.priority === 'p0' || source.priority === 'p1')
      .slice(0, limit)
      .map((source) => source.name),
  );
}

function selectedDatasetSourceNames() {
  const limit = Math.min(40, Math.max(1, Number(process.env.WORLD_ASEAN_DATASET_METRIC_SOURCE_LIMIT || 28)));
  return new Set(
    ASEAN_SOURCE_POOL.filter((source) => source.status === 'active' && source.ingestion === 'dataset' && (source.source_type === 'api-json' || source.source_type === 'csv'))
      .filter((source) => source.priority === 'p0' || source.priority === 'p1')
      .slice(0, limit)
      .map((source) => source.name),
  );
}

function buildAseanSourceProcessing(
  signalCards: AseanTopicSignalCard[],
  datasetMetrics: AseanDatasetMetric[],
  datasetSourceHealth: AseanDatasetSourceHealth[],
): AseanSourceProcessingSummary {
  const selectedPolling = selectedPollingSourceNames();
  const selectedDataset = selectedDatasetSourceNames();
  const signalsBySource = new Map<string, AseanTopicSignalCard[]>();
  for (const card of signalCards) {
    for (const source of evidenceSourcesForCard(card)) {
      signalsBySource.set(source.name, [...(signalsBySource.get(source.name) || []), card]);
    }
  }
  const metricsBySource = new Map<string, AseanDatasetMetric[]>();
  for (const metric of datasetMetrics) {
    metricsBySource.set(metric.source_name, [...(metricsBySource.get(metric.source_name) || []), metric]);
  }
  const datasetHealthBySource = new Map(datasetSourceHealth.map((item) => [item.source_name, item]));

  const profiles = ASEAN_SOURCE_POOL.map((source) => {
    const sourceSignals = signalsBySource.get(source.name) || [];
    const sourceMetrics = metricsBySource.get(source.name) || [];
    const health = datasetHealthBySource.get(source.name);
    const selectedForPolling = selectedPolling.has(source.name);
    const selectedForDataset = selectedDataset.has(source.name);
    const runSelected = selectedForPolling || selectedForDataset || source.ingestion === 'static-anchor' || source.ingestion === 'search-seed';
    const contributionCount = sourceSignals.length + sourceMetrics.length;
    const latestSeenAt =
      [...sourceSignals.map((item) => item.published_at), ...sourceMetrics.map((item) => item.extracted_at)]
        .filter((item): item is string => Boolean(item))
        .sort()
        .at(-1) || null;
    const degraded =
      source.status === 'active' &&
      ((source.ingestion === 'dataset' && health?.status === 'failed') ||
        (source.ingestion === 'dataset' && Boolean(health) && sourceMetrics.length === 0));
    const profileHealth: AseanSourceProcessingProfile['health'] =
      source.status === 'candidate'
        ? 'candidate'
        : degraded
          ? 'degraded'
          : contributionCount > 0
            ? 'contributing'
            : 'ready';
    const issue =
      health?.status === 'failed'
        ? '本轮数据接口未返回可解析结果，沿用缓存或仅保留为待复核源。'
        : health?.status === 'empty'
          ? '接口可访问但本轮未抽取出有效指标。'
          : source.status === 'active' && selectedForPolling && contributionCount === 0
            ? '本轮已进入RSS轮询批次，但未筛出符合东盟专题规则的线索。'
          : source.status === 'active' && selectedForDataset && contributionCount === 0
            ? '本轮已进入指标抽取批次，但未形成可展示指标或线索。'
          : source.status === 'active' && !runSelected
            ? '已入专题信源池，但未进入本轮轮询或指标抽取批次。'
          : null;
    return {
      name: source.name,
      category: source.category,
      scope: source.scope,
      url: source.url,
      source_type: source.source_type,
      ingestion: source.ingestion,
      priority: source.priority,
      status: source.status,
      health: profileHealth,
      signal_count: sourceSignals.length,
      metric_count: sourceMetrics.length,
      contribution_count: contributionCount,
      latest_seen_at: latestSeenAt,
      topic_tags: source.topic_tags || [],
      selected_for_polling: selectedForPolling,
      selected_for_dataset: selectedForDataset,
      run_selected: runSelected,
      handling: sourceHandling(source),
      issue,
    };
  }).sort((left, right) => {
    const healthRank = { contributing: 0, degraded: 1, ready: 2, candidate: 3 };
    const priorityRank = { p0: 0, p1: 1, p2: 2 };
    return (
      healthRank[left.health] - healthRank[right.health] ||
      priorityRank[left.priority || 'p2'] - priorityRank[right.priority || 'p2'] ||
      right.contribution_count - left.contribution_count ||
      left.name.localeCompare(right.name)
    );
  });

  const runSelectedProfiles = profiles.filter((item) => item.run_selected);
  return {
    total_source_count: profiles.length,
    active_source_count: profiles.filter((item) => item.status === 'active').length,
    candidate_source_count: profiles.filter((item) => item.status === 'candidate').length,
    contributing_source_count: profiles.filter((item) => item.health === 'contributing').length,
    degraded_source_count: profiles.filter((item) => item.health === 'degraded').length,
    dataset_source_count: profiles.filter((item) => item.ingestion === 'dataset').length,
    polling_source_count: profiles.filter((item) => item.ingestion === 'polling').length,
    static_anchor_count: profiles.filter((item) => item.ingestion === 'static-anchor').length,
    selected_polling_source_count: profiles.filter((item) => item.selected_for_polling).length,
    selected_dataset_source_count: profiles.filter((item) => item.selected_for_dataset).length,
    run_selected_source_count: runSelectedProfiles.length,
    selected_contributing_source_count: runSelectedProfiles.filter((item) => item.health === 'contributing').length,
    selected_no_contribution_source_count: runSelectedProfiles.filter((item) => item.status === 'active' && item.health === 'ready').length,
    ready_unselected_source_count: profiles.filter((item) => item.status === 'active' && !item.run_selected && item.health === 'ready').length,
    profiles,
  };
}

function questionForCluster(cluster: AseanTopicCluster): AseanForecastQuestion | null {
  const evidenceIds = cluster.signal_ids.slice(0, 5);
  if (evidenceIds.length === 0) return null;
  const scope = cluster.country_scope.length ? cluster.country_scope : ['东盟'];
  const scopeLabel = scope.slice(0, 3).join('、');
  const common = {
    topic: cluster.key,
    country_scope: scope,
    evidence_signal_ids: evidenceIds,
    resolution_source: '公开新闻、政府公告、交易所/央行/航运或卫生机构更新',
  };
  if (cluster.key === 'maritime_security') {
    return {
      ...common,
      question_id: 'asean-maritime-incident-count-14d',
      title: `未来14天，${scopeLabel}相关海上安全或航运扰动公开事件会落在哪个区间？`,
      metric: '南海、马六甲或相关海域新增海上安全、海警/海军、船只扣押、航运扰动公开事件数',
      unit: '事件数',
      target_window: '14天',
      range_options: ['0-1', '2-3', '4及以上'],
      resolution_rule: '统计窗口内来自主流媒体、政府通报或航运机构的独立事件，重复报道只计一次。',
      why_now: '现有线索已涉及海上通道、安全和航运扰动，可按短周期事件数进行复核。',
    };
  }
  if (cluster.key === 'trade_supply_chain') {
    return {
      ...common,
      question_id: 'asean-trade-policy-count-30d',
      title: `未来30天，${scopeLabel}新增贸易、关税或供应链政策事件会落在哪个区间？`,
      metric: '新增或升级的关税、出口限制、供应链迁移、产业投资或贸易谈判公开事件数',
      unit: '事件数',
      target_window: '30天',
      range_options: ['0', '1-2', '3及以上'],
      resolution_rule: '以政府公告、企业正式披露或主流财经媒体报道为准，同一政策链条合并计数。',
      why_now: '贸易与供应链线索具有明确政策和产业落点，可用事件数量进行区间判断。',
    };
  }
  if (cluster.key === 'health_climate') {
    return {
      ...common,
      question_id: 'asean-health-climate-alert-count-14d',
      title: `未来14天，${scopeLabel}公共卫生或气候预警升级会落在哪个区间？`,
      metric: '登革热、烟霾、洪水、台风、高温等公共卫生或气候预警升级公开报道数',
      unit: '预警/升级事件数',
      target_window: '14天',
      range_options: ['0', '1-2', '3及以上'],
      resolution_rule: '以官方卫生、气象、灾害管理机构或主流媒体确认的预警升级为准。',
      why_now: '公共卫生和气候风险可按短周期预警升级数量进行监测。',
    };
  }
  if (cluster.key === 'market_macro') {
    return {
      ...common,
      question_id: 'asean-market-macro-move-count-30d',
      title: `未来30天，${scopeLabel}宏观、汇率、旅游或外资政策变化会落在哪个区间？`,
      metric: '央行、汇率、通胀、签证旅游、外资投资或市场监管相关公开政策变化数',
      unit: '政策/市场事件数',
      target_window: '30天',
      range_options: ['0', '1', '2及以上'],
      resolution_rule: '同一机构围绕同一政策的连续说明合并为一次，跨国家或跨政策分别计数。',
      why_now: '宏观市场线索可通过政策和市场事件数量进行复盘校准。',
    };
  }
  if (cluster.key === 'technology_infrastructure') {
    return {
      ...common,
      question_id: 'asean-tech-infra-project-count-45d',
      title: `未来45天，${scopeLabel}科技或基础设施项目新增披露会落在哪个区间？`,
      metric: '算力基础设施、云服务、电信、港口、铁路、电力等项目新增签约、审批或投运披露数',
      unit: '项目披露数',
      target_window: '45天',
      range_options: ['0', '1-2', '3及以上'],
      resolution_rule: '以政府、企业公告或主流媒体披露为准，同一项目多次报道只计一次。',
      why_now: '基础设施和科技项目通常具有公开披露节点，可进行范围型项目数研判。',
    };
  }
  return {
    ...common,
    question_id: 'asean-politics-security-event-count-14d',
    title: `未来14天，${scopeLabel}政治、安全或外交升级事件会落在哪个区间？`,
    metric: '选举、抗议、边境安全、外交峰会、军方动作或冲突升级公开事件数',
    unit: '事件数',
    target_window: '14天',
    range_options: ['0-1', '2-3', '4及以上'],
    resolution_rule: '以主流媒体、政府通报或国际组织公开记录为准，同一事件跨媒体重复报道只计一次。',
    why_now: '政治安全类线索可拆分为可计数事件，用于判断升级幅度。',
  };
}

export function buildAseanForecastQuestions(clusters: AseanTopicCluster[]) {
  const questions = clusters.map(questionForCluster).filter((question): question is AseanForecastQuestion => Boolean(question));
  return (questions.length ? questions : buildAseanForecastQuestionTemplates()).slice(0, 6);
}

function buildAseanForecastQuestionTemplates(): AseanForecastQuestion[] {
  const templateClusters: AseanTopicCluster[] = [
    { key: 'maritime_security', title: TOPIC_DEFINITIONS.maritime_security.title, signal_count: 0, country_scope: ['东盟'], signal_ids: [] },
    { key: 'trade_supply_chain', title: TOPIC_DEFINITIONS.trade_supply_chain.title, signal_count: 0, country_scope: ['东盟'], signal_ids: [] },
    { key: 'politics_security', title: TOPIC_DEFINITIONS.politics_security.title, signal_count: 0, country_scope: ['东盟'], signal_ids: [] },
    { key: 'health_climate', title: TOPIC_DEFINITIONS.health_climate.title, signal_count: 0, country_scope: ['东盟'], signal_ids: [] },
  ];
  return templateClusters.map((cluster) => {
    const fallback = questionForCluster({ ...cluster, signal_ids: ['template'] });
    return {
      ...(fallback as AseanForecastQuestion),
      evidence_signal_ids: [],
      why_now: '当前筛选范围内新增线索不足，先保留专题研究问题并等待公开依据补充。',
    };
  });
}

export function buildAseanResearchBlueprints(): AseanResearchBlueprint[] {
  return [
    {
      key: 'asean-ai-compute-projects-60d',
      title: '未来60天，东盟范围内新增AI算力或数据中心项目披露数量落在哪个区间？',
      topic: 'technology_infrastructure',
      metric: '政府、园区、运营商或云厂商公开披露的新增、扩容、投运、审批或签约项目数',
      target_window: '60天',
      range_options: ['0-1', '2-3', '4及以上'],
      primary_resolution_sources: ['ASEAN Sustainable Data Centre Guide相关后续发布', '成员国数字经济部门', '企业正式公告', '主流财经媒体'],
      admission_rule: '同一项目多次报道只计一次；纯营销活动、招聘和无地点披露不计入。',
    },
    {
      key: 'asean-electricity-price-policy-45d',
      title: '未来45天，东盟成员国新增电价、燃料补贴或电力供给政策调整会落在哪个区间？',
      topic: 'technology_infrastructure',
      metric: '电价、燃料补贴、发电燃料成本、电力供给或电网规则相关公开政策调整数',
      target_window: '45天',
      range_options: ['0', '1-2', '3及以上'],
      primary_resolution_sources: ['成员国能源主管部门', 'Singapore Data.gov', 'Malaysia OpenAPI', 'Thailand EPPO', '官方公报'],
      admission_rule: '同一机构围绕同一政策的解释性材料合并计数；市场评论不单独计数。',
    },
    {
      key: 'asean-cross-border-power-90d',
      title: '未来90天，中国—东盟或东盟内部新增跨境电力互联公开进展会落在哪个区间？',
      topic: 'technology_infrastructure',
      metric: '跨境输电、电力贸易、清洁能源采购、电网互联、项目融资或标准协调公开进展数',
      target_window: '90天',
      range_options: ['0', '1', '2及以上'],
      primary_resolution_sources: ['ASEAN Centre for Energy', 'ADB', '一带一路能源合作网', '中国电力网', '成员国能源部门'],
      admission_rule: '只计新增实质节点，会议回顾或无项目进展的表态不计入。',
    },
    {
      key: 'asean-supply-chain-policy-30d',
      title: '未来30天，东盟关键产业链新增贸易或投资政策事件会落在哪个区间？',
      topic: 'trade_supply_chain',
      metric: '半导体、数据中心、关键矿产、制造业迁移、关税、外资审批或产业园区相关事件数',
      target_window: '30天',
      range_options: ['0-1', '2-3', '4及以上'],
      primary_resolution_sources: ['ASEANstats', 'AMRO', 'MIDA', 'ANTARA', 'VietnamPlus', '商务部绿色指南相关公开材料'],
      admission_rule: '同一政策链条跨媒体重复报道只计一次，企业单一宣传不作为政策事件。',
    },
    {
      key: 'asean-public-risk-alerts-14d',
      title: '未来14天，东盟公共风险预警升级事件会落在哪个区间？',
      topic: 'health_climate',
      metric: '台风、洪水、地震、烟霾、公共卫生或跨境水资源风险的官方预警升级数',
      target_window: '14天',
      range_options: ['0', '1-2', '3及以上'],
      primary_resolution_sources: ['AHA Centre', 'GDACS', 'Mekong River Commission', 'WHO / World Monitor', '成员国灾害管理部门'],
      admission_rule: '同一灾害过程的滚动更新合并为一次，跨国影响可按国家分别记录但结算时需说明。',
    },
    {
      key: 'asean-maritime-security-14d',
      title: '未来14天，南海、马六甲及周边通道新增安全扰动事件会落在哪个区间？',
      topic: 'maritime_security',
      metric: '海警、海军、船只扣押、航运扰动、联合演训或通道安全公开事件数',
      target_window: '14天',
      range_options: ['0-1', '2-3', '4及以上'],
      primary_resolution_sources: ['ASEAN News RSS', '成员国政府通报', '权威媒体', '航运公开信息'],
      admission_rule: '同一海域同一事件多源报道合并计数；纯评论和历史回顾不计入。',
    },
  ];
}

function graphNode(id: string, node: Omit<AseanGraphNode, 'id'>): AseanGraphNode {
  return { id, ...node };
}

function addEdge(edges: AseanGraphEdge[], edge: AseanGraphEdge) {
  if (edges.some((item) => item.source === edge.source && item.target === edge.target && item.relation === edge.relation)) return;
  edges.push(edge);
}

function eventNodeId(signalId: string) {
  return `event:${signalId.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 72)}`;
}

function countryNodeId(label: string) {
  return `country:${label}`;
}

function issueNodeId(key: AseanTopicKey) {
  return `issue:${key}`;
}

function questionNodeId(questionId: string) {
  return `question:${questionId}`;
}

export function buildAseanGraph(
  signalCards: AseanTopicSignalCard[],
  clusters: AseanTopicCluster[],
  questions: AseanForecastQuestion[],
  maxNodes = 72,
): AseanGraph {
  const nodes = new Map<string, AseanGraphNode>();
  const edges: AseanGraphEdge[] = [];

  nodes.set(
    'region:asean',
    graphNode('region:asean', {
      label: '东盟',
      type: 'external_actor',
      community: 'regional_context',
      confidence: 'TEMPLATE',
      weight: 0.58,
      country_scope: ['东盟'],
      x: 50,
      y: 52,
    }),
  );

  for (const country of ASEAN_COUNTRIES) {
    const position = ASEAN_COUNTRY_POSITIONS[country.label] || { x: 50, y: 50 };
    nodes.set(
      countryNodeId(country.label),
      graphNode(countryNodeId(country.label), {
        label: country.label,
        type: 'country',
        community: 'regional_context',
        confidence: 'TEMPLATE',
        weight: 0.72,
        country_scope: [country.label],
        ...position,
      }),
    );
    addEdge(edges, {
      source: countryNodeId(country.label),
      target: 'region:asean',
      relation: 'located_in',
      confidence: 'TEMPLATE',
      weight: 0.4,
      evidence_signal_ids: [],
    });
  }

  for (const [key, title] of Object.entries(TOPIC_DEFINITIONS) as Array<[AseanTopicKey, (typeof TOPIC_DEFINITIONS)[AseanTopicKey]]>) {
    nodes.set(
      issueNodeId(key),
      graphNode(issueNodeId(key), {
        label: title.title,
        type: 'issue',
        community: key,
        confidence: 'TEMPLATE',
        weight: 0.62,
        issue: key,
      }),
    );
  }

  for (const actor of EXTERNAL_ACTORS) {
    nodes.set(
      actor.id,
      graphNode(actor.id, {
        label: actor.label,
        type: 'external_actor',
        community: 'regional_context',
        confidence: 'TEMPLATE',
        weight: 0.38,
        x: actor.x,
        y: actor.y,
      }),
    );
  }
  for (const link of EXTERNAL_ACTOR_ISSUE_LINKS) {
    addEdge(edges, {
      source: link.actor,
      target: issueNodeId(link.issue),
      relation: 'affects',
      confidence: 'TEMPLATE',
      weight: link.weight,
      evidence_signal_ids: [],
    });
  }

  for (const asset of ROUTE_ASSETS) {
    nodes.set(
      asset.id,
      graphNode(asset.id, {
        label: asset.label,
        type: 'route_or_asset',
        community: asset.issue,
        confidence: 'TEMPLATE',
        weight: 0.54,
        issue: asset.issue,
        x: asset.x,
        y: asset.y,
      }),
    );
    addEdge(edges, {
      source: asset.id,
      target: issueNodeId(asset.issue),
      relation: 'related_to_issue',
      confidence: 'TEMPLATE',
      weight: 0.48,
      evidence_signal_ids: [],
    });
  }

  const signalById = new Map(signalCards.map((card) => [card.id, card]));
  for (const card of signalCards.slice(0, 18)) {
    const id = eventNodeId(card.id);
    nodes.set(
      id,
      graphNode(id, {
        label: card.title,
        type: 'event_cluster',
        community: card.topic,
        confidence: 'EXTRACTED',
        weight: Math.min(1, Math.max(0.42, card.score / 8)),
        country_scope: card.country_scope,
        issue: card.topic,
        evidence_signal_ids: [card.id],
      }),
    );
    addEdge(edges, {
      source: id,
      target: issueNodeId(card.topic),
      relation: 'related_to_issue',
      confidence: 'EXTRACTED',
      weight: 0.72,
      evidence_signal_ids: [card.id],
    });
    for (const country of card.country_scope.filter((item) => item !== '东盟').slice(0, 2)) {
      if (!nodes.has(countryNodeId(country))) continue;
      addEdge(edges, {
        source: id,
        target: countryNodeId(country),
        relation: 'involves',
        confidence: 'EXTRACTED',
        weight: 0.68,
        evidence_signal_ids: [card.id],
      });
    }
  }

  for (const cluster of clusters) {
    for (const question of questions.filter((item) => item.topic === cluster.key).slice(0, 2)) {
      const qid = questionNodeId(question.question_id);
      nodes.set(
        qid,
        graphNode(qid, {
          label: question.metric,
          type: 'forecast_question',
          community: question.topic,
          confidence: question.evidence_signal_ids.length ? 'INFERRED' : 'TEMPLATE',
          weight: question.evidence_signal_ids.length ? 0.66 : 0.44,
          country_scope: question.country_scope,
          issue: question.topic,
          evidence_signal_ids: question.evidence_signal_ids,
        }),
      );
      addEdge(edges, {
        source: qid,
        target: issueNodeId(question.topic),
        relation: 'related_to_issue',
        confidence: question.evidence_signal_ids.length ? 'INFERRED' : 'TEMPLATE',
        weight: 0.54,
        evidence_signal_ids: question.evidence_signal_ids,
      });
      for (const signalId of question.evidence_signal_ids.slice(0, 3)) {
        const card = signalById.get(signalId);
        if (!card) continue;
        addEdge(edges, {
          source: eventNodeId(signalId),
          target: qid,
          relation: 'supports_question',
          confidence: 'INFERRED',
          weight: 0.5,
          evidence_signal_ids: [signalId],
        });
      }
    }
  }

  if (!clusters.length) {
    for (const question of questions.slice(0, 4)) {
      const qid = questionNodeId(question.question_id);
      nodes.set(
        qid,
        graphNode(qid, {
          label: question.metric,
          type: 'forecast_question',
          community: question.topic,
          confidence: 'TEMPLATE',
          weight: 0.42,
          country_scope: question.country_scope,
          issue: question.topic,
          evidence_signal_ids: [],
        }),
      );
      addEdge(edges, {
        source: qid,
        target: issueNodeId(question.topic),
        relation: 'related_to_issue',
        confidence: 'TEMPLATE',
        weight: 0.38,
        evidence_signal_ids: [],
      });
    }
  }

  const limitedNodes = Array.from(nodes.values()).slice(0, maxNodes);
  const validIds = new Set(limitedNodes.map((node) => node.id));
  return {
    nodes: limitedNodes,
    edges: edges.filter((edge) => validIds.has(edge.source) && validIds.has(edge.target)),
    constraints: {
      ontology_version: 'asean-topic-v1',
      max_nodes: maxNodes,
      time_window_days: 30,
      allowed_node_types: ['country', 'external_actor', 'issue', 'event_cluster', 'route_or_asset', 'forecast_question'],
      allowed_relations: ['located_in', 'involves', 'affects', 'related_to_issue', 'supports_question', 'supply_chain_link'],
      hub_policy: '东盟、中国及其他高频主体作为背景锚点保留；公开信息作为依据留存，不直接进入主图。',
    },
  };
}

export function buildAseanTopic(
  signals: AseanSignalLike[],
  limit = 40,
  options: { datasetMetrics?: AseanDatasetMetric[]; datasetSourceHealth?: AseanDatasetSourceHealth[] } = {},
) {
  const unique = new Map<string, AseanSignalLike>();
  for (const signal of signals.filter(isAseanSignal)) {
    const id = String(signal.id || '');
    if (!id || unique.has(id)) continue;
    unique.set(id, signal);
  }
  const sorted = Array.from(unique.values()).sort(
    (left, right) => signalTime(right) - signalTime(left) || aseanSignalScore(right) - aseanSignalScore(left),
  );
  const allSignalCards = sorted.map(toAseanSignalCard).map(normalizeAseanCard);
  const rawInitializedCards = [...ASEAN_INITIAL_SIGNAL_CARDS.map(normalizeAseanCard), ...allSignalCards];
  const processedSignalCards = dedupeDisplaySignalCards(rawInitializedCards, rawInitializedCards.length);
  const signalCards = processedSignalCards.slice(0, limit);
  const clusters = buildAseanTopicClustersFromCards(processedSignalCards);
  const questions = buildAseanForecastQuestions(clusters);
  const counts = buildAseanTopicCounts(processedSignalCards);
  const sourceBreakdown = buildAseanSourceBreakdown(processedSignalCards);
  const datasetMetrics = options.datasetMetrics || [];
  const sourceProcessing = buildAseanSourceProcessing(processedSignalCards, datasetMetrics, options.datasetSourceHealth || []);
  const timeline = buildAseanTimeline(processedSignalCards);
  const validationSummary = buildAseanValidationSummary(rawInitializedCards, processedSignalCards, datasetMetrics);
  const collectionAxes = buildAseanCollectionAxes(processedSignalCards, datasetMetrics, ASEAN_SOURCE_POOL);
  return {
    topic: 'asean',
    title: '东盟区域专题',
    summary: '覆盖东盟成员国、南海、马六甲海峡、区域产业链及周边重点相关方，提供可追溯线索和专题研究依据。',
    signal_count: processedSignalCards.reduce((sum, card) => sum + Math.max(1, card.related_signal_count), 0),
    processed_signal_count: processedSignalCards.length,
    raw_signal_count: rawInitializedCards.length,
    returned_signal_count: signalCards.length,
    signals: signalCards,
    timeline,
    dataset_metrics: datasetMetrics,
    validation_summary: validationSummary,
    collection_axes: collectionAxes,
    source_processing: sourceProcessing,
    source_pool: ASEAN_SOURCE_POOL,
    source_breakdown: sourceBreakdown,
    ...counts,
    clusters,
    questions,
    research_blueprints: buildAseanResearchBlueprints(),
    graph: buildAseanGraph(processedSignalCards, clusters, questions),
  };
}

export type AseanTopicPayload = ReturnType<typeof buildAseanTopic>;
