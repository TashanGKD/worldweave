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
const workerPidPath = path.join(cacheDir, 'world-source-refresh-worker.pid');
const outPath = path.join(cacheDir, 'world-source-refresh-daemon.out.log');
const errPath = path.join(cacheDir, 'world-source-refresh-daemon.err.log');
const workerOutPath = path.join(cacheDir, 'world-source-refresh-worker.out.log');
const workerErrPath = path.join(cacheDir, 'world-source-refresh-worker.err.log');

function append(filePath, text) {
  fs.appendFileSync(filePath, text, 'utf8');
}

function openLog(filePath) {
  return fs.openSync(filePath, 'a');
}

const intervalMinutes = process.env.WORLD_SOURCE_REFRESH_INTERVAL_MINUTES || '30';
const timeoutMinutes = process.env.WORLD_SOURCE_REFRESH_TIMEOUT_MINUTES || '20';
const manageWorker = process.env.WORLD_SOURCE_REFRESH_MANAGE_WORKER !== '0';
const workerPort = process.env.WORLD_SOURCE_REFRESH_WORKER_PORT || '5020';
const workerHost = process.env.WORLD_SOURCE_REFRESH_WORKER_HOST || '127.0.0.1';
const workerBaseUrl = `http://${workerHost}:${workerPort}`;
const configuredBaseUrl = (process.env.WORLD_BATCH_REFRESH_BASE_URL || '').replace(/\/+$/, '');
const refreshBaseUrl = configuredBaseUrl || (manageWorker ? workerBaseUrl : 'http://127.0.0.1:5000');
const workerStartupDelayMs = Number(process.env.WORLD_SOURCE_REFRESH_WORKER_STARTUP_DELAY_MS || 12000);

const out = openLog(outPath);
const err = openLog(errPath);

function withNodeOption(baseValue, option) {
  if (baseValue?.includes(option.split('=')[0])) return baseValue;
  return [baseValue, option].filter(Boolean).join(' ');
}

let worker = null;
if (manageWorker && !configuredBaseUrl) {
  const workerOut = openLog(workerOutPath);
  const workerErr = openLog(workerErrPath);
  worker = spawn(process.execPath, [path.join(root, 'scripts', 'world-start.mjs')], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      HOST: workerHost,
      PORT: workerPort,
      WORLD_HOST: workerHost,
      DEPLOY_RUN_PORT: workerPort,
      WORLD_START_PID_PREFIX: 'world-source-refresh-worker',
      WORLD_WEB_ENABLE_HEAVY_REFRESH: '1',
      NODE_OPTIONS: withNodeOption(process.env.NODE_OPTIONS, '--max-old-space-size=3072'),
    },
    stdio: ['ignore', workerOut, workerErr],
    windowsHide: true,
  });
  fs.writeFileSync(workerPidPath, `${worker.pid}\n`, 'utf8');
  append(
    outPath,
    `\n[${new Date().toISOString()}] source refresh worker started pid=${worker.pid} base=${workerBaseUrl} port=${workerPort}\n`,
  );
  worker.unref();
}

if (worker && workerStartupDelayMs > 0) {
  append(outPath, `[${new Date().toISOString()}] waiting ${workerStartupDelayMs}ms for source refresh worker readiness\n`);
  await new Promise((resolve) => setTimeout(resolve, workerStartupDelayMs));
}

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
    '--world-base-url',
    refreshBaseUrl,
  ],
  {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      WORLD_BATCH_REFRESH_BASE_URL: refreshBaseUrl,
    },
    stdio: ['ignore', out, err],
    windowsHide: true,
  },
);

fs.writeFileSync(pidPath, `${child.pid}\n`, 'utf8');
append(
  outPath,
  `[${new Date().toISOString()}] source refresh daemon started pid=${child.pid} interval=${intervalMinutes} timeout=${timeoutMinutes} base=${refreshBaseUrl}\n`,
);
child.unref();

console.log(
  JSON.stringify(
    {
      pid: child.pid,
      workerPid: worker?.pid || null,
      intervalMinutes,
      timeoutMinutes,
      refreshBaseUrl,
      workerManaged: Boolean(worker),
      workerStartupDelayMs,
      pidPath,
      workerPidPath: worker ? workerPidPath : null,
      outPath,
      errPath,
    },
    null,
    2,
  ),
);
