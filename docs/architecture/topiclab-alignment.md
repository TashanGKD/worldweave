# TopicLab Alignment

## Why This Exists

`world` is not supposed to stay a forever-isolated experimental folder. It should gradually become a cleaner package that can later plug into `Tashan-TopicLab` with minimal friction.

The point is not rigid one-to-one mirroring. The point is:

- align engineering boundaries
- expose missing runbooks and health checks
- keep research-heavy workflows without letting them dominate the product root

Reference repo used for this alignment:

- `research/external-repos/tashan-topiclab/`

## What TopicLab Does Better Right Now

The reference repo already has clear top-level separation:

- `frontend/`
- `backend/`
- `topiclab-backend/`
- `docs/`
- `scripts/`
- subprojects with explicit ownership

It also treats operational checks as first-class repo behavior, not as tribal memory.

## Current World Status

Current `world` strengths:

- app code is already mostly concentrated in `src/`
- scripts are small and readable
- research material is at least grouped under `research/`
- we now have a working runtime health check

Current `world` weaknesses:

- root still mixes product, runtime artifacts, research, and external repos
- there is no explicit package boundary such as `frontend/`
- runtime health used to depend on manual intuition rather than scripted checks
- external environment pollution could silently override local config

## Alignment Map

TopicLab style:

- `docs/` is the permanent home for architecture and runbooks
- `scripts/` is the home for smoke and operational helpers
- subprojects have stable ownership boundaries

World target:

- keep `src/` as the current product code root for now
- treat `docs/` and `scripts/` as mandatory, not optional
- keep `research/` for source-hub work, validation, and external references only
- prevent generated outputs from cluttering the root

## Gaps We Have Identified

1. No stable package boundary yet

`world` still behaves like a repo-root app instead of a future `frontend/` package.

2. Runtime artifacts are too visible

These are expected locally, but should not shape our mental model of the project:

- `.next/`
- `.cache/`
- `logs/`
- `graphify-out/`
- `.graphify-venv/`

3. Self-checking was too weak

The MiniMax issue showed that a system can look "mostly fine" while a critical dependency is misconfigured. That should have been caught by an automated health check much earlier.

4. Environment precedence was under-specified

The runtime used to be vulnerable to outer shell values overriding local intent.

## Immediate Rules

These are the rules we should follow before any larger refactor:

1. New production code goes into `src/`, `public/`, or `scripts/`.
2. New architectural or runbook knowledge goes into `docs/`.
3. New source exploration or repo snapshots go into `research/`.
4. New generated outputs must be ignored and kept out of normal review flow.
5. Any new runtime dependency should get at least one scripted health probe.

## Source Feed Bridge

WorldWeave should not replace TopicLab's topic, post, or discussion storage. The safe integration boundary is:

1. WorldWeave owns signal discovery, source freshness, source scoring, and LiveBench evaluation.
2. TopicLab owns topic creation, AI discussion, posts, and user-facing topic history.
3. WorldWeave exposes a TopicLab-shaped source-feed list at `/api/v1/topiclab/source-feed/articles`.
4. TopicLab can consume that list as a source channel and keep its existing article-to-topic flow.
5. Skill and LiveBench remain standalone WorldWeave modules, similar to a SkillHub-style companion module.

This keeps source signals usable as discussion seeds without creating a hard dependency that would leave TopicLab blank if WorldWeave is warming up.

### Frontend Integration

The TopicLab frontend can treat WorldWeave as the replacement for the main information source-feed page, not as a replacement for the whole TopicLab app.

Recommended frontend shape:

1. Keep TopicLab's existing `SourceFeedPage` card actions: favorite, like, share, and reply-to-topic.
2. Replace the existing media tab with a `WorldWeave` or `世界脉络` tab.
3. In that main information tab, call the normal `sourceFeedApi.list(...)` path with `source_type=worldweave-signal`.
4. Render the returned rows with the existing `SourceArticleCard` first; only introduce a richer WorldWeave card once the basic article-to-topic path is proven.
5. Do not iframe or deep-link to the WorldWeave dashboard as the primary flow. The dashboard remains useful for operators, while TopicLab users need cards that can become topics.

This gives users a WorldWeave-facing source page while preserving TopicLab's discussion UX and existing state.

### Backend Integration

The TopicLab backend should keep `/source-feed/articles` as the single source-feed boundary. WorldWeave is one upstream source behind that boundary.

Recommended backend shape:

1. Add `WORLDWEAVE_BASE_URL` as a non-secret environment value.
2. In `topiclab-backend/app/api/source_feed.py`, route `source_type=worldweave-signal` to `${WORLDWEAVE_BASE_URL}/api/v1/topiclab/source-feed/articles`.
3. Keep the existing Information Collection upstream for all other `source_type` values.
4. Normalize returned rows through the same source article shape before `annotate_source_articles_with_interactions(...)`.
5. Keep `/source-feed/articles/{article_id}/topic` unchanged. The frontend already sends a snapshot when creating a topic, so WorldWeave rows can become topics even when the external article detail endpoint is not implemented yet.

This mirrors the old TopicLab pattern: one source-feed API, multiple upstream source channels, one downstream topic/discussion system.

### Integration Checklist

Use this as the handoff checklist before deploying the TopicLab side:

1. Set `WORLDWEAVE_BASE_URL` in TopicLab backend env. Use the internal service URL when both apps run in the same network; otherwise use the stable public WorldWeave URL.
2. Verify WorldWeave directly: `GET {WORLDWEAVE_BASE_URL}/api/v1/topiclab/source-feed/articles?limit=3&source_type=worldweave-signal`.
3. Verify TopicLab proxy: `GET {TOPICLAB_BACKEND}/source-feed/articles?limit=3&source_type=worldweave-signal`.
4. Open `/info/source` and confirm the cards show TopicLab interactions: like, favorite, share, and reply-to-topic.
5. Create one topic from a WorldWeave card. The topic creation path should use the existing snapshot fallback and should not require a WorldWeave article-detail endpoint.
6. Keep `/info/academic` on the existing IC / arXiv path unless a separate replacement is explicitly planned.

## Near-Term Refactor Direction

When we decide to do a larger structural pass, the safest order is:

1. Keep current runtime stable.
2. Freeze health checks.
3. Add docs for deploy and runbook flows.
4. Move the app into a clearer package boundary only when deploy scripts are updated in the same change.

The most likely long-term shape is:

- `frontend/` for the current Next app
- `docs/` for architecture and runbooks
- `scripts/` for build, deploy, and health checks
- `research/` for source and graph experiments

## Definition Of Better

We should consider this alignment successful when:

- a new collaborator can tell product code from local artifacts in under one minute
- MiniMax, market snapshot, and homepage health can be verified with one command
- moving the app under a future `frontend/` boundary becomes mechanical rather than risky
