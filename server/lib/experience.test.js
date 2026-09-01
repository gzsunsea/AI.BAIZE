const assert = require("node:assert/strict");
const test = require("node:test");

const { buildEventLifecycle, buildHotTopics, buildReport, buildStory, buildTodaySignals } = require("./experience");

function signal(id, eventId, sourceId, score = 90, extra = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    eventId,
    sourceId,
    sourceName: sourceId,
    title: `${eventId} ${id}`,
    score,
    publishedAt: "2026-07-22T03:00:00.000Z",
    ...extra,
  };
}

test("today signals return at most five recent curated representative events", () => {
  const now = new Date();
  const result = buildTodaySignals({
    items: [
      signal("official", "event-a", "official", 90, { priorityTier: "official_first_party", title: "Official AI model release", summary: "Official AI model and API release for creators.", publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() }),
      signal("expert", "event-a", "expert", 85, { priorityTier: "expert_rss", title: "Expert AI workflow analysis", summary: "Expert analysis of the AI model workflow and deployment.", publishedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString() }),
      signal("reference", "event-b", "reference", 99, { priorityTier: "reference", title: "Reference AI model copy", summary: "Reference copy of an AI model announcement.", publishedAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString() }),
      signal("single", "event-c", "single", 88, { priorityTier: "expert_rss", title: "Single-source AI creator tool analysis", summary: "Expert analysis of an AI creator tool.", publishedAt: new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString() }),
    ],
    clusters: [
      { id: "event-a", items: ["official", "expert"] },
      { id: "event-b", items: ["reference"] },
    ],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now, limit: 5 });

  assert.deepEqual(result.items.map((item) => item.id), ["event-a", "event-c"]);
  assert.equal(result.items[0].sourceCount, 2);
  assert.equal(result.items[0].evidenceMeta.evidenceLevel, "multi_source");
  assert.equal(result.issueLabel, "今日先看");
  assert.match(result.summary, /2 条/);
  assert.match(result.selectionNote, /信源质量/);
});

test("today issue metadata reports an honest empty state", () => {
  const result = buildTodaySignals({ items: [], clusters: [], settings: { rules: { selectedThreshold: 72 } } }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });
  assert.equal(result.issueLabel, "今日暂无可用信号");
  assert.match(result.summary, /没有达到精选门槛/);
  assert.match(result.selectionNote, /不降级/);
});

test("today signals do not pad an insufficient candidate pool or repeat an event", () => {
  const result = buildTodaySignals({
    items: [
      signal("only", "event-only", "expert", 84, {
        priorityTier: "expert_rss",
        title: "Single-source AI workflow analysis",
        summary: "Expert analysis of an AI workflow.",
        publishedAt: "2026-08-28T02:00:00.000Z",
      }),
      signal("old", "event-old", "official", 99, {
        priorityTier: "official_first_party",
        title: "Old AI model release",
        summary: "An old official AI model release.",
        publishedAt: "2026-08-25T02:00:00.000Z",
      }),
    ],
    clusters: [],
    settings: { rules: { selectedThreshold: 72 } },
  }, { now: "2026-08-28T04:00:00.000Z", limit: 5 });
  assert.ok(result.items.length <= 1);
  assert.equal(new Set(result.items.map((item) => item.id)).size, result.items.length);
});

test("public hot topics and stories exclude hidden and non-public cluster members", () => {
  const publicOne = signal("public-1", "event-a", "public-one", 80);
  const publicTwo = signal("public-2", "event-a", "public-two", 79);
  const hiddenRepresentative = signal("hidden", "event-a", "private-source", 100, { hidden: true });
  const invalidRepresentative = signal("invalid", "event-a", "invalid-source", 99, { url: "javascript:alert(1)" });
  const hiddenOnlySecondSource = signal("single-hidden", "event-hidden", "private-second", 98, { hidden: true });
  const invalidOnlySecondSource = signal("single-invalid", "event-invalid", "invalid-second", 98, { url: "/relative" });
  const state = {
    items: [
      publicOne,
      publicTwo,
      hiddenRepresentative,
      invalidRepresentative,
      signal("single-public-hidden", "event-hidden", "only-public", 90),
      hiddenOnlySecondSource,
      signal("single-public-invalid", "event-invalid", "only-public", 90),
      invalidOnlySecondSource,
    ],
    clusters: [
      { id: "event-a", items: ["hidden", "invalid", "public-1", "public-2"] },
      { id: "event-hidden", items: ["single-public-hidden", "single-hidden"] },
      { id: "event-invalid", items: ["single-public-invalid", "single-invalid"] },
    ],
  };

  const hot = buildHotTopics(state, { now: "2026-07-22T04:00:00.000Z" });
  assert.deepEqual(hot.items.map((topic) => topic.id), ["event-a"]);
  assert.equal(hot.items[0].representative.id, "public-1");
  assert.deepEqual(hot.items[0].relatedItems.map((item) => item.id), ["public-1", "public-2"]);
  assert.deepEqual(hot.items[0].sources, ["public-one", "public-two"]);

  const story = buildStory(state, "event-a", { now: "2026-07-22T04:00:00.000Z" });
  assert.deepEqual(story.timeline.map((item) => item.id), ["public-1", "public-2"]);
  assert.equal(buildStory(state, "event-hidden", { now: "2026-07-22T04:00:00.000Z" }), null);
  assert.equal(buildStory(state, "event-invalid", { now: "2026-07-22T04:00:00.000Z" }), null);
});

