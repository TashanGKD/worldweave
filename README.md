# World Threads

`world` is the current world-signal, source-knowledge, and prediction runtime that powers:

- `skillhub/source catalog -> stable sources -> zvec source knowledge`
- external question intake and question-pool sync
- Chinese moderator / pro / con generation backed by recent evidence RAG
- world signal / briefing / report compatibility flows for evidence and agent handoff

It is still a standalone workspace today, but it is now being normalized so it can later plug into `Tashan-TopicLab` more cleanly.

## Current Product Truth

The primary product surface is now the homepage prediction arena backed by the source-knowledge runtime.

The practical canonical chain is:

1. `skillhub` and source catalog identify candidate sources
2. runtime upgrades stable sources and cools down failing ones
3. recent evidence is localized, labeled, and embedded into the zvec-backed source knowledge base
4. external forecasting questions enter the pool
5. RAG builds moderator, pro, and con views from source evidence
6. shrimp or fixed agents add human-readable discussion
7. official platform outcomes later validate the question

The older `briefing -> dispatch -> report` runtime still exists, but should now be treated as a compatibility and evidence layer rather than the main product narrative.

## Current Shape

Important directories:

- `src/`: production app code
- `public/`: static assets
- `scripts/`: build, start, health, smoke, and audit helpers
- `docs/`: architecture, alignment notes, and runbooks
- `research/`: source research, validation artifacts, and external reference repos

Generated or local-only directories:

- `.next/`
- `.cache/`
- `logs/`

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env.local
```

Required values are documented in `docs/getting-started/config.md`.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run locally

```bash
pnpm dev
```

Default local URL:

- `http://127.0.0.1:5000`

### 4. Build and run production mode

```bash
pnpm build
pnpm start
```

## Health And Smoke Checks

Daily health check:

```bash
pnpm health:world
```

Workspace boundary audit:

```bash
pnpm audit:workspace
```

Workspace cleanup:

```bash
pnpm clean:workspace
```

Reset runtime history, source-knowledge state, and live question caches:

```bash
pnpm reset:world-data
```

Runtime flow smoke check:

```bash
pnpm smoke:world-runtime
```

If you intentionally want the smoke check to create a new report entry:

```bash
WORLD_SMOKE_WRITE_REPORT=1 pnpm smoke:world-runtime
```

## PM2

The deployed process name is:

- `xia-report-world`

Recommended restart pattern:

```bash
pm2 restart xia-report-world --update-env
```

If the PM2 app ever starts without a valid production build, use the one-shot recovery flow:

```bash
pnpm recover:world
```

The workspace now also prefers local `.env.local` values inside `scripts/start.sh`, so runtime config is less likely to be polluted by outer shell variables.

## Docs

Start here:

- `docs/README.md`
- `docs/architecture/deductive-prediction-reset.md`
- `docs/architecture/source-knowledge-runtime.md`
- `docs/getting-started/quickstart.md`
- `docs/getting-started/config.md`
- `docs/getting-started/deploy.md`
- `docs/architecture/workspace-structure.md`
- `docs/architecture/root-boundary.md`
- `docs/architecture/topiclab-alignment.md`
- `docs/runbooks/runtime-stability.md`

## TopicLab Alignment

The long-term goal is not to freeze `world` as a messy one-off root. The goal is to make it easier to integrate into the broader `Tashan-TopicLab` ecosystem.

Reference repo kept inside this workspace:

- `research/external-repos/tashan-topiclab/`

The current strategy is:

1. stabilize runtime behavior
2. add self-checking and docs
3. normalize root boundaries
4. only then consider a larger package move such as a future `frontend/` boundary
