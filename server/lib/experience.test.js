const assert = require("node:assert/strict");
const test = require("node:test");

const { buildHotTopics, buildReport } = require("./experience");

function signal(id, eventId, sourceId, score = 90, extra = {}) {
  return {
    id,
    eventId,
    sourceId,
    sourceName: sourceId,
    title: `${eventId} ${id}`,
    score,
    publishedAt: "2026-07-22T03:00:00.000Z",
    ...extra,
  };
}

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

test("a pinned item meeting the selected threshold can form a topic", () => {
  const item = signal("p1", "pinned", "official", 80, { pinned: true });
  const result = buildHotTopics({
    items: [item],
    clusters: [{ id: "pinned", title: "Pinned", items: [item], topScore: 80 }],
  }, {
    now: "2026-07-22T04:00:00.000Z",
    selectedThreshold: 80,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "pinned");
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

  const result = buildHotTopics({ items, clusters }, { now: "2026-07-22T04:00:00.000Z" });

  assert.equal(result.items.length, 5);
  assert.deepEqual(result.items.map((item) => item.id), ["event-0", "event-1", "event-2", "event-3", "event-4"]);
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
