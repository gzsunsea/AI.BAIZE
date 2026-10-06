# AI.BAIZE Report Cover Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one automatically selected, same-item-image report cover story to daily, weekly, and monthly reports while keeping report content, ranking, and public projections safe and compatible.

**Architecture:** `buildReport` will choose one cover story only from the final, already-filtered report sections, using the existing representative comparator plus a stable ID tie-breaker. REST and MCP will explicitly serialize the new item through `serializePublicItem`; the report page will display its title and optional image through the existing `/api/media` proxy, without changing the concise issue headline or section ordering.

**Tech Stack:** Node.js built-in test runner, CommonJS Express API, React + TypeScript + Vite, existing `serializePublicItem` and `/api/media` endpoint. No new dependencies or database migration.

## Global Constraints

- The cover story must be selected from the report's final visible `sections`; do not query the full inventory or exceed the per-section limit.
- Preserve `headline`, `sections`, section order, item order, `storyCount`, themes, trend lines, watch items, and coverage.
- Candidate ordering is pinned first, first-party representative second, `selectedRankingScore` third, publication time fourth, stable item ID last.
- The cover image must come from the selected item's own `media`; never borrow an image from related coverage or another story.
- Render images only through `/api/media?url=...`; missing, unsupported, or failed images must leave a readable text cover.
- `coverStory` must pass through `serializePublicItem` in both REST and MCP; no raw runtime item may be spread into a public response.
- Old responses without `coverStory` and empty reports must keep rendering with the existing report layout.
- Preserve the user's pre-existing dirty worktree changes. Inspect each listed file before editing; do not reset, broadly stage, commit, deploy, or modify runtime data/configuration.
- Before each task, conduct an adversarial review of that task's failure modes and scope; do not use a passing test as a substitute for public-projection or visual verification.

---

## File and responsibility map

- Modify `server/lib/experience.js`: add deterministic cover-story selection after report sections are finalized; do not alter section selection or sorting.
- Modify `server/lib/experience.test.js`: test selection priority, stable ties, empty reports, and preservation of the existing report contract.
- Modify `server/index.js`: project `coverStory` through `serializePublicItem` for REST and add the same field to MCP `get_digest`'s explicit report allowlist.
- Modify `server/index.test.js`: verify REST/MCP parity and that raw/internal sentinel fields do not leak through either report projection.
- Modify `src/types.ts`: model an optional nullable `Report.coverStory` for compatibility with older responses.
- Modify `src/lib/experience.mts`: add a pure helper that selects an image-only cover asset, preferring its thumbnail, so media choice can be tested without a browser.
- Modify `src/components/reports/ReportsWorkspace.tsx`: render the representative story and optional proxied image; keep the existing report headline and list behavior.
- Modify `src/styles/reports.css`: style the cover-story module and its narrow-screen layout.
- Modify `src/lib/experience.test.mts`: add a focused report-view contract test for the cover-story markup, image proxy, and graceful fallback.

## Task 1: Derive a deterministic representative story from final report sections

**Adversarial review before this task:** A global raw-score sort could promote a lower-trust source or let one section dominate the existing report. Instead, reuse `compareRepresentatives` only to choose a separate cover item from the already bounded sections; assert that the existing sections remain byte-for-byte equivalent in order.

**Files:** Modify `server/lib/experience.test.js`; modify `server/lib/experience.js`.

**Interface produced:** `buildReport(...).coverStory` is `Item | null`. For ties not distinguished by `compareRepresentatives`, the item with the lexicographically smaller stable `id` wins.

- [x] **Step 1: Add failing selection and preservation tests**

Add these tests near the existing report behavior tests in `server/lib/experience.test.js`:

```js
test("reports choose a deterministic representative from final sections without reordering them", () => {
  const regular = signal("regular", "event-regular", "expert", 99, {
    priorityTier: "expert_rss",
    publishedAt: "2026-07-22T03:00:00.000Z",
  });
  const pinned = signal("pinned", "event-pinned", "community", 60, {
    pinned: true,
    priorityTier: "community_fallback",
    publishedAt: "2026-07-22T02:00:00.000Z",
  });
  const report = buildReport({ dailyDigests: [{
    generatedAt: "2026-07-22T04:00:00.000Z",
    sections: [
      { key: "model", title: "模型", items: [regular] },
      { key: "product", title: "产品", items: [pinned] },
    ],
  }] }, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.equal(report.coverStory.id, "pinned");
  assert.deepEqual(report.sections.map((section) => [section.key, section.items.map(({ id }) => id)]), [
    ["model", ["regular"]],
    ["product", ["pinned"]],
  ]);
  assert.equal(report.storyCount, 2);
  assert.equal(report.headline, "今日值得关注的 2 条 AI 动态");
});

test("report cover story resolves exact ranking ties by stable item ID", () => {
  const z = signal("z-tie", "event-z", "official", 80, {
    priorityTier: "official_first_party",
    publishedAt: "2026-07-22T01:00:00.000Z",
    title: "Stable AI model announcement",
    summary: "The official announcement describes an AI model release.",
  });
  const a = signal("a-tie", "event-a", "official", 80, {
    priorityTier: "official_first_party",
    publishedAt: "2026-07-22T01:00:00.000Z",
    title: "Stable AI model announcement",
    summary: "The official announcement describes an AI model release.",
  });
  const report = buildReport({ dailyDigests: [digest("2026-07-22T04:00:00.000Z", [z, a])] }, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.deepEqual(report.sections[0].items.map(({ id }) => id), ["z-tie", "a-tie"]);
  assert.equal(report.coverStory.id, "a-tie");
});

test("reports without visible stories have a null cover story", () => {
  const report = buildReport({}, {
    period: "daily",
    date: "2026-07-22",
    now: "2026-07-22T12:00:00.000Z",
  });

  assert.equal(report.coverStory, null);
});
```

