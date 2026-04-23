import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const cacheDir = path.join(root, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
dotenv.config({ path: path.join(root, '.env.local') });

const pidPath = path.join(cacheDir, 'world-source-refresh-current.pid');
const outPath = path.join(cacheDir, 'world-source-refresh-daemon.out.log');
const errPath = path.join(cacheDir, 'world-source-refresh-daemon.err.log');

function append(filePath, text) {
  fs.appendFileSync(filePath, text, 'utf8');
}

function openLog(filePath) {
  return fs.openSync(filePath, 'a');
}

const intervalMinutes = process.env.WORLD_SOURCE_REFRESH_INTERVAL_MINUTES || '30';
const timeoutMinutes = process.env.WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES || '20';

const out = openLog(outPath);
const err = openLog(errPath);
const child = spawn(
  process.execPath,
  [
    path.join(root, 'scripts', 'world-source-refresh.mjs'),
    '--loop',
    '--interval-minutes',
    intervalMinutes,
    '--timeout-minutes',
    timeoutMinutes,
    '--include-heavy-world-sync',
  ],
  {
    cwd: root,
    detached: true,
    env: process.env,
    stdio: ['ignore', out, err],
    windowsHide: true,
  },
);

fs.writeFileSync(pidPath, `${child.pid}\n`, 'utf8');
append(outPath, `\n[${new Date().toISOString()}] source refresh daemon started pid=${child.pid} interval=${intervalMinutes} timeout=${timeoutMinutes}\n`);
child.unref();

console.log(JSON.stringify({ pid: child.pid, intervalMinutes, timeoutMinutes, pidPath, outPath, errPath }, null, 2));
