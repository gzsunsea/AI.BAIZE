const assert = require("node:assert/strict");
const test = require("node:test");

const { isNoiseCandidate, isSelectedQualityCandidate } = require("./scoring");

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
