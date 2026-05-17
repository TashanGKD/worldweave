# Workspace Maintenance Summary

Last reviewed: 2026-05-04

This note summarizes the current `world` workspace so future maintenance does not depend on chat history.

## Current Role

This checkout is the `WorldWeave` runtime:

- public world dashboard and signal map
- source knowledge runtime and OpenClaw skill endpoints
- LiveBench question, voting, settlement, and evaluation loop
- TopicLab integration surface for `/info/source` and source-feed style embedding

The repository is intentionally still a single deployable Next.js app. Keep future changes small and avoid splitting the service unless there is a hard operational constraint.

## Repository State

As of this review:

- local branch: `main`
- remotes:
  - `origin`: `https://github.com/TashanGKD/worldweave.git`
  - `fork`: `https://github.com/Yu-Yang-Li/worldweave.git`
- local `main` is behind `origin/main` by 4 commits:
  - `49c1927 fix(dashboard): align side panels to world map height`
  - `ffe47ab Merge pull request #1 from TashanGKD/fzr/dashboard-map-panel-sizing`
  - `4050f91 feat(source): add awesome RSS feed directory`
  - `71de44f feat(source): add awesome RSS feed directory`
- local `HEAD` is `47de551 Keep source refresh status current`

There are existing uncommitted and untracked files. Treat them as intentional user/workspace output until reviewed:

- modified rolling source directory files:
  - `research/source-skill-validation/latest-directory-candidates.json`
  - `research/source-skill-validation/latest-directory-candidates.md`
- untracked deploy note:
  - `docs/runbooks/deploy-api-keys.md`
- untracked source-validation snapshots from 2026-04-25 through 2026-05-04
- untracked preview/product routes:
  - `src/app/arcade-relay-preview/`
  - `src/app/arcade/`
  - `src/app/topiclab-preview/`

Do not run broad cleanup or reset commands before deciding which of those are durable artifacts.

## Main Entry Points

Important UI routes:

- `/`
- `/signals`
- `/signals/[id]`
- `/source-knowledge`
- `/livebench/[questionId]`
- `/livebench/evaluation`
- `/arcade`
- `/arcade-relay-preview`
- `/topiclab-preview`

Important API routes:

- `/api/v1/world/state`
- `/api/v1/world/market-snapshot`
- `/api/v1/world/signals`
- `/api/v1/world/source-knowledge/status`
- `/api/v1/world/source-knowledge/recall`
- `/api/v1/world/source-knowledge/sync`
- `/api/v1/world/livebench/questions`
- `/api/v1/world/livebench/vote`
- `/api/v1/world/livebench/sync`
- `/api/v1/world/livebench/evaluation`
- `/api/v1/openclaw/skill.md`
- `/api/v1/openclaw/sources.skill.md`
- `/api/v1/openclaw/livebench.skill.md`
- `/api/v1/openclaw/evaluation.skill.md`
- `/api/v1/topiclab/source-feed/articles`

Core runtime modules:

- `src/lib/world/runtime.ts`
- `src/lib/world/livebench.ts`
- `src/lib/world/source-catalog.ts`
- `src/lib/world/source-knowledge.ts`
- `src/lib/world/api-snapshot.ts`
- `src/lib/request-origin.ts`

Core UI modules:

- `src/app/page-client.tsx`
- `src/app/dashboard-client.tsx`
- `src/components/world-globe.tsx`
- `src/components/world-market-monitor.tsx`
- `src/components/world-ui.tsx`

## Commands

Use `pnpm`; the package manager is pinned to `pnpm@9.0.0`.

Local development:

```bash
pnpm install
pnpm dev
```

Production-mode local run:

```bash
pnpm build
pnpm start
```

Validation:

```bash
pnpm ts-check
pnpm lint
pnpm health:world
pnpm smoke:world-runtime
pnpm smoke:world-skill
pnpm audit:world-client
pnpm audit:world-skill
pnpm audit:workspace
```

Source refresh and source directory maintenance:

```bash
pnpm source:refresh
pnpm source:directory
pnpm source:refresh:daemon
```

Remote deploy:

```bash
pnpm deploy:remote
```

Only include the vendored `zvec/` tree when it changed:

```bash
pnpm deploy:remote -- --include-zvec
```

## Deployment Notes

The app deploys as one PM2 process:

- process name: `xia-report-world`
- process config: `ecosystem.config.js`
- runtime wrapper: `scripts/world-start.mjs`
- deploy helper: `scripts/deploy-remote.py`

Safe deploy flow:

```bash
pnpm install
pnpm build
pm2 restart xia-report-world --update-env
pnpm health:world
```

`--update-env` matters because stale shell variables previously caused requests to hit the wrong Anthropic-compatible provider.

Required runtime secrets:

- `MINIMAX_API_KEY`
- `METASO_API_KEY` if search enrichment should be active

Expected MiniMax-compatible base URL:

```text
https://api.scnet.cn/api/llm/v1
```

TopicLab integration expects WorldWeave to be reachable behind the same public host:

- `WORLDWEAVE_BASE_URL=http://127.0.0.1:5000`
- `VITE_WORLDWEAVE_FRONTEND_URL=/worldweave/`

Post-deploy public checks:

- `https://world.tashan.chat/worldweave/`
- `https://world.tashan.chat/api/v1/openclaw/skill.md`
- `https://world.tashan.chat/info/source`
- `https://world.tashan.chat/info/source-list`

## Known Historical Issue

The main deployment trap was a stale public host mismatch:

- `world.tashan.chat` resolved to `8.147.58.40`
- the previously controlled host was `49.233.162.81`
- local changes and one temporary server path did not prove the public deployment was fresh
- the validated fix lineage was local commit `47de551` plus TopicLab submodule pointer update `4e7735f`
- follow-up issue was filed as `TashanGKD/Tashan-TopicLab#14`

When a public page looks stale, verify DNS and the actual live-serving host before assuming the local or old server is authoritative.

## Rolling Research Artifacts

`research/source-skill-validation/` contains generated probes, round summaries, and directory candidate extracts. These files are useful for source-catalog history, but they are noisy in normal code review.

Current pattern:

- `probe-YYYY-MM-DD-*` stores source connectivity, hub scan, coverage, and refresh summary data
- `round-YYYY-MM-DD-*` stores small coverage/connectivity summaries
- `directory-candidates-YYYY-MM-DD.*` stores extracted directory candidates
- `latest-directory-candidates.*` points at the newest candidate extract

The latest reviewed candidate extract was updated on 2026-05-04 and changed public-apis count from 478 to 485 and awesome-ai-in-finance count from 120 to 123.

## Maintenance Priorities

1. Pull or merge `origin/main` before new work, but preserve the existing local untracked artifacts.
2. Decide whether `docs/runbooks/deploy-api-keys.md` should be committed as the canonical key checklist.
3. Decide which generated `research/source-skill-validation/` snapshots should be committed versus archived locally.
4. Review the untracked `arcade`, `arcade-relay-preview`, and `topiclab-preview` routes before merging remote changes.
5. Keep deploy and health validation explicit after every runtime or environment change.
6. Keep TopicLab integration as a single deployable WorldWeave service behind the public host unless deployment constraints force a different shape.
