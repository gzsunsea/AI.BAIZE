# AI.BAIZE Full-Site Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild AI.BAIZE's public navigation, selected feed, topics, reports, reading workspace, visual system, and mobile experience while preserving its existing source pipeline and public API compatibility.

**Architecture:** Add deterministic experience helpers for cluster-backed hot topics and daily/weekly/monthly reports, expose them through additive Express endpoints, then reorganize the React frontend around a shared shell and focused feed, topic, report, and reader components. Preserve local-storage keys and legacy endpoints; every optional experience section degrades independently.

**Tech Stack:** Node.js, Express 5, React 19, TypeScript, Vite 7, Lucide React, CSS custom properties, Node `node:test`.

## Global Constraints

- Do not replace or redesign the refresh and scraping pipeline.
- Do not introduce paid APIs, external font dependencies, accounts, cloud bookmark sync, or request-time LLM calls for reports.
- Preserve `/api/items`, `/api/public/items`, `/api/daily`, `/api/public/daily`, and `/api/public/dailies` compatibility.
- Preserve local-storage keys `aibaize-read-items`, `aibaize-saved-items`, `aibaize-processed-items`, `aibaize-density`, and `aihot-theme-mode`.
- Do not republish unavailable copyrighted full text; exported Markdown contains metadata and editorial content only.
- Use Asia/Shanghai local dates for hot-topic freshness and report periods.
- Mobile touch targets must be at least 44 by 44 CSS pixels and honor safe-area insets.
- Do not overwrite `data/db.json`; deployment remains out of scope until separately approved.
- Keep all existing server tests green and run `npm run build` before completion.

## File Map

- Create `server/lib/experience.js`: pure current-signal and report aggregation helpers.
- Create `server/lib/experience.test.js`: eligibility, ordering, period boundary, dedupe, and coverage tests.
- Modify `server/index.js`: additive hot-topic/report routes, validation, OpenAPI entries, and exports for route tests.
- Modify `server/index.test.js`: compatibility and endpoint response tests.
- Create `src/types.ts`: shared item, digest, hot-topic, report, and UI types.
- Create `src/lib/experience.ts`: local-date grouping, topic definitions, report formatting, and Markdown export.
- Create `src/app/App.tsx`: application state, mode routing, requests, and page composition.
- Reduce `src/main.tsx`: React bootstrap and global style imports only.
- Create `src/components/layout/AppShell.tsx`: grouped desktop navigation, mobile header/drawer, bottom navigation, and page shell.
- Create `src/components/feed/FeedExperience.tsx`: current signals, toolbar, filters, date groups, feed cards, and display controls.
- Create `src/components/topics/TopicPage.tsx`: reusable topic header and filtered feed wrapper.
- Create `src/components/reports/ReportsWorkspace.tsx`: period tabs, issue navigation, lead, themes, and report sections.
- Create `src/components/reader/ReadingWorkspace.tsx`: reader/Ask Baize workspace, focus restoration, and export actions.
- Create `src/components/shared.tsx`: theme toggle, bookmark guide, loading/empty/error states, editorial brief, and media preview.
- Create `src/styles/tokens.css`, `base.css`, `layout.css`, `feed.css`, `reports.css`, `reader.css`, and `responsive.css`.
- Retain `src/styles.css` temporarily for Admin, Agent, About, and MP legacy selectors; convert its literal colors and spacing to shared tokens where touched.

---

### Task 1: Build Current-Signal Aggregation

**Files:**
- Create: `server/lib/experience.js`
- Create: `server/lib/experience.test.js`

**Interfaces:**
- Consumes: state-shaped `{ items, clusters, settings }`, `enrichItem(item)` callback, and `selectedThreshold` number.
- Produces: `buildHotTopics(state, options) -> { generatedAt, items }` where each item has `id`, `title`, `sourceCount`, `sources`, `topScore`, `publishedAt`, `representative`, and `relatedItems`.

