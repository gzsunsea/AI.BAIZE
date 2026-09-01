# 热点中心与搜索体验实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入付费数据源或覆盖生产运行数据的前提下，为 AI.BAIZE 增加可分享的热点中心、事件时间线，并让搜索与浏览器返回恢复完整上下文。

**Architecture:** 后端继续以 `server/lib/experience.js` 的事件聚类为唯一热点计算入口，新增统一的热点列表和事件详情公开 API；热点列表限制展示数量，但事件详情从完整候选聚类中查询，保证直接打开任意有效事件链接都能工作。前端在现有单页 App 中加入 pathname/query 驱动的轻量路由，新增独立 `HotPage`/`StoryPage`，并将信息流筛选状态序列化到 URL。首期热度使用本站已有来源数、来源层级、分数和时效，不声称外部讨论量，也不生成历史曲线。

**Tech Stack:** Node.js `node:test`、Express 5、React 19、TypeScript 5、Vite 7、现有 CSS 与 `lucide-react`。

## Global Constraints

- 不引入付费 API 或新的运行时依赖。
- 不覆盖生产 `data/db.json`；热点从当前状态实时计算。
- 热度质量分必须使用现有 `sourceTier/priorityTier` 层级权重，并通过 `rules.version` 公开规则版本。
- 保留 `/api/public/hot-topics` 兼容现有精选页。
- 中键、⌘/Ctrl 点击和右键新开页保持原生行为。
- 移动端 390px 宽度不得产生横向溢出。
- 任何“无热点/无故事/接口失败”都必须是明确空态，不伪造内容。

## 文件地图

- Modify: `server/lib/experience.js` — 统一热点评分、状态和事件详情构建。
- Modify: `server/index.js` — 暴露 `/api/public/hot`、`/api/public/stories/:id`，并扩展信息流搜索参数。
- Modify: `server/lib/experience.test.js`、`server/index.test.js` — 后端纯函数、契约、404 和兼容性测试。
- Modify: `src/types.ts` — 增加热点详情、热度规则、搜索状态类型。
- Create: `src/lib/navigation.ts` — URL 解析/生成、历史导航和列表状态快照。
- Create: `src/lib/navigation.test.mts` — URL 与返回状态单元测试。
- Modify: `src/app/App.tsx` — 轻量路由、`popstate`、热点/故事数据加载、列表滚动恢复。
- Create: `src/components/hot/HotPage.tsx` — 热点中心页面。
- Create: `src/components/hot/StoryPage.tsx` — 事件详情与时间线页面。
- Modify: `src/components/feed/FeedExperience.tsx` — direct/full 搜索模式控件和可访问文案。
- Modify: `src/styles/feed.css`, `src/styles/layout.css`, `src/styles/responsive.css` — 热点、时间线和移动端样式。
- Modify: `src/lib/experience.test.mts` — 前端源码/样式回归测试。

---

### Task 1: 统一热点计算与事件详情领域函数

**Files:**
- Modify: `server/lib/experience.js`（`buildHotTopics` 附近）
- Modify: `server/lib/experience.test.js`

**Interfaces:**
- Produces `buildHotTopics(state, options)`，返回 `{ generatedAt, windowHours: 72, rules, items }`。
- Produces `buildStory(state, id, options)`，返回 `{ event, summary, latestUpdates, timeline, sources, rules }`；找不到事件返回 `null`。

- [ ] **Step 1: 写失败测试，锁定热度、状态和详情契约**

```js
test("hot topics expose rank, heat, status, and a transparent rules version", () => {
  const result = buildHotTopics({
    items: [signal("a1", "event-a", "openai", 91), signal("a2", "event-a", "simon", 88)],
    clusters: [{ id: "event-a", title: "Event A", items: ["a1", "a2"] }],
  }, { now: "2026-08-17T04:00:00.000Z" });

  assert.equal(result.windowHours, 72);
  assert.equal(result.rules.version, 1);
  assert.equal(result.items[0].rank, 1);
  assert.equal(typeof result.items[0].heat, "number");
  assert.equal(["new", "rising", "active"].includes(result.items[0].status), true);
});

test("story detail returns newest updates first and null for unknown ids", () => {
  const state = {
    items: [
      signal("old", "event-a", "one", 80, { publishedAt: "2026-08-16T01:00:00.000Z" }),
      signal("new", "event-a", "two", 85, { publishedAt: "2026-08-17T01:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["old", "new"] }],
  };
  const story = buildStory(state, "event-a", { now: "2026-08-17T04:00:00.000Z", enrichItem: (item) => item });
  assert.deepEqual(story.timeline.map((item) => item.id), ["new", "old"]);
  assert.equal(story.latestUpdates[0].id, "new");
  assert.equal(buildStory(state, "missing", {}), null);
});
```

