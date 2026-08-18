const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { normalizeItem } = require("./scoring");

function loadEnhancerFresh() {
  delete require.cache[require.resolve("./store")];
  delete require.cache[require.resolve("./llmEnhancer")];
  return require("./llmEnhancer");
}

test("rules enhancement preserves authoritative reasons and replaces only automatic copy", async (t) => {
  const originalCwd = process.cwd();
  const originalDisabled = process.env.OLLAMA_DISABLED;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aibaize-enhancer-"));
  t.after(() => {
    process.chdir(originalCwd);
    if (originalDisabled === undefined) delete process.env.OLLAMA_DISABLED;
    else process.env.OLLAMA_DISABLED = originalDisabled;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  process.env.OLLAMA_DISABLED = "1";
  fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });

  const base = {
    url: "https://example.com/agent-migration",
    title: "OpenAI publishes an AI agent API migration timeline",
    summary: "The official release documents model compatibility, migration dates, evals, and deployment guidance for AI agent teams.",
    sourceName: "Verified Brief",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    preferred: true,
    publishedAt: "2026-08-18T00:00:00.000Z",
  };
  const authoritative = [
    normalizeItem({ ...base, id: "selected", aiSelectedReason: "入选核验：官方原文给出了 API 迁移日期及兼容范围。" }),
    normalizeItem({ ...base, id: "judgment", editorialJudgment: "编辑判断：迁移窗口会直接影响现有智能体产品的升级排期。" }),
    normalizeItem({ ...base, id: "raw-reason", reason: "原始编辑理由：正文列明了模型兼容性和部署迁移步骤。" }),
    { ...normalizeItem({ ...base, id: "stored" }), raw: {}, reason: "已存编辑理由：团队已核验迁移截止日期，需保留此判断。" },
  ];
  const automatic = normalizeItem({ ...base, id: "automatic", url: "https://example.com/automatic-agent-update" });
  const automaticReason = automatic.reason;

  fs.writeFileSync(path.join(tempDir, "data", "db.json"), JSON.stringify({
    items: [...authoritative, automatic],
    sources: [],
    settings: { rules: {} },
  }, null, 2));

  const { enhanceRecentItems } = loadEnhancerFresh();
  const result = await enhanceRecentItems({ limit: 10, force: true });
  const stored = JSON.parse(fs.readFileSync(path.join(tempDir, "data", "db.json"), "utf8"));
  const byId = new Map(stored.items.map((item) => [item.id, item]));

  assert.equal(result.provider, "rules");
  for (const item of authoritative) assert.equal(byId.get(item.id).reason, item.reason);
  assert.notEqual(byId.get("automatic").reason, automaticReason);
  assert.equal(byId.get("automatic").llmProvider, "rules");
});