test("public hot ranking and derived fields use only filtered public members", () => {
  const hidden = signal("private-leader", "event-a", "private", 100, { hidden: true });
  const state = {
    items: [
      hidden,
      signal("a1", "event-a", "public-a1", 80),
      signal("a2", "event-a", "public-a2", 79),
      signal("b1", "event-b", "public-b1", 90),
      signal("b2", "event-b", "public-b2", 89),
    ],
    clusters: [
      { id: "event-a", title: hidden.title, topScore: 100, items: ["private-leader", "a1", "a2"] },
      { id: "event-b", title: "Precomputed Event B", topScore: 90, items: ["b1", "b2"] },
    ],
  };

  const hot = buildHotTopics(state, { now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(hot.items.map((topic) => topic.id), ["event-b", "event-a"]);
  const eventA = hot.items.find((topic) => topic.id === "event-a");
  assert.equal(eventA.title, "event-a a1");
  assert.equal(eventA.topScore, 80);
  assert.equal(eventA.summary, "event-a a1");
});

test("hot topics expose rank, heat, status, and a transparent rules version", () => {
  const result = buildHotTopics({
    items: [
      signal("a1", "event-a", "openai", 91, { publishedAt: "2026-08-17T03:00:00.000Z" }),
      signal("a2", "event-a", "simon", 88, { publishedAt: "2026-08-17T02:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["a1", "a2"] }],
  }, { now: "2026-08-17T04:00:00.000Z" });

  assert.equal(result.windowHours, 72);
  assert.equal(result.rules.version, 1);
  assert.deepEqual(Object.keys(result.rules.components), ["sourceQualityScore", "sourceCountBonus", "freshnessBonus", "selectedScoreBonus"]);
  assert.equal(result.rules.tierWeights.official_first_party, 12);
  assert.equal(result.items[0].rank, 1);
  assert.equal(typeof result.items[0].heat, "number");
  assert.equal(["new", "rising", "active"].includes(result.items[0].status), true);
});

test("hot topics expose display source names, latest activity, and representative summary", () => {
  const result = buildHotTopics({
    items: [
      signal("a1", "event-a", "source-id-one", 91, { sourceName: "Official One", summary: "Representative summary", publishedAt: "2026-08-17T01:00:00.000Z" }),
      signal("a2", "event-a", "source-id-two", 88, { sourceName: "Expert Two", publishedAt: "2026-08-17T03:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["a1", "a2"] }],
  }, { now: "2026-08-17T04:00:00.000Z" });

  assert.deepEqual(result.items[0].sources, ["Official One", "Expert Two"]);
  assert.equal(result.items[0].latestAt, "2026-08-17T03:00:00.000Z");
  assert.equal(typeof result.items[0].representative.summary, "string");
});

test("hot topics use persisted cluster sources after dedupe", () => {
  const item = signal("representative", "event-deduped", "OpenAI News", 90, {
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "event-deduped", items: [item.id], sources: ["OpenAI News", "Simon Willison"], duplicateCount: 4 }],
  }, { now: "2026-08-31T04:00:00.000Z" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceCount, 2);
  assert.deepEqual(result.items[0].sources, ["OpenAI News", "Simon Willison"]);
  assert.equal(result.candidates.length, 0);
});

test("hot topics expose selected single-source candidates without calling them confirmed", () => {
  const item = signal("candidate", "event-candidate", "OpenAI News", 90, {
    title: "Official AI model release",
    summary: "Official AI model and API release for creators.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [item], clusters: [], settings: { rules: { selectedThreshold: 72 } } }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 72,
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "emerging");
  assert.equal(result.candidates[0].availability, "candidate");
  assert.equal(result.candidates[0].evidenceMeta.evidenceLevel, "single_source");
});

test("hot candidates cap one source, exclude reference and low-quality content, and avoid duplicates", () => {
  const good = Array.from({ length: 4 }, (_, index) => signal(`good-${index}`, `event-good-${index}`, "OpenAI News", 92 - index, {
    title: `Official AI model release ${index}`,
    summary: "Official AI model and API release for creators.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  }));
  const secondSource = signal("good-other", "event-good-other", "Simon Willison", 80, {
    title: "Expert AI workflow analysis",
    summary: "Expert analysis of the AI model workflow and deployment.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "expert_rss",
  });
  const reference = signal("reference", "event-reference", "AIHOT", 99, {
    title: "Reference AI model copy",
    summary: "Reference copy of an AI model announcement.",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "reference",
  });
  const weak = signal("weak", "event-weak", "OpenAI News", 99, {
    title: "手机发布会价格与外观点评",
    summary: "手机产品价格与外观的行业点评。",
    publishedAt: "2026-08-31T02:00:00.000Z",
    priorityTier: "official_first_party",
  });
  const result = buildHotTopics({ items: [...good, secondSource, reference, weak], clusters: [] }, {
    now: "2026-08-31T04:00:00.000Z",
    selectedThreshold: 72,
  });
  assert.ok(result.candidates.length <= 5);
  assert.ok(result.candidates.filter((item) => item.sourceName === "OpenAI News").length <= 2);
  assert.equal(result.candidates.some((item) => item.id === "reference"), false);
  assert.equal(result.candidates.some((item) => item.id === "weak"), false);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, result.candidates.length);
});

test("story detail returns newest updates first and null for unknown ids", () => {
  const state = {
    items: [
      signal("old", "event-a", "one", 80, { publishedAt: "2026-08-16T01:00:00.000Z" }),
      signal("new", "event-a", "two", 85, { publishedAt: "2026-08-17T01:00:00.000Z" }),
    ],
    clusters: [{ id: "event-a", title: "Event A", items: ["old", "new"] }],
  };
  const story = buildStory(state, "event-a", { now: "2026-08-17T04:00:00.000Z", enrichItem: (item) => item });
  assert.deepEqual(story.timeline.map((item) => item.id), ["new", "old"]);
  assert.equal(story.latestUpdates[0].id, "new");
  assert.equal(buildStory(state, "missing", {}), null);
});

test("story lifecycle distinguishes emerging, confirmed, developing, and stale events", () => {
  const now = new Date("2026-08-31T04:00:00.000Z");
  const makeLifecycle = (items) => buildEventLifecycle(items, now);

  const emerging = makeLifecycle([signal("new", "event", "one", 90, { publishedAt: "2026-08-31T02:00:00.000Z" })]);
  assert.equal(emerging.state, "emerging");
  assert.equal(emerging.label, "刚出现");

  const confirmed = makeLifecycle([
    signal("one", "event", "one", 90, { publishedAt: "2026-08-30T02:00:00.000Z" }),
    signal("two", "event", "two", 88, { publishedAt: "2026-08-31T01:00:00.000Z" }),
  ]);
  assert.equal(confirmed.state, "confirmed");
  assert.equal(confirmed.firstSeenAt, "2026-08-30T02:00:00.000Z");
  assert.equal(confirmed.lastUpdatedAt, "2026-08-31T01:00:00.000Z");

  const developing = makeLifecycle([signal("developing", "event", "one", 90, { publishedAt: "2026-08-30T02:00:00.000Z" })]);
  assert.equal(developing.state, "developing");

  const stale = makeLifecycle([signal("stale", "event", "one", 90, { publishedAt: "2026-08-27T02:00:00.000Z" })]);
  assert.equal(stale.state, "stale");
  assert.match(stale.nextCheck, /不继续扩散/);

  const story = buildStory({ items: [
    signal("one", "event", "one", 90, { publishedAt: "2026-08-31T02:00:00.000Z" }),
    signal("two", "event", "two", 88, { publishedAt: "2026-08-31T01:00:00.000Z" }),
  ], clusters: [{ id: "event", items: ["one", "two"] }] }, "event", { now, enrichItem: (item) => item });
  assert.equal(story.event.lifecycle.state, "confirmed");
});

test("reports expose trend lines with evidence strength and watch items", () => {
  const report = buildReport({
    dailyDigests: [{
      generatedAt: "2026-08-30T04:00:00.000Z",
      sections: [{
        key: "model",
        title: "模型发布/更新",
        items: [
          signal("one", "event-one", "official", 90, { tags: ["Agent", "模型"], priorityTier: "official_first_party", publishedAt: "2026-08-30T03:00:00.000Z" }),
          signal("two", "event-two", "expert", 86, { tags: ["Agent"], priorityTier: "expert_rss", publishedAt: "2026-08-30T02:00:00.000Z" }),
          signal("three", "event-three", "one", 80, { tags: ["研究"], priorityTier: "community_fallback", publishedAt: "2026-08-29T02:00:00.000Z" }),
        ],
      }],
    }],
  }, { period: "weekly", date: "2026-08-30", now: "2026-08-31T04:00:00.000Z" });

  assert.match(report.editorialSummary, /本周/);
  assert.equal(report.trendLines[0].label, "Agent");
  assert.equal(report.trendLines[0].count, 2);
  assert.equal(report.trendLines[0].eventCount, 2);
  assert.equal(typeof report.trendLines[0].evidenceLevel, "string");
  assert.ok(Array.isArray(report.trendLines[0].sampleItems));
  assert.equal(report.watchItems.length, 1);
  assert.equal(report.watchItems[0].id, "three");
});

test("reports exclude reference-only material from public editorial sections and trends", () => {
  const report = buildReport({
    dailyDigests: [{
      generatedAt: "2026-08-30T04:00:00.000Z",
      sections: [{
        key: "model",
        title: "模型",
        items: [
          signal("official", "event-official", "official", 90, { priorityTier: "official_first_party", tags: ["Agent"] }),
          signal("reference", "event-reference", "reference", 99, { priorityTier: "reference", tags: ["Agent"] }),
        ],
      }],
    }],
  }, { period: "weekly", date: "2026-08-30", now: "2026-08-31T04:00:00.000Z" });
  assert.deepEqual(report.sections.flatMap((section) => section.items).map((item) => item.id), ["official"]);
  assert.deepEqual(report.trendLines[0].sampleItems.map((item) => item.id), ["official"]);
});

test("hot topics require independent sources and order by evidence before score", () => {
  const items = [
    signal("a1", "event-a", "openai", 91),
    signal("a2", "event-a", "simon", 88),
    signal("c1", "event-c", "source-1", 80),
    signal("c2", "event-c", "source-2", 80),
    signal("c3", "event-c", "source-3", 80),
    signal("b1", "event-b", "media", 99),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "event-a", title: "Event A", items: ["a1", "a2"], topScore: 91 },
      { id: "event-b", title: "Event B", items: ["b1"], topScore: 99 },
      { id: "event-c", title: "Event C", items: ["c1", "c2", "c3"], topScore: 80 },
    ],
  }, {
    now: "2026-07-22T04:00:00.000Z",
    selectedThreshold: 80,
    enrichItem: (item) => ({ ...item, enriched: true }),
  });

  assert.deepEqual(result.items.map((item) => item.id), ["event-c", "event-a"]);
  assert.equal(result.items[1].sourceCount, 2);
  assert.equal(result.items[1].representative.id, "a1");
  assert.equal(result.items[1].representative.enriched, true);
});

test("a pinned single-source item appears as an emerging candidate", () => {
  const item = signal("p1", "pinned", "official", 80, { pinned: true });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "pinned", title: "Pinned", items: [item], topScore: 80 }],
  }, {
    now: "2026-07-22T04:00:00.000Z",
    selectedThreshold: 80,
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, "p1");
  assert.equal(result.candidates[0].availability, "candidate");
});

test("hot topics discard stale items and count duplicate source ids once", () => {
  const items = [
    signal("fresh-1", "fresh", "same", 95),
    signal("fresh-2", "fresh", "same", 94),
    signal("stale-1", "stale", "one", 99, { publishedAt: "2026-07-18T00:00:00.000Z" }),
    signal("stale-2", "stale", "two", 98, { publishedAt: "2026-07-18T00:00:00.000Z" }),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "fresh", items: ["fresh-1", "fresh-2"] },
      { id: "stale", items: ["stale-1", "stale-2"] },
    ],
  }, { now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(result.items, []);
});

test("hot topics return at most five eligible clusters", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 7; index += 1) {
    const first = signal(`${index}-1`, `event-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `event-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `event-${index}`, items: [first.id, second.id] });
  }

  const result = buildHotTopics({ items, clusters }, { now: "2026-07-22T04:00:00.000Z", limit: 5 });

  assert.equal(result.items.length, 5);
  assert.deepEqual(result.items.map((item) => item.id), ["event-0", "event-1", "event-2", "event-3", "event-4"]);
});

