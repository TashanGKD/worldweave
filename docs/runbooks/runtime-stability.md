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
- `world/state?scene=tech-ai` responds and has current AI signals
- MiniMax responds through the Anthropic-compatible endpoint
- MiniMax base URL is the expected one
- main OpenClaw Skill and AI Hot Skill routes are present
- source-monitor database connection is healthy when configured
- root-level directory layout stays within the agreed boundary

Also check the live runtime health fields after deploy:

```bash
curl --noproxy '*' http://127.0.0.1:5000/api/v1/world/livebench/evaluation?scene=global
curl --noproxy '*' http://127.0.0.1:5000/api/v1/world/source-knowledge/status?scene=global
curl --noproxy '*' http://127.0.0.1:5000/api/v1/world/source-knowledge/status?scene=tech-ai
```

The LiveBench `source_health` payload should show enough open questions for the current window, and `source_knowledge.source_health.freshness_status` should not stay `stale` after the refresh daemon has completed. If `METACULUS_API_TOKEN` is missing, LiveBench remains usable but should be treated as degraded because Metaculus is not contributing to the question pool.

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
MINIMAX_API_KEY=...
METASO_API_KEY=...
METACULUS_API_TOKEN=...
WORLDWEAVE_DATABASE_URL=...
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

In TopicLab or Docker Compose deployments, do not point heavy refresh at the public `worldweave` web service. Run the refresh service with `node scripts/world-source-refresh-daemon.mjs` and let it start its own internal worker. If `WORLD_BATCH_REFRESH_BASE_URL=http://worldweave:3020` is set in the refresh service, heavy source sync will be deferred by the public web process and the background refresh will not perform the intended sync.

The daemon stays in the foreground and supervises both the internal worker and the refresh loop. If either process exits, the daemon restarts it after `WORLD_SOURCE_REFRESH_RESTART_DELAY_MS` (default `5000`).

Use workload budgets instead of raising heap as the first response to OOM:

```bash
WORLD_SOURCE_REFRESH_INTERVAL_MINUTES=60
WORLD_CATALOG_SOURCE_FETCH_CONCURRENCY=3
WORLD_CATALOG_SOURCE_REFRESH_BATCH_SIZE=40
WORLD_CATALOG_SOURCE_MAX_RESPONSE_BYTES=524288
WORLD_TRANSLATION_BATCH_SIZE=2
WORLD_TRANSLATION_PRIME_LIMIT=8
WORLD_VISIBLE_TRANSLATION_BATCH_SIZE=12
WORLD_ALIGNMENT_BATCH_SIZE=2
WORLD_ALIGNMENT_PRIME_LIMIT=4
WORLD_SOURCE_KNOWLEDGE_SYNC_INTERVAL_MINUTES=30
WORLD_SOURCE_KNOWLEDGE_EMBED_BATCH_SIZE=3
WORLD_SOURCE_KNOWLEDGE_EMBED_MAX_PENDING=60
```

These settings make each refresh cycle bounded. Catalog sources rotate through smaller batches, source-knowledge embeddings defer excess new signals to later cycles instead of processing every pending signal at once, and the refresh warm-up does not call `/api/v1/world/state?batch=1`; state rendering should read snapshots rather than trigger a second heavy parse pass.

When `WORLDWEAVE_DATABASE_URL` is set, WorldWeave also writes source monitoring data to Postgres. `DATABASE_URL` remains a compatibility fallback for standalone WorldWeave deployments, but TopicLab deployments should use `WORLDWEAVE_DATABASE_URL` so the TopicLab backend database is not changed. The refresh daemon writes both the `global` and `tech-ai` source-knowledge sync snapshots, so AI source health can be checked independently from the main world timeline:

- `world_source_refresh_runs`: one row per daemon iteration, including `ok`, `running`, `finished_at`, `duration_ms`, and latest signal freshness fields when available.
- `world_source_monitor_snapshots`: one row per successful source-knowledge sync, including signal counts, latest signal time, freshness status, source health counts, and the full JSON payload.
- `world_source_signals`: current signal rows upserted by `signal_id`.

The database is optional. If it is absent or temporarily unavailable, refresh continues to use the local `.cache` snapshots and logs a warning instead of failing the public runtime.

Why this matters:

- catalog RSS/API responses are untrusted external input
- oversized responses are rejected before being decoded into JS strings
- catalog fetches are concurrency-limited
- if a future source still behaves badly, only the worker process should be at risk, not the public web process

## Source Directory Refresh

`pnpm source:directory` refreshes directory-style candidate sources, including `public-apis`, `awesome-ai-in-finance`, and `awesome-rss-feeds`.

On some Windows operations hosts, Node `fetch()` can fail against `raw.githubusercontent.com` before TLS is established while PowerShell can still fetch the same URL through the system network stack. The directory refresh script retries Node fetches and then falls back to PowerShell on Windows. This fallback is only for the directory refresh utility; runtime catalog ingestion still enforces response-size and concurrency guards.

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

`pnpm health:world` separates app health from remote model availability. A MiniMax `rate_limited` or upstream transient response is reported as `degraded` so operators can see that translation/label refresh is temporarily delayed, while the public web process can still serve cached signals. Missing keys or persistent non-degraded failures still need operator action before a full refresh window.

For source display regressions, run:

```bash
pnpm smoke:world-runtime
WORLD_SMOKE_SCENE=tech-ai pnpm smoke:world-runtime
WORLD_SMOKE_SCENE=geo-politics-daily pnpm smoke:world-runtime
pnpm smoke:world-skill
```

The smoke check fails if low-information source snapshots such as `信源更新`, `结构化更新`, `Bundle Feed`, or model-marked `lowInformation` entries leak into the top signal pool.

Hard-coded sample world signals are disabled by default. If every live source fails and no disk cache exists, the API returns an empty signal set rather than showing synthetic sample events. Local demos can opt in with:

```bash
WORLD_ALLOW_SAMPLE_SIGNALS=1 pnpm dev
```

Do not enable `WORLD_ALLOW_SAMPLE_SIGNALS` in production or TopicLab deployments.
