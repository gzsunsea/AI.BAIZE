export type RouteState = {
  page: "feed" | "hot" | "story";
  storyId: string;
  mode: string;
  query: string;
  searchMode: "direct" | "full";
  activeChannel: string;
  activeTag: string;
  category: string;
  statusFilter: string;
  sort: "published_desc" | "relevance";
  pageNumber: number;
};

export type ListSnapshot = Pick<RouteState, "mode" | "query" | "searchMode" | "activeChannel" | "activeTag" | "category" | "statusFilter" | "sort" | "pageNumber"> & {
  scrollY: number;
};

const defaults: Omit<RouteState, "page" | "storyId"> = {
  mode: "selected",
  query: "",
  searchMode: "direct",
  activeChannel: "",
  activeTag: "",
  category: "",
  statusFilter: "all",
  sort: "published_desc",
  pageNumber: 1,
};

function locationOrigin() {
  return globalThis.location?.origin || "http://localhost";
}

function readSearchMode(value: string): RouteState["searchMode"] {
  return value === "full" ? "full" : "direct";
}

function readSort(value: string): RouteState["sort"] {
  return value === "relevance" ? "relevance" : "published_desc";
}

export function parseLocation(location: string | Location): RouteState {
  const url = new URL(typeof location === "string" ? location : location.href, locationOrigin());
  const storyMatch = url.pathname.match(/^\/story\/([^/]+)$/);
  const page: RouteState["page"] = storyMatch ? "story" : url.pathname === "/hot" ? "hot" : "feed";
  const pageNumber = Number.parseInt(url.searchParams.get("page") || "", 10);

  return {
    page,
    storyId: storyMatch ? decodeURIComponent(storyMatch[1]) : "",
    mode: url.searchParams.get("mode") || defaults.mode,
    query: url.searchParams.get("q") || defaults.query,
    searchMode: readSearchMode(url.searchParams.get("search") || ""),
    activeChannel: url.searchParams.get("channel") || defaults.activeChannel,
    activeTag: url.searchParams.get("tag") || defaults.activeTag,
    category: url.searchParams.get("category") || defaults.category,
    statusFilter: url.searchParams.get("status") || defaults.statusFilter,
    sort: readSort(url.searchParams.get("sort") || ""),
    pageNumber: Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : defaults.pageNumber,
  };
}

export function toLocation(route: RouteState) {
  const path = route.page === "hot" ? "/hot" : route.page === "story" ? `/story/${encodeURIComponent(route.storyId)}` : "/";
  const params = new URLSearchParams();
  if (route.page === "feed") {
    for (const [key, value] of [["mode", route.mode], ["q", route.query], ["search", route.searchMode === "direct" ? "" : route.searchMode], ["channel", route.activeChannel], ["tag", route.activeTag], ["category", route.category], ["status", route.statusFilter === "all" ? "" : route.statusFilter], ["sort", route.sort === "published_desc" ? "" : route.sort], ["page", route.pageNumber > 1 ? String(route.pageNumber) : ""]]) {
      if (value) params.set(key, value);
    }
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export function captureListState(key: string, snapshot: ListSnapshot): void {
  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Navigation remains usable when browser storage is unavailable.
  }
}

export function readListState(key: string): ListSnapshot | null {
  try {
    const value = globalThis.sessionStorage?.getItem(key);
    if (!value) return null;
    const snapshot = JSON.parse(value) as ListSnapshot;
    return typeof snapshot.scrollY === "number" ? snapshot : null;
  } catch {
    return null;
  }
}
