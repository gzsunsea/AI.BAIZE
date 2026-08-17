const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");

const {
  app,
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

  assert.equal(selected.length, 25);
  assert.equal(dominantCount, 5);
  assert.equal(preferredCount, 20);
});

test("curated feed excludes items without original http links", () => {
  const selected = selectCuratedItems([
    {
      ...story("internal-detail", "AIHOT mirrored item without original link"),
      url: "/items/internal-detail",
      score: 99,
      priorityTier: "reference",
      sourceKind: "aihot",
    },
    story("external-original", "OpenAI external original link", 88),
  ], {
    selectedFeedLimit: 20,
    selectedPreferredShare: 0.6,
  });

  assert.deepEqual(selected.map((item) => item.id), ["external-original"]);
});

test("curated feed reserves slots for preferred X signals", () => {
  const official = Array.from({ length: 24 }, (_, index) => ({
    ...story(`official-x-quota-${index}`, `Official AI model release ${index}`, 99 - (index % 3)),
    sourceId: `official-x-quota-${index}`,
    sourceName: `Official ${index}`,
    priorityTier: "official_first_party",
  }));
  const cnMedia = Array.from({ length: 24 }, (_, index) => ({
    ...story(`cn-x-quota-${index}`, `Chinese AI model update ${index}`, 96 - (index % 3)),
    sourceId: `cn-x-quota-${index}`,
    sourceName: `CN Media ${index}`,
    priorityTier: "cn_media",
  }));
  const xSignals = Array.from({ length: 8 }, (_, index) => ({
    ...story(`x-signal-${index}`, `X expert AI agent signal ${index}`, 82 - (index % 2)),
    sourceId: "x-ai-leaders",
    sourceName: `X · @expert${index}`,
    sourceKind: "x",
    priorityTier: "preferred_x",
  }));

  const selected = selectCuratedItems([...official, ...cnMedia, ...xSignals], {
    selectedFeedLimit: 20,
    selectedSourceShare: 0.5,
    selectedPreferredShare: 0.6,
    selectedXShare: 0.25,
    selectedCnMediaLimit: 20,
  });

  assert.equal(selected.filter((item) => item.priorityTier === "preferred_x").length, 5);
  assert.equal(selected.slice(0, 8).filter((item) => item.priorityTier === "preferred_x").length, 2);
});

test("curated feed treats X status URLs as X signals after dedupe metadata merges", () => {
  const official = Array.from({ length: 24 }, (_, index) => ({
    ...story(`official-x-url-${index}`, `Official AI model release ${index}`, 99 - (index % 3)),
    sourceId: `official-x-url-${index}`,
    sourceName: `Official ${index}`,
    priorityTier: "official_first_party",
  }));
  const reference = Array.from({ length: 16 }, (_, index) => ({
    ...story(`reference-x-url-${index}`, `Reference AI product signal ${index}`, 96 - (index % 3)),
    sourceId: `reference-x-url-${index}`,
    sourceName: `Reference ${index}`,
    priorityTier: "reference",
  }));
  const xSignals = Array.from({ length: 6 }, (_, index) => ({
    ...story(`x-url-signal-${index}`, `X expert AI agent signal ${index}`, 85),
    url: `https://x.com/expert${index}/status/${1000 + index}`,
    sourceId: "aihot-public",
    sourceName: `Expert ${index}`,
    sourceKind: "aihot",
    priorityTier: "reference",
  }));

  const selected = selectCuratedItems([...official, ...reference, ...xSignals], {
    selectedFeedLimit: 20,
    selectedSourceShare: 0.5,
    selectedPreferredShare: 0.6,
    selectedXShare: 0.25,
  });

  assert.equal(selected.filter((item) => /https:\/\/x\.com\/.+\/status\//.test(item.url)).length, 5);
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

test("public experience endpoints expose hot topics, reports, and structured validation", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const hotResponse = await fetch(`${base}/api/public/hot-topics`);
  assert.equal(hotResponse.status, 200);
  const hot = await hotResponse.json();
  assert.equal(Array.isArray(hot.items), true);
  assert.equal(typeof hot.generatedAt, "string");

  const hotListResponse = await fetch(`${base}/api/public/hot`);
  assert.equal(hotListResponse.status, 200);
  const hotList = await hotListResponse.json();
  assert.equal(hotList.windowHours, 72);
  assert.equal(Array.isArray(hotList.items), true);

  if (hotList.items.length) {
    const storyResponse = await fetch(`${base}/api/public/stories/${encodeURIComponent(hotList.items[0].id)}`);
    assert.equal(storyResponse.status, 200);
    const story = await storyResponse.json();
    assert.equal(Array.isArray(story.timeline), true);
  }

  const missingStory = await fetch(`${base}/api/public/stories/missing-story-id`);
  assert.equal(missingStory.status, 404);
  assert.deepEqual(await missingStory.json(), { error: "story not found" });

  const reportResponse = await fetch(`${base}/api/public/reports?period=weekly&date=2026-07-22`);
  assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json();
  assert.equal(report.period, "weekly");
  assert.deepEqual(report.range, { start: "2026-07-20", end: "2026-07-26" });

  const invalidResponse = await fetch(`${base}/api/public/reports?period=yearly&date=2026-07-22`);
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), { error: "invalid period" });
});
