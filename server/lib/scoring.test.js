const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canAppearInSelectedFeed,
  explicitReasonFor,
  isNoiseCandidate,
  isCuratedSourceAllowed,
  isSelectedQualityCandidate,
  normalizeItem,
  selectedRankingScore,
} = require("./scoring");
const { compactDuplicates, titleFingerprint } = require("./dedupe");

test("curated source policy excludes reference items from public curation", () => {
  assert.equal(isCuratedSourceAllowed({ priorityTier: "reference" }), false);
  assert.equal(isCuratedSourceAllowed({ priorityTier: "reference", pinned: true }), true);
  assert.equal(isCuratedSourceAllowed({ priorityTier: "official_first_party" }), true);
});

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

test("AI training-copyright disclosures are not demoted as generic executive litigation", () => {
  const item = {
    title: "Authors Guild v. OpenAI 新文件披露高管早已知道大规模盗版书籍训练违法",
    summary: "诉讼文件称 OpenAI 和 Microsoft 高管有意使用盗版书籍训练模型，并知道产品可能取代作家。",
    sourceName: "Hacker News 热门（buzzing.cc 中文翻译）",
    sourceKind: "hn",
    priorityTier: "community_fallback",
  };

  assert.equal(isSelectedQualityCandidate(item), true);
});

test("ordinary commercial litigation about AI company executives remains weak industry news", () => {
  const item = {
    title: "OpenAI executives face a lawsuit over a commercial licensing dispute",
    summary: "The complaint concerns sales contract fees and contains no copyright or model-training claims.",
    sourceName: "Hacker News",
    sourceKind: "hn",
    priorityTier: "community_fallback",
  };

  assert.equal(isSelectedQualityCandidate(item), false);
});

