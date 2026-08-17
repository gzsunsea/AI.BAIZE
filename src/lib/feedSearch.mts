import type { Item } from "../types";

export type FeedSearchOptions = {
  query?: string;
  searchMode?: "direct" | "full";
  activeTag?: string;
  activeChannel?: string;
  category?: string;
  sort?: "published_desc" | "relevance";
};

function normalized(value: unknown) {
  return String(value || "").toLowerCase();
}

function directFields(item: Item) {
  return [item.title, item.summary, item.sourceName, (item.tags || []).join(" ")];
}

function fullFields(item: Item) {
  return [
    ...directFields(item),
    item.content,
    item.raw?.content,
    item.raw?.description,
    item.reason,
    item.editorialBrief?.fact,
    item.editorialBrief?.impact,
    item.editorialBrief?.scenario,
  ];
}

export function feedSearchRank(item: Item, query: string) {
  const q = normalized(query).trim();
  if (!q) return 0;
  const weighted: Array<[unknown, number]> = [
    [item.title, 8], [item.summary, 6], [item.reason, 5], [item.editorialBrief?.fact, 5],
    [item.editorialBrief?.impact, 4], [item.editorialBrief?.scenario, 4], [item.sourceName, 3],
    [(item.tags || []).join(" "), 3], [item.content, 2], [item.raw?.content, 2], [item.raw?.description, 2],
  ];
  return weighted.reduce((score, [value, weight]) => score + (normalized(value).includes(q) ? weight : 0), 0);
}

export function filterAndSortFeedItems(items: Item[], options: FeedSearchOptions = {}) {
  const query = normalized(options.query).trim();
  const activeChannel = normalized(options.activeChannel).trim();
  const mode = options.searchMode === "full" ? "full" : "direct";
  const sort = options.sort === "relevance" && mode === "full" && query ? "relevance" : "published_desc";
  return items
    .filter((item) => !options.category || item.category === options.category || item.categoryLabel === options.category)
    .filter((item) => !options.activeTag || item.tags?.includes(options.activeTag))
    .filter((item) => !activeChannel || [item.channel, item.channelLabel].some((value) => normalized(value).trim() === activeChannel))
    .filter((item) => !query || (mode === "full" ? fullFields(item) : directFields(item)).some((value) => normalized(value).includes(query)))
    .sort((a, b) => (
      (sort === "relevance" ? feedSearchRank(b, query) - feedSearchRank(a, query) : 0)
      || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      || String(a.id).localeCompare(String(b.id))
    ));
}
