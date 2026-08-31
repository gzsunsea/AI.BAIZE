import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coverageLabel, creatorCardForItem, groupItemsByLocalDate, itemToMarkdown, reportToMarkdown, todayIssueSummary, todaySignalLabel, todaySignalSummary, topicForMode, topicRequestUrls } from "./experience.mts";
import { filterAndSortFeedItems } from "./feedSearch.mts";

test("today signal copy prefers evidence label and creator value", () => {
  const signal = {
    evidenceMeta: { evidenceLabel: "多源确认", creatorValue: "适合拆解工作流变化。" },
    summary: "官方发布了新能力。",
  } as never;
  assert.equal(todaySignalLabel(signal), "多源确认");
  assert.equal(todaySignalSummary(signal), "适合拆解工作流变化。");
});

test("today issue copy explains a real signal count and honest empty state", () => {
  assert.deepEqual(todayIssueSummary({ items: [{ evidenceMeta: { evidenceLevel: "multi_source" } }, { evidenceMeta: { evidenceLevel: "first_party" } }] } as never), {
    issueLabel: "今日先看",
    summary: "今天有 2 条达到精选门槛的信号，优先关注已形成独立确认的变化。",
    selectionNote: "按信源质量、独立确认、时效与可复用价值排序。",
  });
  assert.deepEqual(todayIssueSummary({ items: [] } as never), {
    issueLabel: "今日暂无可用信号",
    summary: "今天没有达到精选门槛的新增事件。",
    selectionNote: "继续核对一手信源，不降级、不用低质量内容填充。",
  });
});

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

test("all client-rendered feeds share direct/full matching, category filtering, and URL sort", () => {
  const items = [
    { id: "saved-first", title: "AI update", summary: "ordinary", sourceName: "Source", tags: [], category: "culture", channel: "news", channelLabel: "资讯聚合", publishedAt: "2026-08-16T00:00:00.000Z", score: 99 },
    { id: "new-direct", title: "Needle launch", summary: "ordinary", sourceName: "Source", tags: [], category: "culture", channel: "first_party", channelLabel: "一手信源", publishedAt: "2026-08-18T00:00:00.000Z", score: 20 },
    { id: "full-only", title: "AI launch", summary: "ordinary", sourceName: "Source", tags: [], category: "culture", channel: "social", channelLabel: "观点", content: "needle", publishedAt: "2026-08-17T00:00:00.000Z", score: 10 },
    { id: "wrong-category", title: "Needle education", summary: "ordinary", sourceName: "Source", tags: [], category: "education", channel: "first_party", channelLabel: "一手信源", publishedAt: "2026-08-19T00:00:00.000Z", score: 100 },
  ] as never[];

  const direct = filterAndSortFeedItems(items, { query: "needle", searchMode: "direct", category: "culture", sort: "published_desc" });
  assert.deepEqual(direct.map((item) => item.id), ["new-direct"]);
  const full = filterAndSortFeedItems(items, { query: "needle", searchMode: "full", category: "culture", sort: "relevance" });
  assert.deepEqual(full.map((item) => item.id), ["new-direct", "full-only"]);
  const reading = filterAndSortFeedItems(items.slice(0, 2), { query: "", searchMode: "direct", category: "culture", sort: "published_desc" });
  assert.deepEqual(reading.map((item) => item.id), ["new-direct", "saved-first"]);
  const copiedTopicUrl = filterAndSortFeedItems(items, { activeChannel: "first_party", category: "culture", sort: "published_desc" });
  assert.deepEqual(copiedTopicUrl.map((item) => item.id), ["new-direct"]);
  const copiedReadingUrl = filterAndSortFeedItems(items, { activeChannel: "资讯聚合", category: "culture", sort: "published_desc" });
  assert.deepEqual(copiedReadingUrl.map((item) => item.id), ["saved-first"]);
});

test("groups feed items by Shanghai local date and sorts the timeline newest first", () => {
  const items = [
    { id: "oldest", publishedAt: "2026-07-20T08:00:00.000Z" },
    { id: "after-midnight", publishedAt: "2026-07-21T16:30:00.000Z" },
    { id: "before-midnight", publishedAt: "2026-07-21T15:30:00.000Z" },
    { id: "same-day", publishedAt: "2026-07-21T18:00:00.000Z" },
  ];

  const groups = groupItemsByLocalDate(items);

  assert.deepEqual(groups.map((group) => group.date), ["2026-07-22", "2026-07-21", "2026-07-20"]);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["same-day", "after-midnight"]);
});

