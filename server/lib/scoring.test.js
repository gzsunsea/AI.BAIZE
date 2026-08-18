const assert = require("node:assert/strict");
const test = require("node:test");

const { isNoiseCandidate, isSelectedQualityCandidate, normalizeItem } = require("./scoring");

function cnMediaItem(title, summary = "") {
  return {
    title,
    summary,
    tags: ["模型发布"],
    sourceName: "IT之家 AI",
    sourceKind: "rss",
    priorityTier: "cn_media",
  };
}

test("presentation-only galleries are rejected even when AI keywords are present", () => {
  const item = cnMediaItem("联想 AI 主机图赏：金属外壳与极简设计", "支持本地大模型");

  assert.equal(isNoiseCandidate(item), true);
  assert.equal(isSelectedQualityCandidate(item), false);
});

test("weak AI sports prediction stories are rejected", () => {
  const item = cnMediaItem("世界杯连续爆冷，12 家 AI 集体预测错误", "大模型竞猜冠军全部翻车");

  assert.equal(isNoiseCandidate(item), true);
  assert.equal(isSelectedQualityCandidate(item), false);
});

test("substantive local-model hardware remains eligible", () => {
  const item = cnMediaItem("AI 工作站发布：可运行 120B 本地大模型", "面向模型推理和部署，支持大模型量化与本地推理");

  assert.equal(isNoiseCandidate(item), false);
  assert.equal(isSelectedQualityCandidate(item), true);
});

test("normalizeItem keeps high-signal scores distributed instead of saturating at 99", () => {
  const official = normalizeItem({
    url: "https://openai.com/index/new-agents",
    title: "OpenAI launches new agent workflow tools",
    summary: "New API, agent orchestration, deployment guidance, and multimodal automation updates for developers.",
    sourceName: "OpenAI",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    publishedAt: "2026-08-18T00:00:00.000Z",
  });
  const expert = normalizeItem({
    url: "https://simonwillison.net/2026/08/18/agents",
    title: "Simon Willison breaks down new agent workflow patterns",
    summary: "Detailed implementation notes for LLM agents, evals, deployment trade-offs, and production workflows.",
    sourceName: "Simon Willison Blog",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    publishedAt: "2026-08-18T00:00:00.000Z",
  });
  const community = normalizeItem({
    url: "https://github.com/example/agent-demo",
    title: "Agent demo repository",
    summary: "Open source example repository for AI agent experiments.",
    sourceName: "GitHub",
    sourceKind: "github",
    priorityTier: "community_fallback",
    publishedAt: "2026-08-18T00:00:00.000Z",
  });

  assert.ok(official.score < 99);
  assert.ok(expert.score < 99);
  assert.ok(official.score > expert.score);
  assert.ok(expert.score > community.score);
});

test("normalizeItem produces source-specific reasons without generic ranking boilerplate", () => {
  const item = normalizeItem({
    url: "https://latent.space/p/agent-stacks",
    title: "Agent stacks for production teams",
    summary: "Explains how agent orchestration, evals, and deployment workflows differ between research demos and product teams.",
    sourceName: "Latent Space",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    publishedAt: "2026-08-18T00:00:00.000Z",
  });

  assert.match(item.reason, /Latent Space|Agent stacks|生产团队|工作流/);
  assert.doesNotMatch(item.reason, /系统按/);
});
