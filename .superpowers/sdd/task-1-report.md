# Task 1 Report

## Status

DONE

## Implementation

- Added versioned 72-hour hot rules, deterministic tier-weighted heat, status, rank, sorting, and configurable limits to `buildHotTopics`.
- Preserved eligibility requirements for independent sources and pinned threshold items.
- Added `buildStory`, querying all eligible clusters, sorting updates newest-first, limiting latest updates to three, and omitting internal `relatedItems` from the event payload.
- Added focused red/green tests for the hot-topic and story-detail contracts.

## Verification

- `node --test server/lib/experience.test.js` — 15 passed.
- `npm test` — 36 passed.
- `git diff --check` — passed.

## Commit

`feat: add transparent hot story domain model` (final commit hash supplied in handoff)

## Concerns

The existing five-item test now passes an explicit `limit: 5`; the new default is the specified ten-item hot-list limit, while story detail uses an unlimited eligible-cluster query.

## Fixes After Review

- Updated `server/lib/experience.js` to recognize production tier names (`official_first_party`, `expert_rss`, and `community_fallback`) and to fall through from an unknown `priorityTier` to `sourceTier` and `tier` before applying the default weight.
- Added behavior tests in `server/lib/experience.test.js` covering the default ten-item hot-list limit, story lookup beyond the top ten, omission of `event.relatedItems`, the three-item `latestUpdates` cap, and tier/priority fallback heat differences.

### Verification

- `node --test server/lib/experience.test.js` — 19 passed.
- `npm test` — 40 passed.
- `git diff --check` — passed.

### Fix Commit

`fix: normalize hot topic source tiers` (commit hash supplied in handoff).