test("hot topics default to ten eligible clusters", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 12; index += 1) {
    const first = signal(`${index}-1`, `default-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `default-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `default-${index}`, items: [first.id, second.id] });
  }

  const result = buildHotTopics({ items, clusters }, { now: "2026-07-22T04:00:00.000Z" });

  assert.equal(result.items.length, 10);
});

test("story lookup bypasses the hot-list limit", () => {
  const items = [];
  const clusters = [];
  for (let index = 0; index < 11; index += 1) {
    const first = signal(`${index}-1`, `story-${index}`, `${index}-source-1`, 90 - index);
    const second = signal(`${index}-2`, `story-${index}`, `${index}-source-2`, 89 - index);
    items.push(first, second);
    clusters.push({ id: `story-${index}`, items: [first.id, second.id] });
  }

  const story = buildStory({ items, clusters }, "story-10", {
    now: "2026-07-22T04:00:00.000Z",
    enrichItem: (item) => item,
  });

  assert.equal(story.event.id, "story-10");
});

test("story event omits related items and caps latest updates at three", () => {
  const items = Array.from({ length: 4 }, (_, index) => signal(
    `update-${index}`,
    "updates",
    `source-${index}`,
    90 - index,
    { publishedAt: `2026-07-22T0${index}:00:00.000Z` },
  ));
  const story = buildStory({ items, clusters: [{ id: "updates", items: items.map((item) => item.id) }] }, "updates", {
    now: "2026-07-22T04:00:00.000Z",
    enrichItem: (item) => item,
  });

  assert.equal(Object.hasOwn(story.event, "relatedItems"), false);
  assert.equal(story.latestUpdates.length, 3);
  assert.equal(story.timeline.length, 4);
});