test("topic definitions normalize legacy education and culture modes", () => {
  assert.equal(topicForMode("education")?.key, "topic-education");
  assert.equal(topicForMode("culture")?.key, "topic-culture");
  assert.equal(topicForMode("topic-models")?.query.categories[0], "model");
  assert.equal(topicForMode("selected"), null);
});

test("topic requests are bounded and use server-side filters", () => {
  const agentUrls = topicRequestUrls(topicForMode("topic-agents")!);
  assert.equal(agentUrls.length, 3);
  assert.equal(agentUrls.every((url) => url.includes("pageSize=80")), true);
  assert.equal(agentUrls.some((url) => url.includes("q=Agent")), true);

  const educationUrls = topicRequestUrls(topicForMode("topic-education")!);
  assert.deepEqual(educationUrls, ["/api/items?mode=all&category=education&page=1&pageSize=80"]);
});

test("report coverage copy distinguishes complete, partial, and empty periods", () => {
  assert.equal(coverageLabel({ complete: true, days: 7, requiredDays: 7, start: "2026-07-20", end: "2026-07-26" }), "7/7 天完整覆盖");
  assert.equal(coverageLabel({ complete: false, days: 2, requiredDays: 7, start: "2026-07-20", end: "2026-07-21" }), "覆盖 2/7 天 · 2026-07-20 至 2026-07-21");
  assert.equal(coverageLabel({ complete: false, days: 0, requiredDays: 7, start: null, end: null }), "当前周期暂无快照");
});

