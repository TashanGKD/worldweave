import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pidPath = path.join(root, '.cache', 'world-source-refresh-worker.pid');
const host = process.env.WORLD_SOURCE_REFRESH_WORKER_HOST || '127.0.0.1';
const port = process.env.WORLD_SOURCE_REFRESH_WORKER_PORT || '5020';

try {
  const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 1) throw new Error('managed worker pid is missing');
  process.kill(pid, 0);
  if (process.platform === 'linux') {
    const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
    if (!command.includes('world-start.mjs')) throw new Error('managed worker pid does not match world-start');
  }
  const response = await fetch(`http://${host}:${port}/api/v1/openclaw/skill.md`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`managed worker probe returned ${response.status}`);
  process.exit(0);
} catch (error) {
  process.stderr.write(`[world-source-refresh-health] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
