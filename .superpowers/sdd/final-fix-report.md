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

## Final Review Follow-up — 2026-08-18

### Status

The four final review findings are addressed on top of `6963b8e`. No dependency or runtime-data changes were made.

### Fixes

1. **IANA-grounded media-target validation**
   - The media proxy now uses an explicit globally-routable predicate for IPv4 and IPv6 instead of a private-address-only predicate.
   - IPv4 special-purpose ranges include protocol assignments (with the globally reachable PCP/TURN anycast exceptions), documentation networks, benchmarking, shared address space, link-local, private, loopback, multicast, reserved, and deprecated 6to4 relay space.
   - IPv4-compatible, IPv4-mapped, IPv4-translatable, and well-known NAT64 forms are decoded and subjected to the same IPv4 predicate before `requestHop` can run.

2. **Dedicated `/hot` scroll restoration**
   - Leaving `/hot` stores a dedicated hot-list scroll snapshot independent of feed filters and pagination.
   - Browser automatic scroll restoration is disabled for the SPA lifecycle. A `popstate` back to `/hot` records the pending snapshot, reloads matching hot data, and restores only after data is present and React has rendered it.

3. **Origin-aware story return copy**
   - Story navigation records whether it came from the feed or hotspot list. Story success and error states display `返回信息流` for feed/selected-preview origins and `返回热点榜` for hotspot origins.
   - Direct story URLs retain the safe existing fallback to the hotspot list.

4. **Whitespace cleanup**
   - Removed the two trailing-space sequences from `docs/superpowers/specs/2026-08-17-hot-center-search-experience-design.md`.

### Verification

- Focused SSRF/hot/navigation/story suite: `node --test server/security.test.js server/lib/experience.test.js server/index.test.js src/lib/navigation.test.mts src/lib/experience.test.mts` — 64 passed, 0 failed.
- Full suite: `npm test` — 73 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- No real-browser automation is configured, so scroll behavior still benefits from a manual browser release check despite the storage and source-level regression coverage.
- Production deployment and production `data/db.json` changes were not performed.

## Final IPv6 SSRF Follow-up — 2026-08-18

### Status

The remaining Important SSRF finding is addressed on top of `3fdf90b`. Redirect-hop validation and DNS pinning are unchanged.

### Fix

- Replaced the broad `2000::/3` IPv6 admission rule with an explicit snapshot of the IANA IPv6 Global Unicast Address Space allocation registry. Unlisted and reserved blocks such as `2d00::/8`, `3000::/5`, `3800::/6`, and the upper `3f00::/9` reservations are rejected before `requestHop`.
- Preserved the non-global special-purpose exclusions while allowing the IANA-marked globally reachable more-specific assignments within `2001::/23`, including `2001:1::1`.
- Added DNS/request-hop regression coverage proving reserved addresses never reach the request hop, `2001:1::1` does, and mapped/NAT64 private destinations remain blocked.

### Verification

- Focused security suite: `node --test server/security.test.js` — 11 passed, 0 failed.
- Full suite: `npm test` — 75 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed before this report append and repeated before commit.

### Remaining Concerns

- The IPv6 allocation allowlist intentionally tracks the IANA registry snapshot dated 2025-10-10; future IANA global-unicast allocations require a code update before the proxy will accept them.
- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- Production deployment and production `data/db.json` changes were not performed.

## Final Hot Privacy and Snapshot Follow-up — 2026-08-18

### Status

The final two Important findings are addressed on top of `36233c1`. No dependency or runtime-data changes were made.

### Fixes

1. **Public hotspot and story eligibility**
   - Hot-topic construction now removes hidden items and items without original HTTP(S) URLs before source counting, representative selection, score/recency calculation, related-item output, and cluster eligibility.
   - The predicate matches the existing `/api/public/items/:id` public eligibility semantics, so a hidden or invalid-URL second source can no longer make a single-public-source cluster eligible.
   - Unit and live Express endpoint regressions cover hidden/invalid high-score representatives, hidden/invalid second-source eligibility, clean public topic output, public story timelines, and 404 responses for ineligible stories.

