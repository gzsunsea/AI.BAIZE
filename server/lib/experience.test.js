const assert = require("node:assert/strict");
const test = require("node:test");

const { buildHotTopics } = require("./experience");

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
