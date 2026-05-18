import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const baseUrl = process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const scenes = ['global', 'geo-politics-daily', 'tech-ai'];

function request(pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const req = http.request(url, { method: 'GET' }, (res) => {
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

    req.setTimeout(20000, () => {
      req.destroy(new Error(`timeout while requesting ${url.toString()}`));
    });
    req.on('error', reject);
    req.end();
  });
}

function assert(condition, message, context = {}) {
  if (!condition) {
    const error = new Error(message);
    error.context = context;
    throw error;
  }
}

function isArray(value) {
  return Array.isArray(value);
}

function signalHasInternalScoring(signal) {
  const raw = JSON.stringify(signal);
  return raw.includes('upstream_score') || raw.includes('upstream:score:');
}

function validateEvidenceSignal(signal, scene, collection) {
  assert(isArray(signal.tags), 'signal.tags must be an array', { scene, collection, id: signal.id });
  assert(isArray(signal.alignment_tags), 'signal.alignment_tags must be an array', { scene, collection, id: signal.id });
  assert(!signalHasInternalScoring(signal), 'public signal must not expose upstream scoring', {
    scene,
    collection,
    id: signal.id,
  });
  assert(typeof signal.title === 'string' && signal.title.trim().length > 0, 'signal.title must be readable text', {
    scene,
    collection,
    id: signal.id,
  });
}

function validateState(scene, state) {
  assert(isArray(state.nodes), 'state.nodes must be an array', { scene });
  assert(isArray(state.top_signals), 'state.top_signals must be an array', { scene });
  assert(isArray(state.knowledge_signals), 'state.knowledge_signals must be an array', { scene });
  assert(isArray(state.graph_signals), 'state.graph_signals must be an array', { scene });
  assert(isArray(state.pending_question_previews), 'state.pending_question_previews must be an array', { scene });
  assert(isArray(state.resolved_question_previews), 'state.resolved_question_previews must be an array', { scene });
  assert(isArray(state.what_to_do_next), 'state.what_to_do_next must be an array', { scene });
  assert(isArray(state.quick_links), 'state.quick_links must be an array', { scene });
  assert(typeof state.metrics === 'object' && state.metrics !== null, 'state.metrics must exist', { scene });

  for (const node of state.nodes) {
    assert(isArray(node.tags), 'node.tags must be an array', { scene, node_id: node.node_id });
    assert(isArray(node.alignment_tags), 'node.alignment_tags must be an array', { scene, node_id: node.node_id });
    assert(isArray(node.activities), 'node.activities must be an array', { scene, node_id: node.node_id });
    assert(!signalHasInternalScoring(node), 'public node must not expose upstream scoring', { scene, node_id: node.node_id });
  }

  for (const signal of state.top_signals) {
    validateEvidenceSignal(signal, scene, 'top_signals');
  }
  for (const signal of state.graph_signals) {
    validateEvidenceSignal(signal, scene, 'graph_signals');
  }

  if (state.source_catalog) {
    assert(isArray(state.source_catalog.hubs), 'source_catalog.hubs must be an array', { scene });
    assert(isArray(state.source_catalog.overflow_pools), 'source_catalog.overflow_pools must be an array', { scene });
    assert(isArray(state.source_catalog.intake_summary?.next_batch), 'source_catalog.intake_summary.next_batch must be an array', { scene });
  }
}

function validateLiveBenchQuestions(scene, payload) {
  const questions = isArray(payload) ? payload : payload.questions;
  assert(isArray(questions), 'livebench questions must be an array', { scene });
  for (const question of questions) {
    assert(typeof question.title === 'string' && question.title.trim().length > 0, 'question.title must be readable text', {
      scene,
      question_id: question.question_id,
    });
  }
  return questions;
}

function validateExplain(scene, payload) {
  assert(typeof payload === 'object' && payload !== null, 'explain payload must be an object', { scene });
  assert(!JSON.stringify(payload).includes('upstream:score:'), 'explain payload must not expose upstream scoring', { scene });
}

function validateSubworlds(subworlds) {
  assert(isArray(subworlds), 'subworlds must be an array');
  for (const world of subworlds) {
    assert(isArray(world.matched_tags), 'subworld.matched_tags must be an array', { key: world.key });
    assert(isArray(world.recommended_bundles || []), 'subworld.recommended_bundles must be an array when present', { key: world.key });
  }
}

async function main() {
  const summary = [];

  const subworldsRes = await request('/api/v1/world/subworlds');
  assert(subworldsRes.status === 200, 'subworlds endpoint failed', { status: subworldsRes.status });
  const subworldsJson = JSON.parse(subworldsRes.body);
  validateSubworlds(subworldsJson.subworlds || []);

  for (const scene of scenes) {
    const stateRes = await request(`/api/v1/world/state?scene=${encodeURIComponent(scene)}`);
    assert(stateRes.status === 200, 'state endpoint failed', { scene, status: stateRes.status });
    const stateJson = JSON.parse(stateRes.body);
    validateState(scene, stateJson);

    const questionsRes = await request(`/api/v1/world/livebench/questions?scene=${encodeURIComponent(scene)}&limit=8`);
    assert(questionsRes.status === 200, 'livebench questions endpoint failed', { scene, status: questionsRes.status });
    const questionsJson = JSON.parse(questionsRes.body);
    const questions = validateLiveBenchQuestions(scene, questionsJson);

    const explainRes = await request(`/api/v1/world/explain?scene=${encodeURIComponent(scene)}`);
    assert(explainRes.status === 200, 'explain endpoint failed', { scene, status: explainRes.status });
    const explainJson = JSON.parse(explainRes.body);
    validateExplain(scene, explainJson);

    summary.push({
      scene,
      nodeCount: stateJson.nodes.length,
      topSignalCount: stateJson.top_signals.length,
      graphSignalCount: stateJson.graph_signals.length,
      livebenchQuestionCount: questions.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        baseUrl,
        scenes: summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        context: error?.context || null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
