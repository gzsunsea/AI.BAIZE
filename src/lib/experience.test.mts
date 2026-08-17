import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coverageLabel, groupItemsByLocalDate, itemToMarkdown, topicForMode, topicRequestUrls } from "./experience.mts";

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

test("mobile feed styles keep long labels and titles inside the viewport", () => {
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8").replace(/\s+/g, " ");
  const baseCss = readFileSync(new URL("../styles/base.css", import.meta.url), "utf8").replace(/\s+/g, " ");

  assert.match(feedCss, /\.feed-experience \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
  assert.match(feedCss, /grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(feedCss, /\.primary-filters button,[^}]*\.topic-filters button \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/);
  assert.match(feedCss, /\.feed-card-title \{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;/);
  assert.match(baseCss, /html \{[^}]*-webkit-text-size-adjust: 100%;[^}]*text-size-adjust: 100%;/);
});

test("editorial feed renders available media and Chinese radar never falls through to the previous feed", () => {
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const feedCss = readFileSync(new URL("../styles/feed.css", import.meta.url), "utf8");

  assert.match(feedSource, /function FeedMediaPreview/);
  assert.match(feedSource, /<FeedMediaPreview item=\{item\}/);
  assert.match(feedSource, /\/api\/media\?url=/);
  assert.match(feedCss, /\.feed-card-media/);
  assert.match(appSource, /mode === "mp" \? \(\s*mp \? <MpTable mp=\{mp\} \/> : <div className="mp-loading-state"/);
});

test("hot center and story pages retain their semantic editorial landmarks", () => {
  const hotSource = readFileSync(new URL("../components/hot/HotPage.tsx", import.meta.url), "utf8");
  const storySource = readFileSync(new URL("../components/hot/StoryPage.tsx", import.meta.url), "utf8");

  assert.match(hotSource, /近 72 小时/);
  assert.match(hotSource, /role="list"/);
  assert.match(storySource, /事件时间线/);
  assert.match(storySource, /<time/);
});

test("hot and story routes synchronously invalidate stale page data", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /if \(next\.page === "hot"\) \{[\s\S]*setHotPageData\(null\)[\s\S]*setHotPageLoading\(true\)/);
  assert.match(appSource, /if \(next\.page === "story"\) \{[\s\S]*setStory\(null\)[\s\S]*setStoryLoading\(true\)/);
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