- [ ] **Step 2: 运行后端领域测试，确认当前实现失败**

Run: `node --test server/lib/experience.test.js`

Expected: FAIL，因为当前热点返回没有 `windowHours/rules/rank/heat/status`，且没有 `buildStory`。

- [ ] **Step 3: 实现最小热点评分和状态函数**

在 `server/lib/experience.js` 中加入以下确定性函数，并让 `buildHotTopics` 使用它们：

```js
const HOT_RULES = { version: 1, windowHours: 72, trendAvailable: false };

function hotHeat(topic) {
  const tierWeight = { first_party: 12, preferred_x: 11, expert: 10, research: 9, cn_media: 8, education: 7, culture: 7, media: 6, social: 5, community: 4, reference: 3, custom: 2 };
  const sourceQualityScore = Math.min(30, topic.relatedItems.reduce((sum, item) => sum + (tierWeight[item.priorityTier || item.sourceTier || item.tier] || 1), 0));
  const sourceCountBonus = Math.min(25, Math.max(0, topic.sourceCount - 1) * 8);
  const freshnessBonus = Math.max(0, Math.round(20 - topic.ageHours / 4));
  const selectedScoreBonus = Math.min(25, Math.round(topic.topScore / 4));
  return Math.max(0, Math.min(100, sourceQualityScore + sourceCountBonus + freshnessBonus + selectedScoreBonus));
}

function hotStatus(topic) {
  if (topic.ageHours <= 6) return "new";
  return "active";
}
```

`buildHotTopics` 保留原有“至少两个独立来源，或 pinned 且达到 selectedThreshold”的门槛，先构造内部 `topic`，计算 `ageHours`，再按 `heat`、`sourceCount`、`topScore`、`publishedAt` 排序并添加 `rank`。函数读取 `options.limit`，默认 10；当传入 `Number.POSITIVE_INFINITY` 时不截断，供详情查询使用。返回 `windowHours: 72` 和 `rules: HOT_RULES`。

- [ ] **Step 4: 实现 `buildStory` 并过滤公开字段**

```js
function buildStory(state = {}, id, options = {}) {
  const topics = buildHotTopics(state, { ...options, limit: Number.POSITIVE_INFINITY }).items;
  const topic = topics.find((item) => item.id === id);
  if (!topic) return null;
  const timeline = [...(topic.relatedItems || [])].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return {
    event: { ...topic, relatedItems: undefined },
    summary: topic.representative.editorialBrief?.fact || topic.representative.summary || topic.title,
    latestUpdates: timeline.slice(0, 3),
    timeline,
    sources: topic.sources,
    rules: topic.rules || HOT_RULES,
  };
}
```

实现时不要把 `relatedItems: undefined` 序列化到响应中；事件详情只返回 `enrichItem` 生成的公开 `Item` 字段。将 `buildHotTopics` 与 `buildStory` 加到 `module.exports`。

- [ ] **Step 5: 运行测试并提交领域层**

Run: `node --test server/lib/experience.test.js`

Expected: PASS，既有热点和报告测试也继续通过。

```bash
git add server/lib/experience.js server/lib/experience.test.js
git commit -m "feat: add transparent hot story domain model"
```

### Task 2: 暴露热点与事件公开 API

**Files:**
- Modify: `server/index.js`
- Modify: `server/index.test.js`
- Modify: `src/types.ts`

**Interfaces:**
- `GET /api/public/hot` 调用 `buildHotTopics(readState(), { selectedThreshold, enrichItem })`。
- `GET /api/public/stories/:id` 调用 `buildStory`，不存在时返回 `{ error: "story not found" }` 和 404。
- `GET /api/public/hot-topics` 继续返回旧字段，但数据来源改为统一热点构建函数。

- [ ] **Step 1: 写 API 失败测试**

在 `server/index.test.js` 的公开体验测试中加入：

