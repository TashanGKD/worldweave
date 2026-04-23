import fs from 'node:fs/promises';
import path from 'node:path';

import type { WorldScene } from './types';

export type WorldApiSnapshotKey = 'livebench_questions' | 'livebench_evaluation' | 'source_status';

type WorldApiSnapshotEntry<T> = {
  saved_at: string;
  data: T;
};

type WorldApiSnapshotPayload = {
  version: number;
  saved_at: string;
  scenes: Partial<
    Record<
      WorldScene,
      Partial<Record<WorldApiSnapshotKey, WorldApiSnapshotEntry<unknown>>>
    >
  >;
};

const WORLD_API_SNAPSHOT_VERSION = 1;
const WORLD_API_SNAPSHOT_FILE = path.join(process.cwd(), '.cache', 'world-api-snapshots.json');

function isFresh(savedAt: string, maxAgeMs: number) {
  const timestamp = new Date(savedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
}

export async function readWorldApiSnapshot<T>(
  scene: WorldScene,
  key: WorldApiSnapshotKey,
  maxAgeMs: number,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(WORLD_API_SNAPSHOT_FILE, 'utf-8');
    const payload = JSON.parse(raw) as Partial<WorldApiSnapshotPayload>;
    if (payload.version !== WORLD_API_SNAPSHOT_VERSION || !payload.scenes) return null;
    const entry = payload.scenes[scene]?.[key] as WorldApiSnapshotEntry<T> | undefined;
    if (!entry || typeof entry.saved_at !== 'string' || !isFresh(entry.saved_at, maxAgeMs)) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function writeWorldApiSnapshot<T>(
  scene: WorldScene,
  key: WorldApiSnapshotKey,
  data: T,
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(WORLD_API_SNAPSHOT_FILE), { recursive: true });
    let payload: WorldApiSnapshotPayload = {
      version: WORLD_API_SNAPSHOT_VERSION,
      saved_at: new Date().toISOString(),
      scenes: {},
    };
    try {
      const raw = await fs.readFile(WORLD_API_SNAPSHOT_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<WorldApiSnapshotPayload>;
      if (parsed.version === WORLD_API_SNAPSHOT_VERSION && parsed.scenes) {
        payload = {
          version: WORLD_API_SNAPSHOT_VERSION,
          saved_at: typeof parsed.saved_at === 'string' ? parsed.saved_at : payload.saved_at,
          scenes: parsed.scenes,
        };
      }
    } catch {
      // Missing or corrupt snapshot files are replaced below.
    }
    const now = new Date().toISOString();
    payload.saved_at = now;
    payload.scenes[scene] = {
      ...(payload.scenes[scene] || {}),
      [key]: {
        saved_at: now,
        data,
      },
    };
    await fs.writeFile(WORLD_API_SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Snapshots are an optimization; API responses should not fail if persistence fails.
  }
}

export async function deleteWorldApiSnapshots(
  scene: WorldScene,
  keys: WorldApiSnapshotKey[],
): Promise<void> {
  try {
    const raw = await fs.readFile(WORLD_API_SNAPSHOT_FILE, 'utf-8');
    const payload = JSON.parse(raw) as Partial<WorldApiSnapshotPayload>;
    if (payload.version !== WORLD_API_SNAPSHOT_VERSION || !payload.scenes?.[scene]) return;
    const sceneSnapshots = payload.scenes[scene];
    for (const key of keys) {
      delete sceneSnapshots?.[key];
    }
    payload.saved_at = new Date().toISOString();
    await fs.writeFile(WORLD_API_SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Snapshot invalidation should never block a successful write path.
  }
}