2. **Feed and hotspot scroll snapshot isolation**
   - Navigation snapshot capture is route-aware: feed routes write only their keyed list snapshot, hotspot routes write only the dedicated hotspot scroll snapshot, and story/item routes write neither.
   - The feed list key remains unchanged for restoration, while leaving a story can no longer overwrite it with story scroll and feed-shaped state.
   - A storage-level regression exercises feed -> hot -> story -> back -> back state and proves the original feed and hotspot snapshots remain independent.

### Verification

- Focused hot/API/navigation suite: `node --test server/lib/experience.test.js server/index.test.js src/lib/navigation.test.mts src/lib/experience.test.mts` — 58 passed, 0 failed.
- Full suite: `npm test` — 78 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed after this report append.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- No real-browser automation is configured, so browser history scroll behavior still benefits from a manual release click-through despite the route/storage regression coverage.
- Production deployment and production `data/db.json` changes were not performed.

## Release Review Contract Follow-up — 2026-08-18

### Status

The final three release-review findings are addressed on top of `55068eb`. No dependency, deployment, or runtime-data changes were made.

### Fixes

1. **Pinned DNS lookup callback contract**
   - The media request hop now returns a one-element address array when Node requests `lookup(..., { all: true }, callback)` and retains the scalar address/family callback for ordinary lookup calls.
   - Regression coverage exercises both callback shapes and the real default HTTP request hop, rather than only an injected `requestHop` stub.

2. **Public hotspot derived data**
   - Hotspot title, summary fallback, top score, heat, and ranking are derived only from filtered public members. Precomputed cluster title and score can no longer carry hidden representative data into public output or ranking.

3. **Public item related metadata**
   - Durable public item detail recomputes related count, display sources, and top score from public cluster members before serialization, preventing hidden member metadata from appearing in `/api/public/items/:id` responses.

### Verification

- Focused security/hot/item suite: `node --test server/security.test.js server/lib/experience.test.js server/index.test.js` — 48 passed, 0 failed.
- Full suite: `npm test` — 82 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- Production deployment, pushing, and production `data/db.json` changes were not performed.

## Source Quality Storage-Gap Follow-up — 2026-08-18

### Status

The four Important source-quality review findings are addressed on top of `f98cb30`. No dependency, deployment, or runtime-data changes were made.

### Fixes

1. **Legacy reference-source exclusion**
   - Selected eligibility now recognizes legacy AIHOT/reference records by `sourceKind`, `sourceId`, `sourceTier`, or the canonical source name even when `priorityTier` is absent.
   - Explicitly pinned records keep their editorial exception, while hidden or non-HTTP(S) pinned records remain ineligible through the complete public predicate.

2. **One complete selected boundary for Ask Baize and the feed**
   - A shared scoring-layer predicate now enforces visibility, original HTTP(S) URL, pinned semantics, calibrated selected threshold, reference exclusion, and selected-quality rules.
   - Ask Baize uses the same boundary as the selected feed, reports `grounded: false` when no eligible evidence exists, and cannot cite hidden, invalid-URL, low-score, or legacy reference records.

3. **Read-time calibration for stored saturated scores**
   - Existing stored `score` values remain unchanged for display and persistence.
   - Selected thresholding and ordering use a separate read-time score that blends the current quality model with the stored score, so legacy `99` values no longer flatten ranking or admit weak community records automatically.
   - The X share is enforced as a cap during curated selection so the new ordering cannot overflow the configured mix.

4. **Evidence-safe recommendation reasons and channel precedence**
   - Valid `aiSelectedReason` and `editorialJudgment` strings are preserved instead of being overwritten.
   - Automatic fallback copy is neutral and limited to source, title, topic hints, and summary evidence; it no longer invents claims that a source published, reported, analyzed, or broke down an event.
   - Explicit `expert_rss` classification now wins before broad social and Chinese-source name heuristics.

### Verification

