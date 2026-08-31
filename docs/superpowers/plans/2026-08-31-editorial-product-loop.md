# AI.BAIZE 三阶段编辑产品闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有证据优先体验上完成每日刊物、趋势生命周期和订阅导出反馈三阶段闭环，并经审查后提交 GitHub。

**Architecture:** 复用 `server/lib/experience.js` 计算今日信号、报告和事件数据，在公共 API 边界序列化；React 页面只消费结构化字段。反馈继续使用现有公开写入接口，RSS 与 Markdown 导出不引入新服务。

**Tech Stack:** Node.js CommonJS、Express、React、TypeScript、Vite、node:test、现有 CSS 和 JSON store。

## Global Constraints

- 不引入付费 API、付费数据源或新的运行时依赖。
- 不改写生产运行时 `data/db.json` 的结构或内容。
- `reference` 不得进入精选、日报、热点、今日先看或趋势主线。
- 无数据时返回真实空状态，不用低质量内容填充。
- 事实、系统整理、创作建议和用户反馈必须分开呈现。
- 保留现有路由、收藏/已读/处理、问白泽、RSS、API、原文和响应式行为。

---

### Task 1: Extend event lifecycle and report trend contracts

**Files:**
- Modify: `server/lib/experience.js`
- Modify: `server/index.js`
- Modify: `src/types.ts`
- Test: `server/lib/experience.test.js`
- Test: `server/index.test.js`

**Interfaces:**
- `buildStory()` returns `lifecycle: { state, label, firstSeenAt, lastUpdatedAt, nextCheck }` when dates are available.
- `buildReport()` returns `editorialSummary`, `trendLines`, and `watchItems`.
- New public `GET /api/public/trends` returns `{ period, range, summary, items }` using the report trend calculation.

- [ ] Write failing tests for lifecycle state, report trends, and public serialization.
- [ ] Run `node --test server/lib/experience.test.js server/index.test.js` and confirm the new assertions fail.
- [ ] Implement deterministic lifecycle state and trend aggregation from public curated items only.
- [ ] Add the trends route and allowlist all returned item fields through `serializePublicItem`.
- [ ] Re-run focused tests and commit `feat: add editorial trends and event lifecycle`.

### Task 2: Make the daily entry explicitly issue-like

**Files:**
- Modify: `server/lib/experience.js`
- Modify: `server/index.js`
- Modify: `src/types.ts`
- Modify: `src/components/feed/FeedExperience.tsx`
- Modify: `src/lib/experience.mts`
- Test: `server/lib/experience.test.js`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- Today response adds `issueLabel`, `summary`, and `selectionNote` while preserving existing fields.
- `todayIssueSummary()` formats conservative client copy for the panel.

- [ ] Add failing response and copy-helper tests.
- [ ] Run focused tests and verify failure.
- [ ] Add issue metadata derived from signal count, evidence levels, and latest update; never claim consensus without multi-source evidence.
- [ ] Render issue label, summary, and selection note above the current signal list with a real empty state.
- [ ] Re-run focused tests and commit `feat: make today signals an editorial issue`.

### Task 3: Add trends and lifecycle to the reports/story UI

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/reports/ReportsWorkspace.tsx`
- Modify: `src/components/hot/StoryPage.tsx`
- Modify: `src/styles/reports.css`
- Modify: `src/styles/responsive.css`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- `Report` consumes `editorialSummary`, `trendLines`, and `watchItems` from the server.
- `StoryDetail.event.lifecycle` drives a small lifecycle status block.

- [ ] Add failing source-contract tests for report trend and story lifecycle landmarks.
- [ ] Run `node --test src/lib/experience.test.mts` and verify failure.
- [ ] Render report mainline cards and watch items with item open actions; render lifecycle block without hiding the existing timeline.
- [ ] Add responsive one-column rules and long-title wrapping.
- [ ] Re-run frontend tests and typecheck; commit `feat: surface trends and event lifecycle`.

### Task 4: Add report Markdown export and RSS subscription affordance

**Files:**
- Modify: `src/lib/experience.mts`
- Modify: `src/components/reports/ReportsWorkspace.tsx`
- Modify: `src/styles/reports.css`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- `reportToMarkdown(report)` returns a safe Markdown snapshot without internal fields.
- Reports UI exposes `导出本期` and `订阅 RSS` actions.

- [ ] Write failing pure export test.
- [ ] Run the focused test and verify failure.
- [ ] Implement deterministic Markdown export and browser download with object URL cleanup.
- [ ] Add RSS link using `/feed.xml` and keep report loading/error states intact.
- [ ] Re-run focused test and commit `feat: add report export and rss entry`.

### Task 5: Add content-level feedback loop

**Files:**
- Modify: `server/index.js`
- Modify: `src/types.ts`
- Modify: `src/components/reader/ReadingWorkspace.tsx`
- Modify: `src/styles/reader.css`
- Test: `server/index.test.js`
- Test: `src/lib/experience.test.mts`

**Interfaces:**
- `POST /api/feedback` accepts `kind`, `itemId`, `context` and returns them in the stored feedback record.
- Reader renders feedback actions and a non-blocking result message.

- [ ] Write failing API shape and UI contract tests.
- [ ] Run focused tests and verify failure.
- [ ] Validate feedback kind against a fixed allowlist, trim item/context, and preserve the existing message requirement/rate limit.
- [ ] Add accessible feedback buttons that submit item context and never replace primary reading actions.
- [ ] Re-run focused tests and commit `feat: close the content feedback loop`.

### Task 6: Adversarial review and release verification

**Files:**
- Modify only when verification finds a defect.

- [ ] Run `npm test` and inspect all failures.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Run a local endpoint audit for `/api/public/today`, `/api/public/trends`, `/api/public/reports?period=weekly`, `/api/public/stories/:id`, `/feed.xml`, and `/openapi.json`; assert nonempty success bodies where data exists, no `raw`, no hidden fields, and no reference items.
- [ ] Review the diff adversarially for fabricated trends, score-as-meaning, broken event links, feedback spam surface, data leaks, and mobile overflow; fix all findings.
- [ ] Create a final release commit if needed, push the current branch to GitHub, and verify remote HEAD.
