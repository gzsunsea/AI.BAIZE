const assert = require("node:assert/strict");
const test = require("node:test");

const { channelLabel, evidenceMeta, serializePublicItem, sourceChannel } = require("./editorial");

test("evidence metadata distinguishes first party, multiple sources, expert analysis, and gaps", () => {
  assert.deepEqual(evidenceMeta({ priorityTier: "official_first_party", sourceName: "OpenAI", title: "API release", summary: "Official API release" }), {
    evidenceLevel: "first_party",
    evidenceLabel: "一手发布",
    evidenceGaps: ["第三方效果与长期稳定性尚未独立验证"],
    creatorValue: "适合核对功能边界、使用条件与迁移成本。",
    generatedBy: "rules",
  });
  assert.equal(evidenceMeta({ priorityTier: "expert_rss", sourceName: "Expert", title: "Agent workflow", summary: "Deployment notes" }).evidenceLevel, "expert_analysis");
  assert.equal(evidenceMeta({ priorityTier: "expert_rss", sourceName: "Expert", title: "Agent workflow", summary: "Deployment notes" }, [
    { sourceId: "expert", sourceName: "Expert", priorityTier: "expert_rss" },
    { sourceId: "official", sourceName: "OpenAI", priorityTier: "official_first_party" },
  ]).evidenceLevel, "multi_source");
});

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

test("public serialization replaces legacy selected-reason templates with neutral evidence copy", () => {
  const genericReason = "基于信源优先级、时效、主题相关性和可操作性综合判断入选。";
  const item = serializePublicItem({
    id: "legacy-template-reason",
    url: "https://openai.com/index/agent-api-migration",
    title: "OpenAI publishes an AI agent API migration timeline",
    summary: "The official release documents migration dates and model compatibility.",
    sourceName: "OpenAI",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    reason: genericReason,
  });

  assert.notEqual(item.reason, genericReason);
  assert.doesNotMatch(item.reason, /信源优先级|主题相关性|可操作性/);
  assert.match(item.reason, /OpenAI|migration timeline/);
});
