import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const baseUrl = process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const scene = process.env.WORLD_SMOKE_SCENE || 'global';

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

    req.setTimeout(60000, () => {
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
  const home = await request('/');
  const skill = await request(`/api/v1/openclaw/skill.md`);
  const state = await request(`/api/v1/world/state?scene=${encodeURIComponent(scene)}`);
  const sourceStatus = await request(`/api/v1/world/source-knowledge/status?scene=${encodeURIComponent(scene)}`);
  const questions = await request(`/api/v1/world/livebench/questions?scene=${encodeURIComponent(scene)}`);
  const evaluation = await request(`/api/v1/world/livebench/evaluation?scene=${encodeURIComponent(scene)}`);
  const topiclabSource = await request(`/api/v1/topiclab/source-feed/articles?limit=3&source_type=worldweave-signal`);
  const stateJson = JSON.parse(state.body);
  const sourceStatusJson = JSON.parse(sourceStatus.body);
  const questionsJson = JSON.parse(questions.body);
  const evaluationJson = JSON.parse(evaluation.body);
  const topiclabSourceJson = JSON.parse(topiclabSource.body);

  const questionList = Array.isArray(questionsJson) ? questionsJson : questionsJson.questions || questionsJson.list || [];
  const platformModel = evaluationJson.platform_model || {};
  const sourceList = Array.isArray(topiclabSourceJson.list) ? topiclabSourceJson.list : [];

  const failures = [];
  if (home.status !== 200 || !home.body.includes('<!DOCTYPE html>')) failures.push('home');
  if (skill.status !== 200 || !skill.body.includes('name: world-threads')) failures.push('skill');
  if (state.status !== 200 || !Array.isArray(stateJson.nodes)) failures.push('state');
  if (sourceStatus.status !== 200 || !sourceStatusJson.indexed_signal_count) failures.push('source-status');
  if (questions.status !== 200 || questionList.length === 0) failures.push('livebench-questions');
  if (evaluation.status !== 200 || typeof platformModel.resolved_question_count !== 'number') failures.push('evaluation');
  if (topiclabSource.status !== 200 || sourceList.length === 0) failures.push('topiclab-source-feed');

  const summary = {
    checkedAt: new Date().toISOString(),
    scene,
    ok: failures.length === 0,
    failures,
    endpoints: {
      home: home.status,
      skill: skill.status,
      state: state.status,
      sourceStatus: sourceStatus.status,
      questions: questions.status,
      evaluation: evaluation.status,
      topiclabSourceFeed: topiclabSource.status,
    },
    state: {
      nodeCount: stateJson.nodes?.length || 0,
      topSignalCount: stateJson.top_signals?.length || 0,
      generatedAt: stateJson.generated_at || null,
    },
    sourceKnowledge: {
      signalCount: sourceStatusJson.signal_count || 0,
      indexedSignalCount: sourceStatusJson.indexed_signal_count || 0,
      latestSignalPublishedAt: sourceStatusJson.latest_signal_published_at || null,
      embeddingBackend: sourceStatusJson.last_embedding_backend || null,
    },
    livebench: {
      questionCount: questionList.length,
      resolvedQuestionCount: platformModel.resolved_question_count || 0,
      scoredQuestionCount: platformModel.scored_question_count || 0,
      avgBrier: platformModel.avg_brier ?? null,
      hitRate: platformModel.hit_rate ?? null,
    },
    topiclabSourceFeed: {
      returned: sourceList.length,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
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