test("recognized priority tiers and fallback source tiers affect heat", () => {
  const items = [
    signal("fallback", "fallback", "fallback-source", 80, {
      pinned: true,
      sourceTier: "community",
      priorityTier: "unknown-tier",
    }),
    signal("fallback-second", "fallback", "fallback-second-source", 79, {
      sourceTier: "community",
      priorityTier: "unknown-tier",
    }),
    signal("official", "official", "official-source", 80, {
      pinned: true,
      priorityTier: "official_first_party",
    }),
    signal("official-second", "official", "official-second-source", 79, {
      priorityTier: "official_first_party",
    }),
  ];
  const result = buildHotTopics({
    items,
    clusters: [
      { id: "fallback", items: ["fallback", "fallback-second"] },
      { id: "official", items: ["official", "official-second"] },
    ],
  }, { now: "2026-07-22T04:00:00.000Z", selectedThreshold: 80 });

  const byId = new Map(result.items.map((item) => [item.id, item.heat]));
  assert.ok(byId.get("official") > byId.get("fallback"));
});

function digest(generatedAt, items, key = "product", title = "产品") {
  return { generatedAt, sections: [{ key, title, items }] };
}

test("weekly reports dedupe events and disclose incomplete coverage", () => {
  const shared = { id: "same", eventId: "launch", title: "Launch", score: 90, tags: ["Agent"] };
  const state = {
    dailyDigests: [
      digest("2026-07-20T04:00:00.000Z", [shared]),
      digest("2026-07-21T04:00:00.000Z", [{ ...shared, id: "same-2", score: 92 }]),
    ],
  };

  const report = buildReport(state, { period: "weekly", date: "2026-07-22", now: "2026-07-22T04:00:00.000Z" });

  assert.equal(report.storyCount, 1);
  assert.equal(report.sections[0].items[0].id, "same-2");
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.days, 2);
  assert.equal(report.coverage.requiredDays, 7);
  assert.equal(report.estimatedReadingMinutes, 1);
  assert.deepEqual(report.range, { start: "2026-07-20", end: "2026-07-26" });
});

