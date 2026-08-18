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
