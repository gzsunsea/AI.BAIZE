import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseLocation, shouldInterceptLinkClick, toLocation } from "./navigation.ts";

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

test("preserves requested feed page and filter state from a direct URL", () => {
  assert.deepEqual(parseLocation("/?mode=mp&q=agent&channel=news&tag=launch&category=culture&status=saved&sort=relevance&page=3"), {
    page: "feed", storyId: "", mode: "mp", query: "agent", searchMode: "direct", activeChannel: "news", activeTag: "launch", category: "culture", statusFilter: "saved", sort: "relevance", pageNumber: 3,
  });
});

test("only intercepts plain primary link clicks", () => {
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), true);
  assert.equal(shouldInterceptLinkClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), false);
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), false);
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_blank" } }), false);
});

test("story navigation uses event keys and legacy reader anchors remain interceptable", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /storyId: item\.eventId \|\| item\.id/);
  assert.doesNotMatch(appSource, /className=\{readItems\.has\(item\.id\) \? "read" : ""\}[\s\S]{0,240}target="_blank"/);
  assert.doesNotMatch(appSource, /className="title" href=\{item\.url\} target="_blank"/);
  assert.match(appSource, /className=\{readItems\.has\(item\.id\) \? "read" : ""\}[\s\S]{0,240}target="_self"/);
  assert.match(appSource, /className="title" href=\{item\.url\} target="_self"/);
});