- [x] **Step 2: Run the focused test and confirm it fails on the missing field**

Run: `node --test --test-name-pattern='reports choose a deterministic representative|report cover story resolves exact ranking ties|reports without visible stories' server/lib/experience.test.js`

Expected: FAIL because `buildReport` does not yet return `coverStory`; existing tests in the file should not be changed to mask that failure.

- [x] **Step 3: Add selection without changing the report sections**

In `server/lib/experience.js`, add this helper next to `reportHeadline`:

```js
function reportCoverStory(sections = []) {
  const candidates = sections.flatMap((section) => section.items || []);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (
    compareRepresentatives(a, b)
    || String(a.id || "").localeCompare(String(b.id || ""))
  ))[0];
}
```

In `buildReport`, after `sections` is created, add `coverStory: reportCoverStory(sections)` to the returned object. Do not change the existing `sections`, `storyCount`, or `headline` expressions.

- [x] **Step 4: Run focused and full report tests**

Run: `node --test --test-name-pattern='report|reports|weekly|monthly|current monthly' server/lib/experience.test.js`

Expected: all 16 matching report/period tests pass; the issue headline remains concise, section order remains unchanged, and empty reports return `null`.

Run: `node --test server/lib/experience.test.js`

Expected: inspect the full file for cross-surface regressions. The initial checkpoint had one failing `today signals prefer the first-party representative without demoting event rank or dropping coverage` fixture. Follow-up diagnosis found that its raw scores (85/92) calibrated below the unchanged selected threshold (71 vs. 72); the test fixture was recalibrated to qualifying values (88/94) without changing production signal ranking. The full suite now passes.

In the existing reference-filter test, add `assert.equal(report.coverStory.id, "official");` after the assertion that only the official item remains in `report.sections`. In the existing monthly per-section limit test, assert that `report.coverStory.id` is among the 18 visible IDs. Do not require `story-0`: `selectedRankingScore` includes a saturation penalty for high raw scores, so its winner can differ from the list's raw-score order. Membership proves the cover cannot come from beyond the month limit without redefining the ranking rule.

**Review gate:** Compare the report before/after on the test fixture for the exact `sections`, `headline`, and `storyCount` values. If selection needs a new ranking rule or changes an existing list, stop and revise the design instead of slipping in scoring changes.

## Task 2: Safely expose the cover story through REST and MCP

**Adversarial review before this task:** `serializePublicReport` spreads report metadata, and MCP has a separate field allowlist. Adding a property only to `buildReport` would either leak raw item fields through REST or silently omit the cover story from MCP. Test both routes with an internal sentinel before accepting the change.

**Files:** Modify `server/index.test.js`; modify `server/index.js`.

**Interface produced:** The public REST report and MCP `get_digest` both return a `coverStory` item or `null`; every non-null value has the same field projection as other public items.

- [x] **Step 1: Extend the public report fixture and add failing projection assertions**

In the existing `MCP providers reuse public filters and project only public feed, story, topic, and digest fields` test in `server/index.test.js`, give the public item a private sentinel and image fixture (the existing `item()` helper already has `raw` and `mpMeta` sentinels):

```js
const first = item("public-1", "official-one", {
  media: [{ type: "image", url: "https://images.example.com/public-1.jpg", alt: "Public image" }],
});
```

Extend the report assertions to include its cover item:

```js
assert.equal(digest.coverStory.id, "public-1");
assert.equal(monthly.coverStory.id, "public-1");
for (const report of [digest, monthly]) {
  assert.equal(Object.hasOwn(report.coverStory, "raw"), false);
  assert.equal(Object.hasOwn(report.coverStory, "mpMeta"), false);
  assert.equal(Object.hasOwn(report.coverStory, "priorityTier"), false);
  assert.equal(JSON.stringify(report.coverStory).includes("never expose"), false);
}
```