test("reports keep only the latest digest from each Shanghai date", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-20T02:00:00.000Z", [{ id: "morning", title: "Morning", score: 80 }]),
      digest("2026-07-20T09:00:00.000Z", [{ id: "evening", title: "Evening", score: 90 }]),
    ],
  }, { period: "daily", date: "2026-07-20", now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(report.sections[0].items.map((item) => item.id), ["evening"]);
  assert.equal(report.coverage.complete, true);
});

test("weekly reports use Monday through Sunday and stable editorial section order", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-20T04:00:00.000Z", [{ id: "paper", title: "Paper", score: 90 }], "research", "研究"),
      digest("2026-07-21T04:00:00.000Z", [{ id: "model", title: "Model", score: 95 }], "model", "模型"),
    ],
  }, { period: "weekly", date: "2026-07-26", now: "2026-07-26T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2026-07-20", end: "2026-07-26" });
  assert.deepEqual(report.sections.map((section) => section.key), ["model", "research"]);
  assert.equal(report.headline, "本周值得关注的 2 条 AI 动态");
});

test("current monthly coverage ends on the elapsed local date and handles leap years", () => {
  const report = buildReport({
    dailyDigests: [digest("2028-02-01T04:00:00.000Z", [{ id: "one", title: "One", score: 80 }])],
  }, { period: "monthly", date: "2028-02-10", now: "2028-02-10T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(report.coverage.requiredDays, 10);
  assert.equal(report.coverage.days, 1);
  assert.equal(report.coverage.complete, false);
});

test("reports reject invalid periods and dates", () => {
  assert.throws(() => buildReport({}, { period: "yearly", date: "2026-07-22" }), /invalid period/);
  assert.throws(() => buildReport({}, { period: "daily", date: "22-07-2026" }), /invalid date/);
});

test("reports without a requested date anchor to the latest stored snapshot", () => {
  const report = buildReport({
    dailyDigests: [
      digest("2026-07-09T04:00:00.000Z", [{ id: "older", title: "Older", score: 80 }]),
      digest("2026-07-10T04:00:00.000Z", [{ id: "latest", title: "Latest", score: 90 }]),
    ],
  }, { period: "daily", now: "2026-07-22T04:00:00.000Z" });

  assert.deepEqual(report.range, { start: "2026-07-10", end: "2026-07-10" });
  assert.equal(report.headline, "今日值得关注的 1 条 AI 动态");
});

test("reports use the latest inventory date and fill missing snapshots for every period", () => {
  const items = [
    { id: "monday", title: "Monday signal", score: 88, publishedAt: "2026-07-20T04:00:00.000Z" },
    { id: "latest", title: "Latest signal", score: 96, publishedAt: "2026-07-22T04:00:00.000Z" },
  ];
  const state = {
    items,
    dailyDigests: [digest("2026-05-07T04:00:00.000Z", [{ id: "may", title: "May snapshot", score: 80 }])],
  };
  const buildVirtualDigest = (dateKey) => digest(
    `${dateKey}T04:00:00.000Z`,
    items.filter((item) => item.publishedAt.startsWith(dateKey)),
  );

  const daily = buildReport(state, { period: "daily", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });
  const weekly = buildReport(state, { period: "weekly", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });
  const monthly = buildReport(state, { period: "monthly", now: "2026-07-22T12:00:00.000Z", buildVirtualDigest });

  assert.deepEqual(daily.range, { start: "2026-07-22", end: "2026-07-22" });
  assert.equal(daily.storyCount, 1);
  assert.equal(weekly.storyCount, 2);
  assert.equal(monthly.storyCount, 2);
  assert.equal(daily.coverage.complete, true);
});

test("report cover uses a concise issue headline instead of the longest lead story title", () => {
  const longTitle = "steven-jianhao-li/zotero-AI-Butler: 调用大模型自动精读论文库里的论文并总结为笔记";
  const report = buildReport({
    dailyDigests: [digest("2026-07-22T04:00:00.000Z", [{ id: "long", title: longTitle, score: 99 }])],
  }, { period: "daily", date: "2026-07-22", now: "2026-07-22T12:00:00.000Z" });

  assert.equal(report.headline, "今日值得关注的 1 条 AI 动态");
  assert.notEqual(report.headline, longTitle);
});

test("monthly reports keep a bounded set of the highest-scoring stories per section", () => {
  const dailyDigests = Array.from({ length: 25 }, (_, index) => digest(
    `2026-07-${String(index + 1).padStart(2, "0")}T04:00:00.000Z`,
    [{ id: `story-${index}`, title: `Story ${index}`, score: 100 - index }],
  ));

  const report = buildReport({ dailyDigests }, {
    period: "monthly",
    date: "2026-07-31",
    now: "2026-07-31T12:00:00.000Z",
  });

  assert.equal(report.storyCount, 18);
  assert.deepEqual(report.sections[0].items.map((item) => item.id), Array.from({ length: 18 }, (_, index) => `story-${index}`));
});
