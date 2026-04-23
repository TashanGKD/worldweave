import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = args.get('--base-url') || 'http://127.0.0.1:5000';
const model = args.get('--model') || 'MiniMax-M2.5';
const xiaId = args.get('--xia-id') || 'hermes-minimax';
const contributorLabel = args.get('--label') || 'Hermes / MiniMax-M2.5';
const limit = Number(args.get('--limit') || 10);
const timeoutSec = Number(args.get('--timeout-sec') || 180);
const cacheDir = path.join(root, '.cache');
const hermesRepo = path.join(root, 'research', 'external-repos', 'hermes-agent');
const python = path.join(root, '.hermes-venv', 'Scripts', 'python.exe');
const envFile = path.join(root, '.env.local');
const runsPath = path.join(cacheDir, 'hermes-world-backfill-resolved-runs.jsonl');
const progressPath = path.join(cacheDir, 'hermes-world-backfill-resolved-progress.log');

function log(line) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.appendFileSync(progressPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
}

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim();
  }
  return out;
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function readExistingQuestionIds() {
  const ids = new Set();
  const files = [
    path.join(cacheDir, 'world-livebench-votes.jsonl'),
    runsPath,
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if ((item.xia_id === xiaId || item.vote?.xia_id === xiaId) && (item.question_id || item.vote?.question_id)) {
          ids.add(item.question_id || item.vote.question_id);
        }
      } catch {
        // Ignore partial log lines.
      }
    }
  }
  return ids;
}

function sanitize(text, max = 280) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/official_outcome|resolved_outcome|brier|hit_rate|scorecard|probability_yes/gi, '')
    .trim()
    .slice(0, max);
}

function historicalCreatedAt(question) {
  const cutoff = Date.parse(question.resolve_at || question.close_at || question.official_resolved_at || question.updated_at);
  if (!Number.isFinite(cutoff)) return new Date(Date.now() - 3600000).toISOString();
  return new Date(Math.max(0, cutoff - 6 * 3600000)).toISOString();
}

function parseHermesOutput(output) {
  const text = output
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^session_id:/i.test(line.trim()))
    .join('\n')
    .trim();
  const sideMatch = text.match(/^SIDE:\s*(yes|no)\s*$/im);
  const predictionMatch = text.match(/^PREDICTION:\s*(.+)$/im);
  const whyMatch = text.match(/^WHY:\s*(.+)$/im);
  const changeMatch = text.match(/^CHANGE:\s*(.+)$/im);
  const reflectionMatch = text.match(/^REFLECTION:\s*(.+)$/im);
  const side = sideMatch?.[1]?.toLowerCase();
  return {
    text,
    side,
    prediction: sanitize(predictionMatch?.[1], 220),
    why: sanitize(whyMatch?.[1], 320),
    change: sanitize(changeMatch?.[1], 220),
    reflection: sanitize(reflectionMatch?.[1], 220),
    session: output.match(/session_id:\s*(\S+)/)?.[1] || null,
  };
}

function promptFor(question) {
  const title = sanitize(question.title, 360);
  const background = sanitize(question.background || question.moderator_line || question.resolution_criteria, 520);
  const rule = sanitize(question.resolution_criteria || question.settlement_rule || '按题面给出的时间窗和条件判断。', 360);
  const topic = sanitize(question.topic_label || '未分类', 80);
  const region = sanitize(question.region_label || '未标注', 80);
  const resolveAt = sanitize(question.resolve_at || question.close_at || '', 80);
  return `You are Hermes running the World source skill historical replay.

This is a leakage-safe replay. You must act as if the current date is before the question deadline.
You may use only the cleaned question package below. Do not use settlement results, later news, current evaluation, current source status, platform price, crowd probability, other xia, or any fact after the deadline.

Cleaned question package:
title: ${title}
background: ${background || '题面没有额外背景，只能按标题、规则和时间窗判断。'}
rule: ${rule}
topic: ${topic}
region: ${region}
deadline: ${resolveAt}

Return exactly five plain text lines, no markdown, no extra text:
SIDE: yes or no
PREDICTION: one short Simplified Chinese sentence
WHY: one concrete Simplified Chinese reason grounded in title, rule, time window, or visible background
CHANGE: one concrete condition that would change the judgment
REFLECTION: one short sentence about what source habit this replay trains

Rules:
- Do not mention platform names, question ids, probabilities, odds, vote counts, official outcomes, scores, or backtest.
- Do not say you know the result.
- If the package lacks direct evidence, say the visible information is insufficient and make a conservative judgment.
- The wrapper will submit the vote; you must not call any API.`;
}

