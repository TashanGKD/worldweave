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

Node.js `22.21+` can apply proxy variables to built-in `fetch`, `http` and
`https` requests when `NODE_USE_ENV_PROXY=1`. For a Docker deployment whose
forward proxy runs on the host, add the following values to the WorldWeave
repository's `DEPLOY_ENV`:

```env
NODE_USE_ENV_PROXY=1
HTTP_PROXY=http://host.docker.internal:1081
HTTPS_PROXY=http://host.docker.internal:1081
http_proxy=http://host.docker.internal:1081
https_proxy=http://host.docker.internal:1081
NO_PROXY=localhost,127.0.0.1,::1,host.docker.internal,worldweave,worldweave-refresh,.tashan.chat,.tashan.ac.cn,newapi.tashan.chat,coding.dashscope.aliyuncs.com,dashscope.aliyuncs.com,metaso.cn,.scnet.cn,api.scnet.cn,.aliyuncs.com,.aliyun.com,eastmoney.com,push2.eastmoney.com,push2his.eastmoney.com,.coze.cn,api.coze.cn
no_proxy=localhost,127.0.0.1,::1,host.docker.internal,worldweave,worldweave-refresh,.tashan.chat,.tashan.ac.cn,newapi.tashan.chat,coding.dashscope.aliyuncs.com,dashscope.aliyuncs.com,metaso.cn,.scnet.cn,api.scnet.cn,.aliyuncs.com,.aliyun.com,eastmoney.com,push2.eastmoney.com,push2his.eastmoney.com,.coze.cn,api.coze.cn
```

Both Compose services already load the same `.env`; proxy endpoints therefore
stay in `DEPLOY_ENV` rather than being embedded in the image or Compose file.
The Compose services add `host.docker.internal` through `host-gateway` for
Linux deployment hosts.

This machine may also have local proxy variables such as:

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
