'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Map as MapIcon,
  RefreshCw,
  Send,
  Square,
  Timer,
} from 'lucide-react';
import countriesTopologyJson from 'world-atlas/countries-50m.json';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';

import { worldHomeHref, worldMountedHref } from '@/components/world-ui';
import type { AseanTopicKey, AseanTopicPayload } from '@/lib/world/asean-topic';
import { pickDailyAseanResearchQuestions } from '@/lib/world/asean-research-suggestions';

import styles from './asean-demo.module.css';

type TopologyGeometryCollection = { type: 'GeometryCollection'; geometries: unknown[] };
type AseanMapTopology = {
  type: 'Topology';
  objects: {
    countries: TopologyGeometryCollection;
  };
  arcs: unknown[];
  transform?: unknown;
};

type AseanDemoTopic = AseanTopicPayload & {
  generated_at: string;
  incremental_search?: {
    enabled: boolean;
    search_ready: boolean;
    keyword_count: number;
    signal_count: number;
    axis_counts?: Array<{ axis: string; count: number }>;
    cache_ttl_minutes: number;
    refreshed_at: string | null;
    latest_run?: {
      refreshed_at: string;
      fetched_count: number;
      new_item_count: number;
      retained_item_count: number;
      query_count: number;
    } | null;
  };
  dataset_metric_status?: {
    enabled: boolean;
    refreshed_at: string;
    metric_count: number;
    latest_run?: {
      refreshed_at: string;
      source_count: number;
      fetched_count: number;
      metric_count: number;
      failed_count: number;
    } | null;
    source_health?: Array<Record<string, unknown>>;
  };
  dataset_series?: Array<{
    id: string;
    source_name: string;
    source_url: string;
    label: string;
    country: string;
    unit: string;
    topic: AseanTopicKey;
    points: Array<{ date: string; value: number }>;
    latest_date: string;
    latest_value: number;
  }>;
  recent_research_reports?: Array<{
    id: string;
    question: string;
    content: string;
    created_at: string;
    model?: string;
    references: ResearchSource[];
    source_count: number;
  }>;
};
type AseanTopicSignal = AseanDemoTopic['signals'][number];
type AseanTimelineItem = AseanDemoTopic['timeline'][number];
type AseanDatasetMetricRow = AseanDemoTopic['dataset_metrics'][number];
type ResearchSource = {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  description?: string;
  link?: string;
  href?: string;
  name?: string;
  hostname?: string;
};
type ResearchChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'done' | 'error' | 'stopped';
  persisted?: boolean;
  progress_content?: string;
  progress_phase?: string;
  phases?: string[];
  references?: ResearchSource[];
  web_sites?: ResearchSource[];
  source_count?: number;
  progress_stats?: {
    contextSourceCount?: number;
    activeSourceCount?: number;
    candidateSourceCount?: number;
    contributingSourceCount?: number;
    evidenceCount?: number;
  };
  error?: string;
};

type AseanDecisionModelResult = {
  generated_at: string;
  scope: string[];
  layers: Array<{
    id: string;
    title: string;
    description: string;
    items: string[];
  }>;
  indicators: Array<{
    id: string;
    label: string;
    value: number;
    unit: string;
    direction: 'up' | 'down' | 'flat';
    basis: string;
    formula?: string;
    components?: Array<{
      label: string;
      value: string;
      source: string;
    }>;
  }>;
  strategy_models: Array<{
    id: string;
    name: string;
    output: string;
    linked_view: string;
    confidence: number;
  }>;
  fuel_price_training?: {
    generated_at: string;
    source: { name: string; url: string; country: string };
    series: Array<{
      product: string;
      label: string;
      country: string;
      source_name: string;
      source_url: string;
      start: string;
      end: string;
      point_count: number;
    }>;
    forecast_8_weeks: Array<{
      date: string;
      step: number;
      product: string;
      predicted_price: number;
      previous_observed_or_predicted: number;
      change: number;
      direction: string;
    }>;
    trend_points: Array<{
      date: string;
      product: string;
      price: number;
      kind: 'observed' | 'forecast';
    }>;
    deviation_points: Array<{
      date: string;
      product: string;
      observed: number;
      estimated: number;
      difference: number;
      direction: '偏高' | '偏低';
    }>;
    model_metrics: Array<{
      id: 'average_error' | 'relative_error' | 'fit_score' | 'trend_correlation' | 'review_samples';
      label: string;
      value: string;
      level: 'good' | 'watch' | 'weak';
      help: string;
    }>;
    quality_label: string;
    public_readout: string;
    coverage_label: string;
    latest_date: string;
    limitations: string[];
  } | null;
  prediction_tasks: Array<{
    id: string;
    title: string;
    horizon: string;
    target: string;
    metric: string;
    range_options: string[];
    current_assessment: string;
    watch_signals: string[];
  }>;
  model_blueprints?: Array<{
    id: string;
    title: string;
    business_question: string;
    current_data_status: string;
    data_requirements: string[];
    available_inputs: string[];
    method_decision: string;
    training_assessment: string;
    validation_plan: string;
    output_contract: string[];
    evidence_reading_contract?: string[];
    visualization: string;
    next_data_gaps: string[];
    public_model?: {
      name: string;
      kind: string;
      summary: string;
      source_label: string;
      period_label: string;
      quality_label: string;
      quality_metrics: Array<{
        label: string;
        value: string;
        level: 'good' | 'watch' | 'weak';
        detail: string;
      }>;
      forecast_cards: Array<{
        country: string;
        label: string;
        current: number | null;
        estimated: number | null;
        direction: string;
        note: string;
        points?: Array<{
          date: string;
          value: number;
          kind: 'observed' | 'forecast';
        }>;
      }>;
    };
    training_diagnostics?: Array<{
      label: string;
      value: string;
      detail: string;
    }>;
    country_assessments: Array<{
      country: string;
      level: '低约束' | '中约束' | '高约束' | '红灯预警';
      score: number;
      confidence: number;
      basis: string[];
      gaps: string[];
      trained_forecast?: {
        forecast_year: number;
        predicted_supply_gap_ratio: number;
        predicted_band: string;
        source_model: string;
      };
    }>;
  }>;
  summary: string;
};

const TOPIC_LABELS: Record<AseanTopicKey, string> = {
  trade_supply_chain: '贸易与供应链',
  maritime_security: '海上通道与安全',
  politics_security: '政治与安全',
  health_climate: '公共卫生与气候',
  market_macro: '市场与宏观',
  technology_infrastructure: '科技与基础设施',
};

const ISSUE_DESCRIPTIONS: Record<AseanTopicKey, string> = {
  trade_supply_chain: '贸易、关税、产业链迁移与关键矿产',
  maritime_security: '南海、马六甲、执法与航运通道',
  politics_security: '选举、冲突、外交与安全合作',
  health_climate: '极端天气、公共卫生、粮食与水资源',
  market_macro: '汇率、资本流动、通胀与区域市场',
  technology_infrastructure: '算力基础设施、港口、电网与通信',
};

type AseanMapCountry = { id: string; label: string; x: number; y: number; path: string };
type AseanSignalMarker = {
  id: string;
  country: string;
  signal: AseanTopicSignal;
  recency: SignalTimeBucket;
  x: number;
  y: number;
};
type MapLayerKey = 'security' | 'industry' | 'macro_risk' | 'routes';
type MapTimeScope = 'today' | 'recent30';
type SignalTimeBucket = 'today' | 'recent30' | 'older';
type DecisionStageKey = 'collection' | 'analysis' | 'strategy' | 'output';

const ASEAN_COUNTRY_IDS = new Map([
  ['104', '缅甸'],
  ['764', '泰国'],
  ['418', '老挝'],
  ['704', '越南'],
  ['116', '柬埔寨'],
  ['458', '马来西亚'],
  ['702', '新加坡'],
  ['096', '文莱'],
  ['360', '印尼'],
  ['608', '菲律宾'],
  ['626', '东帝汶'],
]);

const ASEAN_LABEL_POSITIONS: Record<string, { x: number; y: number }> = {
  缅甸: { x: 18, y: 22 },
  泰国: { x: 27, y: 36 },
  老挝: { x: 32, y: 29 },
  越南: { x: 40, y: 36 },
  柬埔寨: { x: 34, y: 42 },
  马来西亚: { x: 39, y: 59 },
  新加坡: { x: 31, y: 65 },
  文莱: { x: 50, y: 58 },
  印尼: { x: 51, y: 77 },
  菲律宾: { x: 64, y: 41 },
  东帝汶: { x: 68, y: 87 },
};

const ASEAN_MANUAL_COUNTRIES: AseanMapCountry[] = [
  { id: 'country:新加坡', label: '新加坡', x: 31, y: 65, path: 'M30.5 64.4 L31.6 64.4 L31.6 65.3 L30.5 65.3 Z' },
];

const MAP_BOUNDS = {
  west: 88,
  east: 142,
  north: 29,
  south: -13,
  padding: 5,
};

const mapTopology = countriesTopologyJson as unknown as AseanMapTopology;
const mapFeatures = (feature as (topology: unknown, object: unknown) => unknown)(
  mapTopology,
  mapTopology.objects.countries,
) as FeatureCollection<Geometry, { name?: string }>;

function projectPosition(position: Position) {
  const lon = Number(position[0]);
  const lat = Number(position[1]);
  const width = MAP_BOUNDS.east - MAP_BOUNDS.west;
  const height = MAP_BOUNDS.north - MAP_BOUNDS.south;
  const inner = 100 - MAP_BOUNDS.padding * 2;
  return {
    x: Number((MAP_BOUNDS.padding + ((lon - MAP_BOUNDS.west) / width) * inner).toFixed(2)),
    y: Number((MAP_BOUNDS.padding + ((MAP_BOUNDS.north - lat) / height) * inner).toFixed(2)),
  };
}

function seaRoutePath(points: Array<[number, number]>) {
  const projected = points.map(([lon, lat]) => projectPosition([lon, lat]));
  if (!projected.length) return '';
  if (projected.length === 1) return `M${projected[0].x} ${projected[0].y}`;
  const commands = [`M${projected[0].x} ${projected[0].y}`];
  for (let index = 0; index < projected.length - 1; index += 1) {
    const previous = projected[index - 1] || projected[index];
    const current = projected[index];
    const next = projected[index + 1];
    const afterNext = projected[index + 2] || next;
    const controlA = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const controlB = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6,
    };
    commands.push(`C${controlA.x.toFixed(2)} ${controlA.y.toFixed(2)} ${controlB.x.toFixed(2)} ${controlB.y.toFixed(2)} ${next.x} ${next.y}`);
  }
  return commands.join(' ');
}

function ringToPath(ring: Position[]) {
  return ring
    .map((point, index) => {
      const { x, y } = projectPosition(point);
      return `${index ? 'L' : 'M'}${x} ${y}`;
    })
    .join(' ')
    .concat(' Z');
}

function polygonToPath(polygon: Polygon['coordinates']) {
  return polygon.map(ringToPath).join(' ');
}

function geometryToPath(geometry: Polygon | MultiPolygon) {
  if (geometry.type === 'Polygon') return polygonToPath(geometry.coordinates);
  return geometry.coordinates.map(polygonToPath).join(' ');
}

const BASE_COUNTRIES: AseanMapCountry[] = mapFeatures.features
    .map((item: Feature<Geometry, { name?: string }>) => {
      const label = ASEAN_COUNTRY_IDS.get(String(item.id).padStart(3, '0'));
      if (!label || (item.geometry.type !== 'Polygon' && item.geometry.type !== 'MultiPolygon')) return null;
      const labelPosition = ASEAN_LABEL_POSITIONS[label] || { x: 50, y: 50 };
      return {
        id: `country:${label}`,
        label,
        path: geometryToPath(item.geometry),
        ...labelPosition,
      };
    })
    .filter((item): item is AseanMapCountry => Boolean(item));

const COUNTRIES: AseanMapCountry[] = [
  ...BASE_COUNTRIES,
  ...ASEAN_MANUAL_COUNTRIES.filter((country) => !BASE_COUNTRIES.some((item) => item.label === country.label)),
].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));

const SEA_ROUTES = [
  {
    id: 'malacca-singapore',
    label: '马六甲/新加坡海峡',
    d: seaRoutePath([[94.2, 7.8], [97.4, 6.2], [100.2, 4.1], [102.3, 2.4], [103.9, 1.2]]),
  },
  {
    id: 'south-china-sea-main',
    label: '南海主通道',
    d: seaRoutePath([[103.9, 1.2], [107.3, 3.6], [110.9, 6.6], [114.4, 10.1], [118.6, 14.6], [123.8, 19.2]]),
  },
  {
    id: 'java-eastern',
    label: '爪哇海—东部通道',
    d: seaRoutePath([[103.9, 1.2], [106.8, -1.8], [110.4, -4.6], [114.8, -6.0], [120.5, -6.4], [126.8, -7.3]]),
  },
];

const SEA_ROUTE_GATES = [
  { id: 'gate:malacca', label: '马六甲', ...projectPosition([100.2, 4.1]) },
  { id: 'gate:singapore', label: '新加坡海峡', ...projectPosition([103.9, 1.2]) },
  { id: 'gate:south-china-sea', label: '南海', ...projectPosition([114.4, 10.1]) },
  { id: 'gate:java-sea', label: '爪哇海', ...projectPosition([114.8, -6.0]) },
];

const ISSUE_ORDER: AseanTopicKey[] = [
  'maritime_security',
  'trade_supply_chain',
  'politics_security',
  'health_climate',
  'market_macro',
  'technology_infrastructure',
];

const MAP_LAYER_LABELS: Record<MapLayerKey, string> = {
  security: '安全政治',
  industry: '产业设施',
  macro_risk: '市场风险',
  routes: '海上通道',
};

const MAP_TIME_SCOPE_LABELS: Record<MapTimeScope, string> = {
  today: '当天',
  recent30: '近30天',
};

const MODEL_EVIDENCE_HELP = {
  model: '说明当前测算采用哪类公开数据口径；只作为判断标准，不代表单一结论。',
  inputs: '只读取已入库且可追溯的公开指标、公开价格、来源线索和已保存研判。',
  usage: '输出用于国家比较、缺口复核和行动路径排序；结论仍需回到来源和线索确认。',
};

function HelpTip({ label, text }: { label: string; text?: string }) {
  const content = text?.trim() || '说明当前指标的含义、判断口径和使用边界。';
  const [open, setOpen] = useState(false);
  return (
    <span
      className={styles.helpTipWrap}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-expanded={open}
        aria-label={`${label}说明：${content}`}
        className={styles.helpTip}
        onClick={() => setOpen(true)}
        type="button"
      >
        ?
      </button>
      {open ? <span className={styles.helpBubble} role="tooltip">{content}</span> : null}
    </span>
  );
}

const DEFAULT_MAP_LAYERS: MapLayerKey[] = ['security', 'industry', 'macro_risk', 'routes'];
const DECISION_SCOPE_COUNTRIES = ['马来西亚', '越南', '新加坡', '泰国', '老挝', '柬埔寨'];
const CORE_DATA_COLUMNS: Array<{ key: string; label: string; patterns: string[] }> = [
  { key: 'macro', label: '经济规模', patterns: ['GDP'] },
  { key: 'power', label: '用电强度', patterns: ['人均用电量', '年度电力需求', '电力可及率'] },
  { key: 'digital', label: '网络基础', patterns: ['互联网使用率', '安全互联网服务器密度'] },
  { key: 'technology_trade', label: '技术出口', patterns: ['高技术出口额'] },
  { key: 'investment', label: '资本流入', patterns: ['FDI净流入'] },
  { key: 'openness', label: '贸易开放', patterns: ['贸易开放度'] },
];

function shortTime(value: string) {
  if (!value) return '待更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '待更新';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type SignalUrgencyInput = {
  topic: AseanTopicKey;
  score?: number;
  credibility_score?: number;
  urgency_level?: 'high' | 'elevated' | 'monitoring';
  title?: string;
  summary?: string;
  conflict_group?: string | null;
};

function urgencyTone(input: SignalUrgencyInput) {
  const score = input.score ?? ((input.credibility_score ?? 0) / 10);
  const text = `${input.title || ''} ${input.summary || ''}`;
  const hasIncidentSignal = /地震|洪水|台风|热带气旋|火山|火灾|灾害|预警|告警|冲突|军事|袭击|制裁|停电|中断|封锁|南海|海上通道|马六甲|earthquake|flood|typhoon|cyclone|disaster|warning|alert|conflict|military|attack|sanction|outage|disruption|south china sea|malacca/i.test(text);
  const hasPressureSignal = /短缺|缺口|缺乏|受限|限制|下降|下滑|上涨|上行|飙升|波动|风险|扰动|紧张|负荷|需求|电价|燃油价格|能源价格|GPU|算力|数据中心|电力供给|电力消费|tariff|price|risk|shortage|constraint|restriction|decline|surge|volatility|demand|load|data center|compute/i.test(text);
  const isRiskTopic = input.topic === 'maritime_security' || input.topic === 'politics_security' || input.topic === 'health_climate';

  if (input.urgency_level === 'high') return 'high';
  if ((isRiskTopic && score >= 8) || (input.topic === 'market_macro' && score >= 10)) return 'high';
  if (input.urgency_level) return input.urgency_level;
  if (
    hasIncidentSignal
    && (
      score >= 6
      || isRiskTopic
    )
  ) {
    return 'high';
  }
  if (hasIncidentSignal || (hasPressureSignal && score >= 6) || score >= 10) return 'elevated';
  return 'monitoring';
}

