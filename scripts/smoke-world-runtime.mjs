import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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
const scene = cliArgs.scene || process.env.WORLD_SMOKE_SCENE || 'global';
const databaseConfigured = Boolean(process.env.WORLDWEAVE_DATABASE_URL || process.env.DATABASE_URL);

function collectSignals(stateJson) {
  return [
    ...(Array.isArray(stateJson.top_signals) ? stateJson.top_signals : []),
    ...(Array.isArray(stateJson.graph_signals) ? stateJson.graph_signals : []),
  ];
}

function signalText(signal) {
  return [
    signal?.id,
    signal?.source_name,
    signal?.display_title,
    signal?.display_summary,
    signal?.title,
    signal?.summary,
    Array.isArray(signal?.tags) ? signal.tags.join(' ') : '',
    Array.isArray(signal?.alignment_tags) ? signal.alignment_tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function isLowInformationSignal(signal) {
  return /model:low-information|^fallback-|fallback-|信源更新|结构化更新|Bundle Feed|Source Feed|Global Feed|当前接口返回了结构化|当前样本前几项包括|本轮前几条标题|标题清单/i.test(
    signalText(signal),
  );
}

function isAiSignal(signal) {
  return /source:aihot|aihot|model:ai-related|openai|anthropic|claude|gemini|deepseek|qwen|agent|llm|大模型|智能体|人工智能/i.test(
    signalText(signal),
  );
}

function isTechAiMismatch(signal) {
  const text = signalText(signal);
  const aiSource = /source:aihot|aihot|model:ai-related|daily:ai/i.test(text);
  const operationalSource =
    /scene:finance|\bfinance\b|\bmacro\b|alpha-vantage|openfda|treasury-yield|fda-database/i.test(text) ||
    (!aiSource && /catalog-source|source:selected-source/i.test(text));
  return (
    operationalSource ||
    /发送失败|违反相关法律法规|抓紧申报|马斯克.*抖音.*老干妈/i.test(text)
  );
}

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
          });
        });
      },
    );

    req.setTimeout(20000, () => {
      req.destroy(new Error(`timeout while requesting ${url.toString()}`));
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function main() {
  const state = await request(`/api/v1/world/state?scene=${encodeURIComponent(scene)}`);
  const livebench = await request(`/api/v1/world/livebench/questions?scene=${encodeURIComponent(scene)}&limit=8`);
  const sourceStatus = await request(`/api/v1/world/source-knowledge/status?scene=${encodeURIComponent(scene)}`);

  const stateJson = JSON.parse(state.body);
  const livebenchJson = JSON.parse(livebench.body);
  const sourceStatusJson = JSON.parse(sourceStatus.body);
  const sourceMonitorDb = sourceStatusJson.source_monitor_db || sourceStatusJson.database || null;
  const signals = collectSignals(stateJson);
  const lowInformationCount = signals.filter(isLowInformationSignal).length;
  const aiSignalCount = signals.filter(isAiSignal).length;
  const techAiMismatchCount = scene === 'tech-ai' ? signals.filter(isTechAiMismatch).length : 0;

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scene,
        state: {
          status: state.status,
          nodeCount: stateJson.nodes?.length || 0,
          topSignalCount: stateJson.top_signals?.length || 0,
          sourceHealth: stateJson.source_health?.freshness_status || null,
          lowInformationCount,
          aiSignalCount,
          techAiMismatchCount,
        },
        livebench: {
          status: livebench.status,
          questionCount: Array.isArray(livebenchJson.questions) ? livebenchJson.questions.length : Array.isArray(livebenchJson) ? livebenchJson.length : 0,
        },
        sourceStatus: {
          status: sourceStatus.status,
          freshness: sourceStatusJson.source_health?.freshness_status || sourceStatusJson.freshness_status || null,
          latestSignalPublishedAt:
            sourceStatusJson.latest_signal_published_at || sourceStatusJson.source_health?.latest_signal_published_at || null,
          databaseConfigured,
          databaseConnected: sourceMonitorDb?.connected ?? null,
          databaseSnapshotTableReady: sourceMonitorDb?.snapshot_table_ready ?? null,
        },
      },
      null,
      2,
    ),
  );

  if (
    state.status !== 200 ||
    livebench.status !== 200 ||
    sourceStatus.status !== 200 ||
    !Array.isArray(stateJson.top_signals) ||
    lowInformationCount > 0 ||
    (databaseConfigured && sourceMonitorDb?.connected === false) ||
    (scene === 'tech-ai' && (aiSignalCount === 0 || techAiMismatchCount > 0))
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
