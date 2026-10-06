# Task 2 Report: Public Hot and Story APIs

## Implemented

- Added `GET /api/public/hot`, backed by `buildHotTopics(readState(), ...)` with the configured selected threshold and public item enrichment.
- Added `GET /api/public/stories/:id`, backed by `buildStory(...)`, with a JSON 404 response for unknown stories.
- Kept `/api/public/hot-topics` compatible while continuing to use the unified hot-topic builder.
- Added API coverage for the hot list, story detail, and missing-story behavior.
- Extended frontend contracts with `HotRules`, enriched `HotTopic`, `StoryDetail`, and `SearchState`.

## Verification

- `node --test server/index.test.js server/lib/experience.test.js` — 28 passed.
- `npm test` — 40 passed.
- `npm run build` — passed.
- `git diff --check` — passed.

## Concerns

- No known concerns. Production runtime data was not modified.

## Fix: public item serialization

- Added a focused public item serializer and applied it to representative items, related items, story timelines, latest updates, and the legacy hot-topics route.
- Added endpoint assertions covering management/runtime fields (`hidden`, `pinned`, `priorityTier`, `sourceId`, `mpMeta`, and related internals).

## Fix Verification

- `node --test server/index.test.js server/lib/experience.test.js` — 28 passed.
- `npm test` — 40 passed.
- `npm run build` — passed.
