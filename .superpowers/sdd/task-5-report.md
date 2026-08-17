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