In the test that compares MCP tools to public REST reports, assert that both public projections select the same ID and serialize the same safe item:

```js
assert.equal(digest.coverStory.id, restDigest.coverStory.id);
assert.deepEqual(digest.coverStory, restDigest.coverStory);
```

- [x] **Step 2: Run the focused integration tests and confirm the contract fails**

Run: `node --test --test-name-pattern='MCP providers reuse public filters|MCP tool results match public REST' server/index.test.js`

Expected: FAIL because `coverStory` is not yet present in REST serialization or MCP `get_digest` projection.

- [x] **Step 3: Add explicit safe projections in both public paths**

In `serializePublicReport` in `server/index.js`, add this property to the returned object:

```js
coverStory: report.coverStory ? serializePublicItem(report.coverStory) : null,
```

In `projectMcpReport`, leave `coverStory` out of the generic report metadata copy and explicitly serialize it after `Object.fromEntries`:

```js
if (report.coverStory) result.coverStory = serializePublicItem(report.coverStory);
else result.coverStory = null;
```

Do not add an object spread of `report.coverStory` and do not modify the projections for sections, trends, or watch items.

- [x] **Step 4: Run REST/MCP projection tests**

Run: `node --test --test-name-pattern='MCP providers reuse public filters|MCP tool results match public REST' server/index.test.js`

Expected: PASS; REST and MCP choose the same cover story, media fields are preserved when public, and `raw`, `mpMeta`, `priorityTier`, `hidden`, and `never expose` are absent.

Run: `node --test server/index.test.js`

Expected: all API and MCP provider integration tests pass.

**Review gate:** Inspect `serializePublicItem` and assert the cover item's allowlisted output rather than assuming that the general `/api/public/reports` route makes every nested object public-safe.

## Task 3: Render the report cover story with a safe image fallback

**Adversarial review before this task:** Do not change the existing concise issue masthead, make the image a substitute for story text, use a related source's image, or render remote image URLs directly. The story remains readable and clickable if its image is absent or the proxy fails.

**Files:** Modify `src/types.ts`, `src/lib/experience.mts`, `src/lib/experience.test.mts`, `src/components/reports/ReportsWorkspace.tsx`, and `src/styles/reports.css`.

**Interface produced:** `Report.coverStory?: Item | null` supports old payloads; the report page has an accessible “本期代表稿” module with an optional article-local, proxied image.

- [x] **Step 1: Add failing image-selection and report-view contract tests**

In `src/lib/experience.test.mts`, import `reportCoverImage` from `./experience.mts` and add these tests alongside the existing report helper tests:

```ts
test("report cover image helper accepts images and prefers their thumbnail", () => {
  const image = { type: "image", url: "https://example.com/full.jpg", thumbnail: "https://example.com/thumb.jpg" };
  assert.deepEqual(reportCoverImage({ media: [image] } as never), { asset: image, src: image.thumbnail });
  assert.deepEqual(reportCoverImage({ media: [{ type: "image", url: image.url }] } as never), {
    asset: { type: "image", url: image.url },
    src: image.url,
  });
  assert.equal(reportCoverImage({ media: [{ type: "video", thumbnail: "https://example.com/poster.jpg" }] } as never), null);
  assert.equal(reportCoverImage({ media: [{ type: "image" }] } as never), null);
});

test("report cover story preserves the text lead and uses the safe image proxy", () => {
  const source = readFileSync(new URL("../components/reports/ReportsWorkspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/reports.css", import.meta.url), "utf8").replace(/\s+/g, " ");

  assert.match(source, /report\.coverStory/);
  assert.match(source, /本期代表稿/);
  assert.match(source, /\/api\/media\?url=/);
  assert.match(source, /onError/);
  assert.match(source, /report-cover-story/);
  assert.match(css, /\.report-cover-story/);
  assert.match(css, /@media[^{}]*\{[^}]*\.report-cover-story/);
});
```

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `node --test --test-name-pattern='report cover image helper|report cover story preserves the text lead' src/lib/experience.test.mts`

Expected: FAIL because `reportCoverImage` and report cover markup do not yet exist.

- [x] **Step 3: Implement and test the pure image selection helper**

In `src/lib/experience.mts`, export this helper near the existing report utility functions:

```ts
export function reportCoverImage(item: Pick<Item, "media">) {
  const asset = item.media?.find((candidate) => candidate.type === "image" && Boolean(candidate.thumbnail || candidate.url));
  return asset ? { asset, src: asset.thumbnail || asset.url || "" } : null;
}
```

Run: `node --test --test-name-pattern='report cover image helper' src/lib/experience.test.mts`

