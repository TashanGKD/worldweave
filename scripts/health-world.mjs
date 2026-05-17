import http from 'node:http';

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

const appBaseUrl = process.env.WORLD_HEALTH_BASE_URL || 'http://127.0.0.1:5000';
const minimaxBaseUrl = process.env.MINIMAX_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.scnet.cn/api/llm/v1';
const minimaxApiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const minimaxModel = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
const embeddingModel = process.env.WORLD_ARENA_EMBEDDING_MODEL || 'Qwen3-Embedding-8B';
const minimaxApiStyle = (process.env.MINIMAX_API_STYLE || process.env.MINIMAX_API || 'openai-completions').trim().toLowerCase();
const databaseConfigured = Boolean(process.env.WORLDWEAVE_DATABASE_URL || process.env.DATABASE_URL);
const appRequestTimeoutMs = Number(process.env.WORLD_HEALTH_APP_TIMEOUT_MS || 45000);

function classifyRemoteError(status, message) {
  const text = String(message || '');
  if (status === 429 || /rate|quota|maximum limit|too many/i.test(text)) return 'rate_limited';
  if (status && status >= 500) return 'upstream_error';
  if (/timeout|aborted|ECONNRESET|fetch failed/i.test(text)) return 'network_or_timeout';
  return 'failed';
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
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
    });

    req.setTimeout(appRequestTimeoutMs, () => {
      req.destroy(new Error(`timeout while requesting ${url}`));
    });
    req.on('error', reject);
  });
}

function parseJsonPayload(label, response) {
  try {
    return {
      ok: true,
      json: JSON.parse(response.body),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      json: null,
      error: `${label} returned non-json body: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function checkApp() {
  const home = await fetchText(`${appBaseUrl}/`);
  const market = await fetchText(`${appBaseUrl}/api/v1/world/market-snapshot`);
  const sourceStatus = await fetchText(`${appBaseUrl}/api/v1/world/source-knowledge/status?scene=global`);
  const mainSkill = await fetchText(`${appBaseUrl}/api/v1/openclaw/skill.md`);
  const aiHotSkill = await fetchText(`${appBaseUrl}/api/v1/openclaw/aihot.skill.md`);
  const techAiState = await fetchText(`${appBaseUrl}/api/v1/world/state?scene=tech-ai`);
  const marketPayload = parseJsonPayload('market-snapshot', market);
  const sourceStatusPayload = parseJsonPayload('source-knowledge/status', sourceStatus);
  const techAiStatePayload = parseJsonPayload('world/state tech-ai', techAiState);
  const marketJson = marketPayload.json || {};
  const sourceStatusJson = sourceStatusPayload.json || {};
  const techAiStateJson = techAiStatePayload.json || {};
  return {
    homeStatus: home.status,
    homeLooksHtml: home.body.includes('<!DOCTYPE html>'),
    marketStatus: market.status,
    marketJsonOk: marketPayload.ok,
    marketJsonError: marketPayload.error,
    marketSource: marketJson.source_name,
    marketTradeDate: marketJson.latest_trade_date,
    sourceStatusStatus: sourceStatus.status,
    sourceStatusJsonOk: sourceStatusPayload.ok,
    sourceStatusJsonError: sourceStatusPayload.error,
    sourceFreshness: sourceStatusJson.source_health?.freshness_status || null,
    sourceSignalCount: sourceStatusJson.signal_count || 0,
    sourceStableCount: sourceStatusJson.source_health?.stable_source_count || 0,
    databaseConfigured,
    databaseConnected: sourceStatusJson.source_monitor_db?.connected ?? null,
    databaseSnapshotTableReady: sourceStatusJson.source_monitor_db?.snapshot_table_ready ?? null,
    mainSkillStatus: mainSkill.status,
    mainSkillLooksCurrent: mainSkill.body.includes('name: world-threads'),
    aiHotSkillStatus: aiHotSkill.status,
    aiHotSkillLooksCurrent: aiHotSkill.body.includes('AI Hot') && aiHotSkill.body.includes('/topiclab/source-feed/articles'),
    techAiStateStatus: techAiState.status,
    techAiStateJsonOk: techAiStatePayload.ok,
    techAiStateJsonError: techAiStatePayload.error,
    techAiStateError: techAiStateJson.error || null,
    techAiTopSignalCount: Array.isArray(techAiStateJson.top_signals) ? techAiStateJson.top_signals.length : 0,
  };
}

async function checkMiniMax() {
  if (!minimaxApiKey) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing API key',
    };
  }

  if (minimaxApiStyle === 'openai-completions' || minimaxApiStyle === 'openai' || minimaxApiStyle === 'chat-completions') {
    try {
      const response = await fetch(`${minimaxBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: minimaxModel,
          max_tokens: 64,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: '你好' },
          ],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = payload?.error?.message || payload?.error?.code || `HTTP ${response.status}`;
        return {
          ok: false,
          degraded: true,
          status: response.status,
          reason: classifyRemoteError(response.status, error),
          error,
        };
      }
      return {
        ok: true,
        model: payload.model,
        text: payload.choices?.[0]?.message?.content || '',
        usage: payload.usage || null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        degraded: true,
        status: null,
        reason: classifyRemoteError(null, message),
        error: message,
      };
    }
  }

  const client = new Anthropic({
    apiKey: minimaxApiKey,
    baseURL: minimaxBaseUrl,
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
  });

  try {
    const response = await client.messages.create(
      {
        model: minimaxModel,
        max_tokens: 64,
        system: 'You are a helpful assistant.',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: '你好' }],
          },
        ],
      },
      { timeout: 30000 },
    );

    return {
      ok: true,
      model: response.model,
      text: response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n'),
      usage: response.usage,
    };
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      degraded: true,
      status,
      reason: classifyRemoteError(status, message),
      error: message,
    };
  }
}

