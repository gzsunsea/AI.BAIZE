# AI.BAIZE Content Quality and Experience Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI.BAIZE’s curated content more trustworthy and useful for AI practitioners and creators by adding evidence-aware quality gates, a “Today’s Signals” decision flow, and an evidence-first reading workspace.

**Architecture:** Extend the existing scoring, dedupe, editorial serialization, and experience modules instead of introducing a second content pipeline. The server will compute editorial evidence metadata and a bounded representative-event response; the React app will render that response above the existing timeline and reuse the current route, search, saved, read, processed, and reader behavior.

**Tech Stack:** Node.js CommonJS server modules, Express 5, React 19, TypeScript, Vite, node:test, CSS modules-by-file, local JSON runtime store.

## Global Constraints

- Do not introduce paid APIs, paid data sources, or new runtime dependencies.
- Keep `data/db.json` runtime data unchanged; all new metadata is computed from existing fields or generated during normal refresh.
- `reference` sources remain available for backend diagnostics/comparison but must not enter curated精选、日报、热点 or Today’s Signals surfaces.
- Never lower the quality threshold or pad a short candidate pool with weak content.
- Keep facts, system-generated summaries, and creator suggestions visibly distinct.
- Preserve existing routes, direct/full search, saved/read/processed state, Ask Baize, export, share, focus trapping, and scroll restoration.
- Avoid proactive external creator-backend access.
- Every implementation task ends with a focused test command and a small commit.

---

### Task 1: Add evidence metadata and enforce curated-source policy

**Files:**
- Modify: `server/lib/scoring.js`
- Modify: `server/lib/editorial.js`
- Modify: `server/index.js`
- Test: `server/lib/scoring.test.js`
- Test: `server/lib/editorial.test.js`
- Test: `server/index.test.js`

**Interfaces:**
- Produce `isCuratedSourceAllowed(item)` from `server/lib/scoring.js`; it returns `false` for `reference` unless `item.pinned` is true, and otherwise preserves the existing selected-feed source checks.
- Produce `evidenceMeta(item, relatedItems = [])` from `server/lib/editorial.js`; it returns `{ evidenceLevel, evidenceLabel, evidenceGaps, creatorValue, generatedBy }`.
- `serializePublicItem` includes `evidenceMeta` and continues to exclude `raw`, source health, internal score fields, and moderation fields.

- [ ] **Step 1: Write failing tests for the source policy and evidence labels**

Add tests covering:

```js
test("curated source policy excludes reference items from public curation", () => {
  assert.equal(isCuratedSourceAllowed({ priorityTier: "reference" }), false);
  assert.equal(isCuratedSourceAllowed({ priorityTier: "reference", pinned: true }), true);
  assert.equal(isCuratedSourceAllowed({ priorityTier: "official_first_party" }), true);
});

test("evidence metadata distinguishes first party, multiple sources, expert analysis, and gaps", () => {
  assert.deepEqual(evidenceMeta({ priorityTier: "official_first_party", sourceName: "OpenAI", title: "API release", summary: "Official API release" }), {
    evidenceLevel: "first_party",
    evidenceLabel: "一手发布",
    evidenceGaps: ["第三方效果与长期稳定性尚未独立验证"],
    creatorValue: "适合核对功能边界、使用条件与迁移成本。",
    generatedBy: "rules",
  });
  assert.equal(evidenceMeta({ priorityTier: "expert_rss", sourceName: "Expert", title: "Agent workflow", summary: "Deployment notes" }).evidenceLevel, "expert_analysis");
  assert.equal(evidenceMeta({ priorityTier: "expert_rss", sourceName: "Expert", title: "Agent workflow", summary: "Deployment notes" }, [
    { sourceId: "expert", sourceName: "Expert", priorityTier: "expert_rss" },
    { sourceId: "official", sourceName: "OpenAI", priorityTier: "official_first_party" },
  ]).evidenceLevel, "multi_source");
});
```

