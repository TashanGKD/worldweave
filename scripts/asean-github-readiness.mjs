import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const GROUPS = [
  {
    id: 'topic-api',
    title: 'ASEAN topic data and API shell',
    files: [
      'src/lib/world/asean-topic.ts',
      'src/lib/world/asean-page-data.ts',
      'src/lib/world/asean-metaso-search.ts',
      'src/lib/world/asean-source-feeds.ts',
      'src/lib/world/asean-public-risk-events.ts',
      'src/lib/world/asean-dataset-metrics.ts',
      'src/lib/world/signal-quality.ts',
      'src/app/api/v1/world/asean/route.ts',
      'src/app/api/v1/world/subworlds/route.ts',
    ],
  },
  {
    id: 'demo-ui',
    title: 'ASEAN demo page and navigation wiring',
    files: [
      'src/app/demo/asean/page.tsx',
      'src/app/demo/asean/asean-demo-client.tsx',
      'src/app/demo/asean/asean-demo.module.css',
      'src/app/page.tsx',
      'src/app/dashboard-client.tsx',
      'src/lib/world/dashboard-presentation.ts',
      'src/lib/world/runtime.ts',
    ],
  },
  {
    id: 'research',
    title: 'ASEAN research workflow',
    files: [
      'src/app/api/v1/world/asean/research/route.ts',
      'src/lib/world/asean-deep-research.ts',
      'src/lib/world/asean-research-results.ts',
      'src/lib/world/asean-research-suggestions.ts',
    ],
  },
  {
    id: 'decision-model',
    title: 'ASEAN model readout and optional training scripts',
    files: [
      'src/app/api/v1/world/asean/decision-model/route.ts',
      'src/lib/world/asean-decision-model.ts',
      'src/lib/world/asean-graphify-view.ts',
      'scripts/asean-train-power-risk.mjs',
      'scripts/asean-train-proxy-models.mjs',
      'scripts/asean_train_fuel_price.py',
      'scripts/asean-model-data-report.mjs',
      'scripts/asean-model-readiness.mjs',
      'research/asean-model-data-coverage.md',
      'research/asean-model-datasets.md',
      'research/asean-trainable-data-crawl.md',
    ],
  },
  {
    id: 'verification',
    title: 'Refresh and verification tooling',
    files: [
      'package.json',
      'scripts/world-source-refresh.mjs',
      'scripts/asean-metaso-refresh.mjs',
      'scripts/smoke-asean-demo.mjs',
      'scripts/asean-github-readiness.mjs',
      'tests/mounted-navigation.test.mjs',
      '.gitignore',
      '.env.example',
      'research/asean-github-readiness.md',
    ],
  },
  {
    id: 'model-artifacts',
    title: 'ASEAN committed model artifacts',
    files: [
      '.cache/asean-training/fuel-price-forecast.json',
      '.cache/asean-training/model-data-coverage.json',
      '.cache/asean-training/model-readiness.json',
      '.cache/asean-training/power-risk-baseline.json',
      '.cache/asean-training/proxy-models.json',
    ],
  },
];

const ALLOWED_MODEL_ARTIFACTS = new Set([
  '.cache/asean-training/fuel-price-forecast.json',
  '.cache/asean-training/model-data-coverage.json',
  '.cache/asean-training/model-readiness.json',
  '.cache/asean-training/power-risk-baseline.json',
  '.cache/asean-training/proxy-models.json',
]);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).replace(/\r?\n$/u, '');
}

function parseGroupArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--group') return args[index + 1] || '';
    if (arg.startsWith('--group=')) return arg.slice('--group='.length);
  }
  return '';
}

function statusFor(path) {
  const output = git(['status', '--porcelain=v1', '--', path]);
  if (!output) return existsSync(path) ? 'clean' : 'missing';
  const code = output.split(/\r?\n/u)[0].slice(0, 2);
  if (code === '??') return 'untracked';
  if (code[0] !== ' ') return 'staged';
  if (code[1] !== ' ') return 'modified';
  return code.trim() || 'changed';
}

function summarizeGroup(group) {
  const files = group.files.map((path) => ({ path, status: statusFor(path) }));
  const summary = files.reduce((acc, file) => {
    acc[file.status] = (acc[file.status] || 0) + 1;
    return acc;
  }, {});
  return { id: group.id, title: group.title, summary, files };
}

function findUngroupedChanges() {
  const grouped = new Set(GROUPS.flatMap((group) => group.files));
  const groupedFiles = Array.from(grouped);
  return git(['status', '--porcelain=v1'])
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => line.slice(3).trim())
    .filter((path) => !grouped.has(path))
    .filter((path) => !path.endsWith('/') || !groupedFiles.some((file) => file.startsWith(path)));
}

function findStagedGeneratedArtifacts() {
  const staged = git(['diff', '--cached', '--name-only'])
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return staged.filter((path) => {
    if (ALLOWED_MODEL_ARTIFACTS.has(path)) return false;
    return (
      path.startsWith('.cache/') ||
      path.startsWith('efficientnet_reference/') ||
      /\.cache\//u.test(path)
    );
  });
}

function quotePath(path) {
  return `'${path.replace(/'/gu, "''")}'`;
}

const requestedGroupId = parseGroupArg(process.argv.slice(2));
const selectedGroup = requestedGroupId ? GROUPS.find((group) => group.id === requestedGroupId) : null;
if (requestedGroupId && !selectedGroup) {
  console.error(`Unknown group "${requestedGroupId}". Valid groups: ${GROUPS.map((group) => group.id).join(', ')}`);
  process.exit(2);
}

const scopedGroups = selectedGroup ? [selectedGroup] : GROUPS;
const groups = scopedGroups.map(summarizeGroup);
const missing = groups.flatMap((group) => group.files.filter((file) => file.status === 'missing').map((file) => `${group.id}:${file.path}`));
const stagedGeneratedArtifacts = findStagedGeneratedArtifacts();
const ungroupedChanges = findUngroupedChanges();
const report = {
  ok: missing.length === 0 && stagedGeneratedArtifacts.length === 0 && ungroupedChanges.length === 0,
  generated_at: new Date().toISOString(),
  selected_group: selectedGroup?.id || null,
  groups,
  ungrouped_changes: ungroupedChanges,
  missing,
  staged_generated_artifacts: stagedGeneratedArtifacts,
  suggested_git_add: selectedGroup ? `git add -- ${selectedGroup.files.map(quotePath).join(' ')}` : null,
  next_step: 'Stage one group at a time; keep the TopicLab submodule pointer for a separate host-repo PR.',
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
