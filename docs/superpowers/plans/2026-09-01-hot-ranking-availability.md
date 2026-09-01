# Hot Ranking Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hot ranking useful every day without weakening the evidence standard by separating confirmed multi-source events from clearly labelled emerging candidates.

**Architecture:** Keep `buildHotTopics().items` as the confirmed ranking and add a bounded `candidates` collection derived from recent selected items. Build one source ledger that combines visible event members with persisted dedupe metadata, then serialize both layers through the existing public-item allowlist. The React page will render confirmed items first and an emerging-candidate section when the confirmed list is empty or sparse.

**Tech Stack:** Node.js CommonJS, Express, React + TypeScript, Vite, Node test runner, SSH/rsync deployment.

## Global Constraints

- Confirmed hotspots require at least two independent source identities.
- `duplicateCount` never counts as an independent source.
- Candidate items must pass `isSelectedFeedEligible`, be public, be within 72 hours, and exclude `reference`, hidden, invalid-URL, and low-quality community content.
- Candidate copy must say single-source/pending verification and must not claim consensus or multi-source confirmation.
- Public responses must not expose `raw`, `hidden`, `priorityTier`, `duplicateSources`, `duplicateCount`, or other moderation/ranking internals.
- Do not change `data/db.json` or add paid APIs/data sources.

---

### Task 1: Add failing backend coverage for source-ledger and candidate behavior

**Files:**
- Modify: `server/lib/experience.test.js` after the existing hot-topic tests
- Test: `server/lib/experience.test.js`

**Interfaces:**
- Consumes: existing `buildHotTopics` test fixture helpers and `signal()` factory.
- Produces: executable expectations for persisted source metadata, emerging candidates, source caps, and exclusion rules.

- [ ] **Step 1: Write the failing tests**

Add tests with these exact cases:

```js
test("hot topics use persisted cluster sources after dedupe", () => {
  const item = signal("representative", "event-deduped", "OpenAI News", 90, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "event-deduped", items: [item.id], sources: ["OpenAI News", "Simon Willison"], duplicateCount: 4 }],
  }, { now: "2026-08-31T04:00:00.000Z" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceCount, 2);
  assert.deepEqual(result.items[0].sources, ["OpenAI News", "Simon Willison"]);
  assert.equal(result.candidates.length, 0);
});

test("hot topics expose selected single-source candidates without calling them confirmed", () => {
  const item = signal("candidate", "event-candidate", "OpenAI News", 90, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [item], clusters: [], settings: { rules: { selectedThreshold: 72 } } }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 72,
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "emerging");
  assert.equal(result.candidates[0].availability, "candidate");
  assert.equal(result.candidates[0].evidenceMeta.evidenceLevel, "single_source");
});

test("hot candidates cap one source, exclude reference and low-quality content, and avoid duplicates", () => {
  const good = Array.from({ length: 4 }, (_, index) => signal(`good-${index}`, `event-good-${index}`, "OpenAI News", 92 - index, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  }));
  const secondSource = signal("good-other", "event-good-other", "Simon Willison", 80, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "expert_rss",
  });
  const reference = signal("reference", "event-reference", "AIHOT", 99, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "reference",
  });
  const weak = signal("weak", "event-weak", "OpenAI News", 99, {
    title: "手机发布会价格与外观点评",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [...good, secondSource, reference, weak], clusters: [] }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 72,
  });
  assert.ok(result.candidates.length <= 5);
  assert.ok(result.candidates.filter((item) => item.sourceName === "OpenAI News").length <= 2);
  assert.equal(result.candidates.some((item) => item.id === "reference"), false);
  assert.equal(result.candidates.some((item) => item.id === "weak"), false);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, result.candidates.length);
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `node --test server/lib/experience.test.js`

Expected: FAIL because `buildHotTopics` does not yet return `candidates`, does not read `cluster.sources`, and still admits the pinned single-source exception into `items`.

- [ ] **Step 3: Commit the failing test contract**

```bash
git add server/lib/experience.test.js
git commit -m "test: define available hot ranking behavior"
```

### Task 2: Implement the backend source ledger and emerging candidates

**Files:**
- Modify: `server/lib/experience.js` near `buildHotTopics`
- Test: `server/lib/experience.test.js`

**Interfaces:**
- Consumes: `isPublicItem`, `isCuratedSourceAllowed`, `isSelectedFeedEligible`, `selectedRankingScore`, `evidenceMeta`, and existing `enrichItem` callback.
- Produces: `buildHotTopics(state, options)` returning `{ generatedAt, windowHours, rules, availability, items, candidates }`; candidates are item-shaped records with `availability: "candidate"` and `status: "emerging"`.

- [ ] **Step 1: Add the source identity and candidate helpers**

Add helpers before `buildHotTopics`:

```js
function normalizedSourceIdentity(value = "") {
  return String(value).trim().toLowerCase().replace(/[（(]\s*rss\s*[)）]/gi, "").replace(/\s+/g, " ");
}

