import { Pool } from 'pg';

import type { WorldDashboardSourceRefreshSummary, WorldScene, WorldSignal, WorldSourceKnowledgeState } from './types';

type SourceKnowledgeWithGovernance = WorldSourceKnowledgeState & {
  governance?: {
    runtime_failure_count?: number;
    cooling_down_count?: number;
    monitor_source_count?: number;
    changed_source_count?: number;
    high_quality_source_count?: number;
    recommended_source_count?: number;
    latest_poll_finished_at?: string | null;
  };
};

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
let disabledNoticePrinted = false;

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (!disabledNoticePrinted) {
      disabledNoticePrinted = true;
      console.info('[source-monitor-db] DATABASE_URL is not set; skipping Postgres monitor persistence.');
    }
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

function optionalIso(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function ensureSourceMonitorSchema(activePool: Pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await activePool.query(`
        CREATE TABLE IF NOT EXISTS world_source_monitor_snapshots (
          id BIGSERIAL PRIMARY KEY,
          scene TEXT NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          signal_count INTEGER NOT NULL DEFAULT 0,
          indexed_signal_count INTEGER NOT NULL DEFAULT 0,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          latest_signal_published_at TIMESTAMPTZ NULL,
          latest_signal_age_hours DOUBLE PRECISION NULL,
          freshness_status TEXT NULL,
          last_synced_at TIMESTAMPTZ NULL,
          stable_source_count INTEGER NOT NULL DEFAULT 0,
          watchlist_source_count INTEGER NOT NULL DEFAULT 0,
          blocked_or_unknown_source_count INTEGER NOT NULL DEFAULT 0,
          runtime_failure_count INTEGER NOT NULL DEFAULT 0,
          monitor_source_count INTEGER NOT NULL DEFAULT 0,
          refresh_job_started_at TIMESTAMPTZ NULL,
          refresh_job_finished_at TIMESTAMPTZ NULL,
          refresh_job_running BOOLEAN NULL,
          refresh_job_ok BOOLEAN NULL,
          refresh_job_duration_ms INTEGER NULL,
          payload JSONB NOT NULL
        )
      `);
      await activePool.query(`
        CREATE INDEX IF NOT EXISTS world_source_monitor_snapshots_scene_generated_idx
          ON world_source_monitor_snapshots (scene, generated_at DESC)
      `);
      await activePool.query(`
        CREATE TABLE IF NOT EXISTS world_source_signals (
          signal_id TEXT PRIMARY KEY,
          scene TEXT NOT NULL,
          title TEXT NOT NULL,
          source_name TEXT NULL,
          source_url TEXT NULL,
          published_at TIMESTAMPTZ NULL,
          observed_at TIMESTAMPTZ NULL,
          display_level TEXT NULL,
          severity DOUBLE PRECISION NULL,
          relevance_score DOUBLE PRECISION NULL,
          latitude DOUBLE PRECISION NULL,
          longitude DOUBLE PRECISION NULL,
          tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          alignment_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          payload JSONB NOT NULL
        )
      `);
      await activePool.query(`
        CREATE INDEX IF NOT EXISTS world_source_signals_scene_published_idx
          ON world_source_signals (scene, published_at DESC NULLS LAST)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function persistWorldSourceMonitorSnapshot(input: {
  scene: WorldScene;
  sourceKnowledge: SourceKnowledgeWithGovernance;
  sourceRefreshSummary: WorldDashboardSourceRefreshSummary | null;
  signals: WorldSignal[];
}) {
  const activePool = getPool();
  if (!activePool) return;

  try {
    await ensureSourceMonitorSchema(activePool);
    const health = input.sourceKnowledge.source_health;
    const governance = input.sourceKnowledge.governance;
    const refreshJob = input.sourceRefreshSummary?.refresh_job;
    await activePool.query(
      `
        INSERT INTO world_source_monitor_snapshots (
          scene,
          generated_at,
          signal_count,
          indexed_signal_count,
          chunk_count,
          latest_signal_published_at,
          latest_signal_age_hours,
          freshness_status,
          last_synced_at,
          stable_source_count,
          watchlist_source_count,
          blocked_or_unknown_source_count,
          runtime_failure_count,
          monitor_source_count,
          refresh_job_started_at,
          refresh_job_finished_at,
          refresh_job_running,
          refresh_job_ok,
          refresh_job_duration_ms,
          payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb
        )
      `,
      [
        input.scene,
        optionalIso(input.sourceKnowledge.generated_at) || new Date().toISOString(),
        input.sourceKnowledge.signal_count || 0,
        input.sourceKnowledge.indexed_signal_count || 0,
        input.sourceKnowledge.chunk_count || 0,
        optionalIso(input.sourceKnowledge.latest_signal_published_at),
        health?.latest_signal_age_hours ?? null,
        health?.freshness_status ?? null,
        optionalIso(input.sourceKnowledge.last_synced_at),
        health?.stable_source_count || 0,
        health?.watchlist_source_count || 0,
        health?.blocked_or_unknown_source_count || 0,
        governance?.runtime_failure_count || 0,
        governance?.monitor_source_count || 0,
        optionalIso(refreshJob?.started_at),
        optionalIso(refreshJob?.finished_at),
        typeof refreshJob?.running === 'boolean' ? refreshJob.running : null,
        typeof refreshJob?.ok === 'boolean' ? refreshJob.ok : null,
        refreshJob?.duration_ms ?? null,
        JSON.stringify({
          source_knowledge: input.sourceKnowledge,
          source_refresh_summary: input.sourceRefreshSummary,
        }),
      ],
    );

    for (const signal of input.signals) {
      await activePool.query(
        `
          INSERT INTO world_source_signals (
            signal_id,
            scene,
            title,
            source_name,
            source_url,
            published_at,
            observed_at,
            display_level,
            severity,
            relevance_score,
            latitude,
            longitude,
            tags,
            alignment_tags,
            payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15::jsonb
          )
          ON CONFLICT (signal_id) DO UPDATE SET
            scene = EXCLUDED.scene,
            title = EXCLUDED.title,
            source_name = EXCLUDED.source_name,
            source_url = EXCLUDED.source_url,
            published_at = EXCLUDED.published_at,
            observed_at = EXCLUDED.observed_at,
            display_level = EXCLUDED.display_level,
            severity = EXCLUDED.severity,
            relevance_score = EXCLUDED.relevance_score,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            tags = EXCLUDED.tags,
            alignment_tags = EXCLUDED.alignment_tags,
            last_seen_at = NOW(),
            payload = EXCLUDED.payload
        `,
        [
          signal.id,
          signal.scene || input.scene,
          signal.title || signal.displayTitle || 'untitled signal',
          signal.sourceName || null,
          signal.sourceUrl || null,
          optionalIso(signal.publishedAt),
          optionalIso(signal.observedAt),
          signal.displayLevel || null,
          signal.severity ?? null,
          signal.relevanceScore ?? null,
          signal.latitude ?? null,
          signal.longitude ?? null,
          signal.tags || [],
          signal.alignmentTags || [],
          JSON.stringify(signal),
        ],
      );
    }
  } catch (error) {
    console.warn(
      '[source-monitor-db] Failed to persist source monitor snapshot:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
