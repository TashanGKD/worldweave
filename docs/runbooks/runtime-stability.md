# Runtime Stability

## Purpose

This runbook exists so that runtime problems are caught by routine checks instead of lingering for days.

## Daily Checks

Run these from the workspace root:

```bash
pnpm health:world
pnpm audit:workspace
```

What they cover:

- homepage responds
- `world/market-snapshot` responds
- MiniMax responds through the Anthropic-compatible endpoint
- MiniMax base URL is the expected one
- root-level directory layout stays within the agreed boundary

## PM2 Check

Use this when the app feels unstable:

```bash
pm2 list
pm2 describe xia-report-world
pm2 logs xia-report-world --lines 80 --nostream
```

Important:

- restart with `--update-env` when local environment values changed
- this prevents old shell variables from polluting the long-running service

```bash
set -a && source .env.local && set +a
pm2 restart xia-report-world --update-env
```

## Web And Refresh Worker

Run the public web process as a cache-first service. It should serve pages and API snapshots, not perform heavy external source crawling.

Recommended public web environment:

```bash
WORLD_WEB_ENABLE_HEAVY_REFRESH=0
NODE_OPTIONS=--max-old-space-size=2048
```

The source refresh daemon manages its own internal worker by default. Start it as usual:

```bash
pnpm source:refresh:daemon
```

By default this starts an internal worker at `http://127.0.0.1:5020` with heavy refresh enabled, then points the refresh loop at that worker. Override only when needed:

```bash
WORLD_SOURCE_REFRESH_WORKER_PORT=5020
WORLD_SOURCE_REFRESH_MANAGE_WORKER=1
WORLD_BATCH_REFRESH_BASE_URL=http://127.0.0.1:5020
```

Why this matters:

- catalog RSS/API responses are untrusted external input
- oversized responses are rejected before being decoded into JS strings
- catalog fetches are concurrency-limited
- if a future source still behaves badly, only the worker process should be at risk, not the public web process

## Curl Caveat

This machine may have local proxy variables enabled. Plain `curl` can look broken even when the app is healthy.

Prefer either:

```bash
curl --noproxy '*' http://127.0.0.1:5000/api/v1/world/market-snapshot
```

or use the built-in health script:

```bash
pnpm health:world
```

## MiniMax Check

The expected runtime endpoint is:

```text
https://api.scnet.cn/api/llm/v1
```

If a different model base URL leaks into the process, requests may silently hit the wrong provider.

The current runtime code protects against this by using fixed MiniMax-compatible defaults and only treating `MINIMAX_*` / `ANTHROPIC_*` as explicit overrides. `pnpm health:world` should still be run after any deploy or environment change.
