# Configuration

## Environment File

The workspace uses `.env.local`.

Start from:

```bash
cp .env.example .env.local
```

## Required Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENCLAW_BASE_URL` | recommended | public world / skill host |
| `WORLD_HOST` | recommended | bind address, usually `0.0.0.0` |
| `MINIMAX_API_KEY` | yes | MiniMax API key |
| `MINIMAX_BASE_URL` | yes | MiniMax Anthropic-compatible base URL |
| `MINIMAX_MODEL` | yes | MiniMax model name |

## Optional Billed Features

| Variable | Required | Purpose |
| --- | --- | --- |
| `WORLD_ARENA_EMBEDDING_MODEL` | optional | embedding model name, defaults to `Qwen3-Embedding-8B` |
| `METASO_API_KEY` | optional | Metaso search key for moderator background enrichment |

## Expected MiniMax Endpoint

The expected value is:

```text
https://api.minimaxi.com/anthropic
```

The runtime now prefers local `MINIMAX_*` values over outer `ANTHROPIC_*` values to reduce environment pollution.

Fixed public source endpoints are intentionally kept in code defaults instead of `.env.local`. Deployment should only require host/bind values plus billed API keys.

## Proxy Caveat

This machine may have local proxy variables such as:

- `http_proxy`
- `HTTP_PROXY`
- `https_proxy`
- `HTTPS_PROXY`

That can make plain `curl` look broken even when the app is healthy. Prefer:

```bash
pnpm health:world
```

or:

```bash
curl --noproxy '*' http://127.0.0.1:5000/api/v1/world/market-snapshot
```
