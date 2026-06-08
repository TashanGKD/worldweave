import http from 'node:http';

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : 'true');
    result[key] = value;
    if (inlineValue == null && next && !next.startsWith('--')) index += 1;
  }
  return result;
}

const cliArgs = parseCliArgs(process.argv.slice(2));
const baseUrl = cliArgs.baseUrl || process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const badPublicPattern = /XGBoost|训练案例|内部验证|验证集|MAE|MAPE|R²|RMSE|feature_importance|metrics_by_product|feature_names|"split"|model_type|model_id|API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY|不等同于|下一步：|后续需接入/iu;
const topicPublicPattern = /\bconfigured\b|\bfallback\b|\bmode\b|API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY/iu;
const researchPublicPattern = /\bconfigured\b|\bfallback\b|\bmodel\b|\bmode\b|API_KEY|DASHSCOPE_API_KEY|MINIMAX_API_KEY|DEEPSEEK_API_KEY/iu;

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: data,
            url: url.toString(),
          });
        });
      },
    );

    req.setTimeout(Number(options.timeoutMs || 25000), () => {
      req.destroy(new Error(`timeout while requesting ${url.toString()}`));
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function parseJson(response) {
  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new Error(`invalid JSON from ${response.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceCount(topic) {
  return topic?.source_processing?.contributing_source_count || topic?.source_processing?.active_source_count || 0;
}

function hasFormulaAndComponents(indicator) {
  return Boolean(indicator?.formula) && Array.isArray(indicator?.components) && indicator.components.length > 0;
}

async function main() {
  const [page, topicResponse, decisionResponse, researchResponse] = await Promise.all([
    request('/demo/asean'),
    request('/api/v1/world/asean?limit=80'),
    request('/api/v1/world/asean/decision-model'),
    request('/api/v1/world/asean/research'),
  ]);

  const topic = parseJson(topicResponse);
  const decision = parseJson(decisionResponse);
  const research = parseJson(researchResponse);
  const topicRaw = topicResponse.body;
  const decisionRaw = decisionResponse.body;
  const researchRaw = researchResponse.body;
  const pageText = page.body;

  const indicators = Array.isArray(decision.indicators) ? decision.indicators : [];
  const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]));
  const fuelForecast = decision.fuel_price_training || null;
  const fuelKeys = fuelForecast ? Object.keys(fuelForecast).sort() : [];
  const allowedFuelKeys = [
    'coverage_label',
    'deviation_points',
    'forecast_8_weeks',
    'generated_at',
    'latest_date',
    'limitations',
    'model_metrics',
    'public_readout',
    'quality_label',
    'series',
    'source',
    'trend_points',
  ].sort();

  const checks = {
    page: {
      status: page.status,
      hasAseanTitle: /东盟专题|世界脉络/u.test(pageText),
      noPublicLeak: !badPublicPattern.test(pageText),
    },
    topic: {
      status: topicResponse.status,
      sourceCount: sourceCount(topic),
      metricCount: Array.isArray(topic.dataset_metrics) ? topic.dataset_metrics.length : 0,
      timelineCount: Array.isArray(topic.timeline) ? topic.timeline.length : 0,
      hasSourceProcessing: Boolean(topic.source_processing),
      hasSearchReadyField: typeof topic.incremental_search?.search_ready === 'boolean',
      noConfiguredField: !Object.prototype.hasOwnProperty.call(topic.incremental_search || {}, 'configured'),
      noPublicConfigLeak: !topicPublicPattern.test(topicRaw),
    },
    decision: {
      status: decisionResponse.status,
      schema: decision.schema_version,
      indicatorCount: indicators.length,
      hasGreenFormula: hasFormulaAndComponents(indicatorById.get('green')),
      hasComputeFormula: hasFormulaAndComponents(indicatorById.get('compute')),
      hasPolicyFormula: hasFormulaAndComponents(indicatorById.get('policy')),
      hasFuelForecast: Boolean(fuelForecast),
      fuelKeyShape: fuelKeys.join(','),
      noTrainingLeak: !badPublicPattern.test(decisionRaw),
    },
    research: {
      status: researchResponse.status,
      suggestedQuestionCount: Array.isArray(research.suggested_questions) ? research.suggested_questions.length : 0,
      recentReportCount: Array.isArray(research.recent_reports) ? research.recent_reports.length : 0,
      noThreeParagraphPrompt: !JSON.stringify(research).includes('三段以内'),
      noPublicConfigLeak: !researchPublicPattern.test(researchRaw),
    },
  };

  assert(page.status === 200, 'ASEAN demo page did not return 200');
  assert(checks.page.hasAseanTitle, 'ASEAN demo page did not render expected title text');
  assert(checks.page.noPublicLeak, 'ASEAN demo page includes public-facing training/debug/API wording');
  assert(topicResponse.status === 200, 'ASEAN topic API did not return 200');
  assert(checks.topic.sourceCount >= 20, `ASEAN source count too low: ${checks.topic.sourceCount}`);
  assert(checks.topic.metricCount >= 100, `ASEAN metric count too low: ${checks.topic.metricCount}`);
  assert(checks.topic.timelineCount >= 20, `ASEAN timeline count too low: ${checks.topic.timelineCount}`);
  assert(checks.topic.hasSearchReadyField, 'ASEAN topic API is missing incremental_search.search_ready');
  assert(checks.topic.noConfiguredField, 'ASEAN topic API still exposes incremental_search.configured');
  assert(checks.topic.noPublicConfigLeak, 'ASEAN topic API includes config/fallback/mode/API wording');
  assert(decisionResponse.status === 200, 'ASEAN decision model API did not return 200');
  assert(decision.schema_version >= 10, `ASEAN decision schema is stale: ${decision.schema_version}`);
  assert(checks.decision.hasGreenFormula, 'green indicator is missing formula/components');
  assert(checks.decision.hasComputeFormula, 'compute indicator is missing formula/components');
  assert(checks.decision.hasPolicyFormula, 'policy indicator is missing formula/components');
  assert(checks.decision.hasFuelForecast, 'fuel cost forecast is missing');
  assert(fuelKeys.join('|') === allowedFuelKeys.join('|'), `fuel forecast exposes unexpected keys: ${fuelKeys.join(',')}`);
  assert(checks.decision.noTrainingLeak, 'decision model response includes training/debug/API wording');
  assert(researchResponse.status === 200, 'ASEAN research API did not return 200');
  assert(checks.research.suggestedQuestionCount >= 3, 'ASEAN research suggestions are missing');
  assert(checks.research.noThreeParagraphPrompt, 'research suggestions still include the old three-paragraph prompt');
  assert(checks.research.noPublicConfigLeak, 'research status response includes config/model/fallback/API wording');

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    baseUrl,
    checks,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    checkedAt: new Date().toISOString(),
    baseUrl,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
