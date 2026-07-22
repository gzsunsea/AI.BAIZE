import assert from "node:assert/strict";
import test from "node:test";

import { groupItemsByLocalDate } from "./experience.mts";

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
