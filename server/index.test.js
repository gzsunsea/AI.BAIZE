const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");

const {
  app,
  buildDailyArchive,
  buildDailyDigest,
  collectDailyDigestItemKeys,
  dailyIssueMeta,
  itemsResponse,
  publicItemDetail,
  selectCuratedItems,
} = require("./index");

test("items API keeps direct search scoped, ranks full matches, and echoes search metadata", () => {
  const item = (id, publishedAt, extra = {}) => ({
    id,
    url: `https://example.com/search-${id}`,
    title: "AI release",
    summary: "Product update",
    sourceName: "Official",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    score: 99,
    publishedAt,
    tags: ["产品更新"],
    ...extra,
  });
  const state = {
    clusters: [],
    settings: { rules: { selectedThreshold: 72 } },
    items: [
      item("newest-direct", "2026-08-17T09:00:00.000Z", { title: "Needle AI model release" }),
      item("older-direct", "2026-08-16T09:00:00.000Z", { title: "Needle AI model archive" }),
      item("full-top", "2026-08-15T09:00:00.000Z", { title: "Needle AI model details", editorialBrief: { fact: "needle" } }),
      item("full-content", "2026-08-14T09:00:00.000Z", { title: "AI model release", content: "needle appears only in full text" }),
    ],
  };

  const direct = itemsResponse({ mode: "all", q: "needle" }, state);
  assert.deepEqual(direct.items.map((entry) => entry.id), ["newest-direct", "older-direct", "full-top"]);
  assert.deepEqual(direct.search, { query: "needle", mode: "direct", sort: "published_desc" });

  const full = itemsResponse({ mode: "all", q: "needle", searchMode: "full" }, state);
  assert.deepEqual(full.items.map((entry) => entry.id), ["full-top", "newest-direct", "older-direct", "full-content"]);
  assert.deepEqual(full.search, { query: "needle", mode: "full", sort: "relevance" });
});

test("items API applies copied category and sort state and durable item details stay allowlisted", () => {
  const state = {
    clusters: [],
    settings: { rules: { selectedThreshold: 72 } },
    items: [
      { ...story("culture-new", "Needle culture AI", 50), category: "culture", publishedAt: "2026-08-18T00:00:00.000Z", sourceName: "Culture" },
      { ...story("culture-ranked", "Needle culture model", 90), category: "culture", publishedAt: "2026-08-17T00:00:00.000Z", editorialBrief: { fact: "needle" }, sourceName: "Culture", hidden: false, raw: { secret: true } },
      { ...story("education", "Needle education AI", 99), category: "education", publishedAt: "2026-08-19T00:00:00.000Z" },
    ],
  };
  const result = itemsResponse({ mode: "all", q: "needle", searchMode: "full", category: "culture", sort: "relevance" }, state);
  assert.deepEqual(result.items.map((item) => item.id), ["culture-ranked", "culture-new"]);
  const detail = publicItemDetail(state, "culture-ranked");
  assert.equal(detail.item.id, "culture-ranked");
  assert.equal(Object.hasOwn(detail.item, "raw"), false);
  assert.equal(publicItemDetail(state, "missing"), null);
});

test("public item detail derives related metadata only from public cluster members", () => {
  const state = {
    items: [
      {
        ...story("public", "Public item", 80),
        sourceId: "public-source",
        sourceName: "Public Source",
      },
      {
        ...story("hidden", "Hidden item", 100),
        sourceId: "hidden-source",
        sourceName: "Hidden Secret Source",
        hidden: true,
      },
    ],
    clusters: [{
      id: "mixed-cluster",
      items: ["public", "hidden"],
      size: 2,
      sources: ["Public Source", "Hidden Secret Source"],
      topScore: 100,
    }],
  };

  const detail = publicItemDetail(state, "public");

  assert.deepEqual(detail.item.related, {
    count: 1,
    sources: ["Public Source"],
    topScore: 80,
  });
});

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