- [ ] **Step 1: Write failing hot-topic tests**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { buildHotTopics } = require("./experience");

test("hot topics require independent sources and order by evidence then score", () => {
  const now = "2026-07-22T04:00:00.000Z";
  const items = [
    { id: "a1", eventId: "event-a", sourceId: "openai", sourceName: "OpenAI", title: "A", score: 91, publishedAt: now },
    { id: "a2", eventId: "event-a", sourceId: "simon", sourceName: "Simon", title: "A analysis", score: 88, publishedAt: now },
    { id: "b1", eventId: "event-b", sourceId: "media", sourceName: "Media", title: "B", score: 99, publishedAt: now },
  ];
  const result = buildHotTopics({ items, clusters: [
    { id: "event-a", title: "Event A", items: ["a1", "a2"], sources: ["OpenAI", "Simon"], topScore: 91 },
    { id: "event-b", title: "Event B", items: ["b1"], sources: ["Media"], topScore: 99 },
  ] }, { now, selectedThreshold: 80, enrichItem: (item) => item });
  assert.deepEqual(result.items.map((item) => item.id), ["event-a"]);
  assert.equal(result.items[0].sourceCount, 2);
});

test("a pinned item at the selected threshold can form a topic", () => {
  const now = "2026-07-22T04:00:00.000Z";
  const item = { id: "p1", eventId: "pinned", sourceId: "official", sourceName: "Official", title: "Pinned", score: 80, pinned: true, publishedAt: now };
  const result = buildHotTopics({ items: [item], clusters: [{ id: "pinned", title: "Pinned", items: ["p1"], sources: ["Official"], topScore: 80 }] }, { now, selectedThreshold: 80, enrichItem: (value) => value });
  assert.equal(result.items.length, 1);
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `node --test server/lib/experience.test.js`

Expected: FAIL because `server/lib/experience.js` does not exist.

- [ ] **Step 3: Implement deterministic hot-topic construction**

```js
function itemKeys(cluster = {}) {
  return (cluster.items || []).map((item) => typeof item === "string" ? item : item.id).filter(Boolean);
}

function buildHotTopics(state = {}, options = {}) {
  const nowMs = new Date(options.now || Date.now()).getTime();
  const threshold = Number(options.selectedThreshold || 70);
  const enrich = options.enrichItem || ((item) => item);
  const byId = new Map((state.items || []).map((item) => [item.id, item]));
  const topics = (state.clusters || []).map((cluster) => {
    const related = itemKeys(cluster).map((id) => byId.get(id)).filter(Boolean)
      .filter((item) => nowMs - new Date(item.publishedAt || 0).getTime() <= 72 * 36e5);
    const distinctSources = [...new Set(related.map((item) => item.sourceId || item.sourceName).filter(Boolean))];
    const representative = [...related].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.score || 0) - (a.score || 0))[0];
    if (!representative) return null;
    if (distinctSources.length < 2 && !(representative.pinned && representative.score >= threshold)) return null;
    return {
      id: cluster.id || representative.eventId || representative.id,
      title: cluster.title || representative.title,
      sourceCount: distinctSources.length,
      sources: distinctSources.slice(0, 6),
      topScore: Math.max(cluster.topScore || 0, ...related.map((item) => item.score || 0)),
      publishedAt: representative.publishedAt,
      representative: enrich(representative),
      relatedItems: related.map(enrich),
    };
  }).filter(Boolean).sort((a, b) => b.sourceCount - a.sourceCount || b.topScore - a.topScore || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 5);
  return { generatedAt: new Date(nowMs).toISOString(), items: topics };
}
```

- [ ] **Step 4: Add tests for the 72-hour boundary, duplicate source IDs, five-topic limit, empty inventory, and representative selection**

Use fixed timestamps and assert exact topic IDs, representative IDs, and empty arrays; avoid `Date.now()` in tests.

- [ ] **Step 5: Run the focused test file**

Run: `node --test server/lib/experience.test.js`

Expected: PASS with all current-signal tests.

- [ ] **Step 6: Commit the current-signal helper**

```bash
git add server/lib/experience.js server/lib/experience.test.js
git commit -m "Add cluster-backed current signals"
```

### Task 2: Build Report Aggregation and Add Public Endpoints

**Files:**
- Modify: `server/lib/experience.js`
- Modify: `server/lib/experience.test.js`
- Modify: `server/index.js`
- Modify: `server/index.test.js`

**Interfaces:**
- Consumes: stored `dailyDigests`, requested `period`, requested Shanghai date, and existing `digestItemKeys(item)` semantics.
- Produces: `buildReport(state, options) -> Report`; `GET /api/public/hot-topics`; `GET /api/public/reports?period=daily|weekly|monthly&date=YYYY-MM-DD`.

- [ ] **Step 1: Write failing report tests**

```js
test("weekly reports dedupe events and disclose incomplete coverage", () => {
  const shared = { id: "same", eventId: "launch", title: "Launch", score: 90, tags: ["Agent"] };
  const state = { dailyDigests: [
    { generatedAt: "2026-07-20T00:00:00.000Z", sections: [{ key: "product", title: "产品", items: [shared] }] },
    { generatedAt: "2026-07-21T00:00:00.000Z", sections: [{ key: "product", title: "产品", items: [{ ...shared, id: "same-2" }] }] },
  ] };
  const report = buildReport(state, { period: "weekly", date: "2026-07-22" });
  assert.equal(report.storyCount, 1);
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.days, 2);
  assert.equal(report.estimatedReadingMinutes, 1);
});
```

- [ ] **Step 2: Run the focused tests and confirm `buildReport` is missing**

Run: `node --test server/lib/experience.test.js`

Expected: FAIL with `buildReport is not a function`.

- [ ] **Step 3: Implement report period calculation, latest-snapshot-per-day selection, event dedupe, section merge, theme counts, coverage, and previous/next issue IDs**

Use Monday-through-Sunday for weekly periods and calendar-month boundaries for monthly periods. Deduplicate by first non-empty value among `eventId`, `canonicalUrl`, `url`, `titleFingerprint`, and normalized title. Keep the highest-score representative and preserve `dailySectionOrder`.

```js
function buildReport(state = {}, { period = "daily", date, now = new Date() } = {}) {
  if (!REPORT_PERIODS.has(period)) throw Object.assign(new Error("invalid period"), { statusCode: 400 });
  const anchor = parseShanghaiDate(date || localDateKey(now));
  const range = reportRange(period, anchor);
  const daily = latestDigestPerLocalDay(state.dailyDigests || [], range);
  const sections = mergeDigestSections(daily);
  const storyCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    period,
    issueId: `${period}:${range.startKey}`,
    range: { start: range.startKey, end: range.endKey },
    coverage: coverageFor(period, range, daily, anchor),
    headline: reportHeadline(sections),
    storyCount,
    estimatedReadingMinutes: Math.max(1, Math.ceil(storyCount / 5)),
    themes: countThemes(sections).slice(0, 6),
    sections,
    navigation: reportNavigation(period, range),
  };
}
```

- [ ] **Step 4: Add report boundary tests**

Cover Monday/Sunday, leap-month boundaries, missing dates, multiple issues on one date, deterministic section order, invalid date, invalid period, and empty report output.

- [ ] **Step 5: Wire additive routes and structured validation**

```js
app.get("/api/public/hot-topics", (_req, res) => {
  const state = readState();
  res.json(buildHotTopics(state, {
    selectedThreshold: state.settings?.rules?.selectedThreshold || 70,
    enrichItem,
  }));
});

app.get("/api/public/reports", (req, res) => {
  try {
    res.json(buildReport(readState(), { period: String(req.query.period || "daily"), date: req.query.date }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 6: Add endpoint tests and OpenAPI metadata**

Assert both new routes return 200 with stable shapes, invalid report input returns JSON 400, and existing daily/item endpoints remain 200. Add the two paths to `/openapi.json` without changing existing schemas.

- [ ] **Step 7: Run server tests**

Run: `npm test`

Expected: all existing and new Node tests pass.

- [ ] **Step 8: Commit report aggregation and endpoints**

```bash
git add server/lib/experience.js server/lib/experience.test.js server/index.js server/index.test.js
git commit -m "Add hot topic and report APIs"
```

### Task 3: Establish the Application Shell and Visual Tokens

**Files:**
- Create: `src/types.ts`
- Create: `src/app/App.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/shared.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Create: `src/styles/layout.css`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing API shapes and local-storage state.
- Produces: `App`, `AppShell`, `NavigationGroup[]`, `ThemeToggle`, shared states, and global design tokens used by later components.

- [ ] **Step 1: Move shared TypeScript types without changing their field names**

Define and export `Item`, `Stats`, `DailyDigest`, `Report`, `HotTopic`, `AskResult`, `SavedEntry`, and `AppMode`. `Report` must match Task 2 exactly. Import them from `src/app/App.tsx` and later feature components.

- [ ] **Step 2: Extract the app body from `src/main.tsx` to `src/app/App.tsx` and leave bootstrap only**

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

- [ ] **Step 3: Create grouped navigation definitions and `AppShell`**

```tsx
export const navigationGroups = [
  { label: "发现", items: [{ key: "selected", label: "精选" }, { key: "all", label: "全部动态" }, { key: "reports", label: "报告" }] },
  { label: "专题", items: [{ key: "topic-models", label: "模型" }, { key: "topic-agents", label: "Agent" }, { key: "topic-opensource", label: "开源" }, { key: "topic-education", label: "AI 教育" }, { key: "topic-culture", label: "AI 文化" }] },
  { label: "工作台", items: [{ key: "reading", label: "稍后读" }, { key: "ask", label: "问白泽" }] },
  { label: "服务", items: [{ key: "agent", label: "Agent 接入" }, { key: "about", label: "关于" }] },
] satisfies NavigationGroup[];
```

Keep Admin outside these groups. On mobile expose Selected, All, Reports, Reading List, and More.

- [ ] **Step 4: Add Baize Editorial Desk tokens and base rules**

```css
:root {
  --bg: #08110f;
  --surface: #101c19;
  --surface-raised: #16231f;
  --text: #f3efe5;
  --muted: #a8b4ad;
  --accent: #35c7b0;
  --editorial: #d7ae62;
  --border: rgba(220, 232, 225, 0.14);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --content-max: 1440px;
  color-scheme: dark;
}

:root[data-theme="light"] {
  --bg: #f2efe7;
  --surface: #fbf8f0;
  --surface-raised: #ffffff;
  --text: #17211d;
  --muted: #66736d;
  --accent: #087b6c;
  --editorial: #8b5d17;
  --border: rgba(27, 52, 43, 0.14);
  color-scheme: light;
}
```

- [ ] **Step 5: Replace touched literal colors/sizes with tokens and add visible focus/reduced-motion rules**

Ensure body text is 14px, focus uses `outline: 2px solid var(--accent)`, and motion is disabled inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 6: Build after the extraction**

Run: `npm run build`

Expected: Vite completes and emits `dist/` without TypeScript errors.

- [ ] **Step 7: Commit the shell and token foundation**

```bash
git add src/main.tsx src/app/App.tsx src/types.ts src/components/layout/AppShell.tsx src/components/shared.tsx src/styles/tokens.css src/styles/base.css src/styles/layout.css src/styles.css
git commit -m "Establish editorial app shell"
```

### Task 4: Rebuild the Selected Feed Around Current Signals and Date Groups

**Files:**
- Create: `src/lib/experience.ts`
- Create: `src/components/feed/FeedExperience.tsx`
- Create: `src/styles/feed.css`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Item[]`, `/api/public/hot-topics`, reading-state sets, filters, density, and event handlers.
- Produces: `groupItemsByLocalDate(items)`, `CurrentSignals`, `FeedToolbar`, `DateGroup`, and `FeedCard`.

- [ ] **Step 1: Add pure date grouping and display helpers**

```ts
export function groupItemsByLocalDate(items: Item[]) {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = new Date(item.publishedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([date, groupItems]) => ({ date, items: groupItems }));
}
```

- [ ] **Step 2: Fetch current signals independently from the selected feed**

Use a separate `hotTopicsLoading` and `hotTopicsError` state. An empty successful response renders nothing; an error renders one compact retry row and never replaces the feed.

- [ ] **Step 3: Implement current-signal and date-group components**

Current Signals renders only when at least two topics exist. Date headings use `position: sticky` and today's group cannot collapse. Opening a signal calls `onOpen(topic.representative)` and passes `topic.relatedItems` into reader context.

- [ ] **Step 4: Implement card hierarchy and density behavior**

Comfortable cards show source/time, title, recommendation, editorial brief, score, related count, tags, and actions. Compact cards hide the editorial brief and excess tags but retain the recommendation. Use `<button>` for workspace opening rather than an intercepted external anchor.

- [ ] **Step 5: Move reading-state and density controls into a display menu**

The primary row contains search, category/channel filters, and one display button. The menu exposes All/Unread/Saved/Processed, Comfortable/Compact, and the `J K M B` shortcut hint.

- [ ] **Step 6: Add feed styles and responsive behavior**

Use tokens, sticky date labels with a shell-aware top offset, and stable skeleton sizes. Preserve readable line lengths and explicit read/saved labels; do not use color alone.

- [ ] **Step 7: Run API tests and build**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 8: Commit the redesigned feed**

```bash
git add src/app/App.tsx src/lib/experience.ts src/components/feed/FeedExperience.tsx src/styles/feed.css src/main.tsx
git commit -m "Redesign selected feed experience"
```

### Task 5: Add the Reusable Topic Framework

**Files:**
- Modify: `src/lib/experience.ts`
- Create: `src/components/topics/TopicPage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/styles/feed.css`

**Interfaces:**
- Consumes: `AppMode`, `/api/items` filters, and `FeedExperience`.
- Produces: `TopicDefinition`, `topicDefinitions`, `topicForMode(mode)`, and reusable `TopicPage`.

- [ ] **Step 1: Define exact initial topic filters**

```ts
export const topicDefinitions: Record<string, TopicDefinition> = {
  "topic-models": { label: "模型", description: "模型发布、能力更新与评测信号", query: { tags: ["模型发布", "大模型", "LLM"], categories: ["model"] } },
  "topic-agents": { label: "Agent", description: "智能体产品、框架、协议与工程实践", query: { tags: ["Agent", "智能体", "MCP"], categories: ["product", "opensource"] } },
  "topic-opensource": { label: "开源", description: "值得跟进的开源模型、工具与基础设施", query: { tags: ["开源", "GitHub"], categories: ["opensource"] } },
  "topic-education": { label: "AI 教育", description: "课堂、学习、教师工具与 EdTech", query: { categories: ["education"] } },
  "topic-culture": { label: "AI 文化", description: "艺术、影视、音乐、游戏、版权与创意产业", query: { categories: ["culture"] } },
};
```

- [ ] **Step 2: Extend `/api/items` query construction without client-side full-feed overfetching**

For single-category topics, use `category`. For multi-category/tag topics, issue bounded parallel requests (`pageSize=80`) and merge by item ID, then sort by score and publication time. Do not add a new endpoint unless this bound fails a concrete test.

- [ ] **Step 3: Render `TopicPage` through `FeedExperience`**

Show topic label and description, retain date grouping and reading controls, suppress Current Signals, and show a topic-specific empty state linking to Selected.

- [ ] **Step 4: Preserve legacy education/culture modes during migration**

Map `education` to `topic-education` and `culture` to `topic-culture` inside mode normalization so old internal navigation remains functional.

- [ ] **Step 5: Build and manually query each topic request**

Run: `npm run build`

Expected: build succeeds with all five topic modes reachable.

- [ ] **Step 6: Commit topic pages**

```bash
git add src/lib/experience.ts src/components/topics/TopicPage.tsx src/app/App.tsx src/components/layout/AppShell.tsx src/styles/feed.css
git commit -m "Add reusable editorial topics"
```

### Task 6: Replace Daily With the Reports Workspace

**Files:**
- Create: `src/components/reports/ReportsWorkspace.tsx`
- Create: `src/styles/reports.css`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `GET /api/public/reports`, period/date selection, and reader-opening callback.
- Produces: period tabs, issue navigation, coverage note, report lead, key themes, sections, and back-to-top action.

- [ ] **Step 1: Add report request state keyed by period and issue date**

Use `period: "daily" | "weekly" | "monthly"`, `date`, `report`, `loading`, and `error`. Changing period resets the date to the latest issue and fetches only the selected report.

- [ ] **Step 2: Implement report header and coverage disclosure**

Render period tabs, covered range, `storyCount`, `estimatedReadingMinutes`, completeness note, and previous/next buttons from `report.navigation`. Disable unavailable navigation instead of hiding it.

- [ ] **Step 3: Implement themes and report sections**

Key themes are non-interactive summary chips. Section stories use buttons that open the shared reading workspace; they must not bypass local read tracking with direct external anchors.

- [ ] **Step 4: Add error and empty fallbacks**

Errors show Retry and "查看日报" actions. An empty report shows its real covered date range and does not invent a headline. The Reports navigation remains usable while content reloads.

- [ ] **Step 5: Add report typography and responsive styles**

Keep long-form measure between 66 and 76 characters on desktop, stack the archive/issue controls below 900px, and provide a visible back-to-top button after the first section.

- [ ] **Step 6: Run report tests and build**

Run: `node --test server/lib/experience.test.js`

Expected: all report aggregation tests pass.

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 7: Commit reports**

```bash
git add src/components/reports/ReportsWorkspace.tsx src/styles/reports.css src/app/App.tsx src/main.tsx src/types.ts
git commit -m "Add daily weekly monthly reports"
```

### Task 7: Complete the Reading Workspace and Markdown Export

**Files:**
- Create: `src/components/reader/ReadingWorkspace.tsx`
- Create: `src/styles/reader.css`
- Modify: `src/lib/experience.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: selected `Item`, optional related items, saved/processed state, Ask Baize endpoint, and invoker element reference.
- Produces: accessible desktop side panel/mobile sheet, `itemToMarkdown(item)`, export download, and restored focus.

- [ ] **Step 1: Implement deterministic Markdown serialization**

```ts
export function itemToMarkdown(item: Item) {
  const brief = item.editorialBrief || {};
  return [
    `# ${item.title}`,
    "",
    `- 来源：${item.sourceName}`,
    `- 发布时间：${new Date(item.publishedAt).toLocaleString("zh-CN")}`,
    `- AI.BAIZE ID：${item.id}`,
    `- 原文：${item.url}`,
    "",
    brief.fact && `## 事实\n\n${brief.fact}`,
    brief.impact && `## 影响\n\n${brief.impact}`,
    brief.scenario && `## 场景\n\n${brief.scenario}`,
    item.reason && `## 推荐理由\n\n${item.reason}`,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 2: Extract the existing reader and Ask Baize UI into the reader component**

Preserve current API calls and reader/Ask tabs. Add related coverage using the hot-topic context first and `item.related` metadata as fallback.

- [ ] **Step 3: Add export and focus behavior**

Export creates a UTF-8 Markdown blob named `aibaize-<item-id>.md`. Save the opening element in a ref and focus it after close. Escape closes the workspace; Tab remains contained while the modal is open.

- [ ] **Step 4: Make original, save, process, share, export, and Ask actions explicit**

All actions use text plus icons. Original opens a new tab after marking read. Ask failures do not disable original/save/export actions.

- [ ] **Step 5: Add desktop panel and mobile sheet styles**

Desktop uses a right panel with independent scrolling. Mobile uses a bottom sheet with a visible grabber but no gesture dependency, max-height respecting `100dvh`, and actions padded by `env(safe-area-inset-bottom)`.

- [ ] **Step 6: Build and verify keyboard behavior**

Run: `npm run build`

Expected: build succeeds. Manually verify open, Escape close, focus restoration, J/K/M/B, export, and Ask failure fallback.

- [ ] **Step 7: Commit the reading workspace**

```bash
git add src/components/reader/ReadingWorkspace.tsx src/styles/reader.css src/lib/experience.ts src/app/App.tsx src/main.tsx
git commit -m "Complete reading workspace"
```

### Task 8: Finish Mobile UX, Accessibility, and Full Regression Verification

**Files:**
- Create: `src/styles/responsive.css`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/feed/FeedExperience.tsx`
- Modify: `src/components/reports/ReportsWorkspace.tsx`
- Modify: `src/components/reader/ReadingWorkspace.tsx`
- Modify: `src/styles.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: all completed public views.
- Produces: final responsive behavior, ARIA/focus consistency, safe-area handling, and verified release candidate.

- [ ] **Step 1: Implement mobile search and filter sheets**

At widths below 720px, search expands to a full-width row and filters/display controls open in a labeled sheet. Closing either restores focus to its trigger. Current Signals remains a vertical list.

- [ ] **Step 2: Apply final responsive breakpoints**

Use content-driven breakpoints near 720px and 1024px. Verify 375px, 768px, 1280px, and 1600px widths. Ensure no content is hidden behind the bottom navigation and every mobile control is at least 44px.

- [ ] **Step 3: Audit ARIA, focus, contrast, and reduced motion**

Add `aria-current` to active navigation, `aria-expanded` to drawers/menus, dialog labels, focus-visible styles, and a skip-to-content link. Verify read/saved/selected/error states have text or icon labels in addition to color.

- [ ] **Step 4: Remove superseded selectors and imports**

Delete only selectors made unreachable by extracted components. Keep Admin, MP, Agent, About, bookmark guide, and shared legacy selectors until they are confirmed in use. Run `rg` on each candidate class before deletion.

- [ ] **Step 5: Run complete automated verification**

Run: `npm test`

Expected: all server tests pass.

Run: `npm run build`

Expected: Vite production build succeeds.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Run public-view smoke tests locally**

Start `npm start`, then verify 200 responses for `/api/stats`, `/api/public/items?mode=selected&take=30`, `/api/public/daily`, `/api/public/hot-topics`, `/api/public/reports?period=weekly`, `/`, and `/openapi.json`. Verify Selected, All, five Topics, three Report periods, Reading List, Ask Baize, Agent Access, About, MP, and Admin in dark/light/automatic themes.

- [ ] **Step 7: Review runtime safety**

Run `git status --short data/db.json` and confirm it is unchanged. Confirm no paid dependency or external font was added and no production deployment command was run.

- [ ] **Step 8: Commit final responsive and accessibility pass**

```bash
git add src/components src/styles src/main.tsx src/styles.css
git commit -m "Polish responsive editorial experience"
```

## Final Acceptance Gate

- [ ] Current Signals is backed by independent event clusters and hides when fewer than two topics qualify.
- [ ] Selected and topic feeds group items by Shanghai date and preserve all local reading state.
- [ ] Desktop navigation is grouped; mobile navigation has exactly five top-level actions.
- [ ] Daily, weekly, and monthly reports are deterministic and disclose incomplete coverage.
- [ ] Discovery, reading, saving, processing, sharing, exporting, and Ask Baize share one workspace.
- [ ] Public legacy APIs remain compatible and all tests pass.
- [ ] Production build succeeds at all four target widths in both explicit themes.
- [ ] `data/db.json` is unchanged and no deployment occurred.