- TDD RED: the focused suite initially failed on legacy reference admission, Ask citations, stored-score thresholding, editor-reason overwrite, and expert-channel precedence.
- Focused suite: `node --test server/lib/scoring.test.js server/lib/askBaize.test.js server/lib/editorial.test.js server/index.test.js` — 28 passed, 0 failed.
- Full suite: `npm test` — 94 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed before this report append and will be repeated before commit.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- Production deployment and production `data/db.json` changes were not performed.

## AIHOT Source-Bridge Compatibility Follow-up — 2026-08-18

### Fixes

- AIHOT scraping now supports both legacy timeline cards and the current mobile row-card markup.
- Embedded Next flight `initialItems` are parsed when the public page does not render cards in server HTML.
- Detail-page original-link resolution ignores `beian.miit.gov.cn` footer links so备案页不会被误当成原文。

### Verification

- Focused scraper suite: `node --test server/lib/scrapers.test.js` — 7 passed, 0 failed.
- Full suite and production checks are rerun before release.

## Refresh Merge Preservation Follow-up — 2026-08-18

### Status

The two Important refresh-merge findings are addressed on top of `78e66c5`. No dependency, deployment, or runtime-data changes were made.

### Fixes

1. **Stored display score preservation**
   - Refresh upserts keep an existing stored score while selected ranking remains calibrated only at read time.
   - A filesystem-backed regression exercises the real `upsertItems` path and proves a legacy display score is not replaced by the newly normalized score.

2. **Explicit and stored recommendation reason preservation**
   - Valid `reason`, `aiSelectedReason`, and `editorialJudgment` inputs share one authoritative validation path.
   - Refresh-generated automatic or rejected template copy cannot replace a valid stored editor or LLM reason; a new validated explicit reason remains eligible to replace it.

### Verification

- TDD RED: the focused suite first failed on both raw-reason normalization and real refresh upsert preservation.
- Focused suite: `node --test server/lib/scoring.test.js server/lib/store.test.js` — 11 passed, 0 failed.
- Full suite: `npm test` — 96 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed before this report append and will be repeated before commit.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- Production deployment and production `data/db.json` changes were not performed.

## Final Enhancer, Legacy Link, and Ranking Follow-up — 2026-08-18

### Status

The final three source-quality regressions are addressed on top of `8b4894a`. No dependency, deployment, or runtime-data changes were made.

### Fixes

1. **Enhancement reason authority**
   - Rules and Ollama enhancement continue to refresh summaries and editorial briefs, but preserve validated `aiSelectedReason`, `editorialJudgment`, raw source reasons, and stored editor reasons.
   - Existing rule/Ollama reasons and deterministic normalization fallback copy remain replaceable, so automatic enhancement can still improve automatic text without overwriting editorial judgment.

2. **Legacy timeline title links**
   - Legacy AIHOT cards now prefer `.timeline-title[href]`, then nested `.timeline-title a[href]`, then the first generic anchor.
   - The existing mobile-row and embedded Next-flight parsing paths remain unchanged.

3. **Raw ranking-signal fallback**
   - Read-time selected ranking now falls back to normalized-item `raw.stars`, `raw.comments`, and `raw.topicBoosts` when the corresponding top-level value is absent.
   - A threshold-boundary regression proves raw-only signals produce the same selected score as their top-level normalized equivalents.

### Verification

- TDD RED: the focused suite first failed on explicit-reason overwrite, the nested legacy title link producing no item, and raw-only ranking signals falling below the selected boundary.
- Focused suite: `node --test server/lib/llmEnhancer.test.js server/lib/scrapers.test.js server/lib/scoring.test.js` — 19 passed, 0 failed.
- Full suite: `npm test` — 102 passed, 0 failed.
- No-emit frontend check: `npm run typecheck` — passed.
- Production build: `npm run build` — passed.
- Whitespace check: `git diff --check` — passed before this report append and will be repeated before commit.

### Remaining Concerns

- The existing `MODULE_TYPELESS_PACKAGE_JSON` warning remains during the TypeScript navigation test; resolving it requires a broader CommonJS/ESM packaging decision.
- Production deployment and production `data/db.json` changes were not performed.
