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
  const publishedAt = new Date().toISOString();
  const state = {
    items: [
      item("official", "OpenAI", "OpenAI 发布新模型", publishedAt),
      item("expert", "Simon Willison", "Simon Willison 分析 OpenAI 新模型 Agent API 对开发者影响", publishedAt, "expert_rss"),
    ],
  };
  const result = answerQuestion(state, { question: "比较新模型的影响", command: "compare" });

  assert.equal(result.command, "compare");
  assert.equal(result.grounded, true);
  assert.equal(result.citations.length, 2);
  assert.match(result.answer, /OpenAI/);
  assert.match(result.answer, /Simon Willison/);
});

test("Ask Baize grounds only in items that pass the complete selected boundary", () => {
  const state = {
    settings: { rules: { selectedThreshold: 72 } },
    items: [
      item("eligible", "OpenAI", "OpenAI 发布 AI agent API", new Date().toISOString()),
      { ...item("low", "Low Score", "Low score AI model note", new Date().toISOString()), score: 10 },
      { ...item("invalid", "Invalid URL", "Invalid AI model note", new Date().toISOString()), url: "#" },
      { ...item("hidden", "Hidden", "Hidden AI model note", new Date().toISOString()), hidden: true },
      {
        ...item("legacy-reference", "AIHOT 公开页", "AIHOT mirrored AI model note", new Date().toISOString()),
        sourceKind: "aihot",
        sourceId: "aihot-public",
        priorityTier: "",
        sourceTier: "reference",
      },
    ],
  };

  const result = answerQuestion(state, { question: "AI 模型" });

  assert.deepEqual(result.citations.map((citation) => citation.id), ["eligible"]);
  assert.equal(result.grounded, true);

  const empty = answerQuestion({ settings: state.settings, items: state.items.slice(1) }, { question: "AI 模型" });
  assert.equal(empty.grounded, false);
  assert.deepEqual(empty.citations, []);
});
