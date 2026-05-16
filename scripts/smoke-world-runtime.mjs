import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const baseUrl = process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const scene = process.env.WORLD_SMOKE_SCENE || 'global';
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
  const sourceMonitorDb = sourceStatusJson.source_monitor_db || null;
  const signals = collectSignals(stateJson);
  const lowInformationCount = signals.filter(isLowInformationSignal).length;
  const aiSignalCount = signals.filter(isAiSignal).length;

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
    (databaseConfigured && sourceMonitorDb?.connected !== true) ||
    (scene === 'tech-ai' && aiSignalCount === 0)
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