```js
const hotListResponse = await fetch(`${base}/api/public/hot`);
assert.equal(hotListResponse.status, 200);
const hotList = await hotListResponse.json();
assert.equal(hotList.windowHours, 72);
assert.equal(Array.isArray(hotList.items), true);

if (hotList.items.length) {
  const storyResponse = await fetch(`${base}/api/public/stories/${encodeURIComponent(hotList.items[0].id)}`);
  assert.equal(storyResponse.status, 200);
  const story = await storyResponse.json();
  assert.equal(Array.isArray(story.timeline), true);
}

const missingStory = await fetch(`${base}/api/public/stories/missing-story-id`);
assert.equal(missingStory.status, 404);
assert.deepEqual(await missingStory.json(), { error: "story not found" });
```

- [ ] **Step 2: 运行测试确认路由失败**

Run: `node --test server/index.test.js`

Expected: FAIL，`/api/public/hot` 和 `/api/public/stories/:id` 尚未注册。

- [ ] **Step 3: 注册 API 并保持兼容路由**

在 `server/index.js` 导入 `buildStory`，在现有 `/api/public/hot-topics` 前加入：

```js
app.get("/api/public/hot", (_req, res) => {
  const state = readState();
  res.json(buildHotTopics(state, {
    selectedThreshold: state.settings?.rules?.selectedThreshold || 70,
    enrichItem,
  }));
});

app.get("/api/public/stories/:id", (req, res) => {
  const state = readState();
  const story = buildStory(state, String(req.params.id), {
    selectedThreshold: state.settings?.rules?.selectedThreshold || 70,
    enrichItem,
  });
  if (!story) return res.status(404).json({ error: "story not found" });
  return res.json(story);
});
```

让旧路由直接返回新构建结果的 `items`，并保留 `generatedAt`，使精选页无需立刻迁移字段。`buildStory` 不复用热点列表的数量截断，而是从完整的合格聚类中定位事件。

- [ ] **Step 4: 扩展类型并运行 API 测试**

在 `src/types.ts` 增加 `HotRules`、`HotTopic` 新字段、`StoryDetail` 和 `SearchState`，然后运行：

```bash
node --test server/index.test.js server/lib/experience.test.js
```

Expected: PASS。

- [ ] **Step 5: 提交 API 契约**

```bash
git add server/index.js server/index.test.js src/types.ts
git commit -m "feat: expose hot center and story APIs"
```

### Task 3: 建立 URL 状态与轻量历史导航

**Files:**
- Create: `src/lib/navigation.ts`
- Create: `src/lib/navigation.test.mts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- `parseLocation(location: string | Location): RouteState`
- `toLocation(route: RouteState): string`
- `captureListState(key: string, snapshot: ListSnapshot): void`
- `readListState(key: string): ListSnapshot | null`

- [ ] **Step 1: 写 URL 解析/生成失败测试**

```ts
test("parses hot story and feed search state from URL", () => {
  assert.deepEqual(parseLocation(new URL("https://example.test/story/event-a?q=agent&search=full&channel=news").toString()), {
    page: "story", storyId: "event-a", mode: "selected", query: "agent", searchMode: "full", activeChannel: "news", activeTag: "", category: "", statusFilter: "all", sort: "published_desc", pageNumber: 1,
  });
});

test("omits empty query parameters and round-trips hot route", () => {
  const path = toLocation({ page: "hot", storyId: "", mode: "selected", query: "", searchMode: "direct", activeChannel: "", activeTag: "", category: "", statusFilter: "all", sort: "published_desc", pageNumber: 1 });
  assert.equal(path, "/hot");
});
```

- [ ] **Step 2: 运行测试确认工具不存在**

Run: `node --test src/lib/navigation.test.mts`

Expected: FAIL，文件和导出尚未创建。

- [ ] **Step 3: 实现明确的路由类型和 URL 工具**

```ts
export type RouteState = {
  page: "feed" | "hot" | "story";
  storyId: string;
  mode: string;
  query: string;
  searchMode: "direct" | "full";
  activeChannel: string;
  activeTag: string;
  category: string;
  statusFilter: string;
  sort: "published_desc" | "relevance";
  pageNumber: number;
};

