import assert from "node:assert/strict";
import test from "node:test";

import { parseLocation, toLocation } from "./navigation.ts";

test("parses hot story and feed search state from URL", () => {
  assert.deepEqual(parseLocation(new URL("https://example.test/story/event-a?q=agent&search=full&channel=news").toString()), {
    page: "story", storyId: "event-a", mode: "selected", query: "agent", searchMode: "full", activeChannel: "news", activeTag: "", category: "", statusFilter: "all", sort: "published_desc", pageNumber: 1,
  });
});

test("omits empty query parameters and round-trips hot route", () => {
  const path = toLocation({ page: "hot", storyId: "", mode: "selected", query: "", searchMode: "direct", activeChannel: "", activeTag: "", category: "", statusFilter: "all", sort: "published_desc", pageNumber: 1 });
  assert.equal(path, "/hot");
  assert.deepEqual(parseLocation(path), {
    page: "hot", storyId: "", mode: "selected", query: "", searchMode: "direct", activeChannel: "", activeTag: "", category: "", statusFilter: "all", sort: "published_desc", pageNumber: 1,
  });
});
