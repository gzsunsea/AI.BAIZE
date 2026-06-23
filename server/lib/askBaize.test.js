const assert = require("node:assert/strict");
const test = require("node:test");

const { answerQuestion, inferCommand } = require("./askBaize");

function item(id, sourceName, title, publishedAt, priorityTier = "official_first_party") {
  return {
    id,
    sourceName,
    sourceKind: "rss",
    priorityTier,
    title,
    summary: `${title} 的事实摘要和产品影响。`,
    reason: `${title} 值得关注。`,
    tags: ["模型发布", "产品更新"],
    score: 90,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test("infers comparison and timeline commands", () => {
  assert.equal(inferCommand("比较各家对这件事的说法"), "compare");
  assert.equal(inferCommand("给我事件时间线"), "timeline");
});

test("answers with bounded source citations", () => {
  const state = {
    items: [
      item("official", "OpenAI", "OpenAI 发布新模型", "2026-06-22T01:00:00.000Z"),
      item("expert", "Simon Willison", "新模型的开发者影响", "2026-06-22T02:00:00.000Z", "expert_rss"),
    ],
  };
  const result = answerQuestion(state, { question: "比较新模型的影响", command: "compare" });

  assert.equal(result.command, "compare");
  assert.equal(result.grounded, true);
  assert.equal(result.citations.length, 2);
  assert.match(result.answer, /OpenAI/);
  assert.match(result.answer, /Simon Willison/);
});
