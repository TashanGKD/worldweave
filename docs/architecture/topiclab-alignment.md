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