Import the new functions in the relevant existing test files. Keep the expected copy exact so future copy changes are deliberate.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test server/lib/scoring.test.js server/lib/editorial.test.js server/index.test.js`

Expected: FAIL because `isCuratedSourceAllowed`, `evidenceMeta`, and the new public field do not yet exist.

- [ ] **Step 3: Implement the minimal policy and metadata helpers**

In `server/lib/scoring.js`, implement:

```js
function isCuratedSourceAllowed(item = {}) {
  if (item.pinned) return true;
  const tier = String(item.priorityTier || item.sourceTier || item.tier || "").toLowerCase();
  return tier !== "reference" && canAppearInSelectedFeed(item);
}
```

Export it. In `server/lib/editorial.js`, implement `evidenceMeta` using the current source tier/channel, unique source identity from `relatedItems`, and conservative gaps:

- `multi_source` when at least two distinct source identities are present;
- `first_party` for `official_first_party` or `preferred_x` with one source;
- `expert_analysis` for `expert_rss` with one source;
- `single_source` for other non-reference sources;
- `unverified` only for explicitly flagged weak/uncertain items;
- add the third-party verification gap to first-party items, and add `独立信源仍不足` to single-source items;
- derive `creatorValue` from category/action text without inventing performance claims;
- derive `generatedBy` from `item.llmProvider` (`rules` for absent/rules, `local_llm` for `ollama:*`, `editor` only for an explicit editorial marker).

Add the result in `enrichItem` and allowlist `evidenceMeta` in `serializePublicItem`.

Change curated daily/hot eligibility to call `isCuratedSourceAllowed` while preserving pinned exceptions. Do not change the public `all` feed’s existing broad quality behavior unless it is a curated result.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test server/lib/scoring.test.js server/lib/editorial.test.js server/index.test.js`

Expected: PASS, with existing selected-feed, serialization, and pinned-exception tests unchanged.

- [ ] **Step 5: Commit the evidence policy**

```bash
git add server/lib/scoring.js server/lib/editorial.js server/index.js server/lib/scoring.test.js server/lib/editorial.test.js server/index.test.js
git commit -m "feat: expose evidence-aware curation metadata"
```

### Task 2: Build the bounded Today’s Signals server response

**Files:**
- Modify: `server/lib/experience.js`
- Modify: `server/index.js`
- Test: `server/lib/experience.test.js`
- Test: `server/index.test.js`

**Interfaces:**
- Produce `buildTodaySignals(state, options = {})` from `server/lib/experience.js`.
- Return `{ generatedAt, limit, items }`, where each item is a representative signal with `id`, `title`, `summary`, `publishedAt`, `latestAt`, `sourceCount`, `sources`, `status`, `creatorValue`, `evidenceMeta`, `representative`, and `relatedItems`.
- Add `GET /api/public/today` in `server/index.js`; default `limit` is 5 and maximum is 5.

- [ ] **Step 1: Write failing tests for representative-event selection**

Add tests for:

```js
test("today signals return at most five recent curated representative events", () => {
  const result = buildTodaySignals({
    items: [
      signal("official", "event-a", "official", 90, { priorityTier: "official_first_party", title: "Official AI model release", summary: "Official AI model and API release for creators.", publishedAt: "2026-08-28T02:00:00.000Z" }),
      signal("expert", "event-a", "expert", 85, { priorityTier: "expert_rss", title: "Expert AI workflow analysis", summary: "Expert analysis of the AI model workflow and deployment.", publishedAt: "2026-08-28T01:00:00.000Z" }),
      signal("reference", "event-b", "reference", 99, { priorityTier: "reference", title: "Reference AI model copy", summary: "Reference copy of an AI model announcement.", publishedAt: "2026-08-28T02:30:00.000Z" }),
      signal("single", "event-c", "single", 88, { priorityTier: "expert_rss", title: "Single-source AI creator tool analysis", summary: "Expert analysis of an AI creator tool.", publishedAt: "2026-08-27T12:00:00.000Z" }),
    ],
    clusters: [
      { id: "event-a", items: ["official", "expert"] },
      { id: "event-b", items: ["reference"] },
    ],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });

  assert.deepEqual(result.items.map((item) => item.id), ["event-a", "event-c"]);
  assert.equal(result.items[0].sourceCount, 2);
  assert.equal(result.items[0].evidenceMeta.evidenceLevel, "multi_source");
});

test("today signals do not pad an insufficient candidate pool or repeat an event", () => {
  const result = buildTodaySignals({
    items: [
      signal("only", "event-only", "expert", 84, {
        priorityTier: "expert_rss",
        title: "Single-source AI workflow analysis",
        summary: "Expert analysis of an AI workflow.",
        publishedAt: "2026-08-28T02:00:00.000Z",
      }),
      signal("old", "event-old", "official", 99, {
        priorityTier: "official_first_party",
        title: "Old AI model release",
        summary: "An old official AI model release.",
        publishedAt: "2026-08-25T02:00:00.000Z",
      }),
    ],
    clusters: [],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });
  assert.ok(result.items.length <= 1);
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);
});
```