test("explicit denials of copyrighted training use do not qualify as disclosures", () => {
  const item = {
    title: "OpenAI executives face a lawsuit over using pirated books to train models",
    summary: "The company did not train on copyrighted books or use them for model training.",
    sourceName: "Hacker News",
    sourceKind: "hn",
    priorityTier: "community_fallback",
  };

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

test("legacy AIHOT records without priorityTier stay out of selected unless pinned", () => {
  const legacyIdentifiers = [
    { sourceKind: "aihot" },
    { sourceId: "aihot-public" },
    { sourceTier: "reference" },
    { sourceName: "AIHOT 公开页" },
  ];

  for (const legacy of legacyIdentifiers) {
    assert.equal(canAppearInSelectedFeed(legacy), false);
    assert.equal(canAppearInSelectedFeed({ ...legacy, pinned: true }), true);
  }
});

test("read-time ranking calibrates saturated stored scores without changing display scores", () => {
  const publishedAt = new Date().toISOString();
  const official = {
    title: "OpenAI launches a new multimodal AI agent API",
    summary: "The official release documents the model, API, evals, deployment workflow, and developer migration guidance.",
    sourceName: "OpenAI",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    publishedAt,
    score: 99,
  };
  const community = {
    title: "AI agent model discussion",
    summary: "A community post about an AI agent model.",
    sourceName: "Hacker News",
    sourceKind: "hn",
    priorityTier: "community_fallback",
    publishedAt,
    score: 99,
  };

  assert.equal(official.score, community.score);
  assert.ok(selectedRankingScore(official) > selectedRankingScore(community));
  assert.ok(selectedRankingScore(official) < 99);
  assert.ok(selectedRankingScore(community) < 72);
});

test("read-time ranking falls back to raw engagement and topic boosts at the selected boundary", () => {
  const publishedAt = new Date().toISOString();
  const base = {
    title: "OpenAI launches an AI agent model API",
    summary: "The AI agent model API includes benchmark, inference, deployment, and workflow details.",
    sourceKind: "rss",
    priorityTier: "community_fallback",
    publishedAt,
    score: 72,
  };
  const rawOnly = {
    ...base,
    raw: {
      stars: 10_000,
      comments: 1_000,
      topicBoosts: { agent: 12 },
    },
  };
  const normalized = {
    ...base,
    stars: 10_000,
    comments: 1_000,
    topicBoosts: { agent: 12 },
  };

  assert.ok(selectedRankingScore({ ...base, raw: {} }) < 72);
  assert.equal(selectedRankingScore(rawOnly), selectedRankingScore(normalized));
  assert.ok(selectedRankingScore(rawOnly) >= 72);
});

test("selected ranking rewards independent confirmation when display scores tie", () => {
  const publishedAt = new Date().toISOString();
  const mirrored = {
    title: "AI agent API migration timeline",
    summary: "A newsletter repost of the migration dates and API compatibility details.",
    url: "https://mirror-weekly.example/ai-agent-api-migration",
    titleFingerprint: titleFingerprint("AI agent API migration timeline"),
    sourceName: "Mirror Weekly",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    publishedAt,
    score: 99,
  };
  const confirmed = {
    ...mirrored,
    duplicateCount: 2,
    duplicateSources: ["OpenAI", "Simon Willison Blog"],
    relatedCoverage: [
      { sourceName: "Mirror Weekly", url: mirrored.url, title: mirrored.title, titleFingerprint: mirrored.titleFingerprint },
      { sourceName: "OpenAI", url: "https://openai.com/index/agent-api-migration", title: "OpenAI publishes its new agent API migration schedule", titleFingerprint: titleFingerprint("OpenAI publishes its new agent API migration schedule") },
      { sourceName: "Simon Willison Blog", url: "https://simonwillison.net/2026/sep/28/agent-api-migration/", title: "Notes on the migration timeline for OpenAI's new agent API", titleFingerprint: titleFingerprint("Notes on the migration timeline for OpenAI's new agent API") },
    ],
  };

  assert.equal(mirrored.score, confirmed.score);
  assert.ok(selectedRankingScore(confirmed) > selectedRankingScore(mirrored));
});

test("selected ranking ignores same-source duplicates and unproven duplicate counts", () => {
  const publishedAt = new Date().toISOString();
  const base = {
    title: "AI agent API migration timeline",
    summary: "A newsletter copy of the migration dates and API compatibility details.",
    url: "https://mirror-weekly.example/ai-agent-api-migration",
    titleFingerprint: titleFingerprint("AI agent API migration timeline"),
    sourceName: "Mirror Weekly",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    publishedAt,
    score: 99,
  };
  const unproven = { ...base, duplicateCount: 4 };
  const sameSource = {
    ...base,
    duplicateCount: 4,
    duplicateSources: ["Mirror Weekly", " mirror weekly ", "MIRROR WEEKLY"],
  };
  const independentlyConfirmed = {
    ...sameSource,
    duplicateSources: [...sameSource.duplicateSources, "OpenAI"],
    relatedCoverage: [
      { sourceName: "Mirror Weekly", url: base.url, title: base.title, titleFingerprint: base.titleFingerprint },
      { sourceName: "OpenAI", url: "https://openai.com/index/agent-api-migration", title: "OpenAI publishes its new agent API migration schedule", titleFingerprint: titleFingerprint("OpenAI publishes its new agent API migration schedule") },
    ],
  };

  assert.equal(selectedRankingScore(unproven), selectedRankingScore(base));
  assert.equal(selectedRankingScore(sameSource), selectedRankingScore(base));
  assert.ok(selectedRankingScore(independentlyConfirmed) > selectedRankingScore(base));
});

test("selected ranking does not trust legacy duplicate source names without URL coverage", () => {
  const base = {
    title: "AI agent API migration timeline",
    summary: "A newsletter copy of the migration dates and API compatibility details.",
    url: "https://mirror-weekly.example/ai-agent-api-migration",
    sourceName: "Mirror Weekly",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    publishedAt: new Date().toISOString(),
    score: 80,
  };
  const legacyNamesOnly = {
    ...base,
    duplicateCount: 3,
    duplicateSources: ["OpenAI", "Simon Willison Blog"],
  };

  assert.equal(selectedRankingScore(legacyNamesOnly), selectedRankingScore(base));
});

test("selected ranking does not treat different source names for the same canonical URL as confirmation", () => {
  const base = {
    title: "Authors Guild v. OpenAI filing discusses pirated books in model training",
    summary: "A filing in the copyright lawsuit discusses books used to train AI models.",
    url: "https://authorsguild.org/news/ag-v-openai-training/",
    titleFingerprint: titleFingerprint("Authors Guild v. OpenAI filing discusses pirated books in model training"),
    sourceName: "Hacker News",
    sourceKind: "hn",
    priorityTier: "community_fallback",
    publishedAt: new Date().toISOString(),
    score: 80,
  };
  const sameArticle = {
    ...base,
    duplicateSources: ["Authors Guild"],
    relatedCoverage: [
      { sourceName: "Hacker News", url: base.url, titleFingerprint: base.titleFingerprint },
      { sourceName: "Authors Guild", url: "https://www.authorsguild.org/news/ag-v-openai-training/?utm_source=rss", titleFingerprint: base.titleFingerprint },
    ],
  };

  assert.equal(selectedRankingScore(sameArticle), selectedRankingScore(base));
});

test("selected ranking rewards distinct source URLs when related coverage proves them", () => {
  const base = {
    title: "Authors Guild v. OpenAI filing discusses pirated books in model training",
    summary: "A filing in the copyright lawsuit discusses books used to train AI models.",
    url: "https://authorsguild.org/news/ag-v-openai-training/",
    titleFingerprint: titleFingerprint("Authors Guild v. OpenAI filing discusses pirated books in model training"),
    sourceName: "Hacker News",
    sourceKind: "hn",
    priorityTier: "community_fallback",
    publishedAt: new Date().toISOString(),
    score: 80,
  };
  const independentlyReported = {
    ...base,
    duplicateSources: ["Publishers Weekly"],
    relatedCoverage: [
      { sourceName: "Hacker News", url: base.url, title: base.title, titleFingerprint: base.titleFingerprint },
      { sourceName: "Publishers Weekly", url: "https://www.publishersweekly.com/pw/by-topic/digital/copyright/article/101300.html", title: "Unsealed briefs detail OpenAI and Microsoft book-training copyright claims", titleFingerprint: titleFingerprint("Unsealed briefs detail OpenAI and Microsoft book-training copyright claims") },
    ],
  };

  assert.ok(selectedRankingScore(independentlyReported) > selectedRankingScore(base));
});

test("selected ranking does not treat a same-headline repost at a different URL as independent reporting", () => {
  const sourceA = {
    id: "authors-guild",
    title: "Authors Guild v. OpenAI filing discusses pirated books in model training",
    summary: "A filing in the copyright lawsuit discusses books used to train AI models.",
    url: "https://authorsguild.org/news/ag-v-openai-training/",
    sourceName: "Authors Guild",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    publishedAt: new Date().toISOString(),
    score: 80,
  };
  const sourceB = {
    ...sourceA,
    id: "partner-news",
    title: "Authors Guild v OpenAI filing discusses pirated books in model training!",
    url: "https://partner.example/openai-training-case",
    sourceName: "Partner News",
    priorityTier: "community_fallback",
    score: 79,
  };
  const [reposted] = compactDuplicates([sourceA, sourceB]).items;
  const singleArticle = { ...reposted, duplicateSources: [], relatedCoverage: [] };

  assert.equal(reposted.relatedCoverage.length, 2);
  assert.equal(selectedRankingScore(reposted), selectedRankingScore(singleArticle));
});

test("templated selected reasons are not treated as authoritative editorial reasons", () => {
  const genericReason = "基于信源优先级、时效、主题相关性和可操作性综合判断入选。";

  assert.equal(explicitReasonFor({ reason: genericReason }), "");
  assert.equal(explicitReasonFor({ editorialJudgment: genericReason }), "");
});

test("normalizeItem preserves explicit editor judgment and uses neutral automatic fallback", () => {
  const editorReason = "编辑核验：原文公布了 API 迁移时间表，直接影响现有集成。";
  const explicit = normalizeItem({
    url: "https://example.com/editor-checked",
    title: "OpenAI API migration timeline",
    summary: "The release includes migration dates and compatibility details.",
    sourceName: "Verified Brief",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    editorialJudgment: editorReason,
  });
  const automatic = normalizeItem({
    url: "https://example.com/mirror",
    title: "OpenAI announces a new AI model",
    summary: "The official release describes model availability and API access.",
    sourceName: "Newsletter Mirror",
    sourceKind: "rss",
    priorityTier: "expert_rss",
  });

  assert.equal(explicit.reason, editorReason);
  assert.doesNotMatch(automatic.reason, /Newsletter Mirror(?:拆解|分析|发布|报道)/);
  assert.match(automatic.reason, /Newsletter Mirror|OpenAI announces/);
});

test("normalizeItem treats a validated raw reason as authoritative", () => {
  const sourceReason = "原文明确给出迁移截止日期和兼容范围，现有 API 集成团队需要据此安排升级。";
  const item = normalizeItem({
    url: "https://example.com/verified-source-reason",
    title: "OpenAI publishes an API migration deadline",
    summary: "The official release documents the migration deadline and compatibility details.",
    sourceName: "Verified Brief",
    sourceKind: "rss",
    priorityTier: "expert_rss",
    reason: sourceReason,
  });

  assert.equal(item.reason, sourceReason);
});