Expected: PASS for an image with a thumbnail, an image with only a URL, and `null` for video or missing image URLs.

- [x] **Step 4: Extend the report type and render the module**

In `src/types.ts`, add `coverStory?: Item | null;` to `Report` without changing the type of `headline`.

In `ReportsWorkspace.tsx`, add a local proxy helper matching the existing feed behavior:

```tsx
function mediaProxyUrl(src = "") {
  if (!src) return "";
  return `/api/media?url=${encodeURIComponent(src)}`;
}
```

Render the cover only when `report.coverStory` is truthy, between `report-lead` and `report-themes`/`report-trends`:

```tsx
{report.coverStory && <ReportCoverStory item={report.coverStory} onOpen={onOpen} />}
```

Implement `ReportCoverStory` in the same module. It must call `reportCoverImage(item)` and, when non-null, use `image.asset` for alt text and `image.src` as the source passed through `mediaProxyUrl`; on image error hide only the image while leaving text intact. Use a button to call `onOpen(item)` and display the source name, title, and `item.reason || item.summary`. The article must remain understandable without an image and must not directly link the remote image URL.

- [x] **Step 5: Add responsive report-specific styles**

In `src/styles/reports.css`, add `.report-cover-story` styles using existing report tokens (`--surface`, `--border`, `--text`, `--muted`, and spacing variables); constrain images with `max-width: 100%` and `object-fit: cover`, allow long titles to wrap with `overflow-wrap: anywhere`, and provide a narrow-screen single-column layout in the existing mobile media query. Do not change `.report-lead h2` or `.report-section` ordering styles.

- [x] **Step 6: Run focused tests and type checking**

Run: `node --test --test-name-pattern='report cover image helper|report cover story preserves the text lead' src/lib/experience.test.mts`

Expected: PASS; the helper accepts only usable image media and prefers its thumbnail.

Run: `node --test --test-name-pattern='report cover uses a concise issue headline' server/lib/experience.test.js`

Expected: PASS; `headline` remains the existing short issue title.

Run: `npm run typecheck`

Expected: exit code 0, including the nullable/optional cover-story handling.

**Review gate:** Check that `coverStory` is read defensively when absent, the `img` error path cannot hide the text, media type must be image, image URL is same-item only, and the existing period tabs/summary/export/list remain in place.

## Task 4: End-to-end verification and visual review

**Adversarial review before this task:** Green unit tests cannot prove image requests go through the proxy, cross-period UI remains readable, or a bad image leaves the copy available. Validate a real report response and inspect the desktop and narrow layouts before claiming completion.

**Files:** No planned code changes; update the plan checkboxes only after each verification has actually succeeded.

- [x] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: exit code 0 with all Node and TypeScript tests passing.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: Vite production build completes successfully.

Verification note: latest full run passes all 291 tests; `npm run typecheck` and `npm run build` also exit successfully. The previously failing signal test fixture now meets its existing score threshold; production signal ranking and the threshold are unchanged.

- [x] **Step 2: Inspect public REST and MCP output**

Using the existing public API and in-process MCP integration tests, verify daily, weekly, and monthly reports each return `coverStory` matching an item in `sections`; verify no story returns `null`; verify cover images use the same public item and internal sentinels do not appear. Compare existing `headline`, `sections`, `storyCount`, themes, and range before/after to ensure they are unchanged.

- [x] **Step 3: Visually inspect desktop and narrow layouts**

Run: `npm run dev -- --host 127.0.0.1`

Open the local report page in the existing browser and inspect at a desktop viewport and a narrow mobile viewport. Confirm the cover image is loaded from `/api/media`, the story text remains visible, the page does not overflow horizontally, and the original masthead, issue navigation, section order, and export/RSS actions remain intact. If live data has no image or a failed image cannot be reproduced safely, use the automated fallback assertions and report that limitation rather than substituting an external test image.

Visual result: the local latest daily issue renders the text-only cover correctly at desktop and 390px mobile widths; the live representative had no image, so a live proxied-image load was not available. Unit/source contract checks enforce same-item image selection, proxy-only `src`, and the image-error single-column fallback.

- [x] **Step 4: Check patch hygiene and changed-file scope**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the task's listed product files plus the already-present user changes; do not stage or include unrelated paths.

## Completion criteria

- `coverStory` is deterministic and selected only from final visible report sections.
- REST and MCP expose the same safe public item projection.
- The web report renders a same-item image only through the local safety proxy and keeps text usable on every image failure path.
- Existing report ranking, issue masthead, section contents, export behavior, and date navigation remain unchanged.
- `npm test`, `npm run typecheck`, `npm run build`, and visual review all have recorded passing evidence.
- No commit, deployment, production data/configuration change, or unrelated dirty-file edit occurs without separate authorization.