async function checkEmbedding() {
  if (!minimaxApiKey || !(minimaxApiStyle === 'openai-completions' || minimaxApiStyle === 'openai' || minimaxApiStyle === 'chat-completions')) {
    return {
      ok: false,
      skipped: true,
      reason: 'embedding check requires OpenAI-compatible MiniMax settings',
    };
  }

  try {
    const response = await fetch(`${minimaxBaseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${minimaxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: ['World source skill embedding health check'],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const vector = payload?.data?.[0]?.embedding;
    const error = response.ok ? null : payload?.error?.message || payload?.error?.code || null;
    return {
      ok: response.ok && Array.isArray(vector) && vector.length > 0,
      degraded: !response.ok,
      status: response.status,
      model: embeddingModel,
      dimension: Array.isArray(vector) ? vector.length : null,
      reason: response.ok ? null : classifyRemoteError(response.status, error),
      error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      degraded: true,
      status: null,
      model: embeddingModel,
      dimension: null,
      reason: classifyRemoteError(null, message),
      error: message,
    };
  }
}

function checkEnvironment() {
  return {
    minimaxApiStyle,
    minimaxBaseUrl,
    minimaxBaseUrlLooksRight: Boolean(minimaxBaseUrl),
    hasProxy:
      Boolean(process.env.http_proxy) ||
      Boolean(process.env.HTTP_PROXY) ||
      Boolean(process.env.https_proxy) ||
      Boolean(process.env.HTTPS_PROXY),
    proxyValues: {
      http_proxy: process.env.http_proxy || null,
      HTTP_PROXY: process.env.HTTP_PROXY || null,
      https_proxy: process.env.https_proxy || null,
      HTTPS_PROXY: process.env.HTTPS_PROXY || null,
    },
  };
}

async function main() {
  const summary = {
    checkedAt: new Date().toISOString(),
    environment: checkEnvironment(),
    app: await checkApp(),
    minimax: await checkMiniMax(),
    embedding: await checkEmbedding(),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (
    !summary.environment.minimaxBaseUrlLooksRight ||
    !summary.app.homeLooksHtml ||
    summary.app.homeStatus !== 200 ||
    summary.app.marketStatus !== 200 ||
    !summary.app.marketJsonOk ||
    summary.app.sourceStatusStatus !== 200 ||
    !summary.app.sourceStatusJsonOk ||
    summary.app.sourceSignalCount <= 0 ||
    summary.app.sourceStableCount <= 0 ||
    summary.app.mainSkillStatus !== 200 ||
    !summary.app.mainSkillLooksCurrent ||
    summary.app.aiHotSkillStatus !== 200 ||
    !summary.app.aiHotSkillLooksCurrent ||
    summary.app.techAiStateStatus !== 200 ||
    !summary.app.techAiStateJsonOk ||
    summary.app.techAiTopSignalCount <= 0 ||
    (databaseConfigured && summary.app.databaseConnected !== true) ||
    (summary.minimax.ok === false && !summary.minimax.degraded)
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
