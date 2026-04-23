# Workspace Structure

## Goal

This workspace should gradually move from a single experimental directory into a layout that can later plug into `Tashan-TopicLab` without a painful rewrite.

The guiding rule is simple:

- product code and runtime paths stay small and predictable
- research material stays visible but isolated
- generated artifacts do not crowd the root

## Current Problems

The current root mixes several concerns:

- app runtime files such as `.next`, `logs`, `.cache`
- research material such as `research/`
- generated graph artifacts such as `graphify-out/`
- tool runtime such as `.graphify-venv/`

This works for fast iteration, but it creates friction for stability, onboarding, and future integration.

## Target Shape

The long-term shape should align with the layering style used in `Tashan-TopicLab`:

- `frontend/` or equivalent app directory for the web product
- `backend/` or service directory when server logic grows beyond the current Next runtime
- `docs/` for architecture, runbooks, migration notes, and feature decisions
- `scripts/` for health checks, build helpers, deploy helpers, and smoke tests
- `research/` for source bundles, validation notes, external repo snapshots, and experiments

For the current `world` project, the practical target is:

- keep `src/`, `public/`, `scripts/`, `docs/`, `research/` as first-class directories
- keep runtime artifacts hidden and ignored
- avoid adding new root directories unless they are product-critical

## Current Directory Policy

Root-level directories should be interpreted like this:

- `src/`: production application code
- `public/`: production static assets
- `scripts/`: operational scripts and smoke checks
- `docs/`: architecture and engineering docs
- `research/`: source research, external references, validation outputs
- `logs/`: local runtime output only
- `.cache/`, `.next/`, `.graphify-venv/`, `graphify-out/`: generated or local-only artifacts

## Migration Order

To avoid breaking the running system, migration should happen in this order:

1. Define health checks and structure rules.
2. Keep generated artifacts ignored and out of normal developer flow.
3. Add docs and runbooks before moving code.
4. Move app code into a dedicated `frontend/` directory only when deploy scripts, PM2 config, and imports are updated together.
5. Split backend-style logic from `src/lib/world/` only when a real service boundary is worth the cost.

## Immediate Rules

- New production code goes only into `src/`, `public/`, or `scripts/`.
- New research or source-hub exploration goes only into `research/`.
- New generated outputs must be ignored in `.gitignore`.
- Any future integration work with `Tashan-TopicLab` should treat this project as a candidate `frontend/` package, not as a forever-standalone root.

## Cleanup Rule

Use `pnpm clean:workspace` to remove rebuildable local artifacts without touching production code.

That cleanup currently removes:

- `graphify-out/`
- `.graphify-venv/`
- `.cache/`
- `tsconfig.tsbuildinfo`
- old PM2 log contents under `logs/`

It intentionally does not remove:

- `.next/`
- `node_modules/`
- any tracked source or docs
