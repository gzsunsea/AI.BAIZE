const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDailyArchive,
  buildDailyDigest,
  collectDailyDigestItemKeys,
  dailyIssueMeta,
  selectCuratedItems,
} = require("./index");

function story(id, title, score = 99) {
  return {
    id,
    url: `https://example.com/${id}`,
    title,
    summary: `${title} is a significant AI product and model update for developers.`,
    score,
    publishedAt: "2026-06-17T04:00:00.000Z",
    tags: ["产品更新", "模型发布"],
    sourceKind: "rss",
    priorityTier: "official_first_party",
  };
}

test("daily digest excludes items already covered earlier on the same Shanghai day", () => {
  const covered = [
    story("openai-agent", "OpenAI launches new AI agent"),
    story("claude-model", "Anthropic Claude model update", 98),
  ];
  const fresh = story("gemini-edu", "Gemini AI education tooling", 97);
  const state = {
    sources: [{ enabled: true }, { enabled: true }],
    items: [...covered, fresh],
  };
  const earlierDigest = {
    generatedAt: "2026-06-17T05:00:00.000Z",
    items: covered.slice(0, 1),
    sections: [{ key: "product", title: "产品发布/更新", items: covered }],
  };

  const excludeKeys = collectDailyDigestItemKeys([earlierDigest], "2026-06-17T08:30:00.000Z");
  const next = buildDailyDigest(state, {}, {
    since: Date.parse("2026-06-16T00:00:00.000Z"),
    generatedAt: "2026-06-17T08:30:00.000Z",
    excludeKeys,
  });
  const nextIds = next.sections.flatMap((section) => section.items.map((item) => item.id));

  assert.deepEqual(nextIds, ["gemini-edu"]);
  assert.equal(next.excludedFromEarlierToday, 2);
});

test("daily digest does not exclude prior-day archive items", () => {
  const item = story("openai-agent", "OpenAI launches new AI agent");
  const excludeKeys = collectDailyDigestItemKeys(
    [{ generatedAt: "2026-06-16T05:00:00.000Z", items: [item], sections: [] }],
    "2026-06-17T08:30:00.000Z",
  );

  assert.equal(excludeKeys.size, 0);
});

test("curated feed limits a single source and prioritizes preferred sources", () => {
  const dominant = Array.from({ length: 30 }, (_, index) => ({
    ...story(`media-${index}`, `AI model update from media ${index}`, 99 - (index % 4)),
    sourceId: "dominant-media",
    sourceName: "Dominant Media",
    priorityTier: "cn_media",
  }));
  const preferred = Array.from({ length: 20 }, (_, index) => ({
    ...story(`official-${index}`, `Official AI model release ${index}`, 88 - (index % 4)),
    sourceId: `official-${index % 4}`,
    sourceName: `Official ${index % 4}`,
    priorityTier: index % 2 ? "official_first_party" : "expert_rss",
  }));

  const selected = selectCuratedItems([...dominant, ...preferred], {
    selectedFeedLimit: 30,
    selectedSourceShare: 0.2,
    selectedPreferredShare: 0.6,
    selectedCnMediaLimit: 12,
  });
  const dominantCount = selected.filter((item) => item.sourceId === "dominant-media").length;
  const preferredCount = selected.filter((item) => ["official_first_party", "expert_rss"].includes(item.priorityTier)).length;

  assert.equal(selected.length, 26);
  assert.equal(dominantCount, 6);
  assert.equal(preferredCount, 20);
});

test("daily issue metadata distinguishes same-day midday and evening updates", () => {
  assert.deepEqual(dailyIssueMeta("2026-06-22T05:00:00.000Z"), {
    issueKey: "2026-06-22T13:00",
    issueLabel: "午间更新",
    issueTime: "13:00",
  });
  assert.deepEqual(dailyIssueMeta("2026-06-22T08:30:00.000Z"), {
    issueKey: "2026-06-22T16:30",
    issueLabel: "晚间更新",
    issueTime: "16:30",
  });
});

test("daily archive preserves multiple issues from the same Shanghai day", () => {
  const midday = buildDailyDigest(
    { sources: [{ enabled: true }], items: [story("midday", "OpenAI midday AI model release")] },
    {},
    { generatedAt: "2026-06-22T05:00:00.000Z" },
  );
  const evening = buildDailyDigest(
    { sources: [{ enabled: true }], items: [story("evening", "Anthropic evening AI agent release")] },
    {},
    { generatedAt: "2026-06-22T08:30:00.000Z" },
  );
  const archive = buildDailyArchive(
    { sources: [{ enabled: true }], items: [], dailyDigests: [midday, evening] },
    2,
    "2026-06-22T10:00:00.000Z",
  );

  assert.deepEqual(archive.map((item) => item.issueTime), ["16:30", "13:00"]);
  assert.equal(new Set(archive.map((item) => item.id)).size, 2);
});
