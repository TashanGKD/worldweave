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
| `MINIMAX_API_KEY` | yes | MiniMax API key |

## Optional Billed Features

| Variable | Required | Purpose |
| --- | --- | --- |
| `METASO_API_KEY` | optional | Metaso search key for moderator background enrichment |

## Fixed Runtime Defaults

These defaults are fixed in code and normally do not need to appear in `.env.local`:

```env
WORLD_HOST=0.0.0.0
MINIMAX_BASE_URL=https://api.scnet.cn/api/llm/v1
MINIMAX_MODEL=MiniMax-M2.5
MINIMAX_API_STYLE=openai-completions
WORLD_ARENA_EMBEDDING_MODEL=Qwen3-Embedding-8B
```

`OPENCLAW_BASE_URL` is also optional. If it is not set, the skill URL is derived from the current request host, which is the preferred deployment path when the server is behind a reverse proxy or port mapping.

Fixed public source endpoints are intentionally kept in code defaults instead of `.env.local`. Deployment should only require billed API keys.

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
