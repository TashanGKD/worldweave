import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

process.env.MINIMAX_BASE_URL ||= 'https://api.scnet.cn/api/llm/v1';
process.env.MINIMAX_MODEL ||= 'MiniMax-M2.5';
process.env.MINIMAX_API_STYLE ||= 'openai-completions';

if (!process.env.ANTHROPIC_BASE_URL) process.env.ANTHROPIC_BASE_URL = process.env.MINIMAX_BASE_URL;
if (!process.env.ANTHROPIC_API_KEY && process.env.MINIMAX_API_KEY) {
  process.env.ANTHROPIC_API_KEY = process.env.MINIMAX_API_KEY;
}
delete process.env.ANTHROPIC_AUTH_TOKEN;

const port = process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000';
const host = process.env.HOST || process.env.WORLD_HOST || '0.0.0.0';
const buildId = path.join(process.cwd(), '.next', 'BUILD_ID');
const cacheDir = path.join(process.cwd(), '.cache');
const pidPrefix = process.env.WORLD_START_PID_PREFIX || 'world-start';
const servicePidFile = path.join(cacheDir, `${pidPrefix}-current.pid`);
const wrapperPidFile = path.join(cacheDir, `${pidPrefix}-wrapper.pid`);
const defaultOldSpaceSize = process.env.WORLD_WEB_ENABLE_HEAVY_REFRESH === '1' ? '3072' : '2048';
const worldNodeOptions = process.env.NODE_OPTIONS?.includes('--max-old-space-size')
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, `--max-old-space-size=${defaultOldSpaceSize}`].filter(Boolean).join(' ');

async function runNodeScript(scriptArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, scriptArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated by signal ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`Command exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function findWindowsListenerPid(targetPort) {
  if (process.platform !== 'win32') return null;
  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf-8' });
    const lines = output.split(/\r?\n/u);
    const escapedPort = String(targetPort).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\s(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]|::):${escapedPort}\\s+.*\\sLISTENING\\s+(\\d+)\\s*$`, 'i');
    for (const line of lines) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1];
    }
  } catch {
    return null;
  }
  return null;
}

function refreshServicePidFromListener() {
  const listenerPid = findWindowsListenerPid(port);
  if (listenerPid) {
    fs.writeFileSync(servicePidFile, `${listenerPid}\n`, 'utf-8');
    return true;
  }
  return false;
}

if (!fs.existsSync(buildId)) {
  await runNodeScript([path.join(process.cwd(), 'scripts', 'world-build.mjs')]);
}

const child = spawn(
  process.execPath,
  [
    path.join(process.cwd(), 'scripts', 'run-local-package-bin.mjs'),
    'next',
    'dist/bin/next',
    'start',
    '--hostname',
    host,
    '--port',
    port,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: worldNodeOptions,
    },
    stdio: 'inherit',
  },
);

fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(servicePidFile, `${child.pid ?? ''}\n`, 'utf-8');
fs.writeFileSync(wrapperPidFile, `${process.pid}\n`, 'utf-8');
let listenerPolls = 0;
const listenerPoll = setInterval(() => {
  listenerPolls += 1;
  if (refreshServicePidFromListener() || listenerPolls >= 60) {
    clearInterval(listenerPoll);
  }
}, 500);
listenerPoll.unref?.();

child.on('exit', (code, signal) => {
  clearInterval(listenerPoll);
  for (const pidFile of [wrapperPidFile]) {
    try {
      const recordedPid = fs.readFileSync(pidFile, 'utf-8').trim();
      if (recordedPid === String(pidFile === servicePidFile ? child.pid : process.pid)) {
        fs.rmSync(pidFile, { force: true });
      }
    } catch {
      // Ignore cleanup races during process shutdown.
    }
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
