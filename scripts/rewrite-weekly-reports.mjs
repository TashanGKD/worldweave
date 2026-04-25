import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

const historyPath = path.resolve(process.cwd(), '.cache/world-runtime-history.json');
const minimaxBaseUrl = process.env.MINIMAX_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.scnet.cn/api/llm/v1';
const minimaxApiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const minimaxModel = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
const minimaxApiStyle = (process.env.MINIMAX_API_STYLE || process.env.MINIMAX_API || 'openai-completions').trim().toLowerCase();
const weeklyWindowMs = 7 * 24 * 60 * 60 * 1000;
const limitArg = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0');
const offsetArg = Number(process.argv.find((arg) => arg.startsWith('--offset='))?.split('=')[1] || '0');
const reportIds = process.argv.filter((arg) => arg.startsWith('--report-id=')).map((arg) => arg.split('=')[1]).filter(Boolean);

function normalizeText(value) {
  return String(value || '')
    .replace(/<\/(?:PAST|CURRENT|FUTURE|SUMMARY|WATCH|WHY)>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrompt(report) {
  return [
    '你在重写一条世界事件演绎，目标是让人一眼读懂，而不是保留系统腔。',
    '请只根据提供内容改写，不要增加新事实，不要提字段名，不要提模型、系统、映射、观察池、mention_count、intensity、score。',
    '不要输出 JSON。只输出下面 6 个标签段落，不要重复题目，不要解释：',
    '<PAST>...</PAST>',
    '<CURRENT>...</CURRENT>',
    '<FUTURE>...</FUTURE>',
    '<SUMMARY>...</SUMMARY>',
    '<WATCH>...</WATCH>',
    '<WHY>...</WHY>',
    '写作要求：',
    '1. past_report：一句话讲过去这条线已经发生了什么。',
    '2. current_analysis：一句话讲现在又出现了什么，因此为什么值得继续看。',
    '3. future_projection：一句话讲因此未来一周最可能发生什么。',
    '4. summary：20-50 字，像一条自然摘要。',
    '5. watch_next：一句话讲下一步继续盯什么，但也要像人话。',
    '6. why_readable：一句很短的话，说明你是如何把它改成人话的。',
    '7. 整体风格像人在看新闻后写判断：过去发生了 A，现在又出现 B，因此未来一周更可能出现 C。',
    '',
    `地区：${report.region}`,
    `主题：${report.topic_label || report.topic}`,
    `置信度：${Math.round((report.confidence || 0) * 100)}%`,
    `原 past_report：${normalizeText(report.past_report)}`,
    `原 current_analysis：${normalizeText(report.current_analysis)}`,
    `原 future_projection：${normalizeText(report.future_projection)}`,
    `原 summary：${normalizeText(report.summary)}`,
    `原 watch_next：${normalizeText(report.watch_next)}`,
  ].join('\n');
}

function extractLabeledSections(text) {
  const normalized = text.replace(/```[\s\S]*?\n?/g, '').trim();
  const read = (label) => {
    const regex = new RegExp(`<${label}>\\s*([\\s\\S]*?)(?=\\n\\s*<(?:PAST|CURRENT|FUTURE|SUMMARY|WATCH|WHY)>|$)`, 'i');
    return normalizeText(normalized.match(regex)?.[1] || '');
  };
  const parsed = {
    past_report: read('PAST'),
    current_analysis: read('CURRENT'),
    future_projection: read('FUTURE'),
    summary: read('SUMMARY'),
    watch_next: read('WATCH'),
    why_readable: read('WHY'),
  };
  if (!parsed.past_report || !parsed.current_analysis || !parsed.future_projection) {
    throw new Error(`Failed to parse labeled output: ${text.slice(0, 600)}`);
  }
  return parsed;
}

async function rewriteReport(client, report) {
  let text = '';
  if (minimaxApiStyle === 'openai-completions' || minimaxApiStyle === 'openai' || minimaxApiStyle === 'chat-completions') {
    const response = await fetch(`${minimaxBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${minimaxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: minimaxModel,
        max_tokens: 900,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You rewrite analytical Chinese text into natural, readable Chinese while preserving meaning.',
          },
          {
            role: 'user',
            content: buildPrompt(report),
          },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }
    text = payload.choices?.[0]?.message?.content || '';
  } else {
    const response = await client.messages.create(
      {
        model: minimaxModel,
        max_tokens: 900,
        temperature: 0.2,
        system:
          'You rewrite analytical Chinese text into natural, readable Chinese while preserving meaning. Always return strict JSON only.',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: buildPrompt(report) }],
          },
        ],
      },
      { timeout: 45000 },
    );

    text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  }

  const parsed = extractLabeledSections(text);
  return {
    past_report: normalizeText(parsed.past_report),
    current_analysis: normalizeText(parsed.current_analysis),
    future_projection: normalizeText(parsed.future_projection),
    summary: normalizeText(parsed.summary),
    watch_next: normalizeText(parsed.watch_next),
    why_readable: normalizeText(parsed.why_readable),
  };
}

async function main() {
  if (!minimaxApiKey) {
    throw new Error('Missing MINIMAX_API_KEY / ANTHROPIC_API_KEY');
  }
  if (!fs.existsSync(historyPath)) {
    throw new Error(`Missing history file: ${historyPath}`);
  }

  const client =
    minimaxApiStyle === 'openai-completions' || minimaxApiStyle === 'openai' || minimaxApiStyle === 'chat-completions'
      ? null
      : new Anthropic({
          apiKey: minimaxApiKey,
          baseURL: minimaxBaseUrl,
          defaultHeaders: {
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        });

  const payload = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const weeklyCandidates = reports
    .filter((report) => Date.now() - new Date(report.created_at).getTime() <= weeklyWindowMs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const candidates =
    reportIds.length > 0
      ? weeklyCandidates.filter((report) => reportIds.includes(report.report_id))
      : weeklyCandidates;
  const selected = limitArg > 0 ? candidates.slice(offsetArg, offsetArg + limitArg) : candidates.slice(offsetArg);
  const touched = [];

  for (const report of selected) {
    const rewritten = await rewriteReport(client, report);
    report.past_report = rewritten.past_report || report.past_report;
    report.current_analysis = rewritten.current_analysis || report.current_analysis;
    report.future_projection = rewritten.future_projection || report.future_projection;
    report.summary = rewritten.summary || report.summary;
    report.watch_next = rewritten.watch_next || report.watch_next;
    touched.push({
      report_id: report.report_id,
      region: report.region,
      confidence: report.confidence,
      why_readable: rewritten.why_readable,
    });
  }

  fs.writeFileSync(historyPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ rewritten: touched.length, touched }, null, 2));
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