export function toLocation(route: RouteState) {
  const path = route.page === "hot" ? "/hot" : route.page === "story" ? `/story/${encodeURIComponent(route.storyId)}` : "/";
  const params = new URLSearchParams();
  if (route.page === "feed") {
    for (const [key, value] of [["mode", route.mode], ["q", route.query], ["search", route.searchMode === "direct" ? "" : route.searchMode], ["channel", route.activeChannel], ["tag", route.activeTag], ["category", route.category], ["status", route.statusFilter === "all" ? "" : route.statusFilter], ["sort", route.sort === "published_desc" ? "" : route.sort], ["page", route.pageNumber > 1 ? String(route.pageNumber) : ""]]) {
      if (value) params.set(key, value);
    }
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
```

`parseLocation` 接受 `string | Location`，内部统一使用 `new URL(input, window.location.origin)`；缺失参数回退到规格中的默认值。列表快照写入 `sessionStorage`，只存 `scrollY` 和筛选字段，不存整页内容。

- [ ] **Step 4: 接入 App 的 `pushState`/`popstate`**

在 `App.tsx` 增加一次性监听：

```ts
useEffect(() => {
  const sync = () => setRoute(parseLocation(window.location.href));
  window.addEventListener("popstate", sync);
  return () => window.removeEventListener("popstate", sync);
}, []);
```

新增 `navigate(next, replace = false)`：先保存当前列表快照，再调用 `history[replace ? "replaceState" : "pushState"]({}, "", toLocation(next))`，最后更新 React route state。普通列表卡片点击使用 `pushState` 到 `/story/:id`；详情返回调用 `history.back()`，直接打开详情且无历史时回退 `/hot`。

- [ ] **Step 5: 运行工具测试并提交导航层**

Run: `node --test src/lib/navigation.test.mts`

Expected: PASS。

```bash
git add src/lib/navigation.ts src/lib/navigation.test.mts src/app/App.tsx
git commit -m "feat: add URL-driven navigation state"
```

### Task 4: 实现热点中心与事件详情页面

**Files:**
- Create: `src/components/hot/HotPage.tsx`
- Create: `src/components/hot/StoryPage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/layout.css`, `src/styles/responsive.css`

**Interfaces:**
- `HotPage({ data, loading, error, onOpenStory, onRetry })`
- `StoryPage({ story, loading, error, onBack, onOpenItem, onRetry })`

- [ ] **Step 1: 添加页面渲染回归测试**

在 `src/lib/experience.test.mts` 读取源码并断言：

```ts
const hotSource = readFileSync(new URL("../components/hot/HotPage.tsx", import.meta.url), "utf8");
const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");
assert.match(hotSource, /近 72 小时/);
assert.match(hotSource, /role="list"/);
assert.match(storySource, /事件时间线/);
assert.match(storySource, /<time/);
```

- [ ] **Step 2: 实现 HotPage 的加载、空态和排名列表**

页面用 `ol`/`li` 语义结构，每项显示 `rank`、`heat`、`status`、来源数和 `latestAt`。点击卡片调用 `onOpenStory(item.id)`；错误显示“热点暂时不可用”和重试按钮；空列表显示“近 72 小时暂无达到多源确认阈值的热点”。

- [ ] **Step 3: 实现 StoryPage 的摘要、最新进展和时间线**

页面必须渲染 `summary`、`latestUpdates`、`timeline`、`sources`，时间使用 `<time dateTime={item.publishedAt}>`。每条原文链接使用 `target="_blank" rel="noreferrer"`；返回按钮调用 `onBack`，无详情时显示 404 文案和返回入口。

- [ ] **Step 4: 在 App 中按 route 分支加载数据**

进入 `/hot` 时请求 `/api/public/hot`；进入 `/story/:id` 时请求 `/api/public/stories/${encodeURIComponent(id)}`。加载和错误状态独立于普通信息流，避免切换页面时短暂显示上一页。导航栏“热点榜”和精选页“查看完整热点榜”都调用 `navigate({ page: "hot", ... })`。

- [ ] **Step 5: 添加桌面和移动样式并运行构建**

样式约束：热点列表主列 `minmax(0, 1fr)`，状态徽标不只用颜色，移动端按钮可换行但标题 `overflow-wrap:anywhere`；390px 下不允许固定宽度超过容器。

Run: `npm run build`

Expected: Vite build succeeds with no TypeScript or JSX errors。

- [ ] **Step 6: 提交页面层**

```bash
git add src/components/hot src/app/App.tsx src/styles/layout.css src/styles/responsive.css src/lib/experience.test.mts
git commit -m "feat: add hot center and story timeline pages"
```

### Task 5: 接入搜索模式、URL 筛选和列表滚动恢复

**Files:**
- Modify: `src/components/feed/FeedExperience.tsx`
- Modify: `src/app/App.tsx`
- Modify: `server/index.js`
- Modify: `src/styles/feed.css`, `src/styles/responsive.css`
- Modify: `src/lib/experience.test.mts`

**Interfaces:**
- Feed props 增加 `searchMode: "direct" | "full"` 和 `onSearchModeChange`。
- `/api/items` 接收 `searchMode`，响应回显 `search: { query, mode, sort }`。

- [ ] **Step 1: 写搜索模式和样式失败测试**

```ts
const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");
assert.match(feedSource, /直接匹配/);
assert.match(feedSource, /全文相关/);
assert.match(appSource, /searchMode/);
```

- [ ] **Step 2: 扩展后端搜索字段和排序**

解析 `req.query.searchMode === "full"`；`direct` 只使用标题、摘要、来源和标签；`full` 额外使用正文/编辑摘要字段。`direct` 使用 `publishedAt` 倒序；`full` 使用命中字段权重，再以 `publishedAt` 倒序。未提供参数时保持现有 direct 行为。

- [ ] **Step 3: 在 FeedExperience 增加可访问模式切换**

增加带 `role="tablist"` 的两个按钮，当前模式设置 `aria-selected`；切换调用 `onSearchModeChange` 并触发一次搜索。控件在移动端可横向滚动但不得撑破页面宽度。

- [ ] **Step 4: 将状态同步到 URL 并恢复滚动**

每次 query/tag/channel/searchMode/status 变化后使用 `replaceState` 更新当前列表 URL；分页变化只更新 `page`。详情打开前保存 `{ scrollY, query, activeTag, activeChannel, searchMode, statusFilter, page }`，`popstate` 后在 `requestAnimationFrame` 中 `window.scrollTo(0, snapshot.scrollY)`。`density` 是本地显示偏好，不写入分享 URL。避免在 `scroll` 事件中写 URL。

- [ ] **Step 5: 运行前端与后端回归测试**

Run: `node --test server/index.test.js server/lib/experience.test.js src/lib/experience.test.mts src/lib/navigation.test.mts && npm run build`

Expected: all tests PASS and build succeeds。

- [ ] **Step 6: 提交搜索与返回体验**

```bash
git add src/components/feed/FeedExperience.tsx src/app/App.tsx server/index.js src/styles/feed.css src/styles/responsive.css src/lib/experience.test.mts
git commit -m "feat: preserve search and feed history state"
```

### Task 6: 集成验收与发布前检查

**Files:**
- Modify: `server/index.test.js`（如需补充完整契约测试）
- Modify: `src/lib/experience.test.mts`（如需补充移动端回归断言）

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`

Expected: all existing and new Node tests PASS。

- [ ] **Step 2: 构建生产资产**

Run: `npm run build`

Expected: `dist/` successfully generated；不修改 `data/db.json`。

- [ ] **Step 3: 做最小接口冒烟检查**

启动本地服务后运行：

```bash
curl -fsS http://127.0.0.1:8080/api/public/hot | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s); if(v.windowHours!==72) process.exit(1); console.log(v.items.length)})'
curl -fsS http://127.0.0.1:8080/api/public/hot-topics >/dev/null
```

Expected: `/api/public/hot` 返回 `windowHours:72`，旧 `/api/public/hot-topics` 仍为 200。

- [ ] **Step 4: 手动检查关键路径**

依次验证：精选页 → 当前热点 → `/hot` → `/story/:id` → 浏览器返回；信息流搜索 direct/full → 打开详情 → 返回；复制 URL 新开窗口；390px 移动视口无横向滚动。

- [ ] **Step 5: 提交验收记录**

```bash
git status -sb
git log -6 --oneline
```

Expected: 工作区干净，提交历史包含本计划的分阶段提交；生产部署另行执行，不在本计划内自动覆盖服务器数据。

## Self-review 对照

- 热点中心、事件详情：Task 1–4。
- direct/full 搜索：Task 5。
- URL、返回和滚动恢复：Task 3、Task 5。
- 透明热度规则与“不做历史曲线”：Task 1、Task 4。
- API 兼容与 404：Task 2。
- 移动端无溢出、无伪造空态：Task 4、Task 5、Task 6。
- 模型榜、外部讨论量、生产数据覆盖：明确列为本轮不做/约束。
