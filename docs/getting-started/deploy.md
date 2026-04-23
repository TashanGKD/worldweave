# Deploy

## PM2 Process

Current process:

- `xia-report-world`

PM2 entry:

- `ecosystem.config.js`

Runtime start script:

- `scripts/start.sh`

## Safe Deploy Flow

```bash
pnpm install
pnpm build
pm2 restart xia-report-world --update-env
pnpm health:world
```

## Recommended Sync Flow

Use the repo deployment script instead of hand-copying files.

```bash
pnpm deploy:remote
```

What it does:

- packages the local production source set
- syncs it to `/home/ubuntu/world`
- preserves runtime-only files such as `.env.local`, `logs/`, `output/`, `.next/`, `node_modules/`
- rebuilds remotely
- restarts `xia-report-world`
- verifies `/`, `/api/v1/world/state`, `/api/v1/openclaw/skill.md`

Optional:

```bash
pnpm deploy:remote -- --include-zvec
```

Use `--include-zvec` only when the vendored `zvec/` tree itself changed.

## Why `--update-env` Matters

The runtime used to inherit outer shell variables that could silently redirect Anthropic-compatible requests to the wrong provider.

Use:

```bash
pm2 restart xia-report-world --update-env
```

and keep `.env.local` current.
## Extra Safety

The start script now reloads local `.env.local` and re-exports:

- `ANTHROPIC_BASE_URL` from `MINIMAX_BASE_URL`
- `ANTHROPIC_API_KEY` from `MINIMAX_API_KEY`

That makes production startup more consistent with the intended MiniMax runtime.