test("curated feed excludes unpinned reference items but preserves pinned exceptions", () => {
  const selected = selectCuratedItems([
    story("official-primary", "Official AI platform release", 88),
    {
      ...story("reference-unpinned", "Reference bridge copy of the same release", 96),
      sourceName: "AIHOT 公开页",
      sourceKind: "aihot",
      priorityTier: "reference",
    },
    {
      ...story("reference-pinned", "Pinned analyst note", 84),
      sourceName: "AIHOT 公开页",
      sourceKind: "aihot",
      priorityTier: "reference",
      pinned: true,
    },
  ], {
    selectedFeedLimit: 20,
    selectedPreferredShare: 0.6,
  });

  assert.deepEqual(selected.map((item) => item.id), ["reference-pinned", "official-primary"]);
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

test("curated feed keeps reference-tier X status URLs out until they are explicitly promoted", () => {
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

  assert.equal(selected.filter((item) => /https:\/\/x\.com\/.+\/status\//.test(item.url)).length, 0);
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
  const assertPublicItem = (item) => {
    for (const field of ["hidden", "pinned", "priorityTier", "sourceId", "mpMeta", "raw", "canonicalUrl", "updatedAt"]) {
      assert.equal(Object.hasOwn(item, field), false, `public item leaked ${field}`);
    }
  };
  for (const topic of hot.items) {
    assertPublicItem(topic.representative);
    topic.relatedItems.forEach(assertPublicItem);
  }

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
    assertPublicItem(story.event.representative);
    story.latestUpdates.forEach(assertPublicItem);
    story.timeline.forEach(assertPublicItem);
  }

  hotList.items.forEach((topic) => {
    assertPublicItem(topic.representative);
    topic.relatedItems.forEach(assertPublicItem);
  });

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

test("public hot and story APIs exclude hidden and non-public cluster evidence", async (t) => {
  const publishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const item = (id, eventId, sourceId, score, extra = {}) => ({
    id,
    eventId,
    sourceId,
    sourceName: sourceId,
    title: `${eventId} ${id}`,
    summary: `${eventId} summary`,
    url: `https://example.com/${id}`,
    score,
    publishedAt,
    priorityTier: "official_first_party",
    ...extra,
  });
  const state = {
    settings: { rules: { selectedThreshold: 70 } },
    items: [
      item("public-1", "event-public", "public-one", 90),
      item("public-2", "event-public", "public-two", 89),
      item("hidden-representative", "event-public", "private", 100, { hidden: true }),
      item("invalid-representative", "event-public", "invalid", 99, { url: "javascript:alert(1)" }),
      item("hidden-single-public", "event-hidden", "only-public", 90),
      item("hidden-second-source", "event-hidden", "private-second", 99, { hidden: true }),
      item("invalid-single-public", "event-invalid", "only-public", 90),
      item("invalid-second-source", "event-invalid", "invalid-second", 99, { url: "/relative" }),
    ],
    clusters: [
      { id: "event-public", items: ["hidden-representative", "invalid-representative", "public-1", "public-2"] },
      { id: "event-hidden", items: ["hidden-single-public", "hidden-second-source"] },
      { id: "event-invalid", items: ["invalid-single-public", "invalid-second-source"] },
    ],
  };
  const previousReadState = app.locals.readState;
  app.locals.readState = () => state;
  t.after(() => { app.locals.readState = previousReadState; });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const hotResponse = await fetch(`${base}/api/public/hot`);
  assert.equal(hotResponse.status, 200);
  const hot = await hotResponse.json();
  assert.deepEqual(hot.items.map((topic) => topic.id), ["event-public"]);
  assert.equal(hot.items[0].representative.id, "public-1");
  assert.deepEqual(hot.items[0].relatedItems.map((entry) => entry.id), ["public-1", "public-2"]);
  assert.deepEqual(hot.items[0].sources, ["public-one", "public-two"]);

  const storyResponse = await fetch(`${base}/api/public/stories/event-public`);
  assert.equal(storyResponse.status, 200);
  const storyBody = await storyResponse.json();
  assert.deepEqual(storyBody.timeline.map((entry) => entry.id), ["public-1", "public-2"]);
  assert.equal((await fetch(`${base}/api/public/stories/event-hidden`)).status, 404);
  assert.equal((await fetch(`${base}/api/public/stories/event-invalid`)).status, 404);
});
