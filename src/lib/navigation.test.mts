import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { captureNavigationSnapshot, captureScrollState, cumulativePageRequests, listStateKey, parseLocation, readListState, readScrollState, shouldInterceptLinkClick, storyBackLabel, toLocation } from "./navigation.ts";

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

test("ordinary item URLs round-trip independently from hotspot story URLs", () => {
  const route = parseLocation("https://example.test/item/source-item-1");
  assert.equal(route.page, "item");
  assert.equal(route.storyId, "source-item-1");
  assert.equal(toLocation(route), "/item/source-item-1");
});

test("a restored page requests the cumulative list needed to restore scroll", () => {
  assert.deepEqual(cumulativePageRequests(1, 80), [{ page: 1, pageSize: 80 }]);
  assert.deepEqual(cumulativePageRequests(3, 80), [
    { page: 1, pageSize: 80 }, { page: 2, pageSize: 80 }, { page: 3, pageSize: 80 },
  ]);
});

test("hot-list scroll snapshots round-trip independently from feed state", () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    captureScrollState("aibaize-hot-list", 640);
    assert.equal(readScrollState("aibaize-hot-list"), 640);
    assert.equal(readScrollState("aibaize-feed-list"), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

test("feed to hot to story navigation preserves independent back-stack snapshots", () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  const feed = parseLocation("/?mode=selected&q=agents&page=2");
  const hot = parseLocation("/hot");
  const story = parseLocation("/story/event-a");
  try {
    captureNavigationSnapshot(feed, 480);
    captureNavigationSnapshot(hot, 920);
    captureNavigationSnapshot(story, 0);

    assert.equal(readListState(listStateKey(feed))?.scrollY, 480);
    assert.equal(readScrollState("aibaize-hot-list"), 920);
    assert.equal(values.size, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

test("story back copy follows its list origin and defaults direct links to hot", () => {
  assert.equal(storyBackLabel("feed"), "返回信息流");
  assert.equal(storyBackLabel("hot"), "返回热点榜");
  assert.equal(storyBackLabel(undefined), "返回热点榜");
});

test("only intercepts plain primary link clicks", () => {
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), true);
  assert.equal(shouldInterceptLinkClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), false);
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_self" } }), false);
  assert.equal(shouldInterceptLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, currentTarget: { target: "_blank" } }), false);
});

test("ordinary reader navigation uses durable item links and hotspot navigation keeps story links", () => {
  const appSource = readFileSync(new URL("../app/App.tsx", import.meta.url), "utf8");
  const feedSource = readFileSync(new URL("../components/feed/FeedExperience.tsx", import.meta.url), "utf8");
  const hotSource = readFileSync(new URL("../components/hot/HotPage.tsx", import.meta.url), "utf8");
  assert.match(appSource, /page: "item", storyId: item\.id/);
  assert.match(feedSource, /href=\{itemLocation\(item\.id\)\}/);
  assert.match(feedSource, /shouldInterceptLinkClick\(event\)/);
  assert.match(hotSource, /href=\{storyLocation\(topic\.id\)\}/);
  assert.match(hotSource, /href=\{itemLocation\(candidate\.id\)\}/);
  assert.match(hotSource, /onOpenItem\(candidate\)/);
  assert.doesNotMatch(appSource, /className=\{readItems\.has\(item\.id\) \? "read" : ""\}[\s\S]{0,240}target="_blank"/);
  assert.doesNotMatch(appSource, /className="title" href=\{item\.url\} target="_blank"/);
  assert.match(appSource, /className=\{readItems\.has\(item\.id\) \? "read" : ""\}[\s\S]{0,240}target="_self"/);
  assert.match(appSource, /className="title" href=\{itemLocation\(item\.id\)\} target="_self"/);
});
