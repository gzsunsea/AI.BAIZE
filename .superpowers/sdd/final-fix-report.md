# Final Fix Report

Date: 2026-08-18

## Status

All seven Important full-branch review findings are addressed. No production runtime data was modified and no paid/runtime dependency was added.

## Important Findings

1. **Cumulative list and scroll restoration**
   - A `page=N` feed route now loads pages `1..N` and replaces the list with the deterministic cumulative result, so direct and restored URLs describe the same rendered inventory.
   - Page/load-more transitions retain the current scroll target. `popstate` records the saved target, route application enters loading synchronously, and scroll restoration runs only after the matching list load has completed and React has rendered it (two animation frames).
   - Added behavior coverage for cumulative page request generation and source-level restoration wiring.

2. **Native link affordances**
   - Hot-center cards, current-hotspot cards, feed titles, and story timeline titles are real anchors with durable `/story/:id` or `/item/:id` hrefs.
   - SPA navigation intercepts only unmodified primary clicks. Middle click, Cmd/Ctrl/Shift/Alt click, context menu, and explicit non-self targets retain native browser behavior.
   - Existing reader actions remain available after an intercepted click.

3. **Durable ordinary-item deep links**
   - Ordinary items now use `/item/:id`, not `/story/:id`.
   - Added `GET /api/public/items/:id`, a direct/reload-safe item contract backed by the existing allowlisted public serializer, plus explicit 404 behavior.
   - `/story/:id` remains reserved for eligible hotspot clusters; story timeline item links use `/item/:id` while plain clicks can still open the existing reader workspace route-neutrally.

4. **Consistent search/filter/sort state**
   - Added a shared client search pipeline for topic and reading views with the same direct/full fields and ordering rules as the server feed: direct is publication-descending; full relevance uses publication time as its tie-breaker.
   - Feed requests now apply URL `category` and `sort`; topic and reading modes apply `q`, `search`, `tag`, `category`, and `sort` consistently.
   - Search actions write their effective sort into the URL, so copied routes reproduce the same state.
   - Added behavioral tests covering direct/full scope, relevance, published ordering, category filtering, and allowlisted item responses.

5. **Transparent hotspot contract and UI**
   - Public `rules` now exposes all four score components, caps/decay/divisor values, and complete source-tier weights.
   - Hot topics now expose `latestAt`, a representative `summary`, and human-readable source names while still deduplicating/counting by internal source identity.
   - Hot cards show the latest activity time and summary; the hot page includes an expandable rule explanation.
   - Public item payloads remain allowlisted.

6. **Media proxy SSRF hardening**
   - Replaced auto-following `fetch` with explicit HTTP(S) hops. Every redirect target is parsed, protocol/hostname checked, DNS-resolved, and rejected if any result is private, loopback, link-local, multicast, unspecified, or otherwise non-public.
   - The validated DNS address is pinned into the actual socket lookup for that hop, preventing validation/request DNS rebinding.
   - Redirects are capped, response size is capped at 15 MiB, and the existing timeout remains.
   - Regression coverage includes IPv4 loopback/link-local, bracketed IPv6 loopback, the full IPv6 `fe80::/10` link-local range, private redirect targets, and DNS pinning.

7. **Frontend production validation**
   - `npm test` now includes `src/lib/*.test.mts` while retaining the existing CommonJS Node suites.
   - Added `npm run typecheck` and required React/Node type packages as development-only dependencies.
   - Updated `Item` for the optional full-search `content/raw` fields and fixed the compiler configuration for `.mts` imports and the current frontend target.
   - No-emit typecheck passes.

## Verification

- Focused review suite: `node --test src/lib/navigation.test.mts src/lib/experience.test.mts server/lib/experience.test.js server/index.test.js server/security.test.js` — passed.
- Full suite: `npm test` — 66 tests passed, 0 failed.
- Production build: `npm run build` — passed.
- No-emit frontend check: `npm run typecheck` — passed.
- Whitespace check: `git diff --check` — passed.
- Local API smoke (server imported without starting refresh jobs):
  - `/api/public/hot` — 200, 72-hour window and transparent rules present.
  - `/api/public/hot-topics` — 200 compatibility route.
  - `/api/public/items/:id` — 200 for a live item; internal `raw` field absent.
  - missing `/api/public/items/:id` — 404.
  - IPv6-loopback `/api/media` request — 400.

## Deferred Minor Issues / Concerns

- Node prints `MODULE_TYPELESS_PACKAGE_JSON` while executing the TypeScript navigation test. Converting the package to ESM would affect the CommonJS Express server, so this non-failing warning is consciously deferred.
- `npm install` reports four dependency-audit findings (one low, three high). An automatic audit fix was not applied because it is outside this review scope and may introduce dependency upgrades; no new runtime dependency was added.
- No real-browser visual automation is configured in this repository. The mobile overflow source/style regressions, production build, and route behavior tests pass, but the final 390 px visual click-through remains a manual release check.
- Production deployment and production `data/db.json` changes were intentionally not performed.

## Unfixed Important Findings

None.

## Final Three Whole-Branch Fixes — 2026-08-18

### Status

The final three review findings are addressed on top of `eb069bd`. No dependency or runtime-data changes were made.

### Fixes

1. **IPv6 SSRF classification**
   - Public-media validation now inspects embedded IPv4 values in compatible, mapped, translatable, and well-known NAT64 addresses, rejecting non-public destinations while preserving public ones. Local-use NAT64, discard-only, protocol-assignment, benchmarking, documentation, 6to4, retired 6bone, segment-routing, unique-local, link/site-local, multicast, and IPv6 addresses outside currently allocated global unicast space are rejected before a request hop is created.
   - Regression coverage includes `64:ff9b::7f00:1`, `64:ff9b:1::/48`, benchmarking, documentation, 6to4, and other non-global ranges, and asserts that `requestHop` remains uncalled.

2. **Copied topic/reading URL channel behavior**
   - The shared client feed-search contract now accepts `activeChannel` and matches both decorated channel keys and channel labels.
   - Topic and reading callers pass the URL-restored channel into the shared pipeline; behavior tests cover key-based topic URLs and label-based reading URLs.

3. **Unified hotspot transparency**
   - The selected-feed current-hotspot preview now displays `latestAt`, representative summary, `status`, and `heat` from the unified `HotTopic` contract.
   - The hotspot rule explanation now discloses source-tier increments and cap, independent-source increment and cap, freshness initial value, decay interval and floor, selected-score divisor and cap, total-score bounds, and every tier weight.

### Verification

- Focused security/search/hot suite: `node --test server/security.test.js server/lib/experience.test.js server/index.test.js src/lib/experience.test.mts src/lib/navigation.test.mts` — 59 passed, 0 failed.
- Full suite: `npm test` — 68 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed before this report append and repeated before commit.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning still appears during the TypeScript navigation test; resolving it would require a broader CommonJS/ESM packaging decision.
- No browser automation is configured, so the 390 px visual click-through remains a manual release check.
- Production deployment and production `data/db.json` changes were not performed.
