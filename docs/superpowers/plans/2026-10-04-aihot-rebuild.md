# AI.BAIZE Independent Rebuild Implementation Plan

> For agentic workers: use subagent-driven-development for independent audit and review work; execute integration serially. Each stage must leave reviewable evidence.

**Goal:** Replace AI.BAIZE's entire old frontend with the AIHOT frontend at 309e32eb343a57d721525f04956887d3b9057fdf, keep its own brand and real data, verify locally and in production before removing old pages.

**Architecture:** Import apps/web, packages/contracts, industry and site as a new web workspace. Existing collection services remain behind an HTTP adapter which implements the new site's read contracts and protected management flows. Candidate runs separately; production domain switches only after verification.

**Tech Stack:** React Router SSR, Tailwind, TypeScript, Express collection service, Nginx, systemd.

## Global Constraints

- Preserve AI.BAIZE name, wordmark, icon, domain and verified ICP identity.
- Retain MIT and font license; do not reuse AIHOT's brand assets or invented author identity.
- No paid APIs, fabricated data, unauthenticated admin, production data replacement, or pre-validation old UI deletion.
- Preserve pre-rebuild snapshot e0d9943 and rollback/pre-aihot-rebuild-20261004.
- Read all upstream source files and record audit inventory with SHA-256 hashes.

### Task 1: Audit and preservation

- [x] Snapshot existing modifications in Git and create isolated rebuild/aihot-20261004 worktree.
- [x] Back up production code, database, service and Nginx separately.
- [ ] Complete frontend audit, backend audit and deployment/license audit; record findings under docs/rebuild/.
- [ ] Run baseline npm test and record failures if any; resolve relevant failures before release.

### Task 2: New web workspace

- [ ] Copy upstream web/contracts/industry/site and licenses with reference commit recorded.
- [ ] Configure npm workspaces and Node runtime; build upstream web without importing old src/.
- [ ] Replace site name, wordmark, icon, manifest, policy facts and changelog with actual AI.BAIZE values.
- [ ] Remove upstream admin routes from initial web only if replaced by protected new management pages before release; unsupported functions cannot be silent placeholders.
- [ ] Run web unit tests, typecheck and build.

### Task 3: Site data adapter

- [ ] Write HTTP contract tests for public visibility, filters, cursor/page validation, unavailable IDs, reports/archives, bookmarks availability, and admin authentication before adapter implementation.
- [ ] Mount server/site/index.js before old static fallback; projections in server/site/projections.js implement packages/contracts/src/site.ts.
- [ ] Provide real timeline/pool/detail/hot/story/topics/report/stat/meta/contact/changelog data from existing editorial and experience functions. Null means genuinely unavailable, never invented trend points.
- [ ] Implement feedback and protected management adapters, policy/static/agent endpoints, and retain existing collector.
- [ ] Run server tests and web runtime smoke against copied database; no live model calls from page rendering.

### Task 4: Review and candidate deployment

- [ ] Browser test responsive widths 375/390/640/768/960/1024/1440 and light/dark themes.
- [ ] Exercise navigation/search/filter/load-more/collapse/bookmark/back/report/archive/original/share/feedback/admin flows.
- [ ] Compare upstream/new screenshots with fixed data; record every meaningful difference.
- [ ] Run complete tests/typecheck/build, dependency audit and independent review; resolve actionable findings.
- [ ] Upload candidate to separate release directory and run loopback ports; check candidate before changing Nginx.

### Task 5: Switch and cleanup

- [ ] Switch Nginx to verified new web; preserve old service as immediate rollback until live verification passes.
- [ ] Verify public pages/data/assets/admin boundaries over HTTPS.
- [ ] Delete old src/styles/entry/dist from active release and commit deletion only after new site verification; retain collector files used by new site and historical Git/rollback archives.
- [ ] Push branch and create/attach PR or deliver verified remote commits; record deploy URL, validation results, diff audit and exact old UI deletion evidence.

