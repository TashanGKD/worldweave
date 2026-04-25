import path from 'node:path';
import { spawn } from 'node:child_process';

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
const worldNodeOptions = process.env.NODE_OPTIONS?.includes('--max-old-space-size')
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' ');

const child = spawn(
  process.execPath,
  [
    path.join(process.cwd(), 'scripts', 'run-local-package-bin.mjs'),
    'next',
    'dist/bin/next',
    'dev',
    '--webpack',
    '--hostname',
    host,
    '--port',
    port,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NODE_OPTIONS: worldNodeOptions,
    },
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
