import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolvePackageEntry(packageName, relativeEntry) {
  const direct = path.join(process.cwd(), 'node_modules', packageName, relativeEntry);
  if (fs.existsSync(direct)) {
    return direct;
  }

  const pnpmRoot = path.join(process.cwd(), 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmRoot)) {
    fail(`Unable to find pnpm workspace root at ${pnpmRoot}`);
  }

  const packagePrefix = `${packageName.replace(/\//g, '+')}@`;
  const match = fs
    .readdirSync(pnpmRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(packagePrefix))
    .map((entry) => path.join(pnpmRoot, entry.name, 'node_modules', packageName, relativeEntry))
    .find((candidate) => fs.existsSync(candidate));

  if (!match) {
    fail(`Unable to resolve ${packageName}/${relativeEntry} from node_modules/.pnpm`);
  }

  return match;
}

const [packageName, relativeEntry, ...args] = process.argv.slice(2);
if (!packageName || !relativeEntry) {
  fail('Usage: node ./scripts/run-local-package-bin.mjs <package-name> <relative-entry> [...args]');
}

const entry = resolvePackageEntry(packageName, relativeEntry);
const child = spawn(process.execPath, [entry, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