Reuse the existing `signal` test helper where possible and make the fixture timestamps explicit.

- [ ] **Step 2: Run focused experience tests and verify failure**

Run: `node --test server/lib/experience.test.js server/index.test.js`

Expected: FAIL because `buildTodaySignals` and `/api/public/today` do not yet exist.

- [ ] **Step 3: Implement conservative event grouping and ranking**

In `server/lib/experience.js`:

1. Build public item maps from `state.items` and cluster membership.
2. Group by explicit cluster id, then `eventId`, then canonical URL/id.
3. Keep only members passing `isPublicItem`, `isCuratedSourceAllowed`, and `isSelectedFeedEligible` with the configured threshold.
4. Restrict candidates to the latest 36 hours; use the latest member timestamp for `latestAt`.
5. Select the representative by pinned status, `selectedRankingScore`, then recency.
6. Count unique `sourceId || sourceName`, expose at most six source names, and compute `evidenceMeta` from the public group.
7. Rank by multi-source evidence, source tier, freshness, creator value, and selected ranking score; cap at five; never pad.

Use `enrichItem` only at the public boundary so raw fields are not returned. Keep `buildHotTopics` behavior compatible, but apply the curated-source policy to its public members.

In `server/index.js`, add:

```js
app.get("/api/public/today", (req, res) => {
  const state = readState();
  const limit = Math.min(5, Math.max(1, Number(req.query.limit || 5)));
  const result = buildTodaySignals(state, {
    now: new Date(),
    limit,
    selectedThreshold: state.settings?.rules?.selectedThreshold || 72,
    enrichItem,
  });
  res.json(result);
});
```

Import and export the new experience helper. Serialize representative and related items through the existing allowlist.

- [ ] **Step 4: Add API fallback-safe response tests**

Assert the response shape, five-item cap, no `raw` field, and that a reference-only cluster is absent. Keep endpoint tests pure through the exported helper where the current test setup does not start an HTTP server.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test server/lib/experience.test.js server/index.test.js`

Expected: PASS.

```bash
git add server/lib/experience.js server/index.js server/lib/experience.test.js server/index.test.js
git commit -m "feat: add curated todays signals response"
```

### Task 3: Add frontend types, loading state, and decision-flow rendering

**Files:**
- Modify: `src/types.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/feed/FeedExperience.tsx`
- Modify: `src/lib/experience.mts`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- Add `EvidenceMeta`, `TodaySignal`, and `TodaySignalsResponse` types in `src/types.ts`.
- Add pure `todaySignalLabel(signal)` and `todaySignalSummary(signal)` helpers in `src/lib/experience.mts`.
- `App` owns `todaySignals`, `todaySignalsLoading`, and `todaySignalsError`, loads `/api/public/today` only for the selected feed, and passes the state into `FeedExperience`.

- [ ] **Step 1: Write failing pure-helper tests and type assertions**

Add tests like:

```ts
test("today signal copy prefers evidence label and creator value", () => {
  const signal = {
    evidenceMeta: { evidenceLabel: "多源确认", creatorValue: "适合拆解工作流变化。" },
    summary: "官方发布了新能力。",
  } as never;
  assert.equal(todaySignalLabel(signal), "多源确认");
  assert.equal(todaySignalSummary(signal), "适合拆解工作流变化。");
});
```

- [ ] **Step 2: Run the focused frontend test and verify failure**

Run: `node --test src/lib/experience.test.mts`

Expected: FAIL because the new types/helpers do not exist.

- [ ] **Step 3: Implement types, fetch lifecycle, and props**

Add the types with optional compatibility fields:

```ts
export type EvidenceMeta = {
  evidenceLevel: "first_party" | "multi_source" | "expert_analysis" | "single_source" | "unverified";
  evidenceLabel: string;
  evidenceGaps: string[];
  creatorValue: string;
  generatedBy: "rules" | "local_llm" | "editor";
};