function signalTone(signal: AseanTopicSignal) {
  return urgencyTone(signal);
}

function timelineTone(item: AseanTimelineItem) {
  return urgencyTone({
    topic: item.topic,
    credibility_score: item.credibility_score,
    title: item.title,
    summary: item.summary,
    conflict_group: item.conflict_group,
  });
}

function urgencyLabel(tone: ReturnType<typeof urgencyTone>) {
  if (tone === 'high') return '高紧急';
  if (tone === 'elevated') return '需关注';
  return '常态监测';
}

function mapLayerForTopic(topic: AseanTopicKey): Exclude<MapLayerKey, 'routes'> {
  if (topic === 'maritime_security' || topic === 'politics_security') return 'security';
  if (topic === 'trade_supply_chain' || topic === 'technology_infrastructure') return 'industry';
  return 'macro_risk';
}

function signalTimeBucket(signal: Pick<AseanTopicSignal, 'published_at'>, referenceTime: number): SignalTimeBucket {
  const publishedTime = new Date(signal.published_at || '').getTime();
  if (!Number.isFinite(publishedTime) || !Number.isFinite(referenceTime)) return 'older';
  const referenceDate = new Date(referenceTime);
  const startOfReferenceDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ).getTime();
  const startOfNextDay = startOfReferenceDay + 24 * 60 * 60 * 1000;
  if (publishedTime >= startOfReferenceDay && publishedTime < startOfNextDay) return 'today';
  if (publishedTime >= startOfReferenceDay - 29 * 24 * 60 * 60 * 1000 && publishedTime < startOfNextDay) {
    return 'recent30';
  }
  return 'older';
}

function signalMatchesMapTimeScope(
  signal: Pick<AseanTopicSignal, 'published_at'>,
  scope: MapTimeScope,
  referenceTime: number,
) {
  const bucket = signalTimeBucket(signal, referenceTime);
  if (scope === 'today') return bucket === 'today';
  return bucket === 'today' || bucket === 'recent30';
}

function timelineDotClass(item: AseanTimelineItem) {
  const level = timelineTone(item);
  if (level === 'high') return styles.streamDotHigh;
  if (level === 'elevated') return styles.streamDotElevated;
  return styles.streamDotMonitoring;
}

