import http from 'node:http';

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

const appBaseUrl = process.env.WORLD_HEALTH_BASE_URL || 'http://127.0.0.1:5000';
const minimaxBaseUrl = process.env.MINIMAX_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.minimaxi.com/anthropic';
const minimaxApiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const minimaxModel = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
const embeddingModel = process.env.WORLD_ARENA_EMBEDDING_MODEL || 'Qwen3-Embedding-8B';
const minimaxApiStyle = (process.env.MINIMAX_API_STYLE || process.env.MINIMAX_API || '').trim().toLowerCase();

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

    req.setTimeout(15000, () => {
      req.destroy(new Error(`timeout while requesting ${url}`));
    });
    req.on('error', reject);
  });
}

async function checkApp() {
  const home = await fetchText(`${appBaseUrl}/`);
  const market = await fetchText(`${appBaseUrl}/api/v1/world/market-snapshot`);
  const marketJson = JSON.parse(market.body);
  return {
    homeStatus: home.status,
    homeLooksHtml: home.body.includes('<!DOCTYPE html>'),
    marketStatus: market.status,
    marketSource: marketJson.source_name,
    marketTradeDate: marketJson.latest_trade_date,
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
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }
    return {
      ok: true,
      model: payload.model,
      text: payload.choices?.[0]?.message?.content || '',
      usage: payload.usage || null,
    };
  }

  const client = new Anthropic({
    apiKey: minimaxApiKey,
    baseURL: minimaxBaseUrl,
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
  });

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
}

async function checkEmbedding() {
  if (!minimaxApiKey || !(minimaxApiStyle === 'openai-completions' || minimaxApiStyle === 'openai' || minimaxApiStyle === 'chat-completions')) {
    return {
      ok: false,
      skipped: true,
      reason: 'embedding check requires OpenAI-compatible MiniMax settings',
    };
  }

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
  return {
    ok: response.ok && Array.isArray(vector) && vector.length > 0,
    status: response.status,
    model: embeddingModel,
    dimension: Array.isArray(vector) ? vector.length : null,
    error: response.ok ? null : payload?.error?.message || payload?.error?.code || null,
  };
}

function checkEnvironment() {
  return {
    minimaxApiStyle: minimaxApiStyle || 'anthropic',
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
    summary.minimax.ok === false
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