function sourceLedger(cluster = {}, relatedItems = [], representative = {}) {
  const names = [
    ...relatedItems.map((item) => ({ identity: item.sourceId || item.sourceName, name: item.sourceName || item.sourceId })),
    ...(cluster.sources || []).map((name) => ({ identity: name, name })),
    ...(representative.duplicateSources || []).map((name) => ({ identity: name, name })),
  ].filter((entry) => entry.identity && entry.name);
  const byIdentity = new Map();
  for (const entry of names) {
    const identity = normalizedSourceIdentity(entry.identity);
    if (identity && !byIdentity.has(identity)) byIdentity.set(identity, String(entry.name).trim());
  }
  return [...byIdentity.values()];
}
```

Add `buildHotCandidates(items, confirmedIds, nowMs, threshold, enrichItem)` that:

- filters `isPublicItem`, `isCuratedSourceAllowed`, `isSelectedFeedEligible(item, threshold)` and 72-hour timestamps;
- excludes event IDs already present in `confirmedIds`;
- groups by `todaySignalGroupKey(item)` and keeps the highest-ranked representative per group;
- sorts by `selectedRankingScore`, freshness, and published time;
- keeps at most two per normalized source identity and five total;
- returns enriched public-shaped items with `status: "emerging"`, `availability: "candidate"`, `sourceCount: 1`, `sources: [sourceName]`, and `evidenceMeta: evidenceMeta(item)`.

- [ ] **Step 2: Replace the confirmed-source calculation**

Inside `buildHotTopics`, compute:

```js
const sources = sourceLedger(cluster, relatedItems, representative);
if (!representative || sources.length < 2) return null;
```

Remove the old single-source pinned exception. Keep `duplicateCount` only in internal calculations; never use it to satisfy the source threshold.

Create `confirmedIds` from the final confirmed topics, call `buildHotCandidates` against recent state items, and return:

```js
const availability = items.length ? "confirmed" : candidates.length ? "candidate" : "empty";
return { generatedAt, windowHours, rules, availability, items, candidates };
```

- [ ] **Step 3: Run the focused tests and confirm they pass**

Run: `node --test server/lib/experience.test.js`

Expected: all experience tests pass, including the new source-ledger and candidate tests.

- [ ] **Step 4: Commit the backend implementation**

```bash
git add server/lib/experience.js server/lib/experience.test.js
git commit -m "feat: make hot ranking available without weakening evidence"
```

### Task 3: Expose the two-layer contract through the public API

**Files:**
- Modify: `server/index.js:publicHotTopics` and `/api/public/hot-topics`
- Modify: `server/index.test.js` in the public experience endpoint test
- Test: `server/index.test.js`

**Interfaces:**
- Consumes: `buildHotTopics` result with `availability`, `items`, and `candidates`.
- Produces: public JSON with the new fields and no internal fields.

- [ ] **Step 1: Add the failing API assertions**

Extend the existing hot API assertions with:

```js
assert.ok(["confirmed", "candidate", "empty"].includes(hotList.availability));
assert.equal(Array.isArray(hotList.candidates), true);
for (const candidate of hotList.candidates) {
  assertPublicItem(candidate);
  assert.equal(candidate.availability, "candidate");
  assert.equal(candidate.status, "emerging");
  assert.equal(Object.hasOwn(candidate, "raw"), false);
  assert.equal(Object.hasOwn(candidate, "priorityTier"), false);
}
```

- [ ] **Step 2: Run the API test to confirm the contract fails**

Run: `node --test server/index.test.js`

Expected: FAIL because the route currently returns only `generatedAt`, `windowHours`, `rules`, and `items`.

- [ ] **Step 3: Serialize candidates through the existing allowlist**

Update `publicHotTopics` to map both `items` and `candidates` through `serializePublicItem`, preserving only the explicit candidate presentation fields (`availability`, `status`, `sourceCount`, `sources`, `evidenceMeta`) after serialization. Return `availability` unchanged.

- [ ] **Step 4: Update OpenAPI wording**

Change the `/api/public/hot-topics` summary to “List confirmed hotspots and emerging candidates” and document the `availability`, `items`, and `candidates` response shape in the existing OpenAPI object.

- [ ] **Step 5: Run the API test and commit**

Run: `node --test server/index.test.js`

Expected: all API tests pass.

```bash
git add server/index.js server/index.test.js
git commit -m "feat: expose emerging hot candidates publicly"
```

### Task 4: Update client types and add UI contract tests

**Files:**
- Modify: `src/types.ts` around `HotTopic`
- Modify: `src/lib/experience.test.mts`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- Consumes: public hot API response fields.
- Produces: `HotTopic`, `HotCandidate`, `HotPageData`, and source-level contracts for candidate copy.

- [ ] **Step 1: Add the failing client assertions**

Add source-level assertions to the existing hot-page contract test:

```ts
const hotPageSource = readSource("src/components/hot/HotPage.tsx");
assert.match(hotPageSource, /candidates/);
assert.match(hotPageSource, /正在形成/);
assert.match(hotPageSource, /待确认/);
assert.match(hotPageSource, /查看精选时间线/);
```

- [ ] **Step 2: Run the client tests and confirm they fail**

Run: `node --test src/lib/experience.test.mts`

Expected: FAIL because the page has no candidate section or fallback copy.

- [ ] **Step 3: Extend the types**

Keep confirmed `HotTopic` unchanged and add:

```ts
type HotCandidate = Item & {
  availability: "candidate";
  status: "emerging";
  sourceCount: 1;
  sources: string[];
};
```

Add to `HotPageData` in `src/components/hot/HotPage.tsx`:

```ts
availability?: "confirmed" | "candidate" | "empty";
candidates?: HotCandidate[];
```

- [ ] **Step 4: Run typecheck after the type contract**

Run: `npm run typecheck`

Expected: PASS or only the expected missing-render assertions remain in the source test.

- [ ] **Step 5: Commit the client contract**

```bash
git add src/types.ts src/lib/experience.test.mts
git commit -m "test: define hot candidate UI contract"
```

### Task 5: Implement the hot page candidate experience

**Files:**
- Modify: `src/components/hot/HotPage.tsx`
- Modify: `src/styles/layout.css` or the existing hot-page stylesheet location
- Modify: `src/styles/responsive.css`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- Consumes: `data.items`, `data.candidates`, `data.availability`, `onOpenStory`, `onOpenItem`, `onOpenFeed`, and existing navigation callbacks.
- Produces: a confirmed ranking, an emerging candidate list, and honest empty-state actions.

- [ ] **Step 1: Render candidates without changing confirmed semantics**

Keep the existing confirmed `<ol className="hot-ranking-list">` unchanged for `topics`. Add a second section after it:

```tsx
const candidates = data?.candidates || [];
{!loading && !error && candidates.length > 0 && (
  <section className="hot-candidates" aria-labelledby="hot-candidates-title">
    <header>
      <div><span>EMERGING SIGNALS</span><h2 id="hot-candidates-title">正在形成的热点</h2></div>
      <p>这些内容值得关注，但目前只有单一来源，尚不能视为多源确认。</p>
    </header>
    <ol>
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <a href={itemLocation(candidate.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenItem(candidate); }}>
            <b className="hot-rank">待</b>
            <span className="hot-topic-copy">
              <strong>{candidate.title}</strong>
              <small>待确认 · {candidate.sourceName} · 最新 {formatTime(candidate.publishedAt)}</small>
              <span className="hot-topic-summary">{candidate.evidenceMeta?.evidenceGaps?.join("；") || "独立信源仍不足"}</span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  </section>
)}
```

Use the existing click interception helper exactly as the confirmed list does; do not add a second navigation mechanism.

- [ ] **Step 2: Make the empty state useful**

When `topics.length === 0 && candidates.length === 0`, retain the honest message and add a link/button to the selected feed, using the existing route helper rather than a hard-coded external URL. When candidates exist, do not show the old “暂无热点” card.

- [ ] **Step 3: Update rules copy**

Change the rules description from “热点榜只包含多源确认” to explain that confirmed items and pending candidates are separate layers; explicitly state that candidate items are not consensus.

- [ ] **Step 4: Add responsive styles and source assertions**

Add styles for `.hot-candidates`, its header, list, and `待` marker. The mobile layout must wrap long source/title text and keep candidate cards within the viewport. Extend the existing responsive source test for `.hot-candidates` and `overflow-wrap`.

- [ ] **Step 5: Run client tests and typecheck**

Run: `node --test src/lib/experience.test.mts && npm run typecheck`

Expected: all client tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the UI implementation**

```bash
git add src/components/hot/HotPage.tsx src/styles/layout.css src/styles/responsive.css src/lib/experience.test.mts
git commit -m "feat: show emerging signals in hot ranking"
```

### Task 6: Full adversarial verification, deployment, and GitHub sync

**Files:**
- Modify: none unless verification finds a defect
- Test: `server/*.test.js`, `server/lib/*.test.js`, `src/lib/*.test.mts`

**Interfaces:**
- Consumes: complete local implementation and built assets.
- Produces: verified production deployment and GitHub branch synchronization.

- [ ] **Step 1: Run the complete local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: 0 test failures, TypeScript exit 0, Vite build exit 0, and no whitespace errors.

- [ ] **Step 2: Run focused adversarial checks**

Verify with fixtures and production-shaped state that:

- a cluster with one stored representative and two persisted sources enters `items`;
- a single-source selected item enters `candidates`, not `items`;
- `reference`, hidden, invalid URL, and weak community entries enter neither layer;
- `duplicateCount` alone never creates confirmation;
- API output is JSON, contains `availability`, and has no `raw`, `hidden`, `priorityTier`, `duplicateSources`, or `duplicateCount`;
- no candidate copy says “多源确认” or “共识”.

- [ ] **Step 3: Deploy without replacing runtime data**

Build first, back up production `/opt/aihot/data/db.json`, rsync code and `dist` while excluding `data/`, `.env*`, `.git/`, `node_modules/`, and backup directories, restart `aihot.service`, and verify the service is active.

- [ ] **Step 4: Verify production behavior**

Check `/`, `/hot`, `/api/public/hot-topics`, `/api/public/items?mode=selected&take=5`, and `/feed.xml`. Confirm `/api/public/hot-topics` returns JSON with either confirmed items, candidates, or an explicit `empty` state; it must never return the frontend HTML fallback.

- [ ] **Step 5: Sync GitHub and verify the remote**

Push `agent/hot-center-release` using Git transport if available. If Git transport is blocked but the authenticated GitHub API is available, create a non-force sync commit from the remote branch tip, update the branch ref with `force: false`, and compare the remote tree blob hashes for every changed file with local `git hash-object` values.

- [ ] **Step 6: Commit any final verification-only fix and report exact evidence**

Run `git status --short --branch`, record test/build output, production response shapes, deployment backup path, and the final GitHub commit URL before claiming completion.