test("Markdown export contains editorial metadata without inventing full text", () => {
  const markdown = itemToMarkdown({
    id: "openai-launch",
    title: "OpenAI 发布新模型",
    sourceName: "OpenAI",
    publishedAt: "2026-07-22T04:00:00.000Z",
    url: "https://openai.com/example",
    reason: "值得关注的正式发布。",
    summary: "这段摘要不应伪装成全文。",
    editorialBrief: { fact: "模型已经发布。", impact: "开发接口发生变化。", scenario: "适合产品团队评估。" },
  } as never);

  assert.match(markdown, /^# OpenAI 发布新模型/m);
  assert.match(markdown, /AI\.BAIZE ID：openai-launch/);
  assert.match(markdown, /## 事实[\s\S]*模型已经发布/);
  assert.match(markdown, /## 推荐理由[\s\S]*值得关注/);
  assert.doesNotMatch(markdown, /完整正文|全文/);
});

test("report Markdown export keeps the editorial mainline and source links", () => {
  const markdown = reportToMarkdown({
    period: "weekly",
    issueId: "weekly:2026-08-24",
    range: { start: "2026-08-24", end: "2026-08-30" },
    editorialSummary: "本周形成 Agent 主线。",
    headline: "本周值得关注的 2 条 AI 动态",
    storyCount: 2,
    estimatedReadingMinutes: 1,
    themes: [{ key: "agent", label: "Agent", count: 2 }],
    trendLines: [{ key: "agent", label: "Agent", count: 2, eventCount: 2, sourceCount: 2, latestAt: "2026-08-30T02:00:00.000Z", evidenceLevel: "multi_source", sampleItems: [] }],
    watchItems: [],
    sections: [{ key: "model", title: "模型", items: [{ id: "one", title: "Agent update", sourceName: "Official", publishedAt: "2026-08-30T02:00:00.000Z", url: "https://example.com/one", summary: "Summary", score: 90, tags: [], reason: "Reason", sourceKind: "rss" }] }],
    coverage: { complete: true, days: 7, requiredDays: 7, start: "2026-08-24", end: "2026-08-30" },
    navigation: { previousDate: "2026-08-17", nextDate: null },
  } as never);
  assert.match(markdown, /本周形成 Agent 主线/);
  assert.match(markdown, /## 本期主线/);
  assert.match(markdown, /https:\/\/example\.com\/one/);
  assert.doesNotMatch(markdown, /raw|hidden|priorityTier/);
});

test("reports expose export and RSS actions", () => {
  const source = readFileSync(new URL("../components/reports/ReportsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /导出本期/);
  assert.match(source, /订阅 RSS/);
  assert.match(source, /\/feed\.xml/);
});

test("reader exposes bounded content-quality feedback actions", () => {
  const source = readFileSync(new URL("../components/reader/ReadingWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /有价值/);
  assert.match(source, /重复\/噪音/);
  assert.match(source, /事实需核对/);
  assert.match(source, /\/api\/feedback/);
  assert.match(source, /itemId/);
});

test("mobile feed styles keep long labels and titles inside the viewport", () => {
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8").replace(/\s+/g, " ");
  const baseCss = readFileSync(new URL("../styles/base.css", import.meta.url), "utf8").replace(/\s+/g, " ");

  assert.match(feedCss, /\.feed-experience \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
  assert.match(feedCss, /grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(feedCss, /\.primary-filters button,[^}]*\.topic-filters button \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/);
  assert.match(feedCss, /\.feed-card-title \{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;/);
  assert.match(baseCss, /html \{[^}]*-webkit-text-size-adjust: 100%;[^}]*text-size-adjust: 100%;/);
});

test("evidence-first surfaces have dedicated responsive style contracts", () => {
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8");
  const readerCss = readFileSync(new URL("../styles/reader.css", import.meta.url), "utf8");
  const responsiveCss = readFileSync(new URL("../styles/responsive.css", import.meta.url), "utf8");

  assert.match(feedCss, /\.today-signals/);
  assert.match(feedCss, /\.today-signal-card/);
  assert.match(feedCss, /\.evidence-badge/);
  assert.match(readerCss, /\.reader-evidence-boundary/);
  assert.match(readerCss, /\.creator-card/);
  assert.match(responsiveCss, /today-signals|today-signal-card/);
});

test("feed search exposes direct and full modes and keeps them in the shared URL state", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8");

  assert.match(feedSource, /直接匹配/);
  assert.match(feedSource, /全文相关/);
  assert.match(feedSource, /role="tablist"/);
  assert.match(feedSource, /aria-selected/);
  assert.match(appSource, /searchMode/);
  assert.match(appSource, /searchMode=\$\{encodeURIComponent\(searchMode\)\}/);
  assert.match(appSource, /history\.replaceState/);
  assert.match(appSource, /pendingScrollRestore\.current = next\.page === "feed" && snapshot \? snapshot\.scrollY : null/);
  assert.match(feedCss, /\.search-mode-tabs \{[^}]*overflow-x: auto;/);
});

test("topic and reading feeds share the search pipeline and ignore stale loads", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /filterAndSortFeedItems\(\[\.\.\.merged\.values\(\)\], \{\s*query,\s*searchMode,\s*activeTag,\s*activeChannel,/);
  assert.match(appSource, /mode === "reading" \? filterAndSortFeedItems\(items, \{\s*query,\s*searchMode,\s*activeTag,\s*activeChannel,/);
  assert.match(appSource, /const loadVersion = useRef\(0\)/);
  assert.match(appSource, /const requestVersion = \+\+loadVersion\.current/);
  assert.match(appSource, /if \(requestVersion !== loadVersion\.current\) return;/);
  assert.match(appSource, /const applyRoute = \(next: RouteState\) => \{\s*loadVersion\.current \+= 1;/);
});

test("editorial feed renders available media and Chinese radar never falls through to the previous feed", () => {
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8");

  assert.match(feedSource, /function FeedMediaPreview/);
  assert.match(feedSource, /<FeedMediaPreview item=\{item\}/);
  assert.match(feedSource, /暂无配图/);
  assert.match(feedSource, /\/api\/media\?url=/);
  assert.match(feedCss, /\.feed-card-media/);
  assert.match(feedCss, /\.feed-card-media\.placeholder/);
  assert.match(appSource, /暂无配图/);
  assert.match(appSource, /mode === "mp" \? \(\s*mp \? <MpTable mp=\{mp\} \/> : <div className="mp-loading-state"/);
});

test("selected feed loads todays signals independently and exposes evidence states", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");

  assert.match(appSource, /api<TodaySignalsResponse>\("\/api\/public\/today\?limit=5"\)/);
  assert.match(appSource, /今日先看加载失败/);
  assert.match(feedSource, /今日先看/);
  assert.match(feedSource, /today-signals/);
  assert.match(feedSource, /evidence-badge/);
  assert.match(feedSource, /完整时间线仍可浏览/);
});

test("agent endpoint links do not expose the POST-only ask route as a GET link", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(appSource, /\["问白泽", "\/api\/public\/ask"\]/);
  assert.match(appSource, /\["问白泽（POST）", "\/openapi\.json"\]/);
});

test("hot center and story pages retain their semantic editorial landmarks", () => {
  const hotSource = readFileSync(new URL("../components/hot/HotPage.tsx", import.meta.url), "utf8");
  const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");

  assert.match(hotSource, /近 72 小时/);
  assert.match(hotSource, /role="list"/);
  assert.match(hotSource, /perAdditionalSource/);
  assert.match(hotSource, /decayHours/);
  assert.match(hotSource, /floor/);
  assert.match(hotSource, /selectedScoreBonus\.divisor/);
  assert.match(feedSource, /formatTime\(topic\.latestAt\)/);
  assert.match(feedSource, /topic\.summary \|\| topic\.representative\.summary/);
  assert.match(feedSource, /hot-status \$\{topic\.status\}/);
  assert.match(feedSource, /热度 \{topic\.heat\}/);
  assert.match(storySource, /事件时间线/);
  assert.match(storySource, /<time/);
});

test("reports and story pages surface the editorial trend and lifecycle contracts", () => {
  const reportsSource = readFileSync(new URL("../components/reports/ReportsWorkspace.tsx", import.meta.url), "utf8");
  const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");
  const reportsCss = readFileSync(new URL("../styles/reports.css", import.meta.url), "utf8");

  assert.match(reportsSource, /本期主线/);
  assert.match(reportsSource, /trendLines/);
  assert.match(reportsSource, /继续观察/);
  assert.match(storySource, /生命周期/);
  assert.match(storySource, /firstSeenAt/);
  assert.match(storySource, /nextCheck/);
  assert.match(reportsCss, /report-trends/);
  assert.match(reportsCss, /report-watch/);
});

test("hot and story routes synchronously invalidate stale page data", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /if \(next\.page === "hot"\) \{[\s\S]*setHotPageData\(null\)[\s\S]*setHotPageLoading\(true\)/);
  assert.match(appSource, /if \(next\.page === "story"\) \{[\s\S]*setStory\(null\)[\s\S]*setStoryLoading\(true\)/);
});

test("hot routes save and restore their own scroll only after matching data renders", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const hotListStateKey = "aibaize-hot-list"/);
  assert.match(appSource, /captureNavigationSnapshot\(current, window\.scrollY, hotListStateKey\)/);
  assert.match(appSource, /pendingHotScrollRestore\.current = next\.page === "hot" \? readScrollState\(hotListStateKey\) : null/);
  assert.match(appSource, /history\.scrollRestoration = "manual"/);
  assert.match(appSource, /route\.page !== "hot" \|\| hotPageLoading \|\| !hotPageData \|\| pendingHotScrollRestore\.current === null/);
});

test("story back label follows feed or hot origin while direct stories fall back to hot", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");

  assert.match(appSource, /storyOrigin: next\.page === "story" \? current\.page : undefined/);
  assert.match(appSource, /backLabel=\{storyBackLabel\(history\.state\?\.storyOrigin\)\}/);
  assert.match(storySource, /backLabel: string/);
  assert.match(storySource, /\{backLabel\}/);
});

test("story routes surface API 404s and keep related reader opens route-neutral", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");

  assert.match(appSource, /class ApiError extends Error[\s\S]*status: number/);
  assert.match(appSource, /err instanceof ApiError && err\.status === 404/);
  assert.match(storySource, /notFound: boolean/);
  assert.match(storySource, /404：未找到这个热点事件/);
  assert.match(appSource, /onOpenRelated=\{\(item\) => readerFromStoryPage \? openStoryItem\(item\) : openItem\(item, activeRelatedItems\)\}/);
});
