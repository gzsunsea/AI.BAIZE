# Task 5 Report: search mode, URL filters, and list restoration

## Delivered

- Added accessible `直接匹配` and `全文相关` search tabs to `FeedExperience`; the active tab exposes `aria-selected` and mobile tabs scroll horizontally without widening the page.
- Added `searchMode` state to the feed route flow and to `/api/items` requests. Filter changes use `replaceState`; pagination is the only feed update that creates a page-specific history entry.
- Preserved list snapshots before navigation, including query, filter state, page, and scroll position; `popstate` restores scroll position on the next animation frame.
- Added backend direct/full search behavior. Direct search uses title, summary, source, and tags with newest-first ordering. Full search additionally checks source content and editorial fields, then ranks matching fields before publication time.
- `/api/items` now returns `search: { query, mode, sort }`.

## Verification

- TDD source-contract test was added first and observed failing before implementation.
- `node --test server/index.test.js server/lib/experience.test.js src/lib/experience.test.mts src/lib/navigation.test.mts` — 44 passed.
- `npm test` — 40 passed.
- `npm run build` — passed.
- `git diff --check` — passed.

## Notes

- No dependencies or production runtime data were changed.
- The existing Node warning about `src/lib/navigation.ts` being reparsed as ESM remains; it predates this task and does not affect test success.

## Review fixes

- Full search now uses the same extended editorial/content fields for topic and reading feeds, with relevance ordering before their existing tie-breakers. Direct mode remains limited to title, summary, source, and tags.
- Feed loads use a monotonically increasing request version. Route transitions invalidate prior loads, and stale success/error/finally paths cannot overwrite items, totals, or loading state for the current route.
- `/api/items` normalizes all optional direct and full fields before joining them, preventing literal `undefined` from becoming searchable content. The endpoint response assembly is now a pure helper used by the route, enabling deterministic response-contract tests without changing runtime data.
- Added regression coverage for direct/full field selection, relevance order, echoed search metadata, topic/reading full-mode paths, and stale-load guard wiring.

## Review verification

- `node --test server/index.test.js server/lib/experience.test.js src/lib/experience.test.mts src/lib/navigation.test.mts` — 46 passed.
- `npm test` — 41 passed.
- `npm run build` — passed.
- `git diff --check` — passed.
