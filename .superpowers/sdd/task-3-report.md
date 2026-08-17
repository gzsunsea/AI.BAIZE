# Task 3 Report: URL State and Lightweight History Navigation

## Delivered

- Added `src/lib/navigation.ts` with typed route parsing and URL generation for feed, hot, and story paths.
- Added session-scoped list snapshots containing only `scrollY` and filter/pagination state.
- Connected App state to `pushState`/`popstate`: filter changes and pagination update the feed URL, item opening pushes `/story/:id`, and browser back restores the prior list state and scroll position.
- Closing a navigated story uses browser history; a directly opened story falls back to `/hot`.
- Kept the current feed and reader experience in place; no page redesign was included.

## TDD Evidence

1. Created `src/lib/navigation.test.mts` before the navigation module.
2. `node --test src/lib/navigation.test.mts` failed with `ERR_MODULE_NOT_FOUND` for `navigation.ts`, as expected.
3. Implemented the minimal navigation layer and re-ran the focused test successfully.

## Verification

- `node --test src/lib/navigation.test.mts` — 2 passing.
- `npm test` — 40 passing.
- `npm run build` — passing.
- `git diff --check` — clean.

## Scope Notes

- `/hot` and `/story/:id` are now durable navigation states. Their dedicated rendered pages remain intentionally deferred to Task 4, so this task preserves the existing feed/reader presentation while establishing the route and back-stack behavior it will use.

## Commit

- `41e6a7b feat: add URL-driven navigation state`

## Review Fixes (2026-08-17)

- Feed loading is now driven by `route.pageNumber`: direct and browser-history URLs such as `?page=3` fetch the requested page without replacing the URL or forcing page 1. The load-more path explicitly preserves append behavior.
- All active fallback-feed controls now use `updateFeedRoute`, including search, status, channel, tag, pagination, and navigation mode changes. Mode switches also keep category/channel route fields coherent for daily, MP, and topic modes.
- Direct `/story/:id` routes fetch `/api/public/stories/:id`, hydrate the existing reader with the representative item and related updates, and show a bounded loading/error placeholder whose close action falls back to `/hot`.
- Legacy App anchors now preserve native behavior for modified, non-primary, and explicit-target clicks; SPA opening is limited to a plain primary click targeting the current browsing context.
- Added focused navigation assertions for direct filter/page parsing and link-click interception.

### Verification After Fixes

- `node --test src/lib/navigation.test.mts` — 4 passing (Node emitted the existing module-type warning only).
- `npm test` — 40 passing.
- `npm run build` — passing.
- `git diff --check` — clean.