export type TodaySignal = Item & {
  latestAt: string;
  sourceCount: number;
  sources: string[];
  status: "new" | "active";
  evidenceMeta: EvidenceMeta;
  representative: Item;
  relatedItems: Item[];
};
```

In `App.tsx`, add a request version or abort-safe effect that:

- clears today state when leaving `selected`;
- loads `/api/public/today?limit=5` when selected and not in a story/item route;
- ignores stale responses after route changes;
- stores a user-readable error without blocking the timeline.

Keep the existing main feed request independent so Today’s Signals failure cannot blank the feed.

In `FeedExperience.tsx`:

- render Today’s Signals instead of the current hot-topic strip when `mode === "selected" && statusFilter === "all"`;
- display up to five numbered signals with title, evidence label, source count, latest time, creator value, and actions to open the item or event story when available;
- render distinct “没有达到今日门槛” and “今日先看暂不可用” states;
- keep current filters, timeline, skeleton, and load-more behavior intact.

- [ ] **Step 4: Run focused frontend tests, typecheck, and commit**

Run: `node --test src/lib/experience.test.mts && npm run typecheck`

Expected: PASS.

```bash
git add src/types.ts src/app/App.tsx src/components/feed/FeedExperience.tsx src/lib/experience.mts src/lib/experience.test.mts
git commit -m "feat: add todays signals decision flow"
```

### Task 4: Make the reading workspace evidence-first and add creator card

**Files:**
- Modify: `src/components/reader/ReadingWorkspace.tsx`
- Modify: `src/types.ts`
- Modify: `src/lib/experience.mts`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- Reading workspace consumes `item.evidenceMeta` and renders `EditorialBrief` followed by evidence gaps and creator value.
- Add a pure `creatorCardForItem(item)` helper returning `{ angle, facts, gaps, format, generatedBy } | null`.

- [ ] **Step 1: Write failing tests for fact/suggestion separation**

```ts
test("creator card labels generated suggestions and preserves evidence gaps", () => {
  const card = creatorCardForItem({
    title: "Agent workflow update",
    summary: "A practical deployment update.",
    evidenceMeta: {
      evidenceLevel: "single_source",
      evidenceLabel: "专家解读",
      evidenceGaps: ["独立信源仍不足"],
      creatorValue: "适合拆解工作流变化。",
      generatedBy: "rules",
    },
  } as never);
  assert.equal(card?.generatedBy, "rules");
  assert.deepEqual(card?.gaps, ["独立信源仍不足"]);
  assert.ok(card?.angle);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test src/lib/experience.test.mts`

Expected: FAIL because `creatorCardForItem` does not exist.

- [ ] **Step 3: Implement the helper and reader sections**

Implement conservative creator-card derivation from title, existing `editorialBrief`, `reason`, `creatorValue`, and `evidenceGaps`; if no trustworthy source text exists, return `null` rather than inventing a card.

Change reader order to:

1. metadata and evidence label;
2. fact/impact/scenario;
3. “对创作者的用处”;
4. “证据边界” with gaps and `generatedBy` label;
5. related reporting and timeline;
6. optional “创作卡片” with “系统整理/生成建议” label;
7. existing actions.

Keep the primary “阅读原文” button, existing Ask Baize commands, focus trap, close behavior, saved/read/processed actions, export, share, and related-item navigation unchanged.

- [ ] **Step 4: Run focused test, typecheck, and commit**

Run: `node --test src/lib/experience.test.mts && npm run typecheck`

Expected: PASS.

```bash
git add src/components/reader/ReadingWorkspace.tsx src/types.ts src/lib/experience.mts src/lib/experience.test.mts
git commit -m "feat: make reader evidence first"
```

### Task 5: Tune responsive styling and state affordances

**Files:**
- Modify: `src/styles/feed.css`
- Modify: `src/styles/reader.css`
- Modify: `src/styles/responsive.css`
- Test: `src/lib/experience.test.mts`

- [ ] **Step 1: Add CSS contract tests for the new surfaces**

Read the stylesheet text in the existing test style and assert:

```ts
assert.match(feedCss, /\.today-signals/);
assert.match(feedCss, /\.today-signal-card/);
assert.match(feedCss, /\.evidence-badge/);
assert.match(readerCss, /\.reader-evidence-boundary/);
assert.match(readerCss, /\.creator-card/);
assert.match(responsiveCss, /today-signals|today-signal-card/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test src/lib/experience.test.mts`

Expected: FAIL until the new selectors exist.

- [ ] **Step 3: Implement desktop and mobile styles**

Add styles that:

- give Today’s Signals a distinct but compact editorial surface;
- use separate visual treatments for confirmed, first-party, expert, and unverified evidence labels;
- keep long Chinese titles and labels inside `minmax(0, 1fr)` containers with `overflow-wrap:anywhere`;
- keep primary action hierarchy visible without making every action look primary;
- show reader evidence gaps as a caution block and creator cards as a secondary suggestion block;
- preserve the existing dark/light theme tokens and mobile bottom navigation;
- use one-column mobile layout, horizontal filter scrolling, and no page-level horizontal overflow.

- [ ] **Step 4: Run focused test and commit**

Run: `node --test src/lib/experience.test.mts`

Expected: PASS.

```bash
git add src/styles/feed.css src/styles/reader.css src/styles/responsive.css src/lib/experience.test.mts
git commit -m "style: clarify evidence and signal hierarchy"
```

### Task 6: Full regression, build, and manual acceptance

**Files:**
- Modify only if verification exposes a defect in the tasks above.
- Test: all existing server and frontend test files.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: PASS with no existing quality, navigation, hot-story, serialization, search, or responsive regression failures.

- [ ] **Step 2: Run TypeScript validation and production build**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0 and Vite produces `dist/`.

- [ ] **Step 3: Start the local server and inspect the public endpoints**

Run: `PORT=8080 node server/index.js` in a local terminal, then request:

```bash
curl -sS http://127.0.0.1:8080/api/public/today?limit=5
curl -sS http://127.0.0.1:8080/api/public/items?mode=selected&page=1&pageSize=10
curl -sS http://127.0.0.1:8080/api/public/hot
curl -sS http://127.0.0.1:8080/api/public/daily
```

Check that curated responses contain no unpinned `reference` items, no `raw` fields, and that a short Today’s Signals list is returned without padding.

- [ ] **Step 4: Perform manual UI acceptance**

Verify desktop and narrow mobile widths:

- selected page shows Today’s Signals before the timeline;
- every signal exposes evidence state, latest time, source count, and creator value;
- failed Today’s Signals request leaves the timeline usable;
- opening a signal shows fact, creator value, evidence boundary, related reporting, and original-link action in that order;
- creator card is visibly a suggestion and never presented as fact;
- saved/read/processed/Ask Baize/export/share still work;
- no repeated event occupies multiple signal positions;
- no horizontal overflow or clipped long Chinese labels.

- [ ] **Step 5: Review the final diff and commit any verification fix**

Run: `git diff HEAD~5 --stat && git diff --check`

Expected: only files named in this plan changed, with no runtime database changes and no accidental debug output.
