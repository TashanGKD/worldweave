# WorldWeave ASEAN GitHub readiness notes

Updated: 2026-06-08

This note defines the review and commit boundary for the ASEAN demo work before pushing it to GitHub and then updating the TopicLab submodule pointer. Keep source repo changes separate from the host repo pointer update.

## Current rollout order

1. Finish and push the WorldWeave source PR.
2. Wait until the WorldWeave target commit is accepted for the source branch.
3. Update the TopicLab `worldweave` submodule pointer in a separate TopicLab PR.

Do not update the TopicLab pointer while the WorldWeave source work is still an unreviewed local change set.

## Proposed WorldWeave commit groups

### 1. ASEAN topic data and API shell

Purpose: add the topic payload, public source inputs, metrics, and API routes without the large interactive page.

Files:
- `src/lib/world/asean-topic.ts`
- `src/lib/world/asean-page-data.ts`
- `src/lib/world/asean-metaso-search.ts`
- `src/lib/world/asean-source-feeds.ts`
- `src/lib/world/asean-public-risk-events.ts`
- `src/lib/world/asean-dataset-metrics.ts`
- `src/lib/world/signal-quality.ts`
- `src/app/api/v1/world/asean/route.ts`
- `src/app/api/v1/world/subworlds/route.ts`

Suggested commit:

```text
feat(world): add asean topic data api
```

### 2. ASEAN demo page and navigation wiring

Purpose: add the user-facing demo route and mounted navigation entry points.

Files:
- `src/app/demo/asean/page.tsx`
- `src/app/demo/asean/asean-demo-client.tsx`
- `src/app/demo/asean/asean-demo.module.css`
- `src/app/page.tsx`
- `src/app/dashboard-client.tsx`
- `src/lib/world/dashboard-presentation.ts`
- `src/lib/world/runtime.ts`

Suggested commit:

```text
feat(world): add asean demo experience
```

### 3. ASEAN research workflow

Purpose: add the saved research, source-cleaning, suggestions, and streaming research route.

Files:
- `src/app/api/v1/world/asean/research/route.ts`
- `src/lib/world/asean-deep-research.ts`
- `src/lib/world/asean-research-results.ts`
- `src/lib/world/asean-research-suggestions.ts`

Suggested commit:

```text
feat(world): add asean research workflow
```

### 4. ASEAN model readout and optional training scripts

Purpose: add the public decision-model readout and optional local training/reporting tools. Keep generated caches out of git.

Files:
- `src/app/api/v1/world/asean/decision-model/route.ts`
- `src/lib/world/asean-decision-model.ts`
- `src/lib/world/asean-graphify-view.ts`
- `scripts/asean-train-power-risk.mjs`
- `scripts/asean-train-proxy-models.mjs`
- `scripts/asean_train_fuel_price.py`
- `scripts/asean-model-data-report.mjs`
- `scripts/asean-model-readiness.mjs`
- `research/asean-model-data-coverage.md`
- `research/asean-model-datasets.md`
- `research/asean-trainable-data-crawl.md`

Suggested commit:

```text
feat(world): add asean decision model readout
```

Review note: the Python fuel-price script uses local scientific packages and should remain an optional offline tool. Runtime may read the committed `.cache/asean-training/*` JSON model artifacts, but do not commit source download caches such as OWID CSV or World Bank raw JSON files.

### 5. Refresh and verification tooling

Purpose: add operational refresh hooks and smoke/static tests after the user-facing and API surfaces are present.

Files:
- `package.json`
- `scripts/world-source-refresh.mjs`
- `scripts/asean-metaso-refresh.mjs`
- `scripts/smoke-asean-demo.mjs`
- `tests/mounted-navigation.test.mjs`
- `.gitignore`
- `.env.example`

Suggested commit:

```text
test(world): cover asean public contracts
```

### 6. ASEAN committed model artifacts

Purpose: keep the runtime-ready ASEAN model readout available after deployment without committing raw source-download caches.

Files:
- `.cache/asean-training/fuel-price-forecast.json`
- `.cache/asean-training/model-data-coverage.json`
- `.cache/asean-training/model-readiness.json`
- `.cache/asean-training/power-risk-baseline.json`
- `.cache/asean-training/proxy-models.json`

Suggested commit:

```text
chore(world): add asean model artifacts
```

## Pre-push checks

Run before staging the final source PR:

```powershell
pnpm asean:readiness
pnpm asean:readiness -- --group topic-api
pnpm ts-check
node --test --test-name-pattern "ASEAN topic" tests\mounted-navigation.test.mjs
node --check scripts\smoke-asean-demo.mjs
git diff --check
git status --short --branch
```

Run live smoke only against the matching local or preview service for the same source commit:

```powershell
pnpm smoke:asean -- --base-url http://127.0.0.1:<port>
```

## Blockers before pushing

- The worktree still has a large untracked ASEAN surface; stage by the groups above rather than with `git add .`.
- Use `pnpm asean:readiness -- --group <group-id>` before each commit and stage only the command's `suggested_git_add` files.
- Confirm whether optional research notes belong in the first PR or should be a follow-up documentation commit.
- Confirm only the allowlisted ASEAN model JSON artifacts are staged under `.cache/asean-training`; source download caches remain ignored.
- Do not update the TopicLab `worldweave` submodule pointer until the WorldWeave source PR is ready and the target commit is stable.
