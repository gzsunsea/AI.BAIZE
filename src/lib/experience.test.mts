import assert from "node:assert/strict";
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