async function submitVote(question, parsed) {
  const body = {
    question_id: question.question_id,
    xia_id: xiaId,
    source: 'xia',
    contributor_kind: 'xia',
    contributor_label: contributorLabel,
    origin_url: `${baseUrl}/api/v1/world/livebench/questions/${encodeURIComponent(question.question_id)}?scene=global&audience=xia`,
    side: parsed.side,
    human_readable_prediction: parsed.prediction || (parsed.side === 'yes' ? '我判断这件事会在题面时间窗内发生。' : '我判断这件事不会在题面时间窗内发生。'),
    human_readable_why: parsed.why || '题面可见信息不足，先按保守方向判断。',
    what_changes_my_mind: parsed.change || '如果出现直接满足题面条件的可靠信源，我会改判。',
    created_at: historicalCreatedAt(question),
    historical_backfill: true,
  };
  const response = await fetch(`${baseUrl}/api/v1/world/livebench/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  if (!fs.existsSync(hermesRepo)) throw new Error(`Hermes repo not found: ${hermesRepo}`);
  if (!fs.existsSync(python)) throw new Error(`Hermes python not found: ${python}`);
  const env = readEnv(envFile);
  const existing = readExistingQuestionIds();
  log(`start base_url=${baseUrl} limit=${limit} existing=${existing.size}`);

  const questions = await getJson(`${baseUrl}/api/v1/world/livebench/questions?scene=global&status=resolved&limit=200`);
  const candidates = questions
    .filter((question) => question?.question_id && question.settlement_status === 'resolved')
    .filter((question) => !existing.has(question.question_id))
    .slice(0, Math.max(0, limit));
  log(`candidates=${candidates.length} resolved_total=${questions.length}`);

  const results = [];
  for (const question of candidates) {
    const promptPath = path.join(cacheDir, `hermes-backfill-prompt-${Buffer.from(question.question_id).toString('hex').slice(0, 20)}.txt`);
    fs.writeFileSync(promptPath, promptFor(question), 'utf8');
    log(`hermes:start question_id=${question.question_id}`);
    const startedAt = Date.now();
    const completed = spawnSync(
      python,
      ['-m', 'hermes_cli.main', 'chat', '-q', fs.readFileSync(promptPath, 'utf8'), '--model', model, '--max-turns', '3', '--yolo', '-Q'],
      {
        cwd: hermesRepo,
        env: {
          ...process.env,
          HERMES_HOME: path.join(hermesRepo, '.hermes-world-test'),
          OPENAI_API_KEY: env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY,
          OPENAI_BASE_URL: env.MINIMAX_BASE_URL || process.env.OPENAI_BASE_URL,
          HERMES_INFERENCE_PROVIDER: 'custom',
          HERMES_GIT_BASH_PATH: 'C:\\Program Files\\Git\\bin\\bash.exe',
          NO_COLOR: '1',
        },
        encoding: 'utf8',
        timeout: timeoutSec * 1000,
      },
    );
    const output = `${completed.stdout || ''}\n${completed.stderr || ''}`.trim();
    const parsed = parseHermesOutput(output);
    if (completed.status !== 0 || !['yes', 'no'].includes(parsed.side || '')) {
      const failure = {
        timestamp: new Date().toISOString(),
        ok: false,
        submitted: false,
        reason: completed.error?.message || `hermes_exit_${completed.status}`,
        question_id: question.question_id,
        title: question.title,
        hermes_output: output,
      };
      fs.appendFileSync(runsPath, `${JSON.stringify(failure)}\n`, 'utf8');
      results.push(failure);
      log(`hermes:failed question_id=${question.question_id} status=${completed.status}`);
      continue;
    }
    try {
      const vote = await submitVote(question, parsed);
      const record = {
        timestamp: new Date().toISOString(),
        ok: true,
        submitted: true,
        elapsed_ms: Date.now() - startedAt,
        question_id: question.question_id,
        title: question.title,
        xia_id: xiaId,
        side: vote.side,
        vote_id: vote.vote_id,
        created_at: vote.created_at,
        brier_score: vote.brier_score,
        points_delta: vote.points_delta,
        session: parsed.session,
        prediction: parsed.prediction,
        why: parsed.why,
        reflection: parsed.reflection,
      };
      fs.appendFileSync(runsPath, `${JSON.stringify(record)}\n`, 'utf8');
      results.push(record);
      log(`submitted question_id=${question.question_id} side=${vote.side} brier=${vote.brier_score}`);
    } catch (error) {
      const failure = {
        timestamp: new Date().toISOString(),
        ok: false,
        submitted: false,
        reason: error instanceof Error ? error.message : String(error),
        question_id: question.question_id,
        title: question.title,
        hermes_output: output,
      };
      fs.appendFileSync(runsPath, `${JSON.stringify(failure)}\n`, 'utf8');
      results.push(failure);
      log(`submit:failed question_id=${question.question_id} error=${failure.reason}`);
    }
  }

  console.log(JSON.stringify({
    ok: results.every((item) => item.ok),
    requested_limit: limit,
    resolved_total: questions.length,
    candidate_count: candidates.length,
    submitted_count: results.filter((item) => item.submitted).length,
    failed_count: results.filter((item) => !item.ok).length,
    results,
  }, null, 2));
}

main().catch((error) => {
  log(`fatal ${error instanceof Error ? error.message : String(error)}`);
  console.error(error);
  process.exit(1);
});
