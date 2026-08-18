const assert = require("node:assert/strict");
const test = require("node:test");

const { channelLabel, sourceChannel } = require("./editorial");

test("expert rss sources stay in expert analysis channel even when source names contain research or blog terms", () => {
  const item = {
    url: "https://www.latent.space/p/agent-memory",
    title: "Agent memory stacks in practice",
    summary: "A practitioner breakdown of agent memory, eval loops, and deployment trade-offs.",
    sourceName: "Latent Space Research Blog",
    sourceKind: "rss",
    priorityTier: "expert_rss",
  };

  assert.equal(sourceChannel(item), "expert_analysis");
  assert.equal(channelLabel("expert_analysis"), "专家解读");
});

test("expert rss tier wins over broad social and Chinese name heuristics", () => {
  const item = {
    url: "https://example.com/expert",
    title: "AI agent deployment notes",
    summary: "An expert analysis of production evals.",
    sourceName: "X · @expert 豆包研究博客",
    sourceKind: "rss",
    priorityTier: "expert_rss",
  };

  assert.equal(sourceChannel(item), "expert_analysis");
});

test("source tier falls back to expert analysis when priority tier is absent", () => {
  const item = {
    url: "https://example.com/fallback",
    title: "Agent workflow teardown",
    summary: "A deep expert breakdown of AI agent deployment and eval loops.",
    sourceName: "Independent expert blog",
    sourceKind: "rss",
    sourceTier: "expert_rss",
  };

  assert.equal(sourceChannel(item), "expert_analysis");
});
