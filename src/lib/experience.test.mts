import assert from "node:assert/strict";
import test from "node:test";

import { groupItemsByLocalDate, topicForMode, topicRequestUrls } from "./experience.mts";

test("groups feed items by Shanghai local date and preserves order", () => {
  const items = [
    { id: "after-midnight", publishedAt: "2026-07-21T16:30:00.000Z" },
    { id: "before-midnight", publishedAt: "2026-07-21T15:30:00.000Z" },
    { id: "same-day", publishedAt: "2026-07-21T18:00:00.000Z" },
  ];

  const groups = groupItemsByLocalDate(items);

  assert.deepEqual(groups.map((group) => group.date), ["2026-07-22", "2026-07-21"]);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["after-midnight", "same-day"]);
});

test("topic definitions normalize legacy education and culture modes", () => {
  assert.equal(topicForMode("education")?.key, "topic-education");
  assert.equal(topicForMode("culture")?.key, "topic-culture");
  assert.equal(topicForMode("topic-models")?.query.categories[0], "model");
  assert.equal(topicForMode("selected"), null);
});

test("topic requests are bounded and use server-side filters", () => {
  const agentUrls = topicRequestUrls(topicForMode("topic-agents")!);
  assert.equal(agentUrls.length, 3);
  assert.equal(agentUrls.every((url) => url.includes("pageSize=80")), true);
  assert.equal(agentUrls.some((url) => url.includes("q=Agent")), true);

  const educationUrls = topicRequestUrls(topicForMode("topic-education")!);
  assert.deepEqual(educationUrls, ["/api/items?mode=all&category=education&page=1&pageSize=80"]);
});
