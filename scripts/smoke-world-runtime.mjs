import http from 'node:http';

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const baseUrl = process.env.WORLD_SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const scene = process.env.WORLD_SMOKE_SCENE || 'global';
const xiaId = process.env.WORLD_SMOKE_XIA_ID || 'worldline-primary';
const shouldWriteReport = process.env.WORLD_SMOKE_WRITE_REPORT === '1';

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
  const stateJson = JSON.parse(state.body);

  const briefing = await request(`/api/v1/world/briefing?scene=${encodeURIComponent(scene)}&xia_id=${encodeURIComponent(xiaId)}`);
  const briefingJson = JSON.parse(briefing.body);

  const dispatch = await request('/api/v1/world/dispatch', {
    method: 'POST',
    body: {
      scene,
      xia_id: xiaId,
      mission_id: briefingJson.mission_id,
      briefing: briefingJson,
    },
  });
  const dispatchJson = JSON.parse(dispatch.body);

  let reportSummary = null;
  if (shouldWriteReport) {
    const report = await request('/api/v1/world/report', {
      method: 'POST',
      body: {
        scene,
        xia_id: xiaId,
        mission_id: dispatchJson.briefing.mission_id,
        briefing: dispatchJson.briefing,
      },
    });
    const reportJson = JSON.parse(report.body);
    reportSummary = {
      mission_id: reportJson.mission_id,
      signal_id: reportJson.signal_id,
      validation_status: reportJson.validation_status,
      summary: reportJson.summary,
    };
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scene,
        state: {
          status: state.status,
          nodeCount: stateJson.nodes?.length || 0,
          reportCount: stateJson.graph_reports?.length || 0,
        },
        briefing: {
          status: briefing.status,
          mission_id: briefingJson.mission_id,
          region: briefingJson.region,
          topic: briefingJson.topic_label || briefingJson.topic,
          pending_reference_reports: briefingJson.pending_reference_reports?.length || 0,
        },
        dispatch: {
          status: dispatch.status,
          ok: dispatchJson.ok === true,
          mission_id: dispatchJson.briefing?.mission_id || null,
        },
        report: reportSummary,
      },
      null,
      2,
    ),
  );

  if (
    state.status !== 200 ||
    briefing.status !== 200 ||
    dispatch.status !== 200 ||
    dispatchJson.ok !== true ||
    !briefingJson.mission_id
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