function compactTimelineText(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

function isLowInformationTimelineTitle(value: string) {
  const text = compactTimelineText(value);
  return (
    !text ||
    /^(新闻|动态|工作动态|经贸动态|业界探讨|专题|首页|主页|rss|update)$/iu.test(text) ||
    /主页\s*>|当前位置|用户空间|网站首页|门户网站|官方网站|政府信息公开|网上办事|无障碍|长者专区|业界探讨\s+业界探讨/iu.test(text) ||
    /^\d{4}年部门动态/u.test(text) ||
    /事项$|线索$|公开进展$|相关线索更新$/u.test(text) ||
    (text.match(/\d{4}-\d{2}-\d{2}/gu)?.length || 0) >= 2
  );
}

function concreteTimelineTitle(item: AseanTimelineItem) {
  const title = compactTimelineText(item.title || '');
  const summary = compactTimelineText(item.summary || '');
  const source = compactSourceName(item.source_name || '').replace(/\s*·\s*$/u, '');
  const weakTitle = isLowInformationTimelineTitle(title) || /风险提示$|指标更新$/u.test(title);
  if (!weakTitle) return title;
  const concreteSummary = summary
    .split(/(?<=[。！？!?])\s*/u)
    .map((part) => compactTimelineText(part))
    .map((part) => part.replace(/^公开信息(显示|涉及)，?/u, '').replace(/^公开报道显示，?/u, ''))
    .find((part) => part.length >= 16 && !/相关线索更新|保留来源|同类线索|重点关注|出现人工智能、算力基础设施或数据中心相关线索/u.test(part));
  if (concreteSummary) return concreteSummary.length > 64 ? `${concreteSummary.slice(0, 63)}…` : concreteSummary;
  const country = item.country_scope.filter((value) => value !== '东盟').slice(0, 2).join('、') || '东盟区域';
  const topic = TOPIC_LABELS[item.topic] || '专题';
  return source ? `${country} · ${source}：${topic}公开进展` : `${country}：${topic}公开进展`;
}

function concreteTimelineSummary(item: AseanTimelineItem) {
  const summary = compactTimelineText(item.summary || '');
  if (summary && !/相关线索更新|保留来源、时间和同类线索|出现人工智能、算力基础设施或数据中心相关线索/u.test(summary)) {
    return summary;
  }
  const source = compactSourceName(item.source_name || '').replace(/\s*·\s*$/u, '');
  const country = item.country_scope.filter((value) => value !== '东盟').slice(0, 2).join('、') || '东盟区域';
  const topic = TOPIC_LABELS[item.topic] || '专题';
  return `${country}出现${topic}相关公开进展，已保留来源、时间和国家范围，用于后续研判。${source ? `来源：${source}。` : ''}`;
}

function isConcreteTimelineDisplayItem(item: AseanTimelineItem) {
  const title = concreteTimelineTitle(item);
  const summary = concreteTimelineSummary(item);
  return !(
    isLowInformationTimelineTitle(title)
    || /公开进展$|事项$|相关线索更新/u.test(title)
    || /保留来源、时间和国家范围|保留来源、时间和同类线索|相关线索更新/u.test(summary)
    || /\/index\.html(?:$|[?#])/iu.test(item.source_url || '')
  );
}

function balanceSignalMarkers(rows: AseanSignalMarker[], limit = 30) {
  return [...rows].sort((left, right) => {
    const toneDelta = toneWeight(signalTone(right.signal)) - toneWeight(signalTone(left.signal));
    if (toneDelta) return toneDelta;
    return right.signal.score - left.signal.score;
  }).slice(0, limit);
}

function toneWeight(tone: ReturnType<typeof urgencyTone>) {
  if (tone === 'high') return 3;
  if (tone === 'elevated') return 2;
  return 1;
}

function uniqueId(prefix: string) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function appendUnique(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized || values.includes(normalized)) return values;
  return [...values, normalized].slice(-6);
}

function withoutPendingSourcePhase(values: string[] | undefined) {
  return (values || []).filter((value) => value !== '关联来源');
}

function normalizeResearchPhase(label: string) {
  const normalized = label.trim();
  if (/^关联来源\s+\d+\s*个$/u.test(normalized)) return `已${normalized}`;
  return normalized;
}

function publicResearchPhase(label: string) {
  const normalized = normalizeResearchPhase(label).replace(/^冒烟测试[:：]\s*/u, '').trim();
  if (!normalized) return '';
  if (/确认范围|研究规划/u.test(normalized)) return '确认问题';
  if (/筛选来源|准备检索|核对来源|来源初筛|关联来源|已关联来源|检索/u.test(normalized)) return '核验来源';
  if (/形成答复|研究完成/u.test(normalized)) return '形成结论';
  if (/已保存/u.test(normalized)) return '保存研判';
  if (/请求未完成/u.test(normalized)) return '请求未完成';
  if (/已停止/u.test(normalized)) return '已停止';
  if (/待命/u.test(normalized)) return '待命';
  return normalized;
}

function publicResearchPhases(phases: string[] | undefined) {
  const rows: string[] = [];
  for (const phase of phases || []) {
    const publicPhase = publicResearchPhase(phase);
    if (publicPhase && !rows.includes(publicPhase)) rows.push(publicPhase);
  }
  return rows.slice(-4);
}

function publicResearchStatus(label: string) {
  const phase = publicResearchPhase(label);
  if (phase === '确认问题') return '确认中';
  if (phase === '核验来源') return '核验中';
  if (phase === '形成结论') return '形成中';
  if (phase === '保存研判') return '已保存';
  return phase || label;
}

function latestValue(values: string[] | undefined, fallback: string) {
  if (!values?.length) return fallback;
  return values[values.length - 1] || fallback;
}

function friendlyResearchError(value: string) {
  const text = value.trim();
  if (!text) return '研究请求未完成，请稍后重试。';
  if (/aborted|abort|operation was aborted/iu.test(text)) {
    return '研究请求被中断。若已检索出来源，可缩小国家、议题或时间范围后重新提交。';
  }
  if (/timeout|timed out|超时|超过/iu.test(text)) {
    return '研究请求耗时较长，本次未完整返回。可保留已返回来源，并缩小范围后重试。';
  }
  if (/fetch failed|network|failed to fetch|ECONNRESET|ENOTFOUND/iu.test(text)) {
    return '外部研究服务暂未完整返回，请稍后重试。';
  }
  if (/DASHSCOPE_API_KEY|api key|unauthorized|forbidden/iu.test(text)) {
    return '专题研究服务暂不可用，请复核服务配置后重试。';
  }
  return text;
}

function normalizeResearchMarkdown(value: string) {
  return value
    .replace(/\r/gu, '')
    .replace(/Malaysia OpenAPI Fuel Price/gu, '马来西亚公开燃油价格')
    .replace(/^.*(?:生成检索式|读取来源|来源轮次完成|已关联来源|来源关联更新|关联来源进行中).*$/gmu, '')
    .replace(/^.*(?:DASHSCOPE_API_KEY|api key|fetch failed|XGBoost|MAE|MAPE|RMSE|R²).*$/gmi, '')
    .replace(/^下一步[:：].*$/gmu, '')
    .replace(/([^\n])\s+(#{1,4}\s+)/gu, '$1\n\n$2')
    .replace(
      /^(#{1,4}\s+.{6,80}?)(\s+(本报告|本文|总体而言|具体来看|综合来看|对于|因此|同时|当前|首先|其次|最后))/gmu,
      '$1\n\n$3',
    )
    .replace(
      /^(#{1,4}\s+(越南|泰国|马来西亚|新加坡|印度尼西亚|印尼|菲律宾|缅甸|老挝|柬埔寨|文莱|东帝汶)[:：].{6,72}?)(\s+\2(?=[的正将在已面临拥有呈现作]))/gmu,
      '$1\n\n$2',
    )
    .replace(/([。；！？.!?;:：])\s+([-*]\s+)/gu, '$1\n$2')
    .replace(/([。；！？.!?;])\s+(\d+[.)、]\s+)/gu, '$1\n$2')
    .trim();
}

function renderResearchContent(text: string, fallback: string, _streaming = false, className = '') {
  const content = normalizeResearchMarkdown(text.trim() || fallback);
  if (!content) return null;
  return (
    <div className={`${styles.researchContent} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href || '#'} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function normalizeResearchSourceItem(item: ResearchSource) {
  const url = (item.url || item.link || item.href || '').trim();
  const rawTitle = (item.title || item.name || item.hostname || url).trim();
  const title = readableResearchSourceTitle(rawTitle, url);
  const snippet = (item.snippet || item.description || item.content || '').trim();
  if (!title && !url) return null;
  return { title: title || url, url, snippet };
}

function mergeResearchSources(current: ResearchSource[] | undefined, incoming: ResearchSource[] | undefined, max = 24) {
  const seen = new Set<string>();
  const merged: ResearchSource[] = [];
  for (const item of [...(current || []), ...(incoming || [])]) {
    const normalized = normalizeResearchSourceItem(item);
    if (!normalized) continue;
    const key = (normalized.url || normalized.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= max) break;
  }
  return merged;
}

function researchSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return url.replace(/^https?:\/\//u, '').split('/')[0] || '公开来源';
  }
}

function hasUnreadableResearchTitle(value: string) {
  const compact = value.replace(/\s+/gu, '');
  if (!compact) return true;
  if (/[�□]{1,}/u.test(compact)) return true;
  const mojibakeCount = (compact.match(/[\u00a0-\u00bf\u00c0-\u00ff]/gu) || []).length;
  if (compact.length >= 12 && mojibakeCount / compact.length > 0.18) return true;
  const unusualCount = [...compact].filter((char) => !/[\p{Script=Han}\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)).length;
  return compact.length >= 12 && unusualCount / compact.length > 0.16;
}

function readableResearchSourceTitle(value: string, url: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  if (!hasUnreadableResearchTitle(cleaned)) return cleaned;
  const host = researchSourceHost(url);
  return cleaned.startsWith('[PDF]') || /\.pdf(?:$|\?)/iu.test(url)
    ? `[PDF] ${host} 公开资料`
    : `${host} 公开来源`;
}

function researchSourceItems(sources: ResearchSource[] | undefined, max = 12) {
  const seen = new Set<string>();
  const rows: Array<{ title: string; host: string; url: string; snippet: string }> = [];
  for (const item of sources || []) {
    const normalized = normalizeResearchSourceItem(item);
    if (!normalized) continue;
    const key = (normalized.url || normalized.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      title: normalized.title,
      host: researchSourceHost(normalized.url),
      url: normalized.url,
      snippet: normalized.snippet,
    });
    if (rows.length >= max) break;
  }
  return rows;
}

function ResearchSourceDisclosure({
  sources,
  totalCount,
}: {
  sources: ResearchSource[] | undefined;
  totalCount?: number;
}) {
  const rows = researchSourceItems(sources);
  if (!rows.length) return null;
  const countLabel = totalCount && totalCount > rows.length ? `展示 ${rows.length} 个 / 证据 ${totalCount} 条` : `${rows.length} 个`;
  return (
    <details className={styles.sourceDisclosure}>
      <summary>
        <span>主要来源</span>
        <b>{countLabel}</b>
      </summary>
      <div className={styles.sourceGrid}>
        {rows.map((item, index) => (
          <a href={item.url || '#'} target="_blank" rel="noreferrer" key={`${item.url || item.title}:${index}`}>
            <strong>{item.title || item.host || `来源 ${index + 1}`}</strong>
            <span>{item.host || '公开来源'}</span>
            {item.snippet ? <em>{item.snippet}</em> : null}
          </a>
        ))}
      </div>
    </details>
  );
}

function researchExcerpt(value: string, max = 140) {
  const normalized = value.replace(/Malaysia OpenAPI Fuel Price/gu, '马来西亚公开燃油价格').replace(/[#>*_`]/gu, '').replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function savedResearchTitle(value: string) {
  return publicSuggestedResearchQuestion(value) || '已保存专题研判';
}

function publicSuggestedResearchQuestion(value: string) {
  const normalized = value
    .replace(/^冒烟测试[:：]\s*/u, '')
    .replace(/^研究问题：/u, '')
    .replace(/^请研究[:：]\s*/u, '')
    .replace(/[，,；;。.]?\s*三段以内[。.]?/u, '')
    .trim();
  if (!normalized) return '';
  if (/来源是否可追溯|可追溯/u.test(normalized)) {
    return '能源成本扰动预测可以用哪些公开来源交叉核验？';
  }
  return researchExcerpt(normalized, 78);
}

function researchEvidenceLabel(sourceCount: number | undefined, referenceCount: number | undefined) {
  const evidenceCount = sourceCount || 0;
  const clickableCount = referenceCount || 0;
  if (evidenceCount > clickableCount && clickableCount > 0) return `${evidenceCount} 条依据`;
  if (evidenceCount > 0) return `${evidenceCount} 条依据`;
  return `${clickableCount} 个来源`;
}

function sourceCountFromPhases(phases: string[] | undefined) {
  const phase = [...(phases || [])].reverse().find((item) => /^已关联来源\s+\d+\s*个$/u.test(item));
  const match = phase?.match(/(\d+)/u);
  return match ? Number(match[1]) : 0;
}

function researchWaitingFallback(input: {
  role: ResearchChatMessage['role'];
  pending: boolean;
  references: Array<{ title: string; url: string; snippet: string }>;
  linkedSourceCount: number;
}) {
  if (!input.pending || input.role !== 'assistant') return '';
  if (!input.references.length) return '正在检索公开来源并整理依据。';
  const names = input.references.slice(0, 3).map((item) => item.title).join('；');
  return [
    `来源已就绪：已关联 ${input.linkedSourceCount || input.references.length} 个公开来源。`,
    `优先读取：${names}。`,
    '正在完成交叉核验与结论整合，可先查看下方来源。 ',
  ].join('\n');
}

function appendProgressContent(previous: string | undefined, next: string) {
  const merged = `${previous || ''}${next}`.replace(/\n{3,}/gu, '\n\n');
  const maxLength = 3600;
  if (merged.length <= maxLength) return merged;
  const clipped = merged.slice(merged.length - maxLength);
  const boundary = clipped.search(/[。；！？.!?]\s*/u);
  return boundary > 0 ? clipped.slice(boundary + 1).trimStart() : clipped.trimStart();
}

function phaseProgressLine(label: string, sourceCount?: number) {
  if (/^已关联来源\s+\d+\s*个$/u.test(label)) return `公开证据已关联 ${sourceCount || label.match(/\d+/u)?.[0] || 0} 条，正在筛选可直接支撑结论的材料。`;
  if (label === '确认范围' || label === '研究规划') return '正在确认研究范围和可用来源。';
  if (label === '核对来源') return sourceCount
    ? `公开证据已关联 ${sourceCount} 条，继续核对来源与结论相关性。`
    : '正在核对公开来源与专题问题的相关性。';
  if (label === '来源初筛') return sourceCount
    ? `已完成 ${sourceCount} 条公开证据的初筛。`
    : '已完成一轮公开证据筛选。';
  if (label === '形成答复') return '形成结论：正在把来源、指标和专题线索整理成研判。';
  if (label === '研究完成') return '形成结论：本次研判已生成。';
  if (label === '筛选来源' || label === '准备检索' || label === '关联来源') return sourceCount
    ? `公开证据已关联 ${sourceCount} 条。`
    : '正在筛选可追溯公开证据。';
  return '';
}

function appendPhaseProgress(previous: string | undefined, label: string, sourceCount?: number) {
  const line = phaseProgressLine(label, sourceCount);
  if (!line) return previous || '';
  const isSourceProgress = /公开证据|公开来源|可追溯公开证据/u.test(line);
  const retainedLines = (previous || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !isSourceProgress || !/来源核验|公开证据|公开来源|可追溯公开证据/u.test(item));
  const current = retainedLines.join('\n');
  const lastLine = retainedLines.at(-1);
  if (lastLine === line) return current;
  return appendProgressContent(current, `${current ? '\n' : ''}${line}`);
}

function publicProgressContent(value: string | undefined, sourceCount: number) {
  const text = (value || '').trim();
  if (!text) return '';
  const cleaned = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/(生成检索式|读取来源|来源轮次完成|已关联来源|来源关联更新|关联来源进行中|DASHSCOPE_API_KEY|api key|fetch failed|XGBoost|MAE|MAPE|RMSE|R²)/iu.test(line))
    .slice(-3)
    .join('\n');
  if (cleaned) return cleaned;
  return sourceCount
    ? `公开证据已关联 ${sourceCount} 条，正在整理可直接支撑结论的材料。`
    : '正在筛选可追溯公开证据。';
}

function formatMetricValue(value: number | string) {
  if (typeof value === 'string') return value;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function readableMetricUnit(unit: string) {
  const normalized = unit.trim();
  if (!normalized) return '数值';
  if (/current US\$/i.test(normalized)) return '美元';
  if (/% of population/i.test(normalized)) return '人口占比';
  if (/% of GDP/i.test(normalized)) return '占 GDP 比重';
  if (/kWh per capita/i.test(normalized)) return '千瓦时/人';
  if (/per 1M people/i.test(normalized)) return '每百万人';
  if (/cent_per_kwh/i.test(normalized)) return '美分/千瓦时';
  if (/sen_per_kwh/i.test(normalized)) return '仙/千瓦时';
  if (/^(ron95|ron97|diesel)$/i.test(normalized)) return '令吉/升';
  if (/^(value|index)$/i.test(normalized)) return '指数值';
  return normalized.replace(/_/g, ' ');
}

function readableMetricLabel(label: string) {
  return label
    .replace(/燃油价格\s+diesel/iu, '柴油价格')
    .replace(/燃油价格\s+ron97/iu, 'RON 97 汽油价格')
    .replace(/燃油价格\s+ron95/iu, 'RON 95 汽油价格')
    .replace(/industrial production index/iu, '工业生产指数');
}

function metricCategory(label: string, topic: AseanTopicKey) {
  if (/GDP/iu.test(label)) return '经济规模';
  if (/互联网|Internet/iu.test(label)) return '数字接入';
  if (/高技术|High-Technology/iu.test(label)) return '技术出口';
  if (/贸易开放|Trade Openness/iu.test(label)) return '贸易开放';
  if (/燃油|ron95|ron97|diesel/iu.test(label)) return '能源价格';
  if (/工业生产/iu.test(label)) return '工业运行';
  return TOPIC_LABELS[topic];
}

function compactDate(value: string) {
  const date = value.trim();
  const day = date.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (day) return `${Number(day[2])}/${Number(day[3])}`;
  const month = date.match(/^(\d{4})-(\d{2})$/u);
  if (month) return `${month[1]}年${Number(month[2])}月`;
  return date;
}

function seriesWindow(firstDate: string, latestDate: string) {
  return `${compactDate(firstDate)}-${compactDate(latestDate)}`;
}

function relativeDelta(delta: number, base: number) {
  if (!Number.isFinite(base) || Math.abs(base) < 1e-9) return null;
  const pct = (delta / Math.abs(base)) * 100;
  if (!Number.isFinite(pct)) return null;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function metricDisplay(value: number | string, unit: string) {
  const formatted = formatMetricValue(value);
  if (formatted === '待更新') return { value: formatted, unit: '' };
  if (/current US\$/i.test(unit)) return { value: `$${formatted}`, unit: '美元' };
  if (unit.includes('%')) return { value: `${formatted}%`, unit: '' };
  return { value: formatted, unit: readableMetricUnit(unit) };
}

function sparkValue(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function trendDirection(delta: number) {
  if (Math.abs(delta) < 1e-9) return '持平';
  return delta > 0 ? '上行' : '下行';
}

function trendClassName(delta: number) {
  if (Math.abs(delta) < 1e-9) return styles.seriesFlat;
  return delta > 0 ? styles.seriesUp : styles.seriesDown;
}

function compactSourceName(sourceName: string) {
  return sourceName
    .replace(/^秘塔搜索\s*·\s*/u, '')
    .replace(/^Our World in Data Energy Dataset$/u, 'OWID 能源数据集')
    .replace(/^World Bank ASEAN\s*/u, '世界银行 · ')
    .replace(/^Singapore Data\.gov\s*/u, '新加坡 Data.gov · ')
    .replace(/^Data\.gov\.sg\s*/u, '新加坡 Data.gov · ')
    .replace(/^Malaysia OpenAPI Fuel Price$/u, '马来西亚公开燃油价格')
    .replace(/^Malaysia OpenAPI\s*/u, '马来西亚公开数据 · ');
}

function latestMetricForPatterns(metrics: AseanDatasetMetricRow[], country: string, patterns: string[]) {
  for (const pattern of patterns) {
    const matched = metrics
      .filter((metric) => metric.country === country && metric.label.includes(pattern))
      .sort((left, right) => right.date.localeCompare(left.date) || left.label.localeCompare(right.label))[0];
    if (matched) return matched;
  }
  return null;
}

function buildCoreDataRows(metrics: AseanDatasetMetricRow[]) {
  return DECISION_SCOPE_COUNTRIES.map((country) => ({
    country,
    cells: CORE_DATA_COLUMNS.map((column) => ({
      ...column,
      metric: latestMetricForPatterns(metrics, country, column.patterns),
    })),
  }));
}

function seriesPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function seriesDatePrecision(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/u.test(value)) return 'day';
  if (/^\d{4}-\d{2}$/u.test(value)) return 'month';
  if (/^\d{4}$/u.test(value)) return 'year';
  return 'other';
}

function seriesDateMillis(value: string) {
  if (seriesDatePrecision(value) === 'day') return new Date(value.slice(0, 10)).getTime();
  if (seriesDatePrecision(value) === 'month') return new Date(`${value}-01T00:00:00.000Z`).getTime();
  return Number.NaN;
}

function oneMonthSeriesPoints(points: Array<{ date: string; value: number }>) {
  const sorted = points
    .filter((point) => Number.isFinite(point.value) && seriesDatePrecision(point.date) !== 'other')
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted[sorted.length - 1];
  if (!latest) return [];
  const precision = seriesDatePrecision(latest.date);
  if (precision === 'day') {
    const latestMs = seriesDateMillis(latest.date);
    const cutoff = latestMs - 31 * 24 * 60 * 60 * 1000;
    return sorted.filter((point) => {
      const pointMs = seriesDateMillis(point.date);
      return Number.isFinite(pointMs) && pointMs >= cutoff && pointMs <= latestMs;
    });
  }
  if (precision === 'year') return sorted.slice(-8);
  return sorted.slice(-2);
}

function MetricSeriesPanel({
  series,
}: {
  series: NonNullable<AseanDemoTopic['dataset_series']>;
}) {
  const rows = series
    .map((item) => ({ ...item, points: oneMonthSeriesPoints(item.points) }))
    .filter((item) => item.points.length >= 2)
    .slice(0, 4);
  if (!rows.length) return <p className={styles.monitorEmpty}>当前范围暂无可绘制指标序列。</p>;

  return (
    <div className={styles.seriesList}>
        {rows.map((item, rowIndex) => {
        const values = item.points.map((point) => point.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const chartPoints = item.points.map((point, index) => ({
          x: item.points.length === 1 ? 18 : 18 + (index / (item.points.length - 1)) * 164,
          y: 52 - ((point.value - min) / span) * 34,
        }));
        const area = `${seriesPath(chartPoints)} L ${chartPoints[chartPoints.length - 1].x.toFixed(2)} 62 L ${chartPoints[0].x.toFixed(2)} 62 Z`;
        const first = item.points[0];
        const latest = item.points[item.points.length - 1];
        const delta = latest.value - first.value;
        const latestDisplay = metricDisplay(latest.value, item.unit);
        const deltaDisplay = metricDisplay(Math.abs(delta), item.unit);
        const relativeChange = relativeDelta(delta, first.value);
        return (
          <a href={item.source_url || '#'} target="_blank" rel="noreferrer" key={`${item.id}:${item.country}:${rowIndex}`} className={styles.seriesCard}>
            <div className={styles.seriesMeta}>
              <span>
                <i>{metricCategory(item.label, item.topic)}</i>
                {item.country} · {readableMetricLabel(item.label)}
              </span>
              <strong>
                <b>{latestDisplay.value}</b>
                {latestDisplay.unit ? <small>{latestDisplay.unit}</small> : null}
              </strong>
              <em>
                <i className={trendClassName(delta)}>{trendDirection(delta)}</i>
                <span>窗口 {seriesWindow(first.date, latest.date)}</span>
                <b>变化 {delta >= 0 ? '+' : '-'}{deltaDisplay.value}{deltaDisplay.unit ? ` ${deltaDisplay.unit}` : ''}</b>
                {relativeChange ? <small>{relativeChange}</small> : null}
              </em>
            </div>
            <svg viewBox="0 0 200 76" role="img" aria-label={`${item.country}${item.label}时间序列`}>
              <text x="12" y="12" className={styles.seriesAxisLabel}>{sparkValue(max)}</text>
              <text x="12" y="71" className={styles.seriesAxisLabel}>{sparkValue(min)}</text>
              <text x="150" y="12" className={styles.seriesCurrentLabel}>当前 {sparkValue(latest.value)}</text>
              <text x="18" y="70" className={styles.seriesDateLabel}>{compactDate(first.date)}</text>
              <text x="168" y="70" className={styles.seriesDateLabel}>{compactDate(latest.date)}</text>
              <line x1="18" y1="18" x2="182" y2="18" className={styles.seriesGridLine} />
              <line x1="18" y1="35" x2="182" y2="35" className={styles.seriesGridLine} />
              <line x1="18" y1="52" x2="182" y2="52" className={styles.seriesGridLineStrong} />
              <path d={area} className={styles.seriesArea} />
              <path d={seriesPath(chartPoints)} className={styles.seriesLine} />
              <circle
                cx={chartPoints[chartPoints.length - 1].x}
                cy={chartPoints[chartPoints.length - 1].y}
                r="7"
                className={styles.seriesLastHalo}
              />
              {chartPoints.map((point, index) => (
                <circle key={`${item.id}:${rowIndex}:point:${index}`} cx={point.x} cy={point.y} r={index === chartPoints.length - 1 ? 2.8 : 1.8} />
              ))}
            </svg>
          </a>
        );
      })}
    </div>
  );
}

function TimelinePanel({
  timelineItems,
  visibleTimelineCount,
}: {
  timelineItems: AseanTimelineItem[];
  visibleTimelineCount: number;
}) {
  const displayItems = timelineItems.filter(isConcreteTimelineDisplayItem);
  const rows = (displayItems.length >= 6 ? displayItems : timelineItems).slice(0, 14);
  return (
    <div className={styles.mapTimelinePanel} aria-label="公开信息来源">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.kicker}>时间线</span>
          <h2>{timelineItems.length ? '线索时间线' : '无匹配线索'}</h2>
          <p>按时间倒序展示政策、项目、风险和通道线索；结构化数值在指标区查看。</p>
        </div>
        <span className={styles.timeBadge}>{visibleTimelineCount} 条依据</span>
      </div>
      <div className={styles.streamList}>
        {rows.map((item, index) => {
          const tone = timelineTone(item);
          const title = concreteTimelineTitle(item);
          const summary = concreteTimelineSummary(item);
          return (
            <a className={styles.streamItem} key={`${item.id}:${index}`} href={item.source_url || '#'} target="_blank" rel="noreferrer">
              <span className={`${styles.streamDot} ${timelineDotClass(item)}`} />
              <div>
                <small>{shortTime(item.published_at || '')} · {TOPIC_LABELS[item.topic]} · {item.country_scope.join('、') || '东盟'}</small>
                <strong>{title}</strong>
                <p>
                  {summary || '未提供摘要'}
                  {item.conflict_group ? ' 已进入冲突复核组。' : ''}
                </p>
              </div>
              <em className={`${styles.signalScore} ${tone === 'high' ? styles.signalScoreHigh : tone === 'elevated' ? styles.signalScoreElevated : styles.signalScoreMonitoring}`}>
                <b>{urgencyLabel(tone)}</b>
                <span>可信度 {item.credibility_score}</span>
              </em>
            </a>
          );
        })}
        {!rows.length ? (
          <div className={styles.emptyBox}>
            当前条件下暂无线索。
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SavedResearchReports({
  reports,
  selectedId,
  onSelect,
}: {
  reports: NonNullable<AseanDemoTopic['recent_research_reports']>;
  selectedId: string | null;
  onSelect: (reportId: string) => void;
}) {
  if (!reports.length) return null;
  return (
    <div className={styles.savedResearchPanel} aria-label="已保存专题研判">
      <div className={styles.savedResearchHeader}>
        <span>已保存研判</span>
        <strong>{reports.length} 份</strong>
      </div>
      <div className={styles.savedResearchList}>
        {reports.slice(0, 3).map((report, index) => {
          const reportKey = `${report.id}:${index}`;
          return (
          <button
            className={`${styles.savedResearchButton} ${selectedId === reportKey ? styles.savedResearchButtonActive : ''}`}
            key={reportKey}
            onClick={() => onSelect(reportKey)}
            type="button"
          >
            <span>
              <strong>{savedResearchTitle(report.question)}</strong>
              <em>{researchEvidenceLabel(report.source_count, report.references?.length)}</em>
            </span>
            <b>{selectedId === reportKey ? '已选用' : '选用'}</b>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function _CountryMonitorPanel({
  topic,
  activeIssue,
  selectedCountry,
}: {
  topic: AseanDemoTopic;
  activeIssue: AseanTopicKey | 'all';
  selectedCountry: string | null;
}) {
  const focusCountry = selectedCountry || '东盟';
  const countryMetrics = (topic.dataset_metrics || []).filter((metric) => {
    const countryMatch = focusCountry === '东盟' || metric.country === focusCountry;
    const issueMatch = activeIssue === 'all' || metric.topic === activeIssue;
    return countryMatch && issueMatch;
  });
  const countrySeries = (topic.dataset_series || [])
    .filter((series) => {
      const countryMatch = focusCountry === '东盟' || series.country === focusCountry;
      const issueMatch = activeIssue === 'all' || series.topic === activeIssue;
      return countryMatch && issueMatch;
    })
    .sort((left, right) => {
      const topicPriority = Number(right.topic === activeIssue) - Number(left.topic === activeIssue);
      if (activeIssue !== 'all' && topicPriority) return topicPriority;
      return right.latest_date.localeCompare(left.latest_date) || Math.abs(right.latest_value) - Math.abs(left.latest_value);
    });

  return (
    <div className={styles.monitorStack}>
      <div className={styles.monitorCard}>
        <div className={styles.monitorCardHeader}>
          <span>关键指标</span>
          <strong>{countryMetrics.length ? `${countryMetrics.length} 项` : '区域指标'}</strong>
        </div>
        <div className={styles.metricList}>
          {countryMetrics.slice(0, 5).map((metric, index) => {
            const display = metricDisplay(metric.value, metric.unit);
            return (
              <a
                href={metric.source_url || '#'}
                target="_blank"
                rel="noreferrer"
                key={`${metric.id}:${metric.country}:${index}`}
                title={`${metric.source_name}，最新可用日期：${metric.date}`}
              >
                <span>
                  <i>{metricCategory(metric.label, metric.topic)}</i>
                  {metric.country} · 最新数据
                </span>
                <strong>{readableMetricLabel(metric.label)}</strong>
                <em>
                  <b>{display.value}</b>
                  {display.unit ? <small>{display.unit}</small> : null}
                </em>
                <small>{compactSourceName(metric.source_name)}</small>
              </a>
            );
          })}
          {!countryMetrics.length ? <p className={styles.monitorEmpty}>当前范围暂无结构化指标。</p> : null}
        </div>
      </div>

      <div className={styles.monitorCard}>
        <div className={styles.monitorCardHeader}>
          <span>指标走势</span>
          <strong>{countrySeries.length ? `${countrySeries.length} 组` : '高频指标'}</strong>
        </div>
        <MetricSeriesPanel series={countrySeries} />
      </div>

    </div>
  );
}

function CoreDataMatrix({ metrics }: { metrics: AseanDatasetMetricRow[] }) {
  const rows = buildCoreDataRows(metrics);
  const coveredCells = rows.flatMap((row) => row.cells).filter((cell) => cell.metric).length;
  const totalCells = rows.length * CORE_DATA_COLUMNS.length;
  return (
    <div className={styles.coreDataMatrix} aria-label="东盟六国核心数据底板">
      <div className={styles.coreDataHeader}>
        <div>
          <span>核心数据底板</span>
          <strong>东盟重点国家关键指标</strong>
        </div>
        <em>{coveredCells}/{totalCells} 项指标已接入</em>
      </div>
      <div className={styles.coreDataTable}>
        <div className={styles.coreDataHeadCell}>国家</div>
        {CORE_DATA_COLUMNS.map((column, index) => <div className={styles.coreDataHeadCell} key={`${column.key}:${index}`}>{column.label}</div>)}
        {rows.map((row, rowIndex) => (
          <Fragment key={`${row.country}:${rowIndex}`}>
            <div className={styles.coreDataCountry}>{row.country}</div>
            {row.cells.map((cell) => {
              const metric = cell.metric;
              const display = metric ? metricDisplay(metric.value, metric.unit) : null;
              return metric ? (
                <a
                  className={styles.coreDataCell}
                  href={metric.source_url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  key={`${row.country}:${cell.key}:${rowIndex}`}
                  title={`${metric.source_name}，最新可用日期：${metric.date}`}
                >
                  <strong>{display?.value}</strong>
                  {display?.unit ? <span>{display.unit}</span> : null}
                  <small>{compactSourceName(metric.source_name)}</small>
                </a>
              ) : (
                <div className={`${styles.coreDataCell} ${styles.coreDataMissing}`} key={`${row.country}:${cell.key}:${rowIndex}`}>
                  <strong>缺口</strong>
                  <span>待接入</span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

type FuelPriceTraining = NonNullable<AseanDecisionModelResult['fuel_price_training']>;
type PublicModelReadout = NonNullable<NonNullable<AseanDecisionModelResult['model_blueprints']>[number]['public_model']>;

const FUEL_PRODUCT_LABELS: Record<string, string> = {
  diesel: '柴油',
  ron95: 'RON95',
  ron97: 'RON97',
};

function productToneClass(product: string) {
  if (product === 'diesel') return styles.fuelLineDiesel;
  if (product === 'ron97') return styles.fuelLineRon97;
  return styles.fuelLineRon95;
}

function scaledTrendCoordinates(rows: Array<{ price: number }>, width = 420, height = 92) {
  if (!rows.length) return [];
  const values = rows.map((row) => row.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  return rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : 12 + (index / (rows.length - 1)) * (width - 24);
    const y = 8 + (1 - ((row.price - min) / span)) * (height - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

function fuelModelVerdict(training: FuelPriceTraining) {
  const forecastRows = training.forecast_8_weeks.filter((row) => row.step === 8);
  const downCount = forecastRows.filter((row) => row.change < 0).length;
  const upCount = forecastRows.filter((row) => row.change > 0).length;
  const direction = downCount > upCount ? '偏下行' : upCount > downCount ? '偏上行' : '分化';
  return {
    verdict: training.quality_label,
    direction,
    readout: training.public_readout,
  };
}

function fuelMoveLabel(change: number) {
  if (change > 0.01) return '上行';
  if (change < -0.01) return '下行';
  return '平稳';
}

function fuelMoveClass(change: number) {
  if (change > 0.01) return styles.fuelMoveUp;
  if (change < -0.01) return styles.fuelMoveDown;
  return styles.fuelMoveFlat;
}

function fuelDeviationLevel(value: number) {
  if (value >= 0.2) return '偏差较大';
  if (value >= 0.1) return '偏差可见';
  return '偏差较小';
}

function fuelVisualWidth(value: number, max = 0.28) {
  return `${Math.max(12, Math.min(100, (Math.abs(value) / max) * 100)).toFixed(0)}%`;
}

function fuelPressureLabel(change: number) {
  if (change > 0.01) return '压力抬升';
  if (change < -0.01) return '压力回落';
  return '压力平稳';
}

function modelSeriesPatterns(modelId: string) {
  if (modelId === 'market-heat') return [/GDP/u, /FDI净流入/u, /贸易开放度/u, /互联网使用率/u, /安全互联网服务器密度/u];
  if (modelId === 'power-risk') return [/年度发电量/u, /年度电力需求/u, /电力供给/u, /电力消费/u, /人均用电量/u, /电力可及率/u];
  if (modelId === 'green-parity') return [/可再生电力输出占比/u, /可再生能源消费占比/u, /可再生电力占比/u, /化石电力占比/u, /可再生发电量/u, /燃油价格/u, /月度电价/u];
  if (modelId === 'compute-roi') return [/互联网使用率/u, /安全互联网服务器密度/u, /高技术出口额/u, /FDI净流入/u, /贸易开放度/u];
  if (modelId === 'go-priority') return [/GDP/u, /互联网使用率/u, /年度电力需求/u, /可再生电力占比/u, /可再生能源消费占比/u, /安全互联网服务器密度/u];
  return [];
}

function seriesForStrategyModel(series: NonNullable<AseanDemoTopic['dataset_series']>, modelId: string) {
  const patterns = modelSeriesPatterns(modelId);
  const seen = new Set<string>();
  return series
    .filter((item) => patterns.some((pattern) => pattern.test(item.label)))
    .map((item) => ({
      ...item,
      points: [...(item.points || [])]
        .filter((point) => Number.isFinite(point.value))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-12),
    }))
    .filter((item) => item.points.length >= 3)
    .sort((left, right) => {
      const leftPatternRank = patterns.findIndex((pattern) => pattern.test(left.label));
      const rightPatternRank = patterns.findIndex((pattern) => pattern.test(right.label));
      if (leftPatternRank !== rightPatternRank) return leftPatternRank - rightPatternRank;
      const countryPriority = Number(DECISION_SCOPE_COUNTRIES.includes(right.country)) - Number(DECISION_SCOPE_COUNTRIES.includes(left.country));
      if (countryPriority) return countryPriority;
      return right.points.length - left.points.length || right.latest_date.localeCompare(left.latest_date);
    })
    .filter((item) => {
      const key = `${item.country}:${item.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function modelSeriesTone(delta: number) {
  if (delta > 0) return '上行';
  if (delta < 0) return '下行';
  return '平稳';
}

function ModelSeriesPanel({
  rows,
  modelName,
}: {
  rows: NonNullable<AseanDemoTopic['dataset_series']>;
  modelName: string;
}) {
  if (!rows.length) {
    return (
      <div className={styles.modelSeriesEmpty}>
        当前模型已有横截面指标，连续序列仍需补齐；页面先保留代理测算和来源复核。
      </div>
    );
  }
  return (
    <div className={styles.modelSeriesPanel} aria-label={`${modelName}历史序列`}>
      <div className={styles.modelSeriesHead}>
        <span>历史序列回看</span>
        <b>按公开时间点读取</b>
      </div>
      <div className={styles.modelSeriesGrid}>
        {rows.map((item, rowIndex) => {
          const values = item.points.map((point) => point.value);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const span = max - min || 1;
          const points = item.points.map((point, index) => ({
            x: item.points.length === 1 ? 12 : 12 + (index / (item.points.length - 1)) * 176,
            y: 54 - ((point.value - min) / span) * 36,
          }));
          const first = item.points[0];
          const latest = item.points[item.points.length - 1];
          const delta = latest.value - first.value;
          return (
            <a href={item.source_url || '#'} target="_blank" rel="noreferrer" className={styles.modelSeriesCard} key={`${item.id}:${rowIndex}`}>
              <span>{item.country} · {readableMetricLabel(item.label)}</span>
              <svg viewBox="0 0 200 66" role="img" aria-label={`${item.country}${item.label}历史走势`}>
                <line x1="12" y1="18" x2="188" y2="18" />
                <line x1="12" y1="36" x2="188" y2="36" />
                <line x1="12" y1="54" x2="188" y2="54" />
                <path d={seriesPath(points)} />
                {points.map((point, index) => (
                  <circle key={`${item.id}:series:${index}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 3 : 1.8} />
                ))}
              </svg>
              <em>
                <b>{modelSeriesTone(delta)}</b>
                <small>{compactDate(first.date)} - {compactDate(latest.date)}</small>
              </em>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function readoutDirectionClass(direction: string) {
  if (/上行|抬升|高约束|红灯/u.test(direction)) return styles.modelMoveUp;
  if (/下行|回落|宽松|低约束/u.test(direction)) return styles.modelMoveDown;
  return styles.modelMoveFlat;
}

function formatReadoutValue(value: number | null) {
  if (!Number.isFinite(value)) return '待确认';
  return `${Number(value).toFixed(Math.abs(Number(value)) >= 10 ? 1 : 2)}`;
}

function readoutTimelineGeometry(card: PublicModelReadout['forecast_cards'][number]) {
  const rows = card.points?.length
    ? card.points
    : [
      { date: card.label, value: Number.isFinite(card.current) ? Number(card.current) : 50, kind: 'observed' as const },
      { date: '下一期', value: Number.isFinite(card.estimated) ? Number(card.estimated) : Number(card.current) || 50, kind: 'forecast' as const },
    ];
  const values = rows.map((row) => row.value).filter(Number.isFinite);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 100;
  const rawSpan = Math.max(1, rawMax - rawMin);
  const padding = Math.max(0.6, rawSpan * 0.12);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = Math.max(1, max - min);
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? 57 : 6 + (index / (rows.length - 1)) * 102,
    y: 62 - ((row.value - min) / span) * 50,
  }));
  const observed = points.filter((point) => point.kind === 'observed');
  const latestObserved = observed[observed.length - 1];
  const forecast = points.filter((point) => point.kind === 'forecast');
  const forecastLine = latestObserved && forecast.length ? [latestObserved, ...forecast] : forecast;
  return {
    points,
    observedPath: observed.length >= 2 ? seriesPath(observed) : '',
    forecastPath: forecastLine.length >= 2 ? seriesPath(forecastLine) : '',
    startDate: rows[0]?.date || '',
    endDate: rows[rows.length - 1]?.date || '',
    minLabel: formatReadoutValue(rawMin),
    maxLabel: formatReadoutValue(rawMax),
  };
}

function ModelReadoutPanel({ readout }: { readout: PublicModelReadout | undefined }) {
  if (!readout) return null;
  return (
    <div className={styles.modelReadoutPanel} aria-label={`${readout.name}回看结果`}>
      <div className={styles.modelReadoutHead}>
        <div>
          <span>{readout.kind}</span>
          <strong>{readout.name}</strong>
          <p>{readout.summary}</p>
        </div>
        <em>{readout.quality_label}</em>
      </div>
      <div className={styles.modelQualityGrid}>
        {readout.quality_metrics.map((metric) => (
          <article className={styles[`fuelMetricLevel${metric.level[0].toUpperCase()}${metric.level.slice(1)}`]} key={`${readout.name}:${metric.label}`}>
            <span>{metric.label}<HelpTip label={metric.label} text={metric.detail} /></span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      <div className={styles.modelReadoutMeta}>
        <span>{readout.source_label}</span>
        <b>{readout.period_label}</b>
      </div>
      {readout.forecast_cards.length ? (
        <div className={styles.modelForecastMatrix}>
          {readout.forecast_cards.map((card) => {
            const timeline = readoutTimelineGeometry(card);
            return (
              <article key={`${readout.name}:${card.country}:${card.label}`}>
                <div>
                  <span>{card.country}</span>
                  <strong className={readoutDirectionClass(card.direction)}>{card.direction}</strong>
                </div>
                <svg viewBox="0 0 120 74" role="img" aria-label={`${card.country}历史走势，下一期预计${card.direction}`}>
                  <title>{`${card.country}：${timeline.startDate} 至 ${timeline.endDate}，估计 ${formatReadoutValue(card.estimated)}`}</title>
                  <line x1="6" y1="12" x2="108" y2="12" />
                  <line x1="6" y1="37" x2="108" y2="37" />
                  <line x1="6" y1="62" x2="108" y2="62" />
                  <text className={styles.modelForecastAxisLabel} x="112" y="14">{timeline.maxLabel}</text>
                  <text className={styles.modelForecastAxisLabel} x="112" y="64">{timeline.minLabel}</text>
                  {timeline.observedPath ? <path className={styles.modelForecastObservedLine} d={timeline.observedPath} /> : null}
                  {timeline.forecastPath ? <path className={styles.modelForecastProjectedLine} d={timeline.forecastPath} /> : null}
                  {timeline.points.map((point, index) => (
                    <g
                      aria-label={`${point.date}：${formatReadoutValue(point.value)}${point.kind === 'forecast' ? '，估计' : ''}`}
                      key={`${card.country}:${point.date}:${index}`}
                      role="listitem"
                      tabIndex={0}
                    >
                      <title>{`${point.date}：${formatReadoutValue(point.value)}${point.kind === 'forecast' ? '（估计）' : ''}`}</title>
                      <circle
                        className={point.kind === 'forecast' ? styles.modelForecastProjectedPoint : styles.modelForecastObservedPoint}
                        cx={point.x}
                        cy={point.y}
                        r={point.kind === 'forecast' ? 3.5 : index === timeline.points.length - 2 ? 2.7 : 2}
                      />
                      <text
                        className={styles.modelForecastPointLabel}
                        textAnchor={point.x > 80 ? 'end' : 'start'}
                        x={point.x > 80 ? point.x - 4 : point.x + 4}
                        y={Math.max(11, point.y - 5)}
                      >
                        {compactDate(point.date)} {formatReadoutValue(point.value)}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className={styles.modelForecastNote}>
                  <p>{card.note}</p>
                  <small>下一期预计{card.direction}</small>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FuelTrainingCase({ training }: { training: FuelPriceTraining }) {
  const latestForecastByProduct = Object.values(training.forecast_8_weeks.reduce((acc, row) => {
    const current = acc[row.product];
    if (!current || row.step > current.step) acc[row.product] = row;
    return acc;
  }, {} as Record<string, FuelPriceTraining['forecast_8_weeks'][number]>)).sort((left, right) => left.product.localeCompare(right.product));
  const productTrends = Object.entries((training.trend_points?.length
    ? training.trend_points
    : training.forecast_8_weeks.map((row) => ({
      date: row.date,
      product: row.product,
      price: row.predicted_price,
      kind: 'forecast' as const,
    }))
  ).reduce((acc, row) => {
    acc[row.product] = [...(acc[row.product] || []), row];
    return acc;
  }, {} as Record<string, NonNullable<FuelPriceTraining['trend_points']>>)).sort(([left], [right]) => left.localeCompare(right));
  const latestDeviationByProduct = Object.values((training.deviation_points || []).reduce((acc, row) => {
    const current = acc[row.product];
    if (!current || row.date > current.date) acc[row.product] = row;
    return acc;
  }, {} as Record<string, NonNullable<FuelPriceTraining['deviation_points']>[number]>)).sort((left, right) => left.product.localeCompare(right.product));
  const verdict = fuelModelVerdict(training);
  return (
    <div className={styles.fuelTrainingCase} aria-label="马来西亚能源成本扰动预测">
      <div className={styles.fuelTrainingHead}>
        <div>
          <span>测算结果</span>
          <strong>马来西亚能源成本扰动预测</strong>
          <p>基于 RON95、RON97、柴油周度公开价格，读取未来 8 周燃油成本扰动方向，辅助绿电平价和电力成本研判。</p>
        </div>
        <a href={training.source.url} target="_blank" rel="noreferrer">马来西亚公开燃油价格</a>
      </div>
      <div className={styles.fuelModelVerdict}>
        <article>
          <span>预测口径</span>
          <strong>{verdict.verdict}</strong>
          <p>{verdict.readout}</p>
        </article>
        <article>
          <span>最新范围</span>
          <strong>已更新</strong>
          <p>三类油品周度公开价格，来源为马来西亚政府公开燃油价格。</p>
        </article>
        <article>
          <span>走势判断</span>
          <strong>{verdict.direction}</strong>
          <p>三类油品未来八周预计整体{verdict.direction}，用于判断能源成本压力是否抬升。</p>
        </article>
      </div>
      <div className={styles.fuelForecastGrid}>
        <div className={styles.fuelForecastPanel}>
          <div className={styles.fuelSubhead}>
            <span>历史走势与未来 8 周</span>
            <b>实线为过往，虚线为估计</b>
          </div>
          <div className={styles.fuelMetricRibbon} aria-label="模型回看指标">
            {(training.model_metrics || []).map((metric) => (
              <article className={styles[`fuelMetricLevel${metric.level[0].toUpperCase()}${metric.level.slice(1)}`]} key={metric.id}>
                <span>{metric.label}<HelpTip label={metric.label} text={metric.help} /></span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
          <div className={styles.fuelTrendChart}>
            {productTrends.map(([product, rows]) => {
              const coordinates = scaledTrendCoordinates(rows);
              const observedPoints = rows
                .map((row, index) => row.kind === 'observed' ? coordinates[index] : '')
                .filter(Boolean)
                .join(' ');
              const firstForecastIndex = rows.findIndex((row) => row.kind === 'forecast');
              const forecastCoordinates = rows
                .map((row, index) => row.kind === 'forecast' ? coordinates[index] : '')
                .filter(Boolean);
              const forecastPoints = firstForecastIndex > 0 && coordinates[firstForecastIndex - 1]
                ? [coordinates[firstForecastIndex - 1], ...forecastCoordinates].join(' ')
                : forecastCoordinates.join(' ');
              const dividerX = firstForecastIndex > 0
                ? (
                  (Number(coordinates[firstForecastIndex - 1]?.split(',')[0]) || 118) +
                  (Number(coordinates[firstForecastIndex]?.split(',')[0]) || 128)
                ) / 2
                : 128;
              const latest = rows[rows.length - 1];
              return (
                <div className={styles.fuelTrendRow} key={product}>
                  <span>{FUEL_PRODUCT_LABELS[product] || product}</span>
                  <svg viewBox="0 0 420 92" role="img" aria-label={`${FUEL_PRODUCT_LABELS[product] || product}历史与预测走势`}>
                    <rect className={styles.fuelPressureBandLow} x="0" y="60" width="420" height="32" rx="7" />
                    <rect className={styles.fuelPressureBandMid} x="0" y="30" width="420" height="30" rx="7" />
                    <rect className={styles.fuelPressureBandHigh} x="0" y="0" width="420" height="30" rx="7" />
                    <line className={styles.fuelForecastDivider} x1={dividerX} y1="8" x2={dividerX} y2="84" />
                    {observedPoints ? <polyline className={`${productToneClass(product)} ${styles.fuelLineObserved}`} points={observedPoints} /> : null}
                    {forecastPoints ? <polyline className={`${productToneClass(product)} ${styles.fuelLineForecast}`} points={forecastPoints} /> : null}
                    {rows.map((row, index) => {
                      const point = coordinates[index]?.split(',') || ['0', '0'];
                      return (
                        <circle className={row.kind === 'forecast' ? styles.fuelForecastPoint : styles.fuelObservedPoint} key={`${product}:${row.kind}:${row.date}:${index}`} cx={point[0]} cy={point[1]} r={index === rows.length - 1 ? 3.8 : 2.2}>
                          <title>{`${row.date}：${row.price.toFixed(2)}${row.kind === 'forecast' ? '（估计）' : ''}`}</title>
                        </circle>
                      );
                    })}
                    <text className={styles.fuelChartTinyLabel} x="12" y="15">历史</text>
                    <text className={styles.fuelChartTinyLabel} x={dividerX + 8} y="15">下一期</text>
                  </svg>
                  <b>{latest?.kind === 'forecast' ? '估计' : '最新'}</b>
                </div>
              );
            })}
          </div>
          <div className={styles.fuelForecastCards}>
            {latestForecastByProduct.map((row) => (
              <article key={row.product}>
                <span>{FUEL_PRODUCT_LABELS[row.product] || row.product}</span>
                <strong className={fuelMoveClass(row.change)}>{fuelPressureLabel(row.change)}</strong>
                <i className={styles.fuelVisualBar}><b style={{ width: fuelVisualWidth(row.change, 0.08) }} /></i>
                <p>后续走势预计{fuelMoveLabel(row.change)}，用于判断成本压力方向。</p>
              </article>
            ))}
          </div>
          {latestDeviationByProduct.length ? (
            <div className={styles.fuelDeviationPanel}>
              <div className={styles.fuelSubhead}>
                <span>最近回看</span>
                <b>估计与实际差距</b>
              </div>
              <div className={styles.fuelDeviationList}>
                {latestDeviationByProduct.map((row) => (
                  <article key={`${row.product}:${row.date}`}>
                    <span>{FUEL_PRODUCT_LABELS[row.product] || row.product}</span>
                    <strong className={row.direction === '偏高' ? styles.fuelMoveUp : styles.fuelMoveDown}>{fuelDeviationLevel(row.difference)}</strong>
                    <i className={styles.fuelDeviationMatrix} aria-hidden="true">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <b className={index < Math.ceil(Math.min(8, Math.abs(row.difference) / 0.035)) ? styles.fuelDeviationCellActive : ''} key={`${row.product}:cell:${index}`} />
                      ))}
                    </i>
                    <p>最近回看显示估计较实际{row.direction}，用于校准走势判断。</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const SIDE_MODEL_LABELS: Record<string, { name: string; badge: string }> = {
  'fuel-cost-xgb': { name: '能源成本扰动', badge: '周度预测' },
  'market-heat': { name: '市场进入吸引力', badge: '市场热度' },
  'power-risk': { name: '电力供需压力', badge: '年度预测' },
  'green-parity': { name: '绿电支撑能力', badge: '绿电回看' },
  'compute-roi': { name: '算力需求承载', badge: '需求回看' },
  'go-priority': { name: '出海优先级', badge: '综合排序' },
};

const SIDE_MODEL_READOUTS: Record<string, { target: string; unit: string; meaning: string }> = {
  'fuel-cost-xgb': {
    target: '下一期燃油成本压力',
    unit: '令吉/升',
    meaning: '读取马来西亚柴油、RON95、RON97 公开价格的走势，判断短期能源成本压力方向；它不是电价或供电缺口。',
  },
  'market-heat': {
    target: '市场进入吸引力',
    unit: '综合分',
    meaning: '把需求规模、贸易开放、投资活跃度和数字基础设施放在同一口径下回看，用于比较进入优先级。',
  },
  'power-risk': {
    target: '电力供需压力',
    unit: '压力分',
    meaning: '根据电力使用、发电量、能源结构等公开序列判断供电约束强弱，用于识别数据中心落地的电力压力。',
  },
  'green-parity': {
    target: '绿电支撑能力',
    unit: '支撑分',
    meaning: '根据绿电占比、清洁发电、燃煤约束和能源价格线索判断绿电能否支撑低碳算力场景。',
  },
  'compute-roi': {
    target: '算力需求承载',
    unit: '需求分',
    meaning: '用互联网使用、数据中心设施、网络互联和经济需求侧指标估计算力需求承接空间。',
  },
  'go-priority': {
    target: '出海优先级',
    unit: '排序分',
    meaning: '汇总市场、电力、绿电、算力和政策线索形成国家排序；没有历史行动标签时只做排序，不包装成成功率。',
  },
};

type SidePredictionPoint = {
  date: string;
  value: number;
  kind: 'observed' | 'forecast';
};

type SidePredictionRow = {
  label: string;
  value: string;
  note: string;
  tone?: string;
  points: SidePredictionPoint[];
};

type SidePredictionModelOption = {
  id: string;
  name: string;
  badge: string;
  summary: string;
  quality: string;
  sourceLabel: string;
  sourceUrl?: string;
  readout: { target: string; unit: string; meaning: string };
  rows: SidePredictionRow[];
};

function sidePredictionPanelGeometry(rows: SidePredictionRow[]) {
  const left = 86;
  const right = 402;
  return rows.slice(0, 3).map((row, rowIndex) => {
    const top = 28 + rowIndex * 56;
    const bottom = top + 40;
    const middle = top + 21;
    const points = row.points.filter((point) => Number.isFinite(point.value));
    const values = points.map((point) => point.value);
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 1;
    const rawSpan = Math.max(1e-9, rawMax - rawMin);
    const padding = Math.max(rawSpan * 0.16, Math.abs(rawMax) > 10 ? 1 : 0.1);
    const min = rawMin - padding;
    const max = rawMax + padding;
    const span = Math.max(1e-9, max - min);
    const chartPoints = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? (left + right) / 2 : left + (index / (points.length - 1)) * (right - left),
      y: bottom - ((point.value - min) / span) * (bottom - top),
    }));
    const observed = chartPoints.filter((point) => point.kind === 'observed');
    const latestObserved = observed[observed.length - 1];
    const forecast = chartPoints.filter((point) => point.kind === 'forecast');
    const forecastLine = latestObserved && forecast.length ? [latestObserved, ...forecast] : forecast;
    const forecastStartX = forecast[0]?.x ?? right - 72;
    return {
      ...row,
      top,
      bottom,
      middle,
      forecastStartX,
      points: chartPoints,
      observedPath: observed.length >= 2 ? seriesPath(observed) : '',
      forecastPath: forecastLine.length >= 2 ? seriesPath(forecastLine) : '',
      high: formatReadoutValue(rawMax),
      low: formatReadoutValue(rawMin),
    };
  });
}

function SidePredictionModelBrief({ decisionModel }: { decisionModel: AseanDecisionModelResult | null }) {
  const [activeId, setActiveId] = useState('fuel-cost-xgb');
  const options = useMemo<SidePredictionModelOption[]>(() => {
    const training = decisionModel?.fuel_price_training || null;
    const blueprints = decisionModel?.model_blueprints || [];
    const strategy = decisionModel?.strategy_models || [];
    const optionsList: SidePredictionModelOption[] = [];
    if (training) {
      const verdict = fuelModelVerdict(training);
      const latestForecastByProduct = Object.values(training.forecast_8_weeks.reduce((acc, row) => {
        const current = acc[row.product];
        if (!current || row.step > current.step) acc[row.product] = row;
        return acc;
      }, {} as Record<string, FuelPriceTraining['forecast_8_weeks'][number]>)).sort((left, right) => left.product.localeCompare(right.product));
      const latestDeviationByProduct = Object.values((training.deviation_points || []).reduce((acc, row) => {
        const current = acc[row.product];
        if (!current || row.date > current.date) acc[row.product] = row;
        return acc;
      }, {} as Record<string, NonNullable<FuelPriceTraining['deviation_points']>[number]>)).sort((left, right) => left.product.localeCompare(right.product));
      const fuelTrendByProduct = (training.trend_points || []).reduce((acc, row) => {
        acc[row.product] = [...(acc[row.product] || []), {
          date: row.date,
          value: row.price,
          kind: row.kind,
        }];
        return acc;
      }, {} as Record<string, SidePredictionPoint[]>);
      optionsList.push({
        id: 'fuel-cost-xgb',
        name: '能源成本扰动',
        badge: '周度预测',
        summary: '读取马来西亚公开燃油价格，判断短期能源成本压力。',
        quality: verdict.direction,
        sourceLabel: '马来西亚公开燃油价格',
        sourceUrl: training.source.url,
        readout: SIDE_MODEL_READOUTS['fuel-cost-xgb'],
        rows: latestForecastByProduct.map((row) => {
          const deviation = latestDeviationByProduct.find((item) => item.product === row.product);
          return {
            label: FUEL_PRODUCT_LABELS[row.product] || row.product,
            value: fuelMoveLabel(row.change),
            note: `下一期预计${fuelMoveLabel(row.change)}${deviation ? `，回看${fuelDeviationLevel(deviation.difference)}` : ''}。`,
            tone: fuelMoveClass(row.change),
            points: (fuelTrendByProduct[row.product]?.length
              ? fuelTrendByProduct[row.product]
              : [{ date: row.date, value: row.predicted_price, kind: 'forecast' as const }]
            ).slice(-12),
          };
        }),
      });
    }
    optionsList.push(...blueprints
      .filter((blueprint) => blueprint.public_model && SIDE_MODEL_LABELS[blueprint.id])
      .map((blueprint) => {
        const label = SIDE_MODEL_LABELS[blueprint.id];
        const linked = strategy.find((item) => item.id === blueprint.id);
        const publicModel = blueprint.public_model;
        return {
          id: blueprint.id,
          name: label.name,
          badge: label.badge,
          summary: publicModel?.summary || linked?.output || blueprint.business_question,
          quality: publicModel?.quality_label || '可读',
          sourceLabel: publicModel?.source_label || '公开指标来源',
          readout: SIDE_MODEL_READOUTS[blueprint.id] || {
            target: label.name,
            unit: '综合分',
            meaning: publicModel?.summary || linked?.output || blueprint.business_question,
          },
          rows: (publicModel?.forecast_cards || []).slice(0, 3).map((card) => ({
            label: card.country,
            value: card.direction,
            note: card.note,
            tone: readoutDirectionClass(card.direction),
            points: (card.points?.length
              ? card.points
              : [
                { date: card.label, value: Number(card.current) || 0, kind: 'observed' as const },
                { date: '下一期', value: Number(card.estimated) || Number(card.current) || 0, kind: 'forecast' as const },
              ]
            ).slice(-12),
          })),
        } satisfies SidePredictionModelOption;
      }));
    return optionsList;
  }, [decisionModel]);
  const active = options.find((option) => option.id === activeId) || options[0];
  if (!active) return null;
  const forecastLanes = sidePredictionPanelGeometry(active.rows);
  return (
    <section className={styles.sideModelPanel} aria-label="模型测算摘要">
      <div className={styles.sideModelHead}>
        <div>
          <span className={styles.kicker}>模型测算</span>
          <h2>{active.name}</h2>
          <p>{active.summary}</p>
        </div>
      </div>
      <div className={styles.sideModelReadoutGrid} aria-label="预测口径">
        <article>
          <span>预测对象</span>
          <strong>{active.readout.target}</strong>
        </article>
        <article>
          <span>单位</span>
          <strong>{active.readout.unit}</strong>
        </article>
        <article>
          <span>指标含义 <HelpTip label={`${active.name}指标含义`} text={active.readout.meaning} /></span>
          <strong>{active.quality}</strong>
        </article>
      </div>
      <div className={styles.sideModelTabs} role="tablist" aria-label="预测模型选择">
        {options.map((option) => (
          <button
            type="button"
            role="tab"
            aria-selected={active.id === option.id}
            className={active.id === option.id ? styles.sideModelTabActive : ''}
            key={option.id}
            onClick={() => setActiveId(option.id)}
          >
            <span>{option.name}</span>
            <b>{option.badge}</b>
          </button>
        ))}
      </div>
      <div className={styles.sideModelForecastBoard}>
        <div className={styles.sideModelVisualHead}>
          <span>历史走势与预测段</span>
          <b><i />虚线为预测，阴影为估计区间</b>
        </div>
        <svg className={styles.sideModelHeroChart} viewBox="0 0 420 196" role="img" aria-label={`${active.name}历史走势与下一期估计`}>
          <rect className={styles.sideModelHeroFrame} x="0" y="0" width="420" height="196" rx="12" />
          {forecastLanes.map((lane) => (
            <g key={`${active.id}:${lane.label}`}>
              <rect
                className={styles.sideModelForecastShade}
                x={Math.max(86, lane.forecastStartX - 10)}
                y={lane.top - 9}
                width={Math.max(18, 402 - lane.forecastStartX + 10)}
                height={lane.bottom - lane.top + 18}
                rx="8"
              />
              <line x1="86" y1={lane.top} x2="402" y2={lane.top} />
              <line x1="86" y1={lane.middle} x2="402" y2={lane.middle} />
              <line x1="86" y1={lane.bottom} x2="402" y2={lane.bottom} />
              <text className={styles.sideModelLaneLabel} x="16" y={lane.middle - 5}>{lane.label}</text>
              <text className={`${styles.sideModelLaneValue} ${lane.tone || ''}`} x="16" y={lane.middle + 13}>{lane.value}</text>
              <text className={styles.sideModelLaneAxis} x="407" y={lane.top + 4}>{lane.high}</text>
              <text className={styles.sideModelLaneAxis} x="407" y={lane.bottom + 3}>{lane.low}</text>
              {lane.observedPath ? <path className={styles.sideModelObservedLine} d={lane.observedPath} /> : null}
              {lane.forecastPath ? <path className={styles.sideModelForecastLine} d={lane.forecastPath} /> : null}
              {lane.points.map((point, index) => (
                <g
                  aria-label={`${lane.label}，${lane.note}；${point.date}：${formatReadoutValue(point.value)}${point.kind === 'forecast' ? '，估计' : ''}`}
                  key={`${lane.label}:${point.date}:${index}`}
                  role="listitem"
                  tabIndex={0}
                >
                  <title>{`${point.date}：${formatReadoutValue(point.value)}${point.kind === 'forecast' ? '（估计）' : ''}`}</title>
                  <circle
                    className={point.kind === 'forecast' ? styles.sideModelForecastPoint : styles.sideModelObservedPoint}
                    cx={point.x}
                    cy={point.y}
                    r={point.kind === 'forecast' ? 4.4 : 2.7}
                  />
                  <text
                    className={styles.sideModelPointLabel}
                    textAnchor={point.x > 348 ? 'end' : 'start'}
                    x={point.x > 348 ? point.x - 7 : point.x + 7}
                    y={Math.max(14, point.y - 7)}
                  >
                    {formatReadoutValue(point.value)}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </svg>
        <p className={styles.sideModelSourceLine}>图中实线为已发生数据，虚线为下一阶段估计；阴影表示服务估计区间。</p>
      </div>
    </section>
  );
}

function DecisionModelPanel({
  decisionModel,
  metrics,
  series,
  researchReports,
  sourceCount,
  evidenceCount,
  timelineCount,
  savedResearchCount,
  loading,
  error,
  onRefresh,
}: {
  decisionModel: AseanDecisionModelResult | null;
  metrics: AseanDatasetMetricRow[];
  series: NonNullable<AseanDemoTopic['dataset_series']>;
  researchReports: NonNullable<AseanDemoTopic['recent_research_reports']>;
  sourceCount: number;
  evidenceCount: number;
  timelineCount: number;
  savedResearchCount: number;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [activeStage, setActiveStage] = useState<DecisionStageKey>('collection');
  const [activeModelId, setActiveModelId] = useState('fuel-cost-xgb');
  const indicators = decisionModel?.indicators || [];
  const strategyModels = decisionModel?.strategy_models || [];
  const predictionTasks = decisionModel?.prediction_tasks || [];
  const modelBlueprints = decisionModel?.model_blueprints || [];
  const fuelPriceTraining = decisionModel?.fuel_price_training || null;
  const hasDecisionModel = Boolean(decisionModel);
  const metricDateValues = metrics
    .map((metric) => String(metric.date || '').slice(0, 10))
    .filter((date) => /^\d{4}/u.test(date))
    .sort();
  const latestMetricDate = metricDateValues[metricDateValues.length - 1] || '待刷新';
  const metricCountFor = (pattern: RegExp) => metrics.filter((metric) => pattern.test(`${metric.label} ${metric.source_name} ${metric.topic}`)).length;
  const indicatorValue = (id: string, fallback: string) => {
    const match = indicators.find((indicator) => indicator.id === id);
    return match ? `${match.value}${match.unit}` : fallback;
  };
  const marketMetricCount = metricCountFor(/GDP|FDI|贸易开放度|market_macro/iu);
  const powerMetricCount = metricCountFor(/电力|用电|发电|electricity|energy|technology_infrastructure/iu);
  const greenMetricCount = metricCountFor(/绿电|可再生|化石|renewable|fossil/iu);
  const computeMetricCount = metricCountFor(/互联网|服务器|数据中心|高技术|secure internet|data center|technology/iu);
  const modelKernelRows = [
    ...(fuelPriceTraining ? [{
      id: 'fuel-cost-xgb',
      name: '能源成本扰动预测',
      input: '马来西亚公开油价序列',
      inputCount: fuelPriceTraining.series.reduce((sum, item) => sum + item.point_count, 0),
      countLabel: '周度预测',
      method: '用马来西亚燃油周度价格预测未来 8 周能源成本扰动，辅助绿电与电力成本研判。',
      output: '能源成本压力线索',
      score: fuelPriceTraining.quality_label,
      dataModel: '周度价格时序测算',
      modelSignals: ['RON95', 'RON97', '柴油'],
    }] : []),
    {
      id: 'market-heat',
      name: '市场进入吸引力',
      input: `${marketMetricCount} 项市场指标`,
      inputCount: marketMetricCount,
      method: '按经济规模、资本流入、贸易开放和数字基础形成可回看的进入热度。',
      output: '国家进入排序',
      score: indicatorValue('policy', `${marketMetricCount} 项`),
      countLabel: '代理回看',
      dataModel: '市场进入吸引力研判',
      modelSignals: ['GDP', 'FDI', '贸易开放度'],
    },
    {
      id: 'power-risk',
      name: '电力供需压力',
      input: `${powerMetricCount} 项电力指标`,
      inputCount: powerMetricCount,
      method: '比较年度发电、需求、进口、绿电和宏观变量，读取国家供需压力。',
      output: '供电缺口预警',
      score: indicatorValue('power', `${powerMetricCount} 项`),
      countLabel: '年度回看',
      dataModel: '电力供需压力研判',
      modelSignals: ['电力可及率', '人均用电', '发电与需求'],
    },
    {
      id: 'green-parity',
      name: '绿电支撑能力',
      input: `${greenMetricCount} 项绿电指标`,
      inputCount: greenMetricCount,
      method: '跟踪绿电占比、能源结构和价格线索，判断绿色电力支撑窗口。',
      output: '绿电支撑路径',
      score: indicatorValue('green', `${greenMetricCount} 项`),
      countLabel: '代理回看',
      dataModel: '绿电支撑能力研判',
      modelSignals: ['可再生占比', '化石依赖', '燃料价格'],
    },
    {
      id: 'compute-roi',
      name: '算力需求承载',
      input: `${computeMetricCount} 项数字基础指标`,
      inputCount: computeMetricCount,
      method: '以网络成熟度、安全服务器密度和高技术出口作为算力承载与需求代理变量。',
      output: '算力缺口方向',
      score: indicatorValue('compute', `${computeMetricCount} 项`),
      countLabel: '代理回看',
      dataModel: '算力需求承载研判',
      modelSignals: ['数据中心设施', '网络连接', '高技术出口'],
    },
    {
      id: 'go-priority',
      name: '出海优先级',
      input: `${timelineCount} 条线索 / ${evidenceCount} 个来源`,
      inputCount: timelineCount,
      method: '综合市场、电力、绿电、风险和政策约束，形成可调整权重的广西支撑策略。',
      output: '行动路径建议',
      score: `${strategyModels.length || 5} 个模型`,
      countLabel: '综合排序',
      dataModel: '出海优先级排序研判',
      modelSignals: ['国家排序', '缺口判断', '行动路径'],
    },
  ];
  const viewLabel = (value: string) => value.replace(/驾驶舱/gu, '看板');
  const strategyModelViews = modelKernelRows.map((row) => {
    const linked = strategyModels.find((model) => model.id === row.id || row.name.includes(model.name) || model.name.includes(row.name));
    const blueprint = modelBlueprints.find((item) => item.id === row.id);
    return {
      ...row,
      linkedOutput: linked?.output || row.output,
      linkedView: viewLabel(linked?.linked_view || row.output),
      confidence: linked?.confidence ?? null,
      countLabel: row.countLabel,
      publicModel: blueprint?.public_model,
    };
  });
  const activeModel = strategyModelViews.find((model) => model.id === activeModelId) || strategyModelViews[0];
  const activeBlueprint = activeModel
    ? modelBlueprints.find((blueprint) => blueprint.id === activeModel.id)
    : null;
  const activeModelDiagnostics = activeModel?.id === 'fuel-cost-xgb' || activeModel?.publicModel
    ? []
    : (activeModel?.publicModel?.quality_metrics || activeBlueprint?.training_diagnostics || []).slice(0, 4).map((item) => ({
      label: item.label,
      value: item.value,
      detail: 'detail' in item ? item.detail : '',
    }));
  const activeModelSeries = activeModel && activeModel.id !== 'fuel-cost-xgb'
    ? seriesForStrategyModel(series, activeModel.id)
    : [];
  const outputSummaryRows = [
    {
      label: '优先排序',
      value: `${strategyModels.length || modelKernelRows.length} 个模型`,
      detail: '合并市场、电力、绿电、算力和政策约束，形成国家进入顺序。',
    },
    {
      label: '缺口判断',
      value: `${predictionTasks.length} 组跟踪问题`,
      detail: '把供电缺口、算力需求和绿电约束转成可跟踪的问题。',
    },
    {
      label: '行动路径',
      value: `${savedResearchCount} 份研判`,
      detail: '保留已保存研判、引用来源和下一轮补数范围。',
    },
  ];
  const architectureLayers: Array<{
    key: DecisionStageKey;
    index: string;
    title: string;
    metric: string;
    detail: string;
    tags: string[];
  }> = [
    {
      key: 'collection',
      index: '01',
      title: '数据入库',
      metric: `${sourceCount} 个来源`,
      detail: `${metrics.length} 项指标，最新 ${latestMetricDate}`,
      tags: ['指标源', '专题源', '时间范围'],
    },
    {
      key: 'analysis',
      index: '02',
      title: '指数分析',
      metric: `${indicators.length || 5} 项指数`,
      detail: '网络、电力、绿电、算力、AI营商环境',
      tags: ['公式', '组成项', '来源'],
    },
    {
      key: 'strategy',
      index: '03',
      title: '模型测算',
      metric: fuelPriceTraining ? '6 个模型' : '5 类标准',
      detail: fuelPriceTraining ? '能源成本扰动预测优先展示' : '国家进入、供电约束和绿电窗口',
      tags: ['输入标准', '判定标准', '输出标准'],
    },
    {
      key: 'output',
      index: '04',
      title: '策略输出',
      metric: `${savedResearchCount} 份研判`,
      detail: `${predictionTasks.length} 组跟踪问题，形成行动路径`,
      tags: ['国家排序', '缺口判断', '行动路径'],
    },
  ];
  const statusText = loading
    ? '更新中'
    : !decisionModel
      ? '准备中'
      : '已更新';

  return (
    <section className={styles.decisionPanel} aria-label="绿色算力决策链路">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.kicker}>决策链路</span>
          <h2>绿色算力决策链路</h2>
          <p>{decisionModel?.summary || '将专题来源、指标和线索转化为指数、跟踪问题和出海优先级。'}</p>
        </div>
        <div className={styles.decisionHeaderActions}>
          <span className={styles.timeBadge}>策略研判 · {statusText}</span>
          <button type="button" onClick={onRefresh} disabled={loading} aria-label="刷新策略研判">
            <RefreshCw size={13} className={loading ? styles.spinIcon : ''} />
          </button>
        </div>
      </div>

      {error ? <div className={styles.decisionError}>{error}</div> : null}

      <div className={styles.decisionScope}>
        <span>采集范围</span>
        {(decisionModel?.scope || ['马来西亚', '越南', '新加坡', '泰国', '老挝', '柬埔寨']).map((country, index) => (
          <b key={`${country}:${index}`}>{country}</b>
        ))}
      </div>

      <div className={styles.decisionArchitecture} role="tablist" aria-label="中国东盟绿色算力五层链路">
        {architectureLayers.map((layer) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeStage === layer.key}
            className={`${styles.decisionLayer} ${activeStage === layer.key ? styles.decisionLayerActive : ''}`}
            key={layer.key}
            onClick={() => setActiveStage(layer.key)}
          >
            <small>{layer.index}</small>
            <strong>{layer.title}</strong>
            <b>{layer.metric}</b>
            <p>{layer.detail}</p>
            <div>
              {layer.tags.map((tag, index) => <span key={`${tag}:${index}`}>{tag}</span>)}
            </div>
          </button>
        ))}
      </div>

      {activeStage === 'collection' ? (
        <CoreDataMatrix metrics={metrics} />
      ) : null}

      {hasDecisionModel ? (
        <>
          {activeStage === 'analysis' ? (
            <div className={styles.decisionBlock}>
              <div className={styles.decisionBlockHeader}>
                <span>指数分析结果</span>
                <b>{indicators.length} 项</b>
              </div>
              <div className={styles.decisionIndicatorList}>
                {indicators.map((indicator, index) => (
                  <article className={styles.decisionIndicator} key={`${indicator.id || indicator.label}:${index}`}>
                    <div>
                      <strong>{indicator.label}</strong>
                      {indicator.formula ? <small>{indicator.formula}</small> : null}
                      <span>{indicator.basis}</span>
                      {indicator.components?.length ? (
                        <ul className={styles.decisionIndicatorComponents}>
                          {indicator.components.slice(0, 6).map((component) => (
                            <li key={`${indicator.id}:${component.label}`}>
                              <b>{component.label}</b>
                              <em>{component.value}</em>
                              <small>{component.source}</small>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <em>{indicator.value}{indicator.unit}</em>
                    <i>
                      <b style={{ width: `${Math.max(4, Math.min(100, indicator.value))}%` }} />
                    </i>
                  </article>
                ))}
              </div>
              <p className={styles.decisionNote}>指数为专题研判分；依据栏只引用已接入公开来源，尚未形成可比指标的数据按待补齐处理。</p>
            </div>
          ) : null}

          {activeStage === 'strategy' ? (
            <div className={styles.modelWorkbench} aria-label="策略测算模型">
              <div className={styles.modelSelector} role="tablist" aria-label="策略模型选择">
                {strategyModelViews.map((model) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeModel?.id === model.id}
                    className={activeModel?.id === model.id ? styles.modelSelectorActive : ''}
                    key={model.id}
                    onClick={() => setActiveModelId(model.id)}
                  >
                    <span>{model.name}</span>
                    <b>{model.countLabel}</b>
                  </button>
                ))}
              </div>

              {activeModel ? (
                <div className={styles.modelOutputPanel}>
                  <div className={styles.modelOutputHead}>
                    <div>
                      <span>{activeModel.input}</span>
                      <strong>{activeModel.name}</strong>
                      <p>{activeModel.method}</p>
                    </div>
                    <em>{activeModel.publicModel?.quality_label || activeModel.score}</em>
                  </div>
                  <div className={styles.modelOutputResult}>
                    <span>输出结果</span>
                    <strong>{activeModel.id === 'fuel-cost-xgb' ? '展示马来西亚燃油价格对能源成本的短期扰动。' : activeModel.linkedOutput}</strong>
                    <p>看完这一步，可以判断哪些国家需要优先复核，哪些结论还必须回到来源和线索里确认。</p>
                  </div>
                  <div className={styles.modelEvidenceStrip} aria-label="数据测算口径">
                    <article>
                      <span>测算口径<HelpTip label="测算口径" text={MODEL_EVIDENCE_HELP.model} /></span>
                      <strong>{activeModel.dataModel}</strong>
                    </article>
                    <article>
                      <span>主要输入<HelpTip label="主要输入" text={MODEL_EVIDENCE_HELP.inputs} /></span>
                      <strong>{activeModel.modelSignals.join(' / ')}</strong>
                    </article>
                    <article>
                      <span>使用方式<HelpTip label="使用方式" text={MODEL_EVIDENCE_HELP.usage} /></span>
                      <strong>先看公开指标，再与线索和来源复核</strong>
                    </article>
                  </div>
                  {activeModelDiagnostics.length ? (
                    <div className={styles.modelDiagnosticStrip} aria-label="模型回看质量">
                      {activeModelDiagnostics.map((item) => (
                        <article key={`${activeModel.id}:${item.label}`}>
                          <span>{item.label}<HelpTip label={item.label} text={item.detail} /></span>
                          <strong>{item.value}</strong>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {activeModel.id !== 'fuel-cost-xgb' ? (
                    <ModelReadoutPanel readout={activeModel.publicModel} />
                  ) : null}
                  {activeModel.id !== 'fuel-cost-xgb' ? (
                    <ModelSeriesPanel rows={activeModelSeries} modelName={activeModel.name} />
                  ) : null}
                  {activeModel.id === 'fuel-cost-xgb' && fuelPriceTraining ? (
                    <FuelTrainingCase training={fuelPriceTraining} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStage === 'output' ? (
            <div className={styles.outputStage}>
              {researchReports.length ? (
                <div className={styles.outputResearchPanel}>
                  <div className={styles.decisionBlockHeader}>
                    <span>关注问题与已保存研判</span>
                    <b>{researchReports.length} 份</b>
                  </div>
                  <div className={styles.outputResearchList}>
                    {researchReports.slice(0, 3).map((report, index) => (
                      <article className={styles.outputResearchCard} key={`${report.id}:${index}`}>
                        <div>
                          <span>关注问题</span>
                          <strong>{savedResearchTitle(report.question)}</strong>
                        </div>
                        <em>{researchEvidenceLabel(report.source_count, report.references?.length)}</em>
                        <p>{researchExcerpt(report.content, 260)}</p>
                        <ResearchSourceDisclosure sources={report.references} totalCount={report.source_count} />
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.outputSummaryPanel}>
                  {outputSummaryRows.map((row) => (
                    <article className={styles.outputSummaryCard} key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                      <p>{row.detail}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.decisionPending}>
          <span>策略研判生成中</span>
          <p>已接入 {metrics.length} 项结构化指标，正在生成指数与策略结果。</p>
        </div>
      )}
    </section>
  );
}

function AseanMap({
  topic,
  activeIssue,
  selectedCountry,
  onCountry,
}: {
  topic: AseanDemoTopic;
  activeIssue: AseanTopicKey | 'all';
  selectedCountry: string | null;
  onCountry: (country: string) => void;
}) {
  const [visibleMapLayers, setVisibleMapLayers] = useState<Set<MapLayerKey>>(() => new Set(DEFAULT_MAP_LAYERS));
  const [mapTimeScope, setMapTimeScope] = useState<MapTimeScope>('recent30');
  const mapReferenceTime = useMemo(() => {
    const generatedTime = new Date(topic.generated_at || '').getTime();
    if (Number.isFinite(generatedTime)) return generatedTime;
    const latestSignalTime = topic.signals.reduce((latest, signal) => {
      const publishedTime = new Date(signal.published_at || '').getTime();
      return Number.isFinite(publishedTime) ? Math.max(latest, publishedTime) : latest;
    }, 0);
    return latestSignalTime;
  }, [topic.generated_at, topic.signals]);
  const countryCounts = useMemo(() => {
    if (activeIssue === 'all') {
      return new Map(topic.country_counts.map((country) => [country.label, country.count]));
    }
    const counts = new Map<string, number>();
    for (const signal of topic.signals) {
      if (signal.topic !== activeIssue) continue;
      for (const country of signal.country_scope) {
        if (country === '东盟') continue;
        counts.set(country, (counts.get(country) || 0) + 1);
      }
    }
    return counts;
  }, [activeIssue, topic.country_counts, topic.signals]);
  const timeScopeCounts = useMemo<Record<MapTimeScope, number>>(() => {
    const counts = { today: 0, recent30: 0 };
    for (const signal of topic.signals) {
      if (activeIssue !== 'all' && signal.topic !== activeIssue) continue;
      const bucket = signalTimeBucket(signal, mapReferenceTime);
      if (bucket === 'today') counts.today += 1;
      if (bucket === 'today' || bucket === 'recent30') counts.recent30 += 1;
    }
    return counts;
  }, [activeIssue, mapReferenceTime, topic.signals]);
  const signalMarkers = useMemo<AseanSignalMarker[]>(() => {
    const rows: AseanSignalMarker[] = [];
    const countrySeen = new Map<string, number>();
    const signals = topic.signals.filter((signal) => (
      (activeIssue === 'all' || signal.topic === activeIssue)
      && signalMatchesMapTimeScope(signal, mapTimeScope, mapReferenceTime)
    ));
    for (const signal of signals) {
      const recency = signalTimeBucket(signal, mapReferenceTime);
      for (const country of signal.country_scope) {
        if (country === '东盟') continue;
        if (selectedCountry && country !== selectedCountry) continue;
        const base = ASEAN_LABEL_POSITIONS[country];
        if (!base) continue;
        const index = countrySeen.get(country) || 0;
        countrySeen.set(country, index + 1);
        const angle = index * 137.5 * Math.PI / 180;
        const radius = 2.2 + Math.min(4.8, index * .45);
        rows.push({
          id: `${signal.id}:${country}`,
          country,
          signal,
          recency,
          x: Number((base.x + Math.cos(angle) * radius).toFixed(2)),
          y: Number((base.y + Math.sin(angle) * radius).toFixed(2)),
        });
      }
    }
    return balanceSignalMarkers(rows, 30);
  }, [activeIssue, mapReferenceTime, mapTimeScope, selectedCountry, topic.signals]);
  const visibleSignalMarkers = signalMarkers.filter((marker) => visibleMapLayers.has(mapLayerForTopic(marker.signal.topic)));
  const layerCounts: Record<MapLayerKey, number> = {
    security: signalMarkers.filter((marker) => mapLayerForTopic(marker.signal.topic) === 'security').length,
    industry: signalMarkers.filter((marker) => mapLayerForTopic(marker.signal.topic) === 'industry').length,
    macro_risk: signalMarkers.filter((marker) => mapLayerForTopic(marker.signal.topic) === 'macro_risk').length,
    routes: SEA_ROUTES.length,
  };
  const availableLayers = (Object.keys(MAP_LAYER_LABELS) as MapLayerKey[]).filter((layer) => layerCounts[layer] > 0);
  const toggleLayer = (layer: MapLayerKey) => {
    setVisibleMapLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };
  const showRoutes = visibleMapLayers.has('routes');

  return (
    <div className={styles.mapPanel}>
      <div className={styles.mapLayerControl} aria-label="地图图层控制">
        <span>图层</span>
        {availableLayers.map((layer) => (
          <button
            type="button"
            key={layer}
            onClick={() => toggleLayer(layer)}
            className={visibleMapLayers.has(layer) ? styles.mapLayerToggleActive : ''}
            aria-pressed={visibleMapLayers.has(layer)}
          >
            {MAP_LAYER_LABELS[layer]} <strong>{layerCounts[layer]}</strong>
          </button>
        ))}
        <span className={styles.mapControlDivider}>时间</span>
        {(['today', 'recent30'] as MapTimeScope[]).map((scope) => (
          <button
            type="button"
            key={scope}
            onClick={() => setMapTimeScope(scope)}
            className={mapTimeScope === scope ? styles.mapLayerToggleActive : ''}
            aria-pressed={mapTimeScope === scope}
          >
            {MAP_TIME_SCOPE_LABELS[scope]} <strong>{timeScopeCounts[scope]}</strong>
          </button>
        ))}
      </div>
      <svg viewBox="0 0 100 100" className={styles.mapSvg} role="img" aria-label="东盟平面地图">
        {showRoutes ? (
          <>
            <g className={styles.seaRouteLayer} aria-label="东盟重点海上通道">
              {SEA_ROUTES.map((route, index) => (
                <g key={`${route.id}:${index}`}>
                  <path className={styles.seaRouteUnderlay} d={route.d} />
                  <path className={styles.seaRoute} d={route.d}>
                    <title>{route.label}</title>
                  </path>
                </g>
              ))}
              {SEA_ROUTE_GATES.map((gate, index) => (
                <circle key={`${gate.id}:${index}`} cx={gate.x} cy={gate.y} r="1.05" className={styles.seaRouteGate}>
                  <title>{gate.label}</title>
                </circle>
              ))}
            </g>
            <text x="64" y="37" className={styles.seaLabel}>南海主通道</text>
            <text x="23" y="58" className={styles.seaLabel}>马六甲/新加坡海峡</text>
            <text x="58" y="78" className={styles.seaLabel}>爪哇海—东部通道</text>
          </>
        ) : null}
        {COUNTRIES.map((country, index) => {
          const count = countryCounts.get(country.label) || 0;
          const selected = selectedCountry === country.label;
          return (
            <g
              key={`${country.id}:${index}`}
              onClick={() => onCountry(country.label)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onCountry(country.label);
                }
              }}
              className={styles.countryGroup}
              role="button"
              tabIndex={0}
            >
              <path
                d={country.path}
                className={`${styles.countryShape} ${count > 0 ? styles.countryActive : ''} ${selected ? styles.countrySelected : ''}`}
              />
              <text x={country.x} y={country.y} className={styles.countryLabel} textAnchor="middle">
                {country.label}
              </text>
            </g>
          );
        })}
        {visibleSignalMarkers.map((marker, index) => (
          <circle
            key={`${marker.id}:${marker.country}:${index}:pulse`}
            cx={marker.x}
            cy={marker.y}
            r={marker.signal.score >= 5 ? 1.45 : 1.16}
            className={`${styles.signalPulse} ${styles[`signalPulse_${signalTone(marker.signal)}`]} ${marker.recency === 'today' ? styles.signalPulseToday : styles.signalPulseRecent}`}
          />
        ))}
        {visibleSignalMarkers.map((marker, index) => (
          <circle
            key={`${marker.id}:${marker.country}:${index}`}
            cx={marker.x}
            cy={marker.y}
            r={marker.signal.score >= 5 ? 1.05 : .82}
            className={`${styles.signalDot} ${styles[`signalDot_${signalTone(marker.signal)}`]} ${marker.recency === 'today' ? styles.signalDotToday : styles.signalDotRecent} ${marker.signal.topic === activeIssue || selectedCountry === marker.country ? styles.signalDotActive : ''}`}
          >
            <title>
              {`${marker.country}：${concreteTimelineTitle({
                title: marker.signal.title,
                summary: marker.signal.summary,
                source_name: marker.signal.source_name,
                country_scope: marker.signal.country_scope?.length ? marker.signal.country_scope : [marker.country],
                topic: marker.signal.topic,
                credibility_score: marker.signal.credibility_score,
                published_at: marker.signal.published_at,
              } as AseanTimelineItem)}`}
            </title>
          </circle>
        ))}
        {visibleSignalMarkers.map((marker, index) => marker.recency === 'today' ? null : (
          <Fragment key={`${marker.id}:${marker.country}:${index}:rings`}>
            <circle
              cx={marker.x}
              cy={marker.y}
              r={marker.signal.score >= 5 ? .68 : .55}
              className={`${styles.signalRingRecent} ${styles.signalRingMiddleRecent} ${styles[`signalRing_${signalTone(marker.signal)}`]}`}
            />
            <circle
              cx={marker.x}
              cy={marker.y}
              r={marker.signal.score >= 5 ? .36 : .28}
              className={`${styles.signalRingRecent} ${styles.signalRingInnerRecent} ${styles[`signalRing_${signalTone(marker.signal)}`]}`}
            />
          </Fragment>
        ))}
        <g className={styles.mapLegend} transform="translate(5 91)">
          <circle cx="1.5" cy="1.5" r="1.1" className={styles.legendHighDot} />
          <text x="4" y="2.6">高紧急</text>
          <circle cx="20" cy="1.5" r="1.1" className={styles.legendElevatedDot} />
          <text x="22.5" y="2.6">需关注</text>
          <circle cx="38" cy="1.5" r="1.1" className={styles.legendMonitoringDot} />
          <text x="40.5" y="2.6">常态监测</text>
        </g>
      </svg>
    </div>
  );
}

export default function AseanDemoClient({ topic }: { topic: AseanDemoTopic }) {
  const [activeIssue, setActiveIssue] = useState<AseanTopicKey | 'all'>('all');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [researchInput, setResearchInput] = useState('未来三年，东盟六国中哪些国家最可能出现AI算力供给缺口，广西应如何协同支撑？');
  const [researchMessages, setResearchMessages] = useState<ResearchChatMessage[]>([]);
  const [researchPending, setResearchPending] = useState(false);
  const [selectedSavedResearchId, setSelectedSavedResearchId] = useState<string | null>(null);
  const [decisionModel, setDecisionModel] = useState<AseanDecisionModelResult | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const researchAbortRef = useRef<AbortController | null>(null);
  const researchDialogRef = useRef<HTMLDivElement | null>(null);
  const researchInputRef = useRef<HTMLTextAreaElement | null>(null);
  const researchAutoScrollRef = useRef(true);
  const selectIssue = (issue: AseanTopicKey | 'all') => {
    setActiveIssue(issue);
  };
  const selectCountry = (country: string) => {
    setSelectedCountry((current) => (current === country ? null : country));
  };

  const filteredTimeline = (topic.timeline || []).filter((item) => {
    const issueMatch = activeIssue === 'all' || item.topic === activeIssue;
    const countryMatch = !selectedCountry || item.country_scope.includes(selectedCountry) || item.country_scope.includes('东盟');
    return issueMatch && countryMatch;
  });
  const timelineItems = filteredTimeline.length ? filteredTimeline : topic.timeline || [];
  const visibleTimelineCount = timelineItems.length;
  const datasetMetricCount = topic.dataset_metric_status?.metric_count ?? topic.dataset_metrics?.length ?? 0;
  const sourceProcessing = topic.source_processing;
  const validatedSourceCount = topic.validation_summary?.source_count ?? sourceProcessing?.contributing_source_count ?? 0;
  const activeSourceCount = sourceProcessing?.active_source_count ?? 0;
  const contributingSourceCount = sourceProcessing?.contributing_source_count ?? validatedSourceCount;
  const mergedEvidenceCount = topic.validation_summary?.dedupe_collapsed_count ?? 0;
  const recentResearchCount = topic.recent_research_reports?.length ?? 0;
  const savedResearchReports = topic.recent_research_reports || [];
  const countryFocusRows = topic.country_counts
    .slice(0, 5);
  const visibleIssueRows = ISSUE_ORDER
    .map((issue) => ({
      issue,
      count: topic.topic_counts.find((row) => row.key === issue)?.count || 0,
    }))
    .filter((row) => row.count > 0 || row.issue === activeIssue);
  const selectedCountryCount = selectedCountry ? topic.country_counts.find((country) => country.label === selectedCountry)?.count || 0 : 0;
  const activeIssueCount = activeIssue === 'all'
    ? topic.signal_count
    : topic.topic_counts.find((row) => row.key === activeIssue)?.count || 0;
  const recommendedResearchQuestions = pickDailyAseanResearchQuestions()
    .map((question) => ({ question: publicSuggestedResearchQuestion(question), sourceCount: 0 }))
    .filter((item, index, rows) => item.question && rows.findIndex((row) => row.question === item.question) === index)
    .slice(0, 3);
  const latestAssistantMessage = [...researchMessages].reverse().find((message) => message.role === 'assistant');
  const savedResearchEntries = savedResearchReports.map((report, index) => ({
    report,
    key: `${report.id}:${index}`,
  }));
  const latestSavedResearchEntry = savedResearchEntries[0] || null;
  const activeSavedResearchEntry = savedResearchEntries.find((entry) => entry.key === selectedSavedResearchId) || latestSavedResearchEntry;
  const activeSavedResearchReferences = activeSavedResearchEntry?.report.references || [];
  const activeSavedResearchSourceCount = activeSavedResearchEntry?.report.source_count || activeSavedResearchReferences.length;
  const latestResearchPhase = researchPending
    ? publicResearchStatus(latestValue(latestAssistantMessage?.phases, '连接研究进度'))
    : latestAssistantMessage?.status === 'done'
      ? '研究完成'
      : latestAssistantMessage?.status === 'stopped'
        ? '已停止'
        : researchMessages.length
          ? '待命'
          : activeSavedResearchEntry
            ? '已保存'
            : '待命';
  useEffect(() => {
    const dialog = researchDialogRef.current;
    if (!dialog) return;
    if (!researchAutoScrollRef.current) return;
    dialog.scrollTop = dialog.scrollHeight;
  }, [researchMessages, researchPending]);

  const handleResearchDialogScroll = () => {
    const dialog = researchDialogRef.current;
    if (!dialog) return;
    const distanceToBottom = dialog.scrollHeight - dialog.scrollTop - dialog.clientHeight;
    researchAutoScrollRef.current = distanceToBottom < 120;
  };

  const selectSavedResearch = (reportId: string) => {
    setResearchMessages([]);
    setSelectedSavedResearchId(reportId);
    requestAnimationFrame(() => {
      researchDialogRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const chooseResearchQuestion = (question: string) => {
    setResearchInput(question);
    requestAnimationFrame(() => {
      researchInputRef.current?.focus();
    });
  };

  const loadDecisionModel = async (refresh = false) => {
    setDecisionLoading(true);
    setDecisionError('');
    try {
      const response = await fetch(`/api/v1/world/asean/decision-model${refresh ? '?refresh=1' : ''}`, {
        method: refresh ? 'POST' : 'GET',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => ({}))) as AseanDecisionModelResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || '策略研判服务返回异常');
      setDecisionModel(payload);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : '策略研判加载失败');
    } finally {
      setDecisionLoading(false);
    }
  };

  useEffect(() => {
    void loadDecisionModel(false);
  }, []);

  const runResearch = async () => {
    const content = researchInput.trim();
    if (!content) return;
    researchAbortRef.current?.abort();
    setSelectedSavedResearchId(null);
    const userMessage: ResearchChatMessage = { id: uniqueId('research-user'), role: 'user', content };
    const assistantId = uniqueId('research-assistant');
    const assistantMessage: ResearchChatMessage = { id: assistantId, role: 'assistant', content: '', status: 'streaming', phases: ['确认范围', '关联来源'] };
    const nextMessages = [...researchMessages.filter((message) => !message.persisted), userMessage];
    setResearchInput('');
    researchAutoScrollRef.current = true;
    setResearchMessages((messages) => [...messages, userMessage, assistantMessage]);
    setResearchPending(true);
    const controller = new AbortController();
    researchAbortRef.current = controller;
    const updateAssistant = (patch: Partial<ResearchChatMessage> | ((message: ResearchChatMessage) => Partial<ResearchChatMessage>)) => {
      setResearchMessages((messages) => messages.map((message) => {
        if (message.id !== assistantId) return message;
        const resolvedPatch = typeof patch === 'function' ? patch(message) : patch;
        return { ...message, ...resolvedPatch };
      }));
    };
    try {
      const response = await fetch('/api/v1/world/asean/research?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        updateAssistant({ error: friendlyResearchError(payload.error || '专题研究服务返回异常'), phases: ['请求未完成'] });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handleEvent = (rawEvent: string) => {
        const dataLine = rawEvent.split(/\r?\n/u).find((line) => line.startsWith('data:'));
        if (!dataLine) return;
        const data = dataLine.slice('data:'.length).trim();
        if (!data) return;
        try {
          const parsed = JSON.parse(data) as {
            type?: string;
            content?: string;
            phase?: string;
            status?: string;
            message?: string;
            references?: ResearchChatMessage['references'];
            web_sites?: ResearchChatMessage['web_sites'];
            context_sources?: ResearchChatMessage['web_sites'];
            source_count?: number;
            source_summary?: {
              active_source_count?: number;
              candidate_source_count?: number;
              contributing_source_count?: number;
            };
            validation_summary?: {
              source_count?: number;
              dedupe_collapsed_count?: number;
            };
            result?: {
              content?: string;
              references?: ResearchChatMessage['references'];
              web_sites?: ResearchChatMessage['web_sites'];
              source_count?: number;
            };
            error?: string;
          };
          if (rawEvent.startsWith('event: meta')) {
            updateAssistant((message) => ({
              web_sites: mergeResearchSources(message.web_sites, parsed.context_sources),
              source_count: Math.max(message.source_count || 0, parsed.context_sources?.length || 0),
              progress_stats: {
                ...message.progress_stats,
                contextSourceCount: parsed.context_sources?.length || message.progress_stats?.contextSourceCount,
                activeSourceCount: parsed.source_summary?.active_source_count || message.progress_stats?.activeSourceCount,
                candidateSourceCount: parsed.source_summary?.candidate_source_count || message.progress_stats?.candidateSourceCount,
                contributingSourceCount: parsed.source_summary?.contributing_source_count || message.progress_stats?.contributingSourceCount,
                evidenceCount: parsed.validation_summary?.dedupe_collapsed_count || parsed.validation_summary?.source_count || message.progress_stats?.evidenceCount,
              },
              phases: appendUnique(message.phases || [], parsed.context_sources?.length ? `可用来源 ${parsed.context_sources.length} 个` : '关联来源'),
            }));
          } else if (parsed.type === 'delta' && parsed.content) {
            updateAssistant((message) => ({
              content: `${message.content}${parsed.content}`,
            }));
          } else if (parsed.type === 'progress_delta' && parsed.content) {
            const phase = normalizeResearchPhase(parsed.phase || '研判过程');
            updateAssistant((message) => ({
              progress_content: appendProgressContent(message.progress_content, parsed.content || ''),
              progress_phase: phase,
              phases: appendUnique(message.phases || [], phase),
            }));
          } else if (parsed.type === 'phase' || rawEvent.startsWith('event: phase')) {
            const label = normalizeResearchPhase(parsed.phase || parsed.status || parsed.message || '检索推进');
            updateAssistant((message) => {
              const linkedSourceCount = (message.references?.length || 0) + (message.web_sites?.length || 0);
              const phaseSourceCount = label.match(/^已关联来源\s+(\d+)\s*个$/u)?.[1];
              const nextSourceCount = phaseSourceCount ? Number(phaseSourceCount) : (message.source_count || linkedSourceCount || 0);
              if (label === '关联来源' && linkedSourceCount > 0) {
                const linkedLabel = `已关联来源 ${linkedSourceCount} 个`;
                return {
                  phases: appendUnique(withoutPendingSourcePhase(message.phases), linkedLabel),
                  progress_stats: {
                    ...message.progress_stats,
                    evidenceCount: linkedSourceCount,
                  },
                  progress_content: appendPhaseProgress(message.progress_content, linkedLabel, linkedSourceCount),
                };
              }
              return {
                phases: appendUnique(message.phases || [], label),
                source_count: nextSourceCount || message.source_count,
                progress_stats: nextSourceCount
                  ? { ...message.progress_stats, evidenceCount: nextSourceCount }
                  : message.progress_stats,
                progress_content: appendPhaseProgress(message.progress_content, label, nextSourceCount),
              };
            });
          } else if (parsed.type === 'references') {
            const nextReferences = parsed.references || [];
            const nextWebSites = parsed.web_sites || [];
            const sourceCount = parsed.source_count || nextReferences.length + nextWebSites.length;
            updateAssistant((message) => ({
              references: mergeResearchSources(message.references, nextReferences),
              web_sites: mergeResearchSources(message.web_sites, nextWebSites),
              source_count: Math.max(sourceCount || 0, message.source_count || 0),
              progress_stats: {
                ...message.progress_stats,
                evidenceCount: Math.max(sourceCount || 0, message.progress_stats?.evidenceCount || 0),
              },
              progress_content: appendPhaseProgress(message.progress_content, `已关联来源 ${sourceCount} 个`, sourceCount),
              phases: sourceCount ? appendUnique(withoutPendingSourcePhase(message.phases), `已关联来源 ${sourceCount} 个`) : message.phases,
            }));
          } else if (parsed.type === 'done') {
            updateAssistant((message) => ({
              status: 'done',
              content: message.content || parsed.result?.content || '',
              references: mergeResearchSources(message.references, parsed.result?.references),
              web_sites: mergeResearchSources(message.web_sites, parsed.result?.web_sites),
              source_count: Math.max(parsed.result?.source_count || 0, message.source_count || 0),
              phases: appendUnique(appendUnique(withoutPendingSourcePhase(message.phases), '研究完成'), '已保存到专题首页'),
            }));
          } else if (parsed.error) {
            updateAssistant({ status: 'error', error: friendlyResearchError(parsed.error), phases: ['请求未完成'] });
          }
        } catch {
          // Ignore malformed keepalive chunks.
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\n\n/u);
        buffer = events.pop() || '';
        events.forEach(handleEvent);
      }
      if (buffer) handleEvent(buffer);
    } catch (error) {
      if (!controller.signal.aborted) {
        updateAssistant({ status: 'error', error: friendlyResearchError(error instanceof Error ? error.message : '专题研究请求失败'), phases: ['请求未完成'] });
      }
    } finally {
      if (researchAbortRef.current === controller) researchAbortRef.current = null;
      setResearchPending(false);
    }
  };
  const stopResearch = () => {
    researchAbortRef.current?.abort();
    researchAbortRef.current = null;
    setResearchPending(false);
    setResearchMessages((messages) => {
      const assistantIndex = [...messages].map((message, index) => ({ message, index })).reverse().find(({ message }) => message.role === 'assistant')?.index;
      if (assistantIndex === undefined) return messages;
      return messages.map((message, index) => index === assistantIndex
        ? {
            ...message,
            status: 'stopped',
            phases: appendUnique(message.phases || [], '已停止'),
            content: message.content || '已停止当前研究。',
          }
        : message);
    });
  };

  return (
    <main className={styles.shell}>
      <div className={styles.aurora} />
      <header className={styles.header}>
        <div>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}><MapIcon size={18} /></span>
            <span>世界脉络</span>
          </div>
          <h1>东盟专题</h1>
          <p>{activeSourceCount} 个专题来源、{datasetMetricCount} 项结构化指标、{topic.signal_count} 条线索，覆盖能源电力、数据中心需求和产业链协同等重点议题。</p>
        </div>
        <nav className={styles.viewSwitch} aria-label="世界脉络视图切换">
          <a href={worldHomeHref('geo-politics-daily')}>整体态势</a>
          <a href={worldMountedHref('/demo/asean')} aria-current="page">东盟专题</a>
        </nav>
      </header>

      <section className={styles.topicTabs} aria-label="东盟专题议题切换">
        <button className={`${styles.topicTab} ${activeIssue === 'all' ? styles.topicTabActive : ''}`} onClick={() => selectIssue('all')} type="button">
          <strong>全部</strong>
          <span>{topic.signal_count} 条</span>
        </button>
        {visibleIssueRows.map(({ issue, count }, index) => (
          <button
            key={`${issue}:${index}`}
            className={`${styles.topicTab} ${activeIssue === issue ? styles.topicTabActive : ''}`}
            onClick={() => selectIssue(issue)}
            type="button"
          >
            <strong>{TOPIC_LABELS[issue]}</strong>
            <span>{count} 条</span>
          </button>
        ))}
      </section>

      <section className={styles.stage}>
        <section className={styles.mapStage}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>区域范围</span>
              <h2>东盟成员国与重点通道</h2>
              <p>
                {selectedCountry
                  ? `${selectedCountry}：${selectedCountryCount} 条相关线索。`
                  : activeIssue === 'all'
                    ? `${topic.signal_count} 条线索、${datasetMetricCount} 项指标、${contributingSourceCount} 个有效来源。`
                    : `${TOPIC_LABELS[activeIssue]}：${activeIssueCount} 条线索，${ISSUE_DESCRIPTIONS[activeIssue]}。`}
              </p>
            </div>
            <span className={styles.timeBadge}><Timer size={14} />更新 {shortTime(topic.generated_at)}</span>
          </div>
          <div className={styles.mapOverviewGrid}>
            <TimelinePanel timelineItems={timelineItems} visibleTimelineCount={visibleTimelineCount} />
            <div className={styles.mapOverviewMain}>
              <AseanMap topic={topic} activeIssue={activeIssue} selectedCountry={selectedCountry} onCountry={selectCountry} />
              <div className={styles.countryFocus}>
                {countryFocusRows.map((country, index) => (
                  <button
                    type="button"
                    key={`${country.label}:${index}`}
                    onClick={() => selectCountry(country.label)}
                    className={selectedCountry === country.label ? styles.countryFocusActive : ''}
                  >
                    <span>{country.label}</span>
                    <strong>{country.count}</strong>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DecisionModelPanel
            decisionModel={decisionModel}
            metrics={topic.dataset_metrics || []}
            series={topic.dataset_series || []}
            researchReports={savedResearchReports}
            sourceCount={contributingSourceCount}
            evidenceCount={validatedSourceCount}
            timelineCount={visibleTimelineCount}
            savedResearchCount={recentResearchCount}
            loading={decisionLoading}
            error={decisionError}
            onRefresh={() => void loadDecisionModel(true)}
          />
        </section>

        <aside className={styles.sideStack}>
          <SidePredictionModelBrief decisionModel={decisionModel} />
          <div className={styles.questionPanel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.kicker}>专题研究</span>
                <h2>研报对话</h2>
                <p>{datasetMetricCount} 项指标、{visibleTimelineCount} 条依据、{validatedSourceCount} 个来源、{mergedEvidenceCount} 条相近信息合并；已保存 {recentResearchCount} 份研判。</p>
              </div>
              <span className={`${styles.timeBadge} ${researchPending ? styles.researchLiveBadge : ''}`}>{latestResearchPhase}</span>
            </div>
            <div className={styles.researchBox}>
              <SavedResearchReports
                reports={savedResearchReports}
                selectedId={selectedSavedResearchId}
                onSelect={selectSavedResearch}
              />
              {!researchPending && recommendedResearchQuestions.length ? (
                <div className={styles.researchSuggestionBlock} aria-label="推荐研究问题">
                  <div className={styles.researchSuggestionHeader}>
                    <span>推荐问题</span>
                    <b>{recommendedResearchQuestions.length} 个</b>
                  </div>
                  <div className={styles.researchSuggestions}>
                    {recommendedResearchQuestions.map((item, index) => (
                      <button type="button" key={`${item.question}:${index}`} onClick={() => chooseResearchQuestion(item.question)}>
                        <strong>{item.question}</strong>
                        {item.sourceCount ? <em>{item.sourceCount} 条依据</em> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {researchMessages.length ? (
                <div className={styles.researchDialog} aria-live="polite" aria-busy={researchPending} ref={researchDialogRef} onScroll={handleResearchDialogScroll}>
                  {researchMessages.map((message) => {
                  const references = [...(message.references || []), ...(message.web_sites || [])]
                    .map(normalizeResearchSourceItem)
                    .filter((item): item is { title: string; url: string; snippet: string } => Boolean(item?.url && /^https?:\/\//iu.test(item.url)));
                  const linkedSourcePhase = [...(message.phases || [])]
                    .reverse()
                    .find((phase) => /^已关联来源\s+\d+\s*个$/u.test(phase));
                  const linkedSourceCount = message.source_count || sourceCountFromPhases(message.phases) || references.length;
                  const streaming = message.status === 'streaming' && researchPending;
                  const answerText = message.error || message.content;
                  const waitingText = researchWaitingFallback({
                    role: message.role,
                    pending: researchPending,
                    references,
                    linkedSourceCount,
                  });
                  const visiblePhases = publicResearchPhases(message.phases);
                  const progressText = publicProgressContent(message.progress_content, linkedSourceCount);
                  const hasAnswerText = Boolean(answerText.trim());
                  const showProgress = message.role === 'assistant' && !hasAnswerText && (streaming || Boolean(progressText));
                  const showAnswer = Boolean(answerText.trim()) || (!showProgress && Boolean(waitingText));
                  const sourcePendingLabel = message.progress_phase === '研究规划' ? '确认研究范围' : '核验公开证据';
                  const sourcePendingStatus = message.progress_phase === '研究规划' ? '确认中' : '核验中';
                  if (message.persisted && message.role === 'assistant') {
                    const firstLine = message.content.split('\n').find((line) => line.startsWith('研究问题：')) || '已保存研判';
                    const question = savedResearchTitle(firstLine.replace(/^研究问题：/u, '')) || '已保存研判';
                    const body = message.content.replace(firstLine, '').trim();
                    const archiveSourceCount = message.source_count || references.length;
                    return (
                      <details className={styles.researchArchiveCard} key={message.id}>
                        <summary>
                          <span>已保存研判</span>
                          <strong>{question}</strong>
                          <em>{archiveSourceCount ? `${archiveSourceCount} 条依据` : '依据已保存'}</em>
                        </summary>
                        <div className={styles.researchArchiveBody}>
                          <p>{researchExcerpt(body, 180)}</p>
                          <div className={styles.researchArchiveFull}>
                            {renderResearchContent(body || message.content, '', false, styles.researchAnswerContent)}
                          </div>
                        </div>
                      </details>
                    );
                  }
                  return (
                    <div className={`${styles.researchMessage} ${message.role === 'user' ? styles.researchMessageUser : styles.researchMessageAssistant} ${streaming ? styles.researchMessageStreaming : ''}`} key={message.id}>
                      <small>
                        {message.role === 'user' ? '研究问题' : '专题研究'}
                        {streaming ? <span className={styles.researchLiveDot}>研判中</span> : null}
                      </small>
                      {visiblePhases.length && !showAnswer ? (
                        <div className={styles.researchPhases}>
                          {visiblePhases.map((phase, index) => <span key={`${phase}:${index}`}>{phase}</span>)}
                        </div>
                      ) : null}
                      {showProgress ? (
                        <div className={styles.researchProgressBlock}>
                          <span>{publicResearchPhase(message.progress_phase || '') || '研判过程'}</span>
                          {renderResearchContent(progressText, waitingText, streaming, styles.researchProgressText)}
                        </div>
                      ) : null}
                      {showAnswer ? renderResearchContent(answerText, waitingText, streaming, styles.researchAnswerContent) : null}
                      {references.length ? (
                        <div className={styles.researchRefs}>
                          <span>
                            {linkedSourceCount > references.length
                              ? `可打开来源 ${references.length} 个 / 证据 ${linkedSourceCount} 条`
                              : `可打开来源 ${references.length} 个`}
                            {streaming ? <b>更新中</b> : null}
                          </span>
                          {references.slice(0, 8).map((item, index) => (
                            <a className={styles.researchSourceLink} href={item.url || '#'} target="_blank" rel="noreferrer" key={`${item.url || item.title || index}`}>
                              <strong>{item.title || item.url || `来源 ${index + 1}`}</strong>
                              <span>{researchSourceHost(item.url)}</span>
                              {item.snippet ? <em>{item.snippet}</em> : null}
                            </a>
                          ))}
                        </div>
                      ) : linkedSourcePhase && !showAnswer ? (
                        <div className={`${styles.researchRefs} ${styles.researchRefsResolved}`}>
                          <span>已纳入证据 {linkedSourceCount || ''} 条<b>已完成</b></span>
                          <em>公开证据已完成初筛，正在生成正式答复。</em>
                        </div>
                      ) : message.status === 'streaming' && researchPending ? (
                        <div className={`${styles.researchRefs} ${styles.researchRefsPending}`}>
                          <span>{sourcePendingLabel} <b>{sourcePendingStatus}</b></span>
                        </div>
                      ) : null}
                    </div>
                  );
                  })}
                </div>
              ) : activeSavedResearchEntry ? (
                <div className={`${styles.researchDialog} ${styles.researchSavedReadout}`} aria-label="已保存研判阅读区" ref={researchDialogRef} onScroll={handleResearchDialogScroll}>
                  <article className={`${styles.researchMessage} ${styles.researchMessageAssistant}`}>
                    <small>已保存研判</small>
                    <h3>{savedResearchTitle(activeSavedResearchEntry.report.question)}</h3>
                    {renderResearchContent(activeSavedResearchEntry.report.content, '', false, styles.researchAnswerContent)}
                    {activeSavedResearchReferences.length ? (
                      <div className={styles.researchRefs}>
                        <span>
                          {activeSavedResearchSourceCount > activeSavedResearchReferences.length
                            ? `可打开来源 ${activeSavedResearchReferences.length} 个 / 证据 ${activeSavedResearchSourceCount} 条`
                            : `可打开来源 ${activeSavedResearchReferences.length} 个`}
                        </span>
                        {researchSourceItems(activeSavedResearchReferences, 8).map((item, index) => (
                          <a className={styles.researchSourceLink} href={item.url || '#'} target="_blank" rel="noreferrer" key={`${item.url || item.title}:${index}`}>
                            <strong>{item.title || item.host || `来源 ${index + 1}`}</strong>
                            <span>{item.host || '公开来源'}</span>
                            {item.snippet ? <em>{item.snippet}</em> : null}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                </div>
              ) : null}
              <div className={styles.researchComposerDock}>
                <label className={styles.researchComposer}>
                  <span>研究问题或补充范围</span>
                  <textarea
                    ref={researchInputRef}
                    value={researchInput}
                    onChange={(event) => setResearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault();
                        void runResearch();
                      }
                    }}
                    rows={3}
                    placeholder="例如：重点看越南、泰国、新加坡和马来西亚；时间范围为未来三年；输出给政策研判会使用。"
                  />
                </label>
                <div className={styles.researchActions}>
                  {researchPending ? (
                    <button
                      type="button"
                      className={styles.researchSecondaryAction}
                      onClick={stopResearch}
                    >
                      <Square size={12} />停止
                    </button>
                  ) : null}
                  <button type="button" onClick={runResearch} disabled={researchPending || !researchInput.trim()}>
                    {researchPending ? '研究中' : <><Send size={14} />发送</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
