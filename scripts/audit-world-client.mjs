import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const baseUrl = process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const scenes = ['global', 'war', 'technology', 'capacity', 'finance', 'health', 'weak-signal'];

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

function validateReport(report, scene) {
  assert(isArray(report.facts), 'report.facts must be an array', { scene, report_id: report.report_id });
  assert(isArray(report.projection), 'report.projection must be an array', { scene, report_id: report.report_id });
  assert(isArray(report.invalidators), 'report.invalidators must be an array', { scene, report_id: report.report_id });
  for (const [index, projection] of report.projection.entries()) {
    assert(isArray(projection.assumptions), 'projection.assumptions must be an array', {
      scene,
      report_id: report.report_id,
      projection_index: index,
    });
    assert(isArray(projection.invalidators), 'projection.invalidators must be an array', {
      scene,
      report_id: report.report_id,
      projection_index: index,
    });
  }
}

function validateState(scene, state) {
  assert(isArray(state.nodes), 'state.nodes must be an array', { scene });
  assert(isArray(state.top_signals), 'state.top_signals must be an array', { scene });
  assert(isArray(state.knowledge_signals), 'state.knowledge_signals must be an array', { scene });
  assert(isArray(state.graph_signals), 'state.graph_signals must be an array', { scene });
  assert(isArray(state.hotspot_reports), 'state.hotspot_reports must be an array', { scene });
  assert(isArray(state.exploration_reports), 'state.exploration_reports must be an array', { scene });
  assert(isArray(state.projection_reports), 'state.projection_reports must be an array', { scene });
  assert(isArray(state.graph_reports), 'state.graph_reports must be an array', { scene });
  assert(isArray(state.trails), 'state.trails must be an array', { scene });
  assert(typeof state.metrics === 'object' && state.metrics !== null, 'state.metrics must exist', { scene });
  assert(typeof state.validation_summary === 'object' && state.validation_summary !== null, 'state.validation_summary must exist', { scene });

  for (const node of state.nodes) {
    assert(isArray(node.tags), 'node.tags must be an array', { scene, node_id: node.node_id });
    assert(isArray(node.alignment_tags), 'node.alignment_tags must be an array', { scene, node_id: node.node_id });
    assert(isArray(node.activities), 'node.activities must be an array', { scene, node_id: node.node_id });
  }

  const reports = [
    ...state.hotspot_reports,
    ...state.exploration_reports,
    ...state.projection_reports,
    ...state.graph_reports,
  ];
  for (const report of reports) {
    validateReport(report, scene);
  }

  if (state.source_catalog) {
    assert(isArray(state.source_catalog.hubs), 'source_catalog.hubs must be an array', { scene });
    assert(isArray(state.source_catalog.overflow_pools), 'source_catalog.overflow_pools must be an array', { scene });
    assert(isArray(state.source_catalog.intake_summary?.next_batch), 'source_catalog.intake_summary.next_batch must be an array', { scene });
  }
}

function validateBriefing(scene, briefing) {
  assert(isArray(briefing.evidence_signals), 'briefing.evidence_signals must be an array', { scene });
  assert(isArray(briefing.pending_reference_reports || []), 'briefing.pending_reference_reports must be an array when present', { scene });
  assert(isArray(briefing.recommended_bundles || []), 'briefing.recommended_bundles must be an array when present', { scene });
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

    const briefingRes = await request(`/api/v1/world/briefing?scene=${encodeURIComponent(scene)}&xia_id=worldline-primary`);
    assert(briefingRes.status === 200, 'briefing endpoint failed', { scene, status: briefingRes.status });
    const briefingJson = JSON.parse(briefingRes.body);
    validateBriefing(scene, briefingJson);

    summary.push({
      scene,
      nodeCount: stateJson.nodes.length,
      graphReportCount: stateJson.graph_reports.length,
      pendingReferenceCount: (briefingJson.pending_reference_reports || []).length,
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
