import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function readSource(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('worldHref preserves hash fragments and mounted route helpers target the TopicLab mount', () => {
  const source = readSource('src/components/world-ui.tsx');

  assert.match(source, /return `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`;/);
  assert.match(source, /export function worldMountedHref\(href: string, scene: WorldScene = 'global'\)/);
  assert.match(source, /normalized === '\/worldweave' \|\| normalized\.startsWith\('\/worldweave\/'\)/);
  assert.match(source, /export function worldHomeHref\(scene: WorldScene = 'global', hash = ''\)/);
  assert.match(source, /return worldHref\(`\/worldweave\/\$\{normalizedHash\}`, scene\);/);
});

test('daily pages return to the mounted WorldWeave shell and keep daily tabs relative', () => {
  const source = readSource('src/app/daily/[kind]/page.tsx');

  assert.match(source, /href: worldHomeHref\('geo-politics-daily'\)/);
  assert.match(source, /href: worldHomeHref\('tech-ai'\)/);
  assert.match(source, /href: worldHomeHref\('global'\)/);
  assert.match(source, /<Link href="\.\/geo"/);
  assert.match(source, /<Link href="\.\/ai"/);
  assert.match(source, /<Link href="\.\/livebench"/);
  assert.doesNotMatch(source, /href:\s*'\.\.\/\??/);
});

test('secondary WorldWeave pages return through worldHomeHref instead of the host root', () => {
  for (const path of [
    'src/app/topiclab-preview/page.tsx',
    'src/app/source-knowledge/page.tsx',
    'src/app/livebench/evaluation/page.tsx',
    'src/app/livebench/[questionId]/page.tsx',
    'src/app/signals/[id]/page.tsx',
  ]) {
    const source = readSource(path);
    assert.match(source, /worldHomeHref/);
    assert.doesNotMatch(source, /href=\{worldHref\('\/(#arena-panel)?'/);
    assert.doesNotMatch(source, /href="\.\."/);
    assert.doesNotMatch(source, /href="\/"/);
  }
});

test('ASEAN demo navigation keeps all view links under the mounted WorldWeave route', () => {
  const source = readSource('src/app/demo/asean/asean-demo-client.tsx');

  assert.match(source, /import \{ worldHomeHref, worldMountedHref \} from '@\/components\/world-ui';/);
  assert.match(source, /<a href=\{worldHomeHref\('geo-politics-daily'\)\}>整体态势<\/a>/);
  assert.match(source, /<a href=\{worldMountedHref\('\/demo\/asean'\)\} aria-current="page">东盟专题<\/a>/);
  assert.doesNotMatch(source, /href="\/demo\/asean"/);
  assert.doesNotMatch(source, /window\.location\.assign\('\/\?scene=geo-politics-daily'\)/);
});

test('ASEAN entry redirects and dashboard cards use the mounted WorldWeave route', () => {
  const homePageSource = readSource('src/app/page.tsx');
  const dashboardSource = readSource('src/app/dashboard-client.tsx');

  assert.match(homePageSource, /redirect\('\/worldweave\/demo\/asean'\);/);
  assert.match(dashboardSource, /const aseanTopicHref = worldMountedHref\('\/demo\/asean'\);/);
  assert.match(dashboardSource, /href: aseanTopicHref,/);
  assert.match(dashboardSource, /href=\{aseanTopicHref\}/);
  assert.doesNotMatch(dashboardSource, /href="\/demo\/asean"/);
});

test('ASEAN right-column model and research panels share the same width contract', () => {
  const styles = readSource('src/app/demo/asean/asean-demo.module.css');

  assert.match(styles, /Keep the right-column model and research panels on the same grid edge/);
  assert.match(styles, /\.sideStack \.sideModelPanel,\r?\n\.sideStack \.questionPanel \{\r?\n  align-self: stretch;\r?\n\}/);

  for (const selector of [
    '.stage .sideStack',
    '.sideStack .sideModelPanel',
    '.sideStack .questionPanel',
    '.sideStack .researchBox',
    '.sideStack .researchDialog',
    '.sideStack .savedResearchPanel',
    '.sideStack .researchSuggestionBlock',
  ]) {
    assert.ok(styles.includes(selector), `${selector} should share the right-column width guard`);
  }
});

test('/worldweave compatibility route preserves query parameters before redirecting home', () => {
  const source = readSource('src/app/worldweave/page.tsx');

  assert.match(source, /redirect\(query \? `\/\?\$\{query\}` : '\/'\);/);
  assert.match(source, /search\.append\(key, item\);/);
  assert.match(source, /search\.set\(key, value\);/);
});

test('/worldweave nested compatibility route preserves path and query parameters', () => {
  const source = readSource('src/app/worldweave/[...path]/page.tsx');

  assert.match(source, /const pathname = `\/\$\{path\.map\(\(item\) => encodeURIComponent\(item\)\)\.join\('\/'\)\}`;/);
  assert.match(source, /redirect\(query \? `\$\{pathname\}\?\$\{query\}` : pathname\);/);
  assert.match(source, /search\.append\(key, item\);/);
  assert.match(source, /search\.set\(key, value\);/);
});

test('public skill URLs preserve mounted API prefixes and public HTTPS', () => {
  const originSource = readSource('src/lib/request-origin.ts');

  assert.match(originSource, /export function resolveRequestBaseUrl/);
  assert.match(originSource, /pathname\.indexOf\('\/api\/v1\/'\)/);
  assert.match(originSource, /inferProtocol\(host\) === 'https'/);
  assert.match(originSource, /export function resolvePublicBaseUrl/);

  for (const path of [
    'src/app/api/v1/openclaw/skill.md/route.ts',
    'src/app/api/v1/openclaw/aihot.skill.md/route.ts',
    'src/app/api/v1/openclaw/sources.skill.md/route.ts',
    'src/app/api/v1/openclaw/livebench.skill.md/route.ts',
    'src/app/api/v1/openclaw/evaluation.skill.md/route.ts',
    'src/app/api/v1/world/state/route.ts',
  ]) {
    const source = readSource(path);
    assert.match(source, /resolvePublicBaseUrl/);
  }
});

test('scene-filtered world state uses the public signal quality gate', () => {
  const routeSource = readSource('src/app/api/v1/world/state/route.ts');
  const signalsRouteSource = readSource('src/app/api/v1/world/signals/route.ts');
  const topiclabRouteSource = readSource('src/app/api/v1/topiclab/source-feed/articles/route.ts');
  const recallRouteSource = readSource('src/app/api/v1/world/source-knowledge/recall/route.ts');
  const homePageSource = readSource('src/app/page.tsx');
  const dailyPageSource = readSource('src/app/daily/[kind]/page.tsx');
  const detailPageSource = readSource('src/app/signals/[id]/page.tsx');
  const qualitySource = readSource('src/lib/world/signal-quality.ts');

  assert.match(routeSource, /isPublicEventSignal\(signal\) && dashboardSignalMatchesScene\(signal, scene\)/);
  assert.match(signalsRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(topiclabRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(recallRouteSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(homePageSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(dailyPageSource, /\.filter\(isPublicEventSignal\)/);
  assert.match(detailPageSource, /!isPublicEventSignal/);
  assert.match(qualitySource, /looksLikeTemplatedSignalCopy/);
  assert.ok(qualitySource.includes('/出现新的[^。]{1,16}(?:信号|消息)/u.test(text)'));
  assert.match(qualitySource, /本轮前几条标题\|该分类收录约\|当前样本累计/);
});

test('AI News Radar is ingested through the selected source pipeline', () => {
  const runtimeSource = readSource('src/lib/world/runtime.ts');
  const dashboardSource = readSource('src/lib/world/dashboard-presentation.ts');
  const stateRouteSource = readSource('src/app/api/v1/world/state/route.ts');

  assert.match(runtimeSource, /latest-24h\.json/);
  assert.match(runtimeSource, /function normalizeAiNewsRadarSnapshot/);
  assert.match(runtimeSource, /source:ai-news-radar/);
  assert.match(runtimeSource, /daily:ai/);
  assert.match(runtimeSource, /AI_NEWS_RADAR_PER_SITE_LIMIT/);
  assert.match(dashboardSource, /source:ai-news-radar/);
  assert.match(stateRouteSource, /source:ai-news-radar/);
});

test('daily poster export uses model curation, title fallback dedupe, and a DOM-backed png download', () => {
  const dailyPageSource = readSource('src/app/daily/[kind]/page.tsx');
  const posterSource = readSource('src/app/daily/daily-share-poster.tsx');
  const runtimeSource = readSource('src/lib/world/runtime.ts');

  assert.match(runtimeSource, /export async function curateWorldDailySignals/);
  assert.match(runtimeSource, /requestLabel: `daily-curation-\$\{input\.kind\}`/);
  assert.match(runtimeSource, /display_title/);
  assert.match(runtimeSource, /display_summary/);
  assert.match(dailyPageSource, /await curateWorldDailySignals/);
  assert.match(dailyPageSource, /daily_display_title/);
  assert.match(dailyPageSource, /daily_display_summary/);
  assert.match(dailyPageSource, /function dedupeDailyVisibleTitles/);
  assert.match(posterSource, /function uniquePosterSignals/);
  assert.match(posterSource, /canvas\.toBlob/);
  assert.match(posterSource, /document\.body\.appendChild\(link\)/);
});

test('ASEAN topic filters existing signals and exposes range-based forecast questions separately', () => {
  const aseanSource = readSource('src/lib/world/asean-topic.ts');
  const routeSource = readSource('src/app/api/v1/world/asean/route.ts');
  const demoPageSource = readSource('src/app/demo/asean/page.tsx');
  const demoClientSource = readSource('src/app/demo/asean/asean-demo-client.tsx');
  const aseanPageDataSource = readSource('src/lib/world/asean-page-data.ts');
  const aseanMetasoSource = readSource('src/lib/world/asean-metaso-search.ts');
  const aseanSourceFeedsSource = readSource('src/lib/world/asean-source-feeds.ts');
  const aseanPublicRiskSource = readSource('src/lib/world/asean-public-risk-events.ts');
  const aseanDatasetMetricsSource = readSource('src/lib/world/asean-dataset-metrics.ts');
  const aseanDeepResearchSource = readSource('src/lib/world/asean-deep-research.ts');
  const aseanResearchRouteSource = readSource('src/app/api/v1/world/asean/research/route.ts');
  const aseanRefreshScriptSource = readSource('scripts/asean-metaso-refresh.mjs');
  const aseanSmokeSource = readSource('scripts/smoke-asean-demo.mjs');
  const aseanReadinessScriptSource = readSource('scripts/asean-github-readiness.mjs');
  const aseanFuelTrainingScriptSource = readSource('scripts/asean_train_fuel_price.py');
  const aseanModelDataReportSource = readSource('scripts/asean-model-data-report.mjs');
  const aseanDecisionModelSource = readSource('src/lib/world/asean-decision-model.ts');
  const packageSource = readSource('package.json');
  const appPageSource = readSource('src/app/page.tsx');
  const dashboardSource = readSource('src/lib/world/dashboard-presentation.ts');
  const runtimeSource = readSource('src/lib/world/runtime.ts');
  const subworldsSource = readSource('src/app/api/v1/world/subworlds/route.ts');
  const envExampleSource = readSource('.env.example');

  assert.match(aseanSource, /export function isAseanSignal/);
  assert.match(aseanSource, /range_options: string\[\]/);
  assert.match(aseanSource, /question_id: 'asean-maritime-incident-count-14d'/);
  assert.match(aseanSource, /question_id: 'asean-trade-policy-count-30d'/);
  assert.match(aseanSource, /resolution_rule/);
  assert.match(aseanSource, /export function buildAseanGraph/);
  assert.match(aseanSource, /ASEAN_SOURCE_POOL/);
  assert.match(aseanSource, /ASEAN News RSS/);
  assert.match(aseanSource, /Singapore MPA Media Releases RSS/);
  assert.match(aseanSource, /CSIS AMTI RSS/);
  assert.match(aseanSource, /ReCAAP ISC Alerts/);
  assert.match(aseanSource, /AHA Centre/);
  assert.match(aseanSource, /ASEAN Centre for Energy/);
  assert.match(aseanSource, /ACE ASEAN Power Grid Updates 2025/);
  assert.match(aseanSource, /ACE ASEAN Energy Statistics Leaflet 2025/);
  assert.match(aseanSource, /ASEAN Sustainable Data Centre Guide/);
  assert.match(aseanSource, /ASEAN Digital Masterplan 2030/);
  assert.match(aseanSource, /ASEAN Digital Economy Framework Agreement Summary/);
  assert.match(aseanSource, /ASEAN Guide on AI Governance and Ethics/);
  assert.match(aseanSource, /ASEAN Expanded AI Guide on Generative AI/);
  assert.match(aseanSource, /ASEAN Responsible AI Roadmap 2025-2030/);
  assert.match(aseanSource, /AMRO RSS/);
  assert.match(aseanSource, /ASEAN Centre for Biodiversity RSS/);
  assert.match(aseanSource, /US-ASEAN Business Council RSS/);
  assert.match(aseanSource, /World Bank ASEAN GDP/);
  assert.match(aseanSource, /World Bank ASEAN Electric Power Consumption/);
  assert.match(aseanSource, /World Bank ASEAN Secure Internet Servers/);
  assert.match(aseanSource, /World Bank ASEAN High-Technology Exports/);
  assert.match(aseanSource, /World Bank ASEAN FDI Net Inflows/);
  assert.match(aseanSource, /World Bank ASEAN Trade Openness/);
  assert.match(aseanSource, /Malaysia OpenAPI Fuel Price/);
  assert.match(aseanSource, /Malaysia OpenAPI Electricity Supply/);
  assert.match(aseanSource, /Malaysia OpenAPI Industrial Production Index/);
  assert.match(aseanSource, /Philippines PSA OpenSTAT Energy/);
  assert.match(aseanSource, /Philippines PSA OpenSTAT ICT/);
  assert.match(aseanSource, /Philippines PSA OpenSTAT Approved Investment/);
  assert.match(aseanSource, /Singapore Data\.gov Electricity Generation And Consumption/);
  assert.match(aseanSource, /Singapore Data\.gov Electricity Accounts by Sub-sector/);
  assert.match(aseanSource, /Singapore Data\.gov Monthly Electricity Tariffs/);
  assert.match(aseanSource, /Singapore Data\.gov Electricity Tariff Components/);
  assert.match(aseanSource, /Singapore IMDA Green DC Roadmap/);
  assert.match(aseanSource, /Thailand EPPO Quarterly Energy RSS/);
  assert.match(aseanSource, /Timor-Leste Government RSS/);
  assert.match(aseanSource, /ANTARA Business & Investment RSS/);
  assert.match(aseanSource, /Cambodia CDC RSS/);
  assert.match(aseanSource, /Open Development Cambodia Electricity/);
  assert.match(aseanSource, /Brunei Department of Energy Efficiency Handbook/);
  assert.match(aseanSource, /Brunei Department of Energy Net Metering Guideline/);
  assert.match(aseanSource, /GDACS Disaster Alerts RSS/);
  assert.match(aseanSource, /USGS Earthquake GeoJSON M4\.5\+/);
  assert.match(aseanSource, /NASA EONET Open Events/);
  assert.match(aseanSource, /earthquake\.usgs\.gov/);
  assert.match(aseanSource, /gsfc\.nasa\.gov/);
  assert.match(aseanSource, /GDELT Doc ASEAN Query/);
  assert.match(aseanSource, /IMF PortWatch/);
  assert.match(aseanSource, /OpenSky Network States API/);
  assert.match(aseanSource, /AviationStack Flights API/);
  assert.match(aseanSource, /dedupe_key/);
  assert.match(aseanSource, /allowed_node_types/);
  assert.match(aseanSource, /hub_policy/);
  assert.match(routeSource, /readAseanTopic/);
  assert.match(routeSource, /force: url\.searchParams\.get\('fresh'\) === '1'/);
  assert.match(routeSource, /limit,/);
  assert.match(routeSource, /量化区间研判问题/);
  assert.match(demoPageSource, /readAseanTopic\(\)/);
  assert.match(aseanPageDataSource, /readAseanMetasoSignals/);
  assert.match(aseanPageDataSource, /readAseanSourceFeedSignals/);
  assert.match(aseanPageDataSource, /readAseanPublicRiskSignals/);
  assert.match(aseanPageDataSource, /readAseanDatasetMetricState/);
  assert.match(aseanPageDataSource, /datasetMetrics: datasetMetricState\.metrics/);
  assert.match(aseanPublicRiskSource, /GDACS Disaster Alerts RSS/);
  assert.match(aseanPublicRiskSource, /USGS Earthquake GeoJSON M4\.5\+/);
  assert.match(aseanPublicRiskSource, /NASA EONET Open Events/);
  assert.match(aseanPublicRiskSource, /source:asean-public-risk/);
  assert.match(aseanPublicRiskSource, /ASEAN_BOUNDS/);
  assert.match(aseanDatasetMetricsSource, /WORLD_ASEAN_DATASET_METRICS/);
  assert.match(aseanDatasetMetricsSource, /source:asean-dataset/);
  assert.match(aseanDatasetMetricsSource, /extractWorldBankMetrics/);
  assert.match(aseanDatasetMetricsSource, /extractDataGovSgMetrics/);
  assert.match(aseanDeepResearchSource, /qwen-deep-research/);
  assert.match(aseanDeepResearchSource, /DASHSCOPE_API_KEY/);
  assert.match(aseanDeepResearchSource, /X-DashScope-SSE/);
  assert.match(aseanDeepResearchSource, /buildAseanResearchContext/);
  assert.match(aseanDeepResearchSource, /runQwenDeepResearchStream/);
  assert.match(aseanResearchRouteSource, /suggested_questions/);
  assert.match(aseanResearchRouteSource, /runQwenDeepResearch/);
  assert.match(aseanResearchRouteSource, /text\/event-stream/);
  assert.doesNotMatch(aseanResearchRouteSource, /configured:\s*config\.configured/);
  assert.doesNotMatch(aseanResearchRouteSource, /mode:\s*'topic-research'|mode:\s*'research'|mode:\s*'dialogue'/);
  assert.doesNotMatch(aseanResearchRouteSource, /status:\s*'fallback'|local-source-research|fallbackConclusion|buildLocalResearchFallback/);
  assert.match(aseanDeepResearchSource, /专题实体关系约束/);
  assert.doesNotMatch(aseanResearchRouteSource, /light_rag|lightrag|LightRAG/);
  assert.doesNotMatch(aseanDeepResearchSource, /asean-lightrag|LightRAG/);
  assert.match(aseanSourceFeedsSource, /WORLD_ASEAN_SOURCE_FEED_TTL_MINUTES/);
  assert.match(aseanSourceFeedsSource, /source:asean-feed/);
  assert.match(aseanSourceFeedsSource, /hasAseanScope/);
  assert.match(aseanSourceFeedsSource, /WORLD_ASEAN_SOURCE_FEED_LIMIT \|\| 18/);
  assert.match(aseanSourceFeedsSource, /piracy\|robbery\|coast guard/);
  assert.match(aseanSourceFeedsSource, /AMRO\|AHA Centre/);
  assert.match(aseanSourceFeedsSource, /Thailand EPPO/);
  assert.match(aseanSourceFeedsSource, /พลังงาน/);
  assert.match(aseanMetasoSource, /ASEAN_METASO_KEYWORDS/);
  assert.match(aseanMetasoSource, /ASEAN_TARGETED_SEARCHES/);
  assert.match(aseanMetasoSource, /axisForQuery/);
  assert.match(aseanMetasoSource, /axis: 'energy_power'/);
  assert.match(aseanMetasoSource, /axis: 'compute_data_center'/);
  assert.match(aseanMetasoSource, /axis: 'maritime_ports'/);
  assert.match(aseanMetasoSource, /axis: 'public_risk'/);
  assert.match(aseanMetasoSource, /axis_counts/);
  assert.match(aseanMetasoSource, /aseanenergy/);
  assert.match(aseanMetasoSource, /worldbank/);
  assert.match(aseanMetasoSource, /data\\\.gov\\\.sg/);
  assert.match(aseanMetasoSource, /WORLD_ASEAN_METASO_TTL_MINUTES/);
  assert.match(aseanMetasoSource, /search_ready: Boolean\(API_KEY\)/);
  assert.doesNotMatch(aseanMetasoSource, /configured: Boolean\(API_KEY\)/);
  assert.match(aseanMetasoSource, /source:topic-only/);
  assert.match(aseanRefreshScriptSource, /search_ready/);
  assert.doesNotMatch(aseanRefreshScriptSource, /configured/);
  assert.match(aseanSmokeSource, /topicPublicPattern/);
  assert.match(aseanSmokeSource, /incremental_search\.search_ready/);
  assert.match(aseanSmokeSource, /noConfiguredField/);
  assert.match(aseanSmokeSource, /ASEAN topic API still exposes incremental_search\.configured/);
  assert.match(packageSource, /"asean:readiness": "node \.\/scripts\/asean-github-readiness\.mjs"/);
  assert.match(aseanReadinessScriptSource, /id: 'topic-api'/);
  assert.match(aseanReadinessScriptSource, /src\/lib\/world\/asean-metaso-search\.ts/);
  assert.match(aseanReadinessScriptSource, /id: 'demo-ui'/);
  assert.match(aseanReadinessScriptSource, /id: 'research'/);
  assert.match(aseanReadinessScriptSource, /id: 'decision-model'/);
  assert.match(aseanReadinessScriptSource, /id: 'verification'/);
  assert.match(aseanReadinessScriptSource, /staged_generated_artifacts/);
  assert.match(aseanReadinessScriptSource, /--group/);
  assert.match(aseanReadinessScriptSource, /selected_group/);
  assert.match(aseanReadinessScriptSource, /suggested_git_add/);
  assert.match(aseanReadinessScriptSource, /ungroupedChanges\.length/);
  [
    'WORLD_ASEAN_DEEP_RESEARCH_FALLBACK_SOURCE_MIN',
    'WORLD_ASEAN_METASO_QUERY_SIZE',
    'WORLD_ASEAN_METASO_MAX_ITEMS',
    'WORLD_ASEAN_METASO_TIMEOUT_MS',
    'WORLD_ASEAN_METASO_ALLOWED_HOSTS',
    'WORLD_ASEAN_SOURCE_FEEDS',
    'WORLD_ASEAN_SOURCE_FEED_TIMEOUT_MS',
    'WORLD_ASEAN_SOURCE_FEED_PER_SOURCE_LIMIT',
    'WORLD_ASEAN_PUBLIC_RISK_EVENTS',
    'WORLD_ASEAN_PUBLIC_RISK_TIMEOUT_MS',
    'WORLD_ASEAN_DATASET_METRICS',
    'WORLD_ASEAN_DATASET_METRIC_TIMEOUT_MS',
    'WORLD_ASEAN_DATASET_FETCH_ATTEMPTS',
    'WORLD_ASEAN_DATASET_FETCH_CONCURRENCY',
    'WORLD_ASEAN_INCLUDE_EXTENDED_DATASETS',
    'WORLD_ASEAN_REFRESH_LIMIT',
  ].forEach((envName) => {
    assert.match(envExampleSource, new RegExp(`^${envName}=`, 'm'));
  });
  assert.match(aseanFuelTrainingScriptSource, /fuel-price-forecast\.json/);
  assert.doesNotMatch(aseanFuelTrainingScriptSource, /OUTPUT_FILE = OUTPUT_DIR \/ "fuel-price-xgboost\.json"/);
  assert.match(aseanFuelTrainingScriptSource, /malaysia-fuel-price-weekly-forecast/);
  assert.doesNotMatch(aseanFuelTrainingScriptSource, /malaysia-fuel-price-xgboost-weekly/);
  assert.match(aseanDecisionModelSource, /fuel-price-forecast\.json/);
  assert.match(aseanDecisionModelSource, /LEGACY_FUEL_PRICE_TRAINING_PATH/);
  assert.match(aseanDecisionModelSource, /malaysia-fuel-price-weekly-forecast/);
  assert.match(aseanDecisionModelSource, /malaysia-fuel-price-xgboost-weekly/);
  assert.match(aseanModelDataReportSource, /fuel-price-forecast\.json/);
  assert.match(aseanModelDataReportSource, /LEGACY_FUEL_PRICE_FORECAST_FILE/);
  assert.doesNotMatch(demoClientSource, /decisionModel\?\.(?:configured\b|model\b|mode\b|fallback\b)/);
  assert.match(appPageSource, /scene === 'asean'/);
  assert.match(demoClientSource, /东盟成员国与重点通道/);
  assert.match(demoClientSource, /指标走势/);
  assert.match(demoClientSource, /高紧急/);
  assert.match(demoClientSource, /需关注/);
  assert.match(demoClientSource, /常态监测/);
  assert.match(demoClientSource, /图层/);
  assert.match(demoClientSource, /海上通道/);
  assert.match(demoClientSource, /visibleMapLayers/);
  assert.doesNotMatch(demoClientSource, /国家数据面板/);
  assert.match(demoClientSource, /关键指标/);
  assert.match(demoClientSource, /oneMonthSeriesPoints/);
  assert.match(aseanDatasetMetricsSource, /extractArraySeries/);
  assert.match(aseanDatasetMetricsSource, /extractDataGovSgSeries/);
  assert.match(aseanDatasetMetricsSource, /extractWorldBankSeries/);
  assert.doesNotMatch(demoClientSource, /监测完备度/);
  assert.doesNotMatch(demoClientSource, /国家覆盖/);
  assert.doesNotMatch(demoClientSource, /来源结构/);
  assert.doesNotMatch(demoClientSource, /议题分布/);
  assert.doesNotMatch(demoClientSource, /关系图谱/);
  assert.doesNotMatch(demoClientSource, /CONTEXT_ACTOR/);
  assert.match(aseanSource, /actor:china/);
  assert.match(aseanSource, /validation_summary/);
  assert.match(aseanSource, /source:asean-public-risk/);
  assert.match(aseanSource, /collection_axes/);
  assert.match(aseanSource, /能源电力/);
  assert.match(aseanSource, /算力与数据中心/);
  assert.match(aseanSource, /港口航运与通道/);
  assert.match(aseanSource, /source_processing/);
  assert.match(aseanSource, /buildAseanSourceProcessing/);
  assert.match(aseanSource, /run_selected_source_count/);
  assert.match(aseanSource, /ready_unselected_source_count/);
  assert.match(aseanSource, /buildAseanTimeline/);
  assert.match(aseanSource, /research_blueprints/);
  assert.match(aseanSource, /earthquake\|flood\|typhoon/);
  assert.match(aseanSource, /asean-ai-compute-projects-60d/);
  assert.match(aseanSource, /asean-electricity-price-policy-45d/);
  assert.match(aseanSource, /credibility_score/);
  assert.match(demoClientSource, /dataset_metric_status/);
  assert.doesNotMatch(demoClientSource, /采集重点/);
  assert.doesNotMatch(demoClientSource, /axisStatus_/);
  assert.doesNotMatch(demoClientSource, /信源处理/);
  assert.doesNotMatch(demoClientSource, /degraded_source_count/);
  assert.match(demoClientSource, /研报对话/);
  assert.doesNotMatch(demoClientSource, /operationMetrics/);
  assert.doesNotMatch(demoClientSource, /专题运行数据/);
  assert.doesNotMatch(demoClientSource, /researchContext/);
  assert.doesNotMatch(demoClientSource, /dataRail/);
  assert.match(demoClientSource, /mapTimelinePanel/);
  assert.match(demoClientSource, /东盟重点国家关键指标/);
  assert.match(demoClientSource, /sideStack/);
  assert.match(demoClientSource, /researchSuggestions/);
  assert.match(demoClientSource, /researchDialog/);
  assert.match(demoClientSource, /研究问题或补充范围/);
  assert.match(demoClientSource, /text\/event-stream/);
  assert.doesNotMatch(demoClientSource, /获取范围确认/);
  assert.doesNotMatch(demoClientSource, /生成研究报告/);
  assert.doesNotMatch(demoClientSource, /处理链路/);
  assert.doesNotMatch(demoClientSource, /地图仅呈现东盟成员国/);
  assert.match(demoClientSource, /个有效来源/);
  assert.match(dashboardSource, /scene === 'asean'/);
  assert.match(runtimeSource, /normalizedScene === 'asean'/);
  assert.match(subworldsSource, /key: 'asean'/);
});
