# Quick Start

## Prerequisites

- Node.js 22.21+
- `pnpm`
- a valid MiniMax key for the Anthropic-compatible endpoint

## 1. Configure environment

```bash
cp .env.example .env.local
```

Fill in at least:

- `MINIMAX_API_KEY`

Optional paid enrichment uses `METASO_API_KEY`. The public skill URL is derived from the request host by default, so `OPENCLAW_BASE_URL` is usually unnecessary when the server is behind a normal reverse proxy or port mapping.

## 2. Install dependencies

```bash
pnpm install
```

## 3. Start local development

```bash
pnpm dev
```

Open:

- `http://127.0.0.1:5000`

## 4. Verify runtime health

```bash
pnpm health:world
pnpm smoke:world-runtime
```

## 5. Production mode

```bash
pnpm build
pnpm start
```

If you are using PM2:

```bash
pm2 restart xia-report-world --update-env
```
