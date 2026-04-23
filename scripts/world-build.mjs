import path from 'node:path';
import { spawn } from 'node:child_process';

import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

if (!process.env.ANTHROPIC_BASE_URL && process.env.MINIMAX_BASE_URL) {
  process.env.ANTHROPIC_BASE_URL = process.env.MINIMAX_BASE_URL;
}
if (!process.env.ANTHROPIC_API_KEY && process.env.MINIMAX_API_KEY) {
  process.env.ANTHROPIC_API_KEY = process.env.MINIMAX_API_KEY;
}
delete process.env.ANTHROPIC_AUTH_TOKEN;

const worldNodeOptions = process.env.NODE_OPTIONS?.includes('--max-old-space-size')
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, '--max-old-space-size=8192'].filter(Boolean).join(' ');

const child = spawn(
  process.execPath,
  [path.join(process.cwd(), 'scripts', 'run-local-package-bin.mjs'), 'next', 'dist/bin/next', 'build'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
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
