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
