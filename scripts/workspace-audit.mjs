import fs from 'node:fs/promises';

const root = process.cwd();

const expected = new Map([
  ['src', 'production-app'],
  ['public', 'production-assets'],
  ['scripts', 'operations'],
  ['docs', 'documentation'],
  ['research', 'research'],
  ['assets', 'shared-assets'],
]);

const generated = new Map([
  ['.next', 'generated-build'],
  ['.cache', 'runtime-cache'],
  ['logs', 'runtime-logs'],
  ['node_modules', 'dependencies'],
]);

const allowedRootFiles = new Set([
  '.babelrc',
  '.coze',
  '.env.example',
  '.env.local',
  '.gitignore',
  '.npmrc',
  'README.md',
  'components.json',
  'ecosystem.config.js',
  'eslint.config.mjs',
  'next-env.d.ts',
  'next.config.ts',
  'package.json',
  'pnpm-lock.yaml',
  'postcss.config.mjs',
  'tsconfig.json',
]);

async function main() {
  const dirEntries = await fs.readdir(root, { withFileTypes: true });
  const entries = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const files = dirEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const summary = {
    checkedAt: new Date().toISOString(),
    expectedPresent: entries.filter((name) => expected.has(name)).map((name) => ({ name, role: expected.get(name) })),
    generatedPresent: entries.filter((name) => generated.has(name)).map((name) => ({ name, role: generated.get(name) })),
    unexpectedDirectories: entries.filter((name) => !expected.has(name) && !generated.has(name) && !name.startsWith('.git')),
    allowedRootFiles: files.filter((name) => allowedRootFiles.has(name)),
    unexpectedRootFiles: files.filter((name) => !allowedRootFiles.has(name)),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (summary.unexpectedDirectories.length > 0 || summary.unexpectedRootFiles.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
