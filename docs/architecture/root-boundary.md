# Root Boundary

## Goal

The repo root should stay understandable in one quick glance.

This means:

- product code is obvious
- operational entrypoints are obvious
- research stays grouped
- rebuildable artifacts do not silently become part of the product surface

## Allowed Root Directories

- `src`
- `public`
- `scripts`
- `docs`
- `research`
- `assets`
- `.next`
- `logs`
- `node_modules`

Generated directories such as `.cache`, `graphify-out`, and `.graphify-venv` are tolerated only temporarily and should be removable by `pnpm clean:workspace`.

## Allowed Root Files

- `.babelrc`
- `.env.example`
- `.env.local`
- `.gitignore`
- `.npmrc`
- `README.md`
- `components.json`
- `ecosystem.config.js`
- `eslint.config.mjs`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `postcss.config.mjs`
- `tsconfig.json`

## Practical Rule

If a new root file or folder is not obviously one of these:

- app runtime config
- package manager config
- documented operational entrypoint

it probably belongs somewhere else.

## Preferred Placement

- product code: `src/`
- browser assets: `public/`
- operational logic: `scripts/`
- docs and runbooks: `docs/`
- source research and external references: `research/`
- local build/runtime artifacts: generated and removable
