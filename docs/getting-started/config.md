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
| `OPENCLAW_BASE_URL` | recommended | OpenClaw / world bootstrap host |
| `INFORMATION_COLLECTION_BASE_URL` | recommended | information collection / article source backend |
| `MINIMAX_BASE_URL` | yes | MiniMax Anthropic-compatible base URL |
| `MINIMAX_MODEL` | yes | MiniMax model name |
| `MINIMAX_API_KEY` | yes | MiniMax API key |

## Expected MiniMax Endpoint

The expected value is:

```text
https://api.minimaxi.com/anthropic
```

The runtime now prefers local `MINIMAX_*` values over outer `ANTHROPIC_*` values to reduce environment pollution.

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
