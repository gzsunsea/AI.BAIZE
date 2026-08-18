const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { itemsResponse } = require("../index");
const { normalizeItem, selectedRankingScore } = require("./scoring");

function loadStoreFresh() {
  const modulePath = require.resolve("./store");
  delete require.cache[modulePath];
  return require("./store");
}

test("readState backfills legacy source metadata without overwriting stored display scores", (t) => {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aibaize-store-"));
  t.after(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "data", "db.json"), JSON.stringify({
    items: [
      {
        id: "legacy-official",
        url: "https://openai.com/index/new-agent-stack",
        title: "OpenAI ships a new multimodal AI agent stack",
        summary: "Official release notes cover the API, model rollout, evals, and deployment guidance.",
        sourceName: "OpenAI",
        sourceKind: "rss",
        sourceId: "openai-news",
        publishedAt: "2026-08-18T00:00:00.000Z",
        score: 99,
      },
      {
        id: "legacy-reference",
        url: "https://example.com/reference",
        title: "Reference feed mirror item",
        summary: "A mirrored roundup entry.",
        sourceName: "AIHOT 公开页",
        sourceKind: "aihot",
        sourceId: "aihot-public",
        publishedAt: "2026-08-18T00:00:00.000Z",
        score: 99,
      },
    ],
    sources: [],
    settings: { rules: { selectedThreshold: 72, selectedFeedLimit: 20 } },
  }, null, 2));

  const { readState } = loadStoreFresh();
  const state = readState();
  const official = state.items.find((item) => item.id === "legacy-official");
  const reference = state.items.find((item) => item.id === "legacy-reference");
  const selected = itemsResponse({ mode: "selected", pageSize: 20 }, state);

  assert.equal(official.score, 99);
  assert.equal(reference.score, 99);
  assert.equal(official.priorityTier, "official_first_party");
  assert.equal(reference.priorityTier, "reference");
  assert.ok(selectedRankingScore(official) < 99);
  assert.deepEqual(selected.items.map((item) => item.id), ["legacy-official"]);
  assert.equal(selected.items[0].score, 99);
});

test("upsertItems preserves stored display score and editorial reason during refresh", (t) => {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aibaize-store-upsert-"));
  t.after(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
  const url = "https://openai.com/index/agent-api-migration";
  const storedReason = "编辑核验：迁移截止日期已经确认，现有 API 集成团队需要提前完成兼容性检查。";
  fs.writeFileSync(path.join(tempDir, "data", "db.json"), JSON.stringify({
    items: [{
      id: "stored-agent-api",
      url,
      title: "OpenAI publishes an AI agent API migration timeline",
      summary: "The official release documents API migration dates, model compatibility, and deployment guidance.",
      sourceName: "OpenAI",
      sourceKind: "rss",
      sourceId: "openai-news",
      priorityTier: "official_first_party",
      publishedAt: "2026-08-18T00:00:00.000Z",
      score: 99,
      reason: storedReason,
    }],
    sources: [],
    settings: { rules: { selectedThreshold: 72, selectedFeedLimit: 20 } },
  }, null, 2));

  const refreshed = normalizeItem({
    url,
    title: "OpenAI publishes an AI agent API migration timeline",
    summary: "The refreshed official release documents API migration dates, model compatibility, and deployment guidance.",
    sourceName: "OpenAI",
    sourceKind: "rss",
    sourceId: "openai-news",
    priorityTier: "official_first_party",
    publishedAt: "2026-08-18T01:00:00.000Z",
    reason: "系统按优先信源、时效、主题相关性和可操作性入选。",
  });
  assert.notEqual(refreshed.score, 99);
  assert.notEqual(refreshed.reason, storedReason);

  const { readState, upsertItems } = loadStoreFresh();
  upsertItems([refreshed]);
  const stored = readState().items.find((item) => item.id === "stored-agent-api");

  assert.equal(stored.score, 99);
  assert.equal(stored.reason, storedReason);
});
