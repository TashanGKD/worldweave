import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import dotenv from 'dotenv';

const root = process.cwd();
const cacheDir = path.join(root, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });

dotenv.config({ path: path.join(root, '.env.local') });

if (!process.env.ANTHROPIC_BASE_URL && process.env.MINIMAX_BASE_URL) {
  process.env.ANTHROPIC_BASE_URL = process.env.MINIMAX_BASE_URL;
}
if (!process.env.ANTHROPIC_API_KEY && process.env.MINIMAX_API_KEY) {
  process.env.ANTHROPIC_API_KEY = process.env.MINIMAX_API_KEY;
}
delete process.env.ANTHROPIC_AUTH_TOKEN;

const port = process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000';
const host = process.env.HOST || process.env.WORLD_HOST || '0.0.0.0';
const buildId = path.join(root, '.next', 'BUILD_ID');
const stdoutPath = path.join(cacheDir, 'world-start-current.out.log');
const stderrPath = path.join(cacheDir, 'world-start-current.err.log');
const pidPath = path.join(cacheDir, 'world-start-current.pid');
const worldNodeOptions = process.env.NODE_OPTIONS?.includes('--max-old-space-size')
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' ');

function append(pathname, text) {
  fs.appendFileSync(pathname, text, 'utf8');
}

function openLog(pathname) {
  return fs.openSync(pathname, 'a');
}

function findWindowsListenerPid(targetPort) {
  if (process.platform !== 'win32') return null;
  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const escapedPort = String(targetPort).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\s(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]|::):${escapedPort}\\s+.*\\sLISTENING\\s+(\\d+)\\s*$`, 'i');
    for (const line of output.split(/\r?\n/u)) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1];
    }
  } catch {
    return null;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!fs.existsSync(buildId)) {
  const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'world-build.mjs')], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
  });
  if (build.stdout) append(stdoutPath, build.stdout);
  if (build.stderr) append(stderrPath, build.stderr);
  if (build.status !== 0) {
    append(stderrPath, `\n[world-daemon] build failed with exit code ${build.status}\n`);
    process.exit(build.status ?? 1);
  }
}

const out = openLog(stdoutPath);
const err = openLog(stderrPath);

const child = spawn(
  process.execPath,
  [
    path.join(root, 'scripts', 'run-local-package-bin.mjs'),
    'next',
    'dist/bin/next',
    'start',
    '--hostname',
    host,
    '--port',
    port,
  ],
  {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: worldNodeOptions,
    },
    stdio: ['ignore', out, err],
    windowsHide: true,
  },
);

fs.writeFileSync(pidPath, `${child.pid}\n`, 'utf8');
append(stdoutPath, `\n[world-daemon] started pid=${child.pid} host=${host} port=${port} node_options=${worldNodeOptions}\n`);
child.unref();

let listenerPid = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  listenerPid = findWindowsListenerPid(port);
  if (listenerPid) break;
  await sleep(500);
}
if (listenerPid) {
  fs.writeFileSync(pidPath, `${listenerPid}\n`, 'utf8');
  append(stdoutPath, `[world-daemon] listener pid=${listenerPid} port=${port}\n`);
}

console.log(JSON.stringify({ pid: listenerPid ?? child.pid, childPid: child.pid, host, port, stdoutPath, stderrPath, pidPath }, null, 2));
