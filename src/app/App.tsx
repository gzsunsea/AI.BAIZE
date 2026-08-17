import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Archive,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Flame,
  GraduationCap,
  Heart,
  ListFilter,
  List,
  Loader2,
  Lock,
  Menu,
  Monitor,
  MessageCircle,
  MessageSquareText,
  Moon,
  Palette,
  RefreshCw,
  Rows3,
  Search,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { FeedExperience } from "../components/feed/FeedExperience";
import { TopicPage } from "../components/topics/TopicPage";
import { ReportsWorkspace } from "../components/reports/ReportsWorkspace";
import { ReadingWorkspace as EditorialReadingWorkspace } from "../components/reader/ReadingWorkspace";
import { HotPage, type HotPageData } from "../components/hot/HotPage";
import { StoryPage } from "../components/hot/StoryPage";
import { BookmarkGuide, ThemeToggle } from "../components/shared";
import { topicForMode, topicRequestUrls } from "../lib/experience.mts";
import { captureListState, parseLocation, readListState, shouldInterceptLinkClick, toLocation, type RouteState } from "../lib/navigation";
import type { ApiState, AskResult, DailyDigest, HotTopic, Item, MpArticle, MpDigest, SavedEntry, Stats, StoryDetail } from "../types";
import "../styles.css";

const nav = [
  { key: "selected", label: "精选" },
  { key: "all", label: "全部 AI 动态" },
  { key: "reading", label: "稍后读" },
  { key: "education", label: "AI 教育" },
  { key: "culture", label: "AI 文化" },
  { key: "daily", label: "AI 日报" },
  { key: "mp", label: "公众号爆文" },
  { key: "agent", label: "Agent 接入" },
  { key: "about", label: "关于" },
  { key: "admin", label: "后台" },
];

const adminTokenKey = "aihot-admin-token";
const canonicalSiteUrl = "https://www.aibaize.cc";
const readItemsKey = "aibaize-read-items";
const savedItemsKey = "aibaize-saved-items";
const processedItemsKey = "aibaize-processed-items";

const channelTabs = [
  { key: "", label: "全部" },
  { key: "first_party", label: "一手信源" },
  { key: "news", label: "资讯" },
  { key: "social", label: "推文" },
  { key: "community", label: "论文/开源" },
];

const sectionSubtitles: Record<string, string> = {
  model: "Model Releases",
  product: "Product Updates",
  opensource: "Open Source",
  research: "Research Papers",
  education: "Education Tech",
  culture: "Culture & Creative",
  opinion: "Tactics & Opinions",
  industry: "Industry Signals",
};

function formatTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isFinite(diff) && diff < 36e5) return `${Math.max(1, Math.round(diff / 60000))} 分钟前`;
  if (Number.isFinite(diff) && diff < 864e5) return `${Math.round(diff / 36e5)} 小时前`;
  return date.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new ApiError(res.status, await res.text() || res.statusText);
  return res.json();
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function searchField(value: unknown) {
  return String(value || "").toLowerCase();
}

function directSearchFields(item: Item) {
  return [item.title, item.summary, item.sourceName, (item.tags || []).join(" ")].map(searchField);
}

function fullSearchFields(item: Item) {
  return [
    ...directSearchFields(item),
    item.content,
    item.raw?.content,
    item.raw?.description,
    item.reason,
    item.editorialBrief?.fact,
    item.editorialBrief?.impact,
    item.editorialBrief?.scenario,
  ].map(searchField);
}

function topicSearchHaystack(item: Item, searchMode: "direct" | "full") {
  return (searchMode === "full" ? fullSearchFields(item) : directSearchFields(item)).join(" ");
}

function readingSearchHaystack(item: Item, searchMode: "direct" | "full") {
  return topicSearchHaystack(item, searchMode);
}

function fullSearchRank(item: Item, query: string) {
  if (!query) return 0;
  const fields: Array<[unknown, number]> = [
    [item.title, 8], [item.summary, 6], [item.reason, 5], [item.editorialBrief?.fact, 5],
    [item.editorialBrief?.impact, 4], [item.editorialBrief?.scenario, 4], [item.sourceName, 3],
    [(item.tags || []).join(" "), 3], [item.content, 2], [item.raw?.content, 2], [item.raw?.description, 2],
  ];
  return fields.reduce((score, [value, weight]) => score + (searchField(value).includes(query) ? weight : 0), 0);
}

export function App() {
  const [route, setRoute] = useState<RouteState>(() => parseLocation(window.location.href));
  const [mode, setMode] = useState(() => route.mode);
  const [themeMode, setThemeMode] = useState(localStorage.getItem("aihot-theme-mode") || "dark");
  const [query, setQuery] = useState(() => route.query);
  const [searchMode, setSearchMode] = useState<"direct" | "full">(() => route.searchMode);
  const [activeTag, setActiveTag] = useState(() => route.activeTag);
  const [activeChannel, setActiveChannel] = useState(() => route.activeChannel);
  const [statusFilter, setStatusFilter] = useState(() => route.statusFilter);
  const [density, setDensity] = useState(localStorage.getItem("aibaize-density") || "comfortable");
  const [items, setItems] = useState<Item[]>([]);
  const [feedPage, setFeedPage] = useState(() => route.pageNumber);
  const [feedTotal, setFeedTotal] = useState(0);
  const [daily, setDaily] = useState<DailyDigest | null>(null);
  const [dailyArchive, setDailyArchive] = useState<DailyDigest[]>([]);
  const [mp, setMp] = useState<MpDigest | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showBookmarkGuide, setShowBookmarkGuide] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [activeRelatedItems, setActiveRelatedItems] = useState<Item[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"reader" | "ask">("reader");
  const [readItems, setReadItems] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(readItemsKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(savedItemsKey) || "[]");
    } catch {
      return [];
    }
  });
  const [processedItems, setProcessedItems] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(processedItemsKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [hotTopicsLoading, setHotTopicsLoading] = useState(false);
  const [hotTopicsError, setHotTopicsError] = useState("");
  const [storyLoading, setStoryLoading] = useState(() => route.page === "story");
  const [storyError, setStoryError] = useState("");
  const [storyNotFound, setStoryNotFound] = useState(false);
  const [hotPageData, setHotPageData] = useState<HotPageData | null>(null);
  const [hotPageLoading, setHotPageLoading] = useState(() => route.page === "hot");
  const [hotPageError, setHotPageError] = useState("");
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [readerFromStoryPage, setReaderFromStoryPage] = useState(false);
  const appendNextRouteLoad = useRef(false);
  const loadVersion = useRef(0);

  const currentRoute = (): RouteState => ({
    ...route,
    mode,
    query,
    searchMode,
    activeTag,
    activeChannel,
    statusFilter,
    pageNumber: feedPage,
  });

  const applyRoute = (next: RouteState) => {
    loadVersion.current += 1;
    if (next.page === "hot") {
      setHotPageData(null);
      setHotPageError("");
      setHotPageLoading(true);
      setStory(null);
      setStoryError("");
      setStoryNotFound(false);
      setStoryLoading(false);
    } else if (next.page === "story") {
      setStory(null);
      setStoryError("");
      setStoryNotFound(false);
      setStoryLoading(true);
      setHotPageData(null);
      setHotPageError("");
      setHotPageLoading(false);
    } else {
      setHotPageLoading(false);
      setStoryLoading(false);
    }
    setRoute(next);
    setMode(next.mode);
    setQuery(next.query);
    setSearchMode(next.searchMode);
    setActiveTag(next.activeTag);
    setActiveChannel(next.activeChannel);
    setStatusFilter(next.statusFilter);
    setFeedPage(next.pageNumber);
    if (next.page !== "story") {
      setActiveItem(null);
      setActiveRelatedItems([]);
      setReaderFromStoryPage(false);
    }
  };

  const listStateKey = (next: RouteState) => `aibaize-list:${toLocation({ ...next, page: "feed", storyId: "" })}`;

  const navigate = (next: RouteState, replace = false) => {
    const current = currentRoute();
    captureListState(listStateKey(current), {
      scrollY: window.scrollY,
      mode: current.mode,
      query: current.query,
      searchMode: current.searchMode,
      activeChannel: current.activeChannel,
      activeTag: current.activeTag,
      category: current.category,
      statusFilter: current.statusFilter,
      sort: current.sort,
      pageNumber: current.pageNumber,
    });
    if (replace) history.replaceState({ aibaizeNavigation: true }, "", toLocation(next));
    else history.pushState({ aibaizeNavigation: true }, "", toLocation(next));
    applyRoute(next);
  };

  const updateFeedRoute = (changes: Partial<RouteState>) => {
    const changedKeys = Object.keys(changes);
    const onlyPageChanged = changedKeys.length === 1 && changedKeys[0] === "pageNumber";
    navigate({ ...currentRoute(), ...changes, page: "feed", storyId: "" }, !onlyPageChanged);
  };

  const closeWorkspace = () => {
    if (readerFromStoryPage) {
      setActiveItem(null);
      setActiveRelatedItems([]);
      setReaderFromStoryPage(false);
      return;
    }
    if (route.page === "story") {
      if (history.state?.aibaizeNavigation) history.back();
      else navigate({ ...currentRoute(), page: "hot", storyId: "" }, true);
      return;
    }
    setActiveItem(null);
    setActiveRelatedItems([]);
    setAskOpen(false);
  };

  useEffect(() => {
    const sync = () => {
      const next = parseLocation(window.location.href);
      applyRoute(next);
      const snapshot = readListState(listStateKey(next));
      if (snapshot) window.requestAnimationFrame(() => window.scrollTo(0, snapshot.scrollY));
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const load = async (page = 1, append = false) => {
    const requestVersion = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const nextStats = await api<Stats>("/api/stats");
      let nextItems: Item[] = [];
      let nextFeedTotal = 0;
      let nextDaily: DailyDigest | null = null;
      let nextDailyArchive: DailyDigest[] = [];
      let nextMp: MpDigest | null = null;
      if (mode === "reports") {
        nextItems = [];
      } else if (mode === "daily") {
        const [digest, archive] = await Promise.all([
          api<DailyDigest>(`/api/daily?q=${encodeURIComponent(query)}`),
          api<{ items: DailyDigest[] }>("/api/public/dailies?take=16"),
        ]);
        nextDaily = digest;
        nextDailyArchive = archive.items?.length ? archive.items : [digest];
        nextItems = nextDaily.items;
      } else if (mode === "mp") {
        nextMp = await api<MpDigest>(`/api/mp?q=${encodeURIComponent(query)}`);
        nextItems = nextMp.items;
      } else if (mode === "reading") {
        nextItems = savedEntries.map((entry) => entry.item);
        nextFeedTotal = nextItems.length;
      } else if (topicForMode(mode)) {
        const topic = topicForMode(mode)!;
        const responses = await Promise.all(topicRequestUrls(topic).map((url) => api<{ items: Item[]; total: number }>(url)));
        const merged = new Map<string, Item>();
        for (const response of responses) {
          for (const item of response.items || []) merged.set(item.id, item);
        }
        const normalizedQuery = query.trim().toLowerCase();
        nextItems = [...merged.values()]
          .filter((item) => !activeTag || item.tags?.includes(activeTag))
          .filter((item) => !normalizedQuery || topicSearchHaystack(item, searchMode).includes(normalizedQuery))
          .sort((a, b) => (normalizedQuery && searchMode === "full" ? fullSearchRank(b, normalizedQuery) - fullSearchRank(a, normalizedQuery) : 0) || (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
        nextFeedTotal = nextItems.length;
      } else {
        const categoryMode = mode === "education" ? "education" : mode === "culture" ? "culture" : "";
        const apiMode = mode === "all" || categoryMode ? "all" : "selected";
        const pageSize = apiMode === "all" ? 120 : 80;
        const feed = await api<{ items: Item[]; total: number; page: number; pageSize: number }>(
          `/api/items?mode=${apiMode}&q=${encodeURIComponent(query)}&searchMode=${encodeURIComponent(searchMode)}&tag=${encodeURIComponent(activeTag)}&channel=${encodeURIComponent(mode === "all" || mode === "selected" ? activeChannel : "")}&category=${encodeURIComponent(categoryMode)}&page=${page}&pageSize=${pageSize}`,
        );
        nextItems = feed.items;
        nextFeedTotal = feed.total;
      }
      if (requestVersion !== loadVersion.current) return;
      setItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setFeedPage(page);
      setFeedTotal(nextFeedTotal);
      setDaily(nextDaily);
      setDailyArchive(nextDailyArchive);
      setMp(nextMp);
      setStats(nextStats);
    } catch (err) {
      if (requestVersion !== loadVersion.current) return;
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (requestVersion === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (route.page !== "feed") return;
    const append = appendNextRouteLoad.current;
    appendNextRouteLoad.current = false;
    load(route.pageNumber, append);
  }, [route]);

  useEffect(() => {
    if (route.page !== "story" || !route.storyId) return;
    let cancelled = false;
    setStoryLoading(true);
    setStoryError("");
    setStoryNotFound(false);
    setStory(null);
    api<StoryDetail>(`/api/public/stories/${encodeURIComponent(route.storyId)}`)
      .then((nextStory) => {
        if (!nextStory.event?.representative) throw new Error("未找到该故事");
        if (cancelled) return;
        setStory(nextStory);
      })
      .catch((err) => {
        if (!cancelled) {
          setStoryNotFound(err instanceof ApiError && err.status === 404);
          setStoryError(err instanceof Error ? err.message : "故事加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setStoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [route.page, route.storyId]);

  const loadHotPage = async () => {
    setHotPageLoading(true);
    setHotPageError("");
    setHotPageData(null);
    try {
      const result = await api<HotPageData>("/api/public/hot");
      setHotPageData(result);
    } catch (err) {
      setHotPageError(err instanceof Error ? err.message : "热点加载失败");
    } finally {
      setHotPageLoading(false);
    }
  };

  useEffect(() => {
    if (route.page === "hot") loadHotPage();
  }, [route.page]);

  useEffect(() => {
    if (mode === "reading") {
      setItems(savedEntries.map((entry) => entry.item));
      setFeedTotal(savedEntries.length);
    }
  }, [savedEntries, mode]);

  useEffect(() => {
    const apply = () => {
      const actual = themeMode === "auto" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : themeMode;
      document.documentElement.setAttribute("data-theme", actual);
      document.documentElement.setAttribute("data-theme-mode", themeMode);
      localStorage.setItem("aihot-theme-mode", themeMode);
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  const visibleTags = useMemo(() => stats?.tags.slice(0, 12) || [], [stats]);
  const hotItems = useMemo(() => buildHotItems(items), [items]);
  const savedIds = useMemo(() => new Set(savedEntries.map((entry) => entry.item.id)), [savedEntries]);
  const activeTopic = topicForMode(mode);
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const searchFiltered = mode === "reading" && normalizedQuery
      ? items.filter((item) => readingSearchHaystack(item, searchMode).includes(normalizedQuery))
      : items;
    const searchSorted = mode === "reading" && normalizedQuery && searchMode === "full"
      ? [...searchFiltered].sort((a, b) => fullSearchRank(b, normalizedQuery) - fullSearchRank(a, normalizedQuery) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
      : searchFiltered;
    return searchSorted.filter((item) => {
    if (statusFilter === "unread") return !readItems.has(item.id);
    if (statusFilter === "saved") return savedIds.has(item.id);
    if (statusFilter === "processed") return processedItems.has(item.id);
    return true;
    });
  }, [items, mode, query, searchMode, statusFilter, readItems, savedIds, processedItems]);

  const saveReadItems = (next: Set<string>) => {
    const compact = [...next].slice(-500);
    localStorage.setItem(readItemsKey, JSON.stringify(compact));
    setReadItems(new Set(compact));
  };

  const markRead = (id: string) => {
    if (!id || readItems.has(id)) return;
    const next = new Set(readItems);
    next.add(id);
    saveReadItems(next);
  };

  const openItem = (item: Item, relatedItems: Item[] = []) => {
    markRead(item.id);
    setActiveItem(item);
    setActiveRelatedItems(relatedItems);
    navigate({ ...currentRoute(), page: "story", storyId: item.eventId || item.id });
  };

  const openStoryItem = (item: Item) => {
    setReaderFromStoryPage(true);
    setPanelTab("reader");
    setAskOpen(false);
    markRead(item.id);
    setActiveItem(item);
    setActiveRelatedItems([...(story?.latestUpdates || []), ...(story?.timeline || [])].filter((candidate) => candidate.id !== item.id));
  };

  const toggleRead = (id: string) => {
    if (!id) return;
    const next = new Set(readItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveReadItems(next);
  };

  const toggleSaved = (item: Item) => {
    setSavedEntries((current) => {
      const exists = current.some((entry) => entry.item.id === item.id);
      const next = exists
        ? current.filter((entry) => entry.item.id !== item.id)
        : [{ item, savedAt: new Date().toISOString() }, ...current].slice(0, 500);
      localStorage.setItem(savedItemsKey, JSON.stringify(next));
      return next;
    });
  };

  const toggleProcessed = (id: string) => {
    const next = new Set(processedItems);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (!readItems.has(id)) markRead(id);
    }
    const compact = [...next].slice(-500);
    localStorage.setItem(processedItemsKey, JSON.stringify(compact));
    setProcessedItems(new Set(compact));
  };

  const changeDensity = (value: string) => {
    localStorage.setItem("aibaize-density", value);
    setDensity(value);
  };

  const exportSaved = () => {
    const markdown = [
      "# AI.BAIZE 稍后读",
      "",
      ...savedEntries.flatMap(({ item, savedAt }) => [
        `## [${item.title}](${item.url})`,
        "",
        `- 来源：${item.sourceName}`,
        `- 收藏时间：${new Date(savedAt).toLocaleString("zh-CN")}`,
        `- 状态：${processedItems.has(item.id) ? "已处理" : readItems.has(item.id) ? "已读" : "未读"}`,
        "",
        item.editorialBrief?.fact || item.summary || item.reason || "",
        "",
      ]),
    ].join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aibaize-reading-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (nextMode: string) => {
    if (nextMode === "hot") {
      navigate({ ...currentRoute(), page: "hot", storyId: "" });
      setMobileMenuOpen(false);
      return;
    }
    if (nextMode === "ask") {
      setMobileMenuOpen(false);
      setActiveItem(null);
      setActiveRelatedItems([]);
      setPanelTab("ask");
      setAskOpen(true);
      return;
    }
    setLoading(true);
    if (nextMode === "mp") setMp(null);
    updateFeedRoute({
      mode: nextMode,
      category: nextMode === "education" || nextMode === "culture" ? nextMode : "",
      activeChannel: nextMode === "selected" || nextMode === "all" ? activeChannel : "",
      statusFilter: nextMode === "reading" ? "saved" : "all",
      pageNumber: 1,
    });
    setMobileMenuOpen(false);
    setAskOpen(false);
  };

  const openAsk = (item?: Item) => {
    if (item) {
      markRead(item.id);
      setActiveItem(item);
    }
    setPanelTab("ask");
    setAskOpen(true);
  };

  const loadHotTopics = async () => {
    setHotTopicsLoading(true);
    setHotTopicsError("");
    try {
      const result = await api<{ generatedAt: string; items: HotTopic[] }>("/api/public/hot-topics");
      setHotTopics(result.items || []);
    } catch (err) {
      setHotTopicsError(err instanceof Error ? err.message : "当前热点加载失败");
    } finally {
      setHotTopicsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "selected") loadHotTopics();
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape" && (activeItem || askOpen)) {
        closeWorkspace();
        return;
      }
      if (!activeItem) return;
      const index = visibleItems.findIndex((item) => item.id === activeItem.id);
      if (event.key.toLowerCase() === "j" && index >= 0 && index < visibleItems.length - 1) openItem(visibleItems[index + 1]);
      if (event.key.toLowerCase() === "k" && index > 0) openItem(visibleItems[index - 1]);
      if (event.key.toLowerCase() === "m") toggleRead(activeItem.id);
      if (event.key.toLowerCase() === "b") toggleSaved(activeItem);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, askOpen, visibleItems, readItems, savedEntries]);

  const shareSite = async () => {
    const url = canonicalSiteUrl;
    const data = {
      title: "AI.BAIZE",
      text: "AI.BAIZE：AI 自动筛选的高价值动态、日报与中文爆文雷达。",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("链接已复制");
        window.setTimeout(() => setShareMessage(""), 1800);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setShareMessage("分享失败");
      window.setTimeout(() => setShareMessage(""), 1800);
    }
  };

  const bookmarkSite = async () => {
    const url = canonicalSiteUrl;
    if (installPrompt) {
      const promptEvent = installPrompt;
      setInstallPrompt(null);
      await promptEvent.prompt();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("链接已复制");
      window.setTimeout(() => setShareMessage(""), 1800);
    } catch {
      setShareMessage("");
    }
    setShowBookmarkGuide(true);
  };

  return (
    <>
      <AppShell
        mode={route.page === "hot" ? "hot" : mode}
        readerOpen={Boolean(activeItem || askOpen)}
        mobileMenuOpen={mobileMenuOpen}
        themeMode={themeMode}
        themeControl={<ThemeToggle value={themeMode} onChange={setThemeMode} />}
        onModeChange={switchMode}
        onMobileMenuChange={setMobileMenuOpen}
        onThemeCycle={() => setThemeMode(themeMode === "dark" ? "light" : themeMode === "light" ? "auto" : "dark")}
      >
        {route.page === "hot" ? (
          <HotPage data={hotPageData} loading={hotPageLoading} error={hotPageError} onOpenStory={(id) => navigate({ ...currentRoute(), page: "story", storyId: id })} onRetry={loadHotPage} />
        ) : route.page === "story" ? (
          <StoryPage story={story} loading={storyLoading} error={storyError} notFound={storyNotFound} onBack={closeWorkspace} onOpenItem={openStoryItem} onRetry={() => {
            if (!route.storyId) return;
            setStoryLoading(true);
            setStoryError("");
            setStoryNotFound(false);
            setStory(null);
            api<StoryDetail>(`/api/public/stories/${encodeURIComponent(route.storyId)}`).then(setStory).catch((err) => {
              setStoryNotFound(err instanceof ApiError && err.status === 404);
              setStoryError(err instanceof Error ? err.message : "故事加载失败");
            }).finally(() => setStoryLoading(false));
          }} />
        ) : mode === "admin" ? (
          <AdminPanel onChanged={() => load(1, false)} />
        ) : mode === "agent" ? (
          <AgentPage />
        ) : mode === "about" ? (
          <About stats={stats} />
        ) : mode === "reports" ? (
          <ReportsWorkspace onOpen={(item) => { setPanelTab("reader"); setAskOpen(false); openItem(item); }} />
        ) : ["selected", "all", "reading"].includes(mode) ? (
          <FeedExperience
            mode={mode}
            items={visibleItems}
            feedTotal={feedTotal}
            stats={stats}
            hotTopics={hotTopics}
            hotTopicsLoading={hotTopicsLoading}
            hotTopicsError={hotTopicsError}
            loading={loading}
            error={error}
            query={query}
            searchMode={searchMode}
            activeTag={activeTag}
            activeChannel={activeChannel}
            statusFilter={statusFilter}
            density={density}
            readItems={readItems}
            savedIds={savedIds}
            processedItems={processedItems}
            shareMessage={shareMessage}
            onQueryChange={setQuery}
            onSearch={() => updateFeedRoute({ query, pageNumber: 1 })}
            onSearchModeChange={(searchMode) => updateFeedRoute({ searchMode, pageNumber: 1 })}
            onTagChange={(activeTag) => updateFeedRoute({ activeTag, pageNumber: 1 })}
            onChannelChange={(activeChannel) => updateFeedRoute({ activeChannel, pageNumber: 1 })}
            onStatusChange={(statusFilter) => updateFeedRoute({ statusFilter })}
            onDensityChange={changeDensity}
            onOpen={(item, relatedItems = []) => { setPanelTab("reader"); setAskOpen(false); openItem(item, relatedItems); }}
            onAsk={openAsk}
            onToggleRead={toggleRead}
            onToggleSaved={toggleSaved}
            onToggleProcessed={toggleProcessed}
            onRefresh={() => load(feedPage, false)}
            onRetryHotTopics={loadHotTopics}
            onOpenHotPage={() => navigate({ ...currentRoute(), page: "hot", storyId: "" })}
            onBookmarkSite={bookmarkSite}
            onShareSite={shareSite}
            onLoadMore={() => { appendNextRouteLoad.current = true; updateFeedRoute({ pageNumber: feedPage + 1 }); }}
          />
        ) : activeTopic ? (
          <TopicPage
            definition={activeTopic}
            feedProps={{
              mode,
              items: visibleItems,
              feedTotal,
              stats,
              hotTopics: [],
              hotTopicsLoading: false,
              hotTopicsError: "",
              loading,
              error,
              query,
              searchMode,
              activeTag,
              activeChannel,
              statusFilter,
              density,
              readItems,
              savedIds,
              processedItems,
              shareMessage,
              onQueryChange: setQuery,
              onSearch: () => updateFeedRoute({ query, pageNumber: 1 }),
              onSearchModeChange: (searchMode) => updateFeedRoute({ searchMode, pageNumber: 1 }),
              onTagChange: (activeTag) => updateFeedRoute({ activeTag, pageNumber: 1 }),
              onChannelChange: (activeChannel) => updateFeedRoute({ activeChannel, pageNumber: 1 }),
              onStatusChange: (statusFilter) => updateFeedRoute({ statusFilter }),
              onDensityChange: changeDensity,
              onOpen: (item, relatedItems = []) => { setPanelTab("reader"); setAskOpen(false); openItem(item, relatedItems); },
              onAsk: openAsk,
              onToggleRead: toggleRead,
              onToggleSaved: toggleSaved,
              onToggleProcessed: toggleProcessed,
              onRefresh: () => load(feedPage, false),
              onRetryHotTopics: loadHotTopics,
              onOpenHotPage: () => navigate({ ...currentRoute(), page: "hot", storyId: "" }),
              onBookmarkSite: bookmarkSite,
              onShareSite: shareSite,
              onLoadMore: () => { appendNextRouteLoad.current = true; updateFeedRoute({ pageNumber: feedPage + 1 }); },
            }}
          />
        ) : (
          <>
            {mode !== "daily" && (
              <>
                <header className="page-head compact-head">
                  <div>
                    <h1>{mode === "all" ? "全部 AI 动态" : mode === "reading" ? "稍后读" : mode === "mp" ? "中文雷达" : mode === "education" ? "AI 教育" : mode === "culture" ? "AI 文化" : "精选"}</h1>
                    <p>{mode === "reading" ? "保存在本机的阅读清单，可标记已处理并导出 Markdown。" : mode === "mp" ? "中文媒体、公众号与国内 AI 动态聚合。" : mode === "education" ? "教育、学习、课堂、教师工具与 EdTech 场景中的 AI 最新动态。" : mode === "culture" ? "文化、艺术、影视、音乐、游戏、版权与创意产业中的 AI 最新动态。" : mode === "all" ? "完整抓取结果，包含精选之外的长尾内容。" : "AI 自动挑选的高价值内容，按热度、时效、来源可信度排序。"}</p>
                  </div>
                  <div className="head-metrics">
                    <Stat label="可见" value={stats?.total ?? 0} />
                    <Stat label="精选" value={stats?.selected ?? 0} />
                    <Stat label="信源" value={`${stats?.healthySources ?? 0}/${stats?.sources ?? 0}`} />
                    <button className="icon-action bookmark-action" onClick={bookmarkSite} title="收藏/添加到桌面">
                      <Bookmark size={18} />
                    </button>
                    <button className="icon-action share-action" onClick={shareSite} title="分享网站">
                      <Share2 size={18} />
                    </button>
                    <button className="icon-action" onClick={() => load(1, false)} title="刷新列表">
                      {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
                    </button>
                    <button className="icon-action ask-action" onClick={() => openAsk()} title="问白泽">
                      <MessageSquareText size={18} />
                    </button>
                  </div>
                </header>
                {shareMessage && <div className="toast">{shareMessage}</div>}

                <section className="toolbar">
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      placeholder="搜索标题/摘要..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && updateFeedRoute({ query, pageNumber: 1 })}
                    />
                  </label>
                  <button className="primary" onClick={() => updateFeedRoute({ query, pageNumber: 1 })}>
                    <Check size={17} />
                    筛选
                  </button>
                  {mode === "reading" && (
                    <button className="icon-action" type="button" onClick={exportSaved} title="导出 Markdown" disabled={!savedEntries.length}>
                      <Download size={17} />
                    </button>
                  )}
                </section>
                {mode !== "mp" && mode !== "education" && mode !== "culture" && (
                  <section className="reading-controls" aria-label="阅读状态和密度">
                    <div className="reading-status">
                      {[
                        ["all", "全部"],
                        ["unread", "未读"],
                        ["saved", "稍后读"],
                        ["processed", "已处理"],
                      ].map(([key, label]) => (
                        <button className={statusFilter === key ? "active" : ""} key={key} type="button" onClick={() => updateFeedRoute({ statusFilter: key })}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="density-switch">
                      <button className={density === "comfortable" ? "active" : ""} type="button" onClick={() => changeDensity("comfortable")} title="舒展视图"><Rows3 size={16} /></button>
                      <button className={density === "compact" ? "active" : ""} type="button" onClick={() => changeDensity("compact")} title="紧凑视图"><List size={16} /></button>
                    </div>
                  </section>
                )}
              </>
            )}

            {(mode === "all" || mode === "selected") && <div className="tag-row signal-tabs">
              {
                channelTabs.map((tab) => (
                  <button className={activeChannel === tab.key ? "active" : ""} key={tab.key || "all"} onClick={() => updateFeedRoute({ activeChannel: tab.key, pageNumber: 1 })}>
                    {tab.label}
                    {tab.key && <span>{stats?.channels?.find((item) => item.channel === tab.key)?.count || 0}</span>}
                  </button>
                ))}
            </div>}

            {mode !== "daily" && mode !== "mp" && mode !== "education" && mode !== "culture" && <div className="tag-row">
              <button className={!activeTag ? "active" : ""} onClick={() => updateFeedRoute({ activeTag: "", pageNumber: 1 })}>
                全部
              </button>
              {visibleTags.map((tag) => (
                <button className={activeTag === tag.tag ? "active" : ""} key={tag.tag} onClick={() => updateFeedRoute({ activeTag: tag.tag, pageNumber: 1 })}>
                  {tag.tag}
                  <span>{tag.count}</span>
                </button>
              ))}
            </div>}

            {error && <div className="notice error">{error}</div>}
            {loading && <div className="notice">正在加载真实数据...</div>}
            {!loading && visibleItems.length === 0 && <div className="notice">{mode === "reading" ? "稍后读清单还是空的。" : "当前筛选没有内容。"}</div>}

            {mode === "daily" && daily ? <DailyMagazine daily={daily} archive={dailyArchive} /> : mode === "mp" ? (
              mp ? <MpTable mp={mp} /> : <div className="mp-loading-state"><Loader2 className="spin" size={20} /><span>正在载入中文雷达</span></div>
            ) : (
              <>
                {!loading && statusFilter === "all" && hotItems.length > 0 && mode !== "reading" && <HotPulse items={hotItems} readItems={readItems} onOpen={openItem} />}
                <Feed
                  items={visibleItems}
                  density={density}
                  readItems={readItems}
                  savedIds={savedIds}
                  processedItems={processedItems}
                  onOpen={(item) => { setPanelTab("reader"); setAskOpen(false); openItem(item); }}
                  onAsk={openAsk}
                  onToggleRead={toggleRead}
                  onToggleSaved={toggleSaved}
                  onToggleProcessed={toggleProcessed}
                />
                {items.length < feedTotal && (
                  <div className="load-more">
                    <button className="primary" onClick={() => { appendNextRouteLoad.current = true; updateFeedRoute({ pageNumber: feedPage + 1 }); }} disabled={loading}>
                      {loading ? "加载中..." : `加载更多 ${items.length}/${feedTotal}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </AppShell>
      {(activeItem || askOpen) && (
        <EditorialReadingWorkspace
          item={activeItem}
          relatedItems={activeRelatedItems}
          initialTab={panelTab}
          saved={Boolean(activeItem && savedIds.has(activeItem.id))}
          processed={Boolean(activeItem && processedItems.has(activeItem.id))}
          onClose={closeWorkspace}
          onRead={markRead}
          onOpenRelated={(item) => readerFromStoryPage ? openStoryItem(item) : openItem(item, activeRelatedItems)}
          onToggleSaved={toggleSaved}
          onToggleProcessed={toggleProcessed}
        />
      )}
      {showBookmarkGuide && <BookmarkGuide onClose={() => setShowBookmarkGuide(false)} />}
    </>
  );
}

function AgentPage() {
  const origin = window.location.origin;
  const endpoints = [
    ["精选动态", "/api/public/items?mode=selected&take=20"],
    ["全部动态", "/api/public/items?mode=all&take=50"],
    ["关键词搜索", "/api/public/items?mode=all&q=OpenAI"],
    ["日报", "/api/public/daily"],
    ["历史日报", "/api/public/dailies?take=7"],
    ["问白泽", "/api/public/ask"],
    ["RSS", "/feed.xml"],
    ["OpenAPI", "/openapi.json"],
    ["Skill", "/aihot-skill/SKILL.md"],
  ];
  return (
    <section>
      <header className="page-head compact-head">
        <div>
          <h1>Agent 接入</h1>
          <p>给 Codex、Claude Code、Cursor、RSS 阅读器和自动化工作流使用的公开接口。不需要令牌。</p>
        </div>
      </header>
      <div className="agent-grid">
        {[
          ["Skill", "适合 Codex、Claude Code、Cursor 等 Agent 直接安装使用", "/aihot-skill/SKILL.md"],
          ["RSS", "适合阅读器、自动化和低频轮询", "/feed.xml"],
          ["REST API", "适合程序化搜索、日报和分类查询", "/openapi.json"],
        ].map(([label, desc, path]) => (
          <a className="agent-card" href={path} key={path} target="_blank" rel="noreferrer">
            <strong>{label}</strong>
            <p>{desc}</p>
            <code>{origin}{path}</code>
          </a>
        ))}
      </div>
      <section className="agent-panel">
        <h2>常用端点</h2>
        <div className="intent-table">
          {endpoints.map(([label, path]) => (
            <a href={path} key={path} target="_blank" rel="noreferrer">
              <span>{label}</span>
              <code>{path}</code>
            </a>
          ))}
        </div>
      </section>
      <section className="agent-panel">
        <h2>触发示例</h2>
        <div className="prompt-grid">
          {["今天 AI 圈有什么新东西", "最近 OpenAI 有什么发布", "最近一周 AI 论文", "AI 圈昨天发生了什么", "给我中文 AI 选题热点"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>
      <section className="agent-panel">
        <h2>安装 Skill</h2>
        <pre>{`帮我安装这个 skill：${origin}/aihot-skill/`}</pre>
        <p>Agent 意图路由：泛问走精选；日报走 daily；完整覆盖走 all；关键词走 q；论文走 category=research；中文爆文走 mode=mp。</p>
      </section>
    </section>
  );
}

function DailyHeader({ daily }: { daily: DailyDigest }) {
  const storyCount = daily.sections.reduce((sum, section) => sum + section.items.length, 0);
  const date = new Date(daily.generatedAt);
  const vol = date.toISOString().slice(0, 10).replace(/-/g, ".");
  return (
    <section className="daily-card">
      <div>
        <span>VOL.{vol} · {storyCount} STORIES · AI BAIZE DAILY</span>
        <h2>{daily.headline}</h2>
        <p>{daily.summary}</p>
      </div>
    </section>
  );
}

function DailySections({ daily }: { daily: DailyDigest }) {
  return (
    <section className="daily-sections">
      {daily.sections.map((section) => (
        <div className="daily-section" key={section.key}>
          <div className="daily-section-head">
            <div>
              <span>{String(daily.sections.indexOf(section) + 1).padStart(2, "0")}</span>
              <h2>{section.title}</h2>
              <p>{sectionSubtitles[section.key] || "AI Signals"}</p>
            </div>
            <b>{section.items.length} 条</b>
          </div>
          <div className="daily-mini-list">
            {section.items.map((item) => (
            <a className="daily-mini-card" href={item.url} key={item.id} rel="noreferrer" target="_blank">
                <span>{item.channelLabel || "资讯"} · {item.sourceName} · {item.score}</span>
                <strong>{item.title}</strong>
                <EditorialBrief item={item} />
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function formatIssueDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { vol: "LATEST", month: "最新", day: "", archiveDay: "", zh: "今日", weekday: "" };
  const digits = "〇一二三四五六七八九";
  const toChineseNumber = (num: number) => {
    if (num <= 10) return num === 10 ? "十" : digits[num];
    if (num < 20) return `十${digits[num % 10]}`;
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ""}`;
  };
  const zhYear = String(date.getFullYear()).split("").map((item) => digits[Number(item)]).join("");
  const zhMonth = `${toChineseNumber(date.getMonth() + 1)}月`;
  const zhDay = `${toChineseNumber(date.getDate())}日`;
  return {
    vol: date.toISOString().slice(0, 10).replace(/-/g, "."),
    month: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`,
    day: zhDay,
    archiveDay: `${date.getDate()}日`,
    zh: `${zhYear}年${zhMonth}${zhDay}`,
    weekday: date.toLocaleDateString("zh-CN", { weekday: "long" }),
  };
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA");
}

function dailyIdentity(daily: DailyDigest) {
  return daily.id || daily.issueKey || daily.generatedAt;
}

function sourceBadge(item: Item) {
  if (item.category === "education") return "教育";
  if (item.category === "culture") return "文化";
  if (item.sourceKind === "paper" || item.category === "research") return "研究";
  if (item.sourceKind === "repo" || item.category === "opensource") return "开源";
  if (item.channel === "first_party") return "官方";
  if (item.channel === "social") return "社区";
  return "资讯";
}

function buildHotItems(items: Item[]) {
  const now = Date.now();
  return [...items]
    .filter((item) => {
      const ageHours = (now - new Date(item.publishedAt || 0).getTime()) / 36e5;
      return Number.isFinite(ageHours) && ageHours <= 72;
    })
    .sort((a, b) => {
      const aFresh = Math.max(0, 72 - (now - new Date(a.publishedAt || 0).getTime()) / 36e5);
      const bFresh = Math.max(0, 72 - (now - new Date(b.publishedAt || 0).getTime()) / 36e5);
      const aHeat = (a.score || 0) * 1.6 + (a.related?.count || 0) * 8 + aFresh + (a.pinned ? 30 : 0);
      const bHeat = (b.score || 0) * 1.6 + (b.related?.count || 0) * 8 + bFresh + (b.pinned ? 30 : 0);
      return bHeat - aHeat;
    })
    .slice(0, 4);
}

function HotPulse({ items, readItems, onOpen }: { items: Item[]; readItems: Set<string>; onOpen: (item: Item) => void }) {
  return (
    <section className="hot-pulse" aria-label="当前热点">
      <div className="hot-pulse-head">
        <div>
          <span>当前热点</span>
          <strong>{items.length} 条值得先看</strong>
        </div>
        <small>综合分数、时效与关联讨论排序</small>
      </div>
      <div className="hot-pulse-list">
        {items.map((item, index) => (
          <a className={readItems.has(item.id) ? "read" : ""} href={item.url} key={item.id} rel="noreferrer" target="_self" onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpen(item); }}>
            <b>{index + 1}</b>
            <span>
              <strong>{item.title}</strong>
              <small>{item.sourceName} · {formatTime(item.publishedAt)} · {item.related?.count ? `关联 ${item.related.count} 条` : item.categoryLabel || "行业动态"}</small>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function ReadingWorkspace({
  item,
  initialTab,
  saved,
  processed,
  onClose,
  onRead,
  onToggleSaved,
  onToggleProcessed,
}: {
  item: Item | null;
  initialTab: "reader" | "ask";
  saved: boolean;
  processed: boolean;
  onClose: () => void;
  onRead: (id: string) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"reader" | "ask">(initialTab);
  useEffect(() => setTab(initialTab), [initialTab, item?.id]);
  const shareText = item ? `${item.title}\n${item.summary || item.reason || ""}\n${item.url}` : "";

  const copyItem = async () => {
    if (!item) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, text: item.summary || item.reason, url: item.url });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const openOriginal = () => {
    if (!item) return;
    onRead(item.id);
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="quick-view-backdrop" role="presentation" onClick={onClose}>
      <article className="quick-view reading-workspace" role="dialog" aria-modal="true" aria-label="阅读工作台" onClick={(event) => event.stopPropagation()}>
        <div className="quick-view-grabber">
          <ChevronDown size={18} />
        </div>
        <header className="workspace-head">
          <div className="workspace-tabs" role="tablist">
            <button className={tab === "reader" ? "active" : ""} type="button" onClick={() => setTab("reader")} disabled={!item}>
              <BookOpen size={15} />
              阅读
            </button>
            <button className={tab === "ask" ? "active" : ""} type="button" onClick={() => setTab("ask")}>
              <MessageSquareText size={15} />
              问白泽
            </button>
          </div>
          <button className="quick-icon" type="button" onClick={onClose} aria-label="关闭速览">
            <X size={18} />
          </button>
        </header>
        {tab === "reader" && item ? (
          <>
            <div className="workspace-scroll">
              <header className="quick-view-head">
                <div>
                  <span>{item.sourceName} · {formatTime(item.publishedAt)}</span>
                  <h2>{item.title}</h2>
                </div>
              </header>
              <div className="quick-meta">
                <span>{item.categoryLabel || "行业动态"}</span>
                <span>{item.channelLabel || "资讯聚合"}</span>
                <strong>{item.score}</strong>
              </div>
              <EditorialBrief item={item} />
              <div className="quick-reason">
                <span>推荐理由</span>
                <p>{item.reason}</p>
              </div>
              {item.related && item.related.count > 1 && (
                <div className="quick-related">
                  <span>关联讨论</span>
                  <p>{item.related.count} 条 · {item.related.sources.slice(0, 5).join(" / ")}</p>
                </div>
              )}
              <div className="quick-tags">
                {item.tags?.slice(0, 8).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <footer className="quick-actions workspace-actions">
              <button className="primary" type="button" onClick={openOriginal}>
                阅读原文
                <ArrowUpRight size={16} />
              </button>
              <button className={saved ? "quick-copy active" : "quick-copy"} type="button" onClick={() => onToggleSaved(item)}>
                <Bookmark size={16} />
                {saved ? "已收藏" : "稍后读"}
              </button>
              <button className={processed ? "quick-copy active" : "quick-copy"} type="button" onClick={() => onToggleProcessed(item.id)}>
                <CheckCircle2 size={16} />
                {processed ? "已处理" : "标记处理"}
              </button>
              <button className="quick-copy icon-only" type="button" onClick={copyItem} title="分享">
                <Copy size={16} />
                {copied ? "已复制" : "分享"}
              </button>
            </footer>
          </>
        ) : (
          <AskBaize item={item} />
        )}
      </article>
    </div>
  );
}

function AskBaize({ item }: { item: Item | null }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const commands = [
    ["brief", "一句话摘要"],
    ["compare", "多来源比较"],
    ["timeline", "事件时间线"],
    ["impact", "影响判断"],
    ["sources", "查看信源"],
    ["next", "下一篇"],
  ];

  const ask = async (command = "") => {
    const prompt = question.trim() || (item ? `分析 ${item.title}` : "最近最值得关注的 AI 变化");
    setLoading(true);
    setError("");
    try {
      const next = await api<AskResult>("/api/public/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: prompt, command, itemId: item?.id || "" }),
      });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "问答失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ask-baize">
      <div className="ask-context">
        <Sparkles size={18} />
        <div>
          <strong>问白泽</strong>
          <span>{item ? `正在分析：${item.title}` : "基于 AI.BAIZE 精选库回答，并附原始信源"}</span>
        </div>
      </div>
      <div className="ask-commands">
        {commands.map(([key, label]) => (
          <button key={key} type="button" onClick={() => ask(key)} disabled={loading}>
            {label}
          </button>
        ))}
      </div>
      <label className="ask-input">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") ask();
          }}
          placeholder="例如：比较各家对这次模型发布的判断"
        />
        <button type="button" onClick={() => ask()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <MessageSquareText size={16} />}
          提问
        </button>
      </label>
      {error && <div className="notice error">{error}</div>}
      {result && (
        <div className="ask-result">
          <div className="ask-answer">
            {result.answer.split("\n").map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
          <div className="ask-citations">
            <span>引用信源</span>
            {result.citations.map((citation) => (
              <a href={citation.url} key={`${citation.id}-${citation.index}`} target="_blank" rel="noreferrer">
                <b>{citation.index}</b>
                <span>
                  <strong>{citation.title}</strong>
                  <small>{citation.sourceType} · {citation.sourceName} · {formatTime(citation.publishedAt)}</small>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DailyMagazine({ daily, archive }: { daily: DailyDigest; archive: DailyDigest[] }) {
  const [showAllArchive, setShowAllArchive] = useState(false);
  const [activeDaily, setActiveDaily] = useState(daily);
  useEffect(() => setActiveDaily(daily), [daily.generatedAt]);
  const issue = formatIssueDate(activeDaily.generatedAt);
  const storyCount = activeDaily.sections.reduce((sum, section) => sum + section.items.length, 0);
  const savedArchive = archive.length ? archive : [];
  const archiveWithoutCurrentVirtual = daily.fromSnapshot
    ? savedArchive
    : savedArchive.filter((item) => !(item.virtual && localDateKey(item.generatedAt) === localDateKey(daily.generatedAt)));
  const fullArchive = archiveWithoutCurrentVirtual.some((item) => dailyIdentity(item) === dailyIdentity(daily))
    ? archiveWithoutCurrentVirtual
    : [daily, ...archiveWithoutCurrentVirtual];
  const archiveList = showAllArchive ? fullArchive : fullArchive.slice(0, 8);
  const currentMonth = formatIssueDate(daily.generatedAt).month;
  return (
    <section className="daily-magazine">
      <aside className="daily-archive" aria-label="日报期刊">
        <button className={dailyIdentity(activeDaily) === dailyIdentity(daily) ? "daily-latest active" : "daily-latest"} type="button" onClick={() => setActiveDaily(daily)}>
          <b>最新一期 · {daily.issueLabel || "分时快报"}</b>
          <span>{localDateKey(daily.generatedAt)} {daily.issueTime || formatIssueDate(daily.generatedAt).weekday}</span>
        </button>
        <div className="daily-month-head">
          <span>{currentMonth}</span>
          <b>{archiveList.length}</b>
        </div>
        <div className="daily-archive-list">
          {archiveList.map((issueItem, index) => {
            const itemDate = formatIssueDate(issueItem.generatedAt);
            const title = issueItem.sections?.[0]?.items?.[0]?.title || issueItem.headline || "AI 日报";
            const isActive = dailyIdentity(issueItem) === dailyIdentity(activeDaily);
            return (
              <button className={isActive ? "active" : ""} key={dailyIdentity(issueItem)} onClick={() => setActiveDaily(issueItem)}>
                <span>
                  {itemDate.archiveDay}
                  <small>{issueItem.issueTime || ""}</small>
                </span>
                <b><em>{issueItem.issueLabel || "日报"}</em>{title}</b>
              </button>
            );
          })}
        </div>
        <button className="daily-all-link" type="button" onClick={() => setShowAllArchive((value) => !value)}>
          {showAllArchive ? "收起日报 ↑" : "全部日报 →"}
        </button>
      </aside>

      <article className="daily-paper">
        <div className="daily-kicker">
          <i />
          <span>VOL.{issue.vol} · {storyCount} STORIES · AI BAIZE DAILY</span>
        </div>
        <header className="daily-paper-hero">
          <h2>
            <span>AI</span><em>BAIZE</em> 日报
          </h2>
          <div className="daily-date-line">
            <span>{issue.zh}</span>
            <b>{issue.weekday}</b>
            <i />
            <small>{activeDaily.issueLabel || "分时快报"} · {activeDaily.issueTime || "实时"} 更新</small>
          </div>
          {(activeDaily.excludedFromEarlierToday || 0) > 0 && (
            <div className="daily-increment">
              本期新增 {storyCount} 条，已排除今日早前报道 {activeDaily.excludedFromEarlierToday} 条
            </div>
          )}
          <div className="daily-editorial-note">
            <span>主编判断</span>
            <p>{activeDaily.summary}</p>
          </div>
        </header>

        <div className="daily-story-sections">
          {activeDaily.sections.map((section, index) => (
            <section className="daily-story-section" key={section.key || section.title}>
              <div className="daily-story-head">
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{section.title}</h3>
                  <small>{sectionSubtitles[section.key] || "AI Signals"}</small>
                </div>
                <b>{section.items.length} 篇</b>
              </div>
              <div className="daily-story-list">
                {section.items.map((item) => (
                  <a className="daily-story-card" href={item.url} key={item.id} rel="noreferrer" target="_blank">
                    <h4>{item.title}</h4>
                    <div>
                      <span className="source-badge">{sourceBadge(item)}</span>
                      <span>{item.sourceName}</span>
                      {item.author && <span>{item.author}</span>}
                    </div>
                    <EditorialBrief item={item} />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}

function MpTable({ mp }: { mp: MpDigest }) {
  const [range, setRange] = useState("24h");
  const [accountType, setAccountType] = useState("all");
  const [trend, setTrend] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const now = Date.now();
  const rangeItems = mp.items.filter((item) => {
    if (range === "all") return true;
    const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 24 * 365;
    return now - new Date(item.publishedAt).getTime() <= hours * 36e5;
  });
  const typeGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; count: number }>();
    for (const item of rangeItems) {
      const key = item.mpMeta?.accountType || "aggregator";
      const label = item.mpMeta?.accountLabel || "聚合线索";
      const group = groups.get(key) || { key, label, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [rangeItems]);
  const trendGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; count: number }>();
    for (const item of rangeItems) {
      const key = item.mpMeta?.trendKey || "industry";
      const label = item.mpMeta?.trendLabel || "行业动态";
      const group = groups.get(key) || { key, label, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [rangeItems]);
  const filtered = rangeItems.filter((item) => (accountType === "all" || item.mpMeta?.accountType === accountType) && (trend === "all" || item.mpMeta?.trendKey === trend));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section className="mp-panel">
      <div className="mp-status">
        <span>状态：正常</span>
        <span>上次抓取：{formatTime(mp.refreshedAt)}</span>
        <span>下次：约 30 分钟后</span>
        <span>当前范围：{filtered.length} 条</span>
      </div>
      <div className="mp-filters">
        {[
          ["24h", "过去 24h"],
          ["7d", "7 天"],
          ["30d", "30 天"],
          ["1y", "1 年"],
          ["all", "全部"],
        ].map(([key, label]) => (
          <button className={range === key ? "active" : ""} key={key} onClick={() => { setRange(key); setPage(1); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="mp-type-tabs">
        <button className={accountType === "all" ? "active" : ""} onClick={() => { setAccountType("all"); setPage(1); }}>
          全部账号 <b>{rangeItems.length}</b>
        </button>
        {typeGroups.map((group) => (
          <button className={accountType === group.key ? "active" : ""} key={group.key} onClick={() => { setAccountType(group.key); setPage(1); }}>
            {group.label} <b>{group.count}</b>
          </button>
        ))}
      </div>
      <div className="mp-type-tabs">
        <button className={trend === "all" ? "active" : ""} onClick={() => { setTrend("all"); setPage(1); }}>
          全部趋势 <b>{rangeItems.length}</b>
        </button>
        {trendGroups.map((group) => (
          <button className={trend === group.key ? "active" : ""} key={group.key} onClick={() => { setTrend(group.key); setPage(1); }}>
            {group.label} <b>{group.count}</b>
          </button>
        ))}
      </div>
      <div className="mp-note">{mp.note}</div>
      <div className="mp-radar">
        {["强烈关注", "值得跟进", "观察备用"].map((label) => {
          const count = filtered.filter((item) => item.mpMeta?.qualityLabel === label).length;
          return (
            <div key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
            </div>
          );
        })}
      </div>
      <div className="mp-table">
        <div className="mp-row mp-head">
          <span>发文日期</span>
          <span>标题</span>
          <span>账号/类型</span>
          <span>阅读</span>
          <span>点赞</span>
          <span>转发</span>
          <span>异常值</span>
        </div>
        {rows.length === 0 && (
          <div className="mp-empty">当前时间范围暂无爆文，切换到更长时间范围可查看历史内容。</div>
        )}
        {rows.map((item, index) => (
          <a className="mp-row" href={item.url} key={item.id} rel="noreferrer" target="_blank">
            <span>{new Date(item.publishedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</span>
            <strong>
              <i>{(page - 1) * pageSize + index + 1}</i>
              <span className="mp-title-stack">
                <em>{item.mpTitle || item.title}</em>
                {item.mpTitle && item.mpTitle !== item.title && <small>{item.title}</small>}
              </span>
            </strong>
            <span className="mp-source-stack">
              <em>{item.sourceName}</em>
              <small>{item.mpMeta?.accountLabel || "聚合线索"} · {item.mpMeta?.trendLabel || "行业动态"} · {item.mpMeta?.metricLabel || "系统估算"}</small>
            </span>
            <span>{item.mpMetrics?.reads.toLocaleString("zh-CN")}</span>
            <span>{item.mpMetrics?.likes.toLocaleString("zh-CN")}</span>
            <span>{item.mpMetrics?.shares.toLocaleString("zh-CN")}</span>
            <b className={(item.mpMetrics?.abnormal || 0) >= 2 ? "hot" : ""}>{item.mpMetrics?.abnormal.toFixed(2)}x</b>
            {item.mpMeta?.editorNote && <p className="mp-editor-note">{item.mpMeta.editorNote}</p>}
          </a>
        ))}
      </div>
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Feed({
  items,
  density,
  readItems,
  savedIds,
  processedItems,
  onOpen,
  onAsk,
  onToggleRead,
  onToggleSaved,
  onToggleProcessed,
}: {
  items: Item[];
  density: string;
  readItems: Set<string>;
  savedIds: Set<string>;
  processedItems: Set<string>;
  onOpen: (item: Item) => void;
  onAsk: (item: Item) => void;
  onToggleRead: (id: string) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
}) {
  const timelineItems = [...items].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime() || (b.score || 0) - (a.score || 0));
  const groups = timelineItems.reduce<Record<string, { label: string; items: Item[] }>>((acc, item) => {
    const date = new Date(item.publishedAt);
    const key = Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString("en-CA");
    acc[key] = acc[key] || {
      label: Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }),
      items: [],
    };
    acc[key].items.push(item);
    return acc;
  }, {});

  return (
    <section className={`timeline ${density === "compact" ? "compact" : ""}`}>
      {Object.entries(groups).map(([date, group]) => {
        const unread = group.items.filter((item) => !readItems.has(item.id)).length;
        return (
        <div className="timeline-day" key={date}>
          <div className="date-label">
            <span>{group.label}</span>
            <b>{unread ? `${unread} 条未读` : "已读完"}</b>
          </div>
          {group.items.map((item) => {
            const isRead = readItems.has(item.id);
            return (
            <article className={`timeline-item ${isRead ? "read" : ""}`} key={item.id}>
              <time>{new Date(item.publishedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
              <span className="rail" />
              <div className="card">
                <div className="mobile-card-meta">
                  <time>{new Date(item.publishedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                  <span>{item.sourceName} · {item.categoryLabel || "行业动态"}</span>
                </div>
                <div className="card-head">
                  <span>{item.sourceName} · {item.channelLabel || "资讯聚合"} · {item.categoryLabel || "行业动态"}</span>
                  <div>
                    <button className={savedIds.has(item.id) ? "read-toggle active" : "read-toggle"} type="button" onClick={() => onToggleSaved(item)} title={savedIds.has(item.id) ? "移出稍后读" : "加入稍后读"} aria-label={savedIds.has(item.id) ? "移出稍后读" : "加入稍后读"}>
                      <Bookmark size={14} />
                    </button>
                    <button className={processedItems.has(item.id) ? "read-toggle active" : "read-toggle"} type="button" onClick={() => onToggleProcessed(item.id)} title={processedItems.has(item.id) ? "取消已处理" : "标记已处理"} aria-label={processedItems.has(item.id) ? "取消已处理" : "标记已处理"}>
                      <CheckCircle2 size={14} />
                    </button>
                    <button className="read-toggle" type="button" onClick={() => onToggleRead(item.id)} title={isRead ? "标记为未读" : "标记为已读"} aria-label={isRead ? "标记为未读" : "标记为已读"}>
                      {isRead ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    {(item.pinned || item.score >= 60) && <b>精选</b>}
                    <strong className="score-pill">{item.score}</strong>
                  </div>
                </div>
                <a className="title" href={item.url} target="_self" rel="noreferrer" onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpen(item); }}>
                  {item.title}
                </a>
                <EditorialBrief item={item} />
                <MediaPreview item={item} />
                <div className="tags">
                  {item.tags?.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                {item.related && item.related.count > 1 && (
                  <div className="related-line">
                    关联讨论 {item.related.count} 条 · {item.related.sources.slice(0, 3).join(" / ")}
                  </div>
                )}
                <div className="reason">
                  <span>推荐理由：</span>
                  {item.reason}
                </div>
                {item.scoreBreakdown && (
                  <div className="score-grid">
                    {item.scoreBreakdown.map((part) => (
                      <span key={part.key}>
                        {part.label}
                        <b>{part.value}</b>
                      </span>
                    ))}
                  </div>
                )}
                <div className="card-actions">
                  <button className="read read-detail" type="button" onClick={() => onOpen(item)}>
                    站内阅读
                    <ArrowUpRight size={16} />
                  </button>
                  <button className="read ask-detail" type="button" onClick={() => onAsk(item)}>
                    问白泽
                    <MessageSquareText size={15} />
                  </button>
                </div>
              </div>
            </article>
            );
          })}
        </div>
        );
      })}
    </section>
  );
}

function mediaProxyUrl(src = "") {
  if (!src) return "";
  if (src.startsWith(window.location.origin) || src.startsWith("/")) return src;
  return `/api/media?url=${encodeURIComponent(src)}`;
}

function MediaPreview({ item }: { item: Item }) {
  const media = (item.media || []).filter((asset) => asset.url || asset.thumbnail).slice(0, 2);
  if (!media.length) return null;
  return (
    <div className={`media-strip ${media.length > 1 ? "multi" : ""}`}>
      {media.map((asset, index) => {
        const isVideo = /video|mp4|webm|mov/i.test(`${asset.type || ""} ${asset.url || ""}`);
        const src = asset.thumbnail || asset.url || "";
        return (
          <a className="media-tile" href={item.url} key={`${src}-${index}`} target="_blank" rel="noreferrer">
            <img alt={asset.alt || item.title} loading="lazy" src={mediaProxyUrl(src)} />
            {isVideo && <span className="play-mark">▶</span>}
          </a>
        );
      })}
    </div>
  );
}

function EditorialBrief({ item }: { item: Item }) {
  const brief = item.editorialBrief;
  if (!brief?.fact && !brief?.impact && !brief?.scenario) {
    return <p>{item.summary}</p>;
  }
  return (
    <div className="editorial-brief">
      {brief.fact && (
        <p>
          <span>事实摘要</span>
          {brief.fact}
        </p>
      )}
      {brief.impact && (
        <p>
          <span>影响判断</span>
          {brief.impact}
        </p>
      )}
      {brief.scenario && (
        <p>
          <span>场景价值</span>
          {brief.scenario}
        </p>
      )}
    </div>
  );
}

function About({ stats }: { stats: Stats | null }) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState("");
  const submit = async () => {
    await api("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, contact, page: "about" }),
    });
    setMessage("");
    setContact("");
    setSent("反馈已收到。");
  };
  return (
    <section className="page-head solo">
      <div>
        <h1>关于 AI.BAIZE</h1>
        <p>
          这是一个自托管 AI 监控站，免费抓取公开网页、RSS、Hacker News、GitHub、arXiv 和 Dev.to 数据，使用本地规则生成标签、热度分与推荐理由。
          当前服务器已收录 {stats?.total ?? 0} 条可见动态。
        </p>
        <div className="feedback-box">
          <input placeholder="联系方式，可选" value={contact} onChange={(event) => setContact(event.target.value)} />
          <textarea placeholder="反馈、想看的信源或改进建议" value={message} onChange={(event) => setMessage(event.target.value)} />
          <button className="primary" onClick={submit} disabled={!message.trim()}>
            提交反馈
          </button>
          {sent && <span>{sent}</span>}
        </div>
      </div>
    </section>
  );
}

function AdminPanel({ onChanged }: { onChanged: () => void }) {
  const [token, setToken] = useState(localStorage.getItem(adminTokenKey) || "");
  const [state, setState] = useState<ApiState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", url: "", kind: "rss", tier: "custom" });
  const [sourceFilter, setSourceFilter] = useState("preferred");
  const [newMp, setNewMp] = useState({ title: "", url: "", account: "", reads: 0, likes: 0, shares: 0, accountBaseline: 3000 });
  const [threshold, setThreshold] = useState(72);
  const [xSharePercent, setXSharePercent] = useState(20);
  const [cnSourceLimit, setCnSourceLimit] = useState(5);

  const headers = { "content-type": "application/json", "x-admin-token": token };

  const loadAdmin = async () => {
    setMessage("");
    try {
      const next = await api<ApiState>("/api/admin/state", { headers });
      setState(next);
      setThreshold(next.settings.rules?.selectedThreshold || 72);
      setXSharePercent(Math.round(Number(next.settings.rules?.selectedXShare ?? 0.2) * 100));
      setCnSourceLimit(Number(next.settings.rules?.selectedCnSourceLimit || 5));
      localStorage.setItem(adminTokenKey, token);
    } catch {
      setMessage("后台令牌不正确。默认令牌是 aihot-admin，生产环境建议在 systemd 中设置 ADMIN_TOKEN。");
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const result = await api<{ fetched: number; total: number; errors: unknown[] }>("/api/admin/refresh", { method: "POST", headers });
      setMessage(`抓取完成：新增/更新 ${result.fetched} 条，库存 ${result.total} 条，错误 ${result.errors.length} 个。`);
      await loadAdmin();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const patchItem = async (id: string, patch: Partial<Item>) => {
    await api(`/api/admin/items/${id}`, { method: "PUT", headers, body: JSON.stringify(patch) });
    await loadAdmin();
    onChanged();
  };

  const deleteItem = async (id: string) => {
    await api(`/api/admin/items/${id}`, { method: "DELETE", headers });
    await loadAdmin();
    onChanged();
  };

  const addSource = async () => {
    await api("/api/admin/sources", { method: "POST", headers, body: JSON.stringify(newSource) });
    setNewSource({ name: "", url: "", kind: "rss", tier: "custom" });
    await loadAdmin();
  };

  const patchSource = async (id: string, patch: Record<string, unknown>) => {
    await api(`/api/admin/sources/${id}`, { method: "PUT", headers, body: JSON.stringify(patch) });
    await loadAdmin();
  };

  const deleteSource = async (id: string) => {
    await api(`/api/admin/sources/${id}`, { method: "DELETE", headers });
    await loadAdmin();
  };

  const saveRules = async () => {
    await api("/api/admin/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        rules: {
          selectedThreshold: threshold,
          selectedXShare: Math.max(0, Math.min(0.5, xSharePercent / 100)),
          selectedCnSourceLimit: Math.max(1, Math.min(12, cnSourceLimit)),
        },
      }),
    });
    setMessage("规则已保存。");
    await loadAdmin();
    onChanged();
  };

  const generateDaily = async () => {
    const digest = await api<{ headline: string }>("/api/admin/daily", { method: "POST", headers });
    setMessage(`日报已生成：${digest.headline}`);
    await loadAdmin();
  };

  const closeFeedback = async (id: string) => {
    await api(`/api/admin/feedback/${id}`, { method: "PUT", headers, body: JSON.stringify({ status: "closed" }) });
    await loadAdmin();
  };

  const seedMp = async () => {
    const result = await api<{ added: number }>("/api/admin/mp/seed", { method: "POST", headers });
    setMessage(`已从中文内容导入 ${result.added} 条公众号种子。`);
    await loadAdmin();
  };

  const addMpArticle = async () => {
    await api("/api/admin/mp/articles", { method: "POST", headers, body: JSON.stringify(newMp) });
    setNewMp({ title: "", url: "", account: "", reads: 0, likes: 0, shares: 0, accountBaseline: 3000 });
    await loadAdmin();
    onChanged();
  };

  const patchMpArticle = async (id: string, patch: Partial<MpArticle>) => {
    await api(`/api/admin/mp/articles/${id}`, { method: "PUT", headers, body: JSON.stringify(patch) });
    await loadAdmin();
    onChanged();
  };

  const deleteMpArticle = async (id: string) => {
    await api(`/api/admin/mp/articles/${id}`, { method: "DELETE", headers });
    await loadAdmin();
    onChanged();
  };

  useEffect(() => {
    if (token) loadAdmin();
  }, []);

  const sourceBucket = (source: ApiState["sources"][number]) => {
    if (source.health && !source.health.ok) return "failed";
    if ((source.noisePenalty || 0) >= 10 || source.priorityTier === "community_fallback") return "lowered";
    if (source.preferred) return "preferred";
    return "normal";
  };
  const sourceFilterOptions = [
    { key: "preferred", label: "首选信源" },
    { key: "normal", label: "普通信源" },
    { key: "lowered", label: "降权源" },
    { key: "failed", label: "失败源" },
    { key: "all", label: "全部" },
  ];
  const visibleSources = (state?.sources || []).filter((source) => sourceFilter === "all" || sourceBucket(source) === sourceFilter);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>后台管理</h1>
          <p>管理抓取源、刷新任务、精选状态和隐藏内容。</p>
        </div>
        <button className="icon-action" onClick={loadAdmin} title="加载后台">
          <RefreshCw size={18} />
        </button>
      </header>

      <div className="admin-login">
        <Lock size={18} />
        <input placeholder="后台令牌" value={token} onChange={(event) => setToken(event.target.value)} />
        <button className="primary" onClick={loadAdmin}>
          进入
        </button>
        <button className="primary" onClick={refresh} disabled={!state || busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          立即抓取
        </button>
      </div>

      {message && <div className="notice">{message}</div>}

      {state && (
        <>
          <section className="admin-section">
            <h2>运营动作</h2>
            <div className="ops-grid">
              <div className="ops-card">
                <strong>精选阈值</strong>
                <input type="number" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                <button className="primary" onClick={saveRules}>保存规则</button>
              </div>
              <div className="ops-card">
                <strong>X 保底比例</strong>
                <input type="number" value={xSharePercent} min={0} max={50} onChange={(event) => setXSharePercent(Number(event.target.value))} />
                <span>精选列表优先为 preferred_x 留位</span>
                <button className="primary" onClick={saveRules}>保存规则</button>
              </div>
              <div className="ops-card">
                <strong>中文单源上限</strong>
                <input type="number" value={cnSourceLimit} min={1} max={12} onChange={(event) => setCnSourceLimit(Number(event.target.value))} />
                <span>限制 IT之家等单个中文媒体连续占位</span>
                <button className="primary" onClick={saveRules}>保存规则</button>
              </div>
              <div className="ops-card">
                <strong>日报生成</strong>
                <span>把当前库存内容固化成一份日报记录</span>
                <button className="primary" onClick={generateDaily}>生成日报</button>
              </div>
            </div>
          </section>

          <section className="admin-section">
            <h2>数据源</h2>
            <div className="source-form">
              <input placeholder="名称" value={newSource.name} onChange={(event) => setNewSource({ ...newSource, name: event.target.value })} />
              <input placeholder="URL" value={newSource.url} onChange={(event) => setNewSource({ ...newSource, url: event.target.value })} />
              <select value={newSource.kind} onChange={(event) => setNewSource({ ...newSource, kind: event.target.value })}>
                <option value="rss">RSS</option>
                <option value="web_list">网页列表</option>
                <option value="hn">Hacker News</option>
                <option value="github">GitHub</option>
                <option value="arxiv">arXiv</option>
                <option value="devto">Dev.to</option>
              </select>
              <select value={newSource.tier} onChange={(event) => setNewSource({ ...newSource, tier: event.target.value })}>
                <option value="custom">自定义</option>
                <option value="first_party">一手信源</option>
                <option value="expert">专家 RSS</option>
                <option value="cn_media">中文媒体</option>
                <option value="media">媒体</option>
                <option value="community">社区</option>
                <option value="research">研究</option>
              </select>
              <button className="primary" onClick={addSource} disabled={!newSource.url}>新增</button>
            </div>
            <div className="filter-row">
              {sourceFilterOptions.map((option) => (
                <button className={sourceFilter === option.key ? "active" : ""} key={option.key} type="button" onClick={() => setSourceFilter(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="source-grid">
              {visibleSources.map((source) => (
                <div className="source-card" key={source.id}>
                  <strong>{source.name}</strong>
                  <span>{source.kind} · {source.priorityTier || source.tier || "default"} · {source.preferred ? "首选" : sourceBucket(source) === "lowered" ? "降权" : "普通"}</span>
                  <p>{source.url}</p>
                  <b>{source.enabled ? "启用" : "停用"} · {source.health ? (source.health.ok ? `正常 ${source.health.count} 条` : `失败 ${source.health.message}`) : "未检查"}</b>
                  {source.health && <small>{formatTime(source.health.checkedAt)} · {source.health.durationMs}ms · {source.health.attempts} 次</small>}
                  {source.kind === "x_profiles" && (
                    <small>账号 {source.maxHandles || 28} 个 · 单账号尝试 {source.perHandleMaxAttempts || 3} 次 · mirror {source.mirrorTimeoutMs || 2500}ms</small>
                  )}
                  <div className="source-actions">
                    <button onClick={() => patchSource(source.id, { enabled: !source.enabled })}>{source.enabled ? "停用" : "启用"}</button>
                    <button onClick={() => deleteSource(source.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>抓取日志</h2>
            <div className="run-list">
              {state.runs.slice(0, 12).map((run) => (
                <div className="run-item" key={run.at}>
                  <strong>{formatTime(run.at)} · {run.fetched} 条 · 库存 {run.total}</strong>
                  <span>{run.errors.length ? run.errors.map((error) => `${error.source}: ${error.message}`).join("；") : "无错误"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>公众号爆文池</h2>
            <div className="source-form mp-form">
              <input placeholder="标题" value={newMp.title} onChange={(event) => setNewMp({ ...newMp, title: event.target.value })} />
              <input placeholder="链接" value={newMp.url} onChange={(event) => setNewMp({ ...newMp, url: event.target.value })} />
              <input placeholder="账号" value={newMp.account} onChange={(event) => setNewMp({ ...newMp, account: event.target.value })} />
              <input type="number" placeholder="阅读" value={newMp.reads} onChange={(event) => setNewMp({ ...newMp, reads: Number(event.target.value) })} />
              <button className="primary" onClick={addMpArticle} disabled={!newMp.title || !newMp.url}>新增</button>
              <button className="primary" onClick={seedMp}>导入种子</button>
            </div>
            <div className="admin-list">
              {(state.mpArticles || []).slice(0, 80).map((article) => (
                <div className="mp-admin-item" key={article.id}>
                  <div>
                    <strong>{article.title}</strong>
                    <span>{article.account} · {formatTime(article.publishedAt)}</span>
                    <small>{article.reads > 0 ? "后台补录/真实阅读" : "后台补录/估算阅读"} · 基准 {article.accountBaseline || 3000}</small>
                  </div>
                  <input type="number" value={article.reads || 0} onChange={(event) => patchMpArticle(article.id, { reads: Number(event.target.value) })} />
                  <input type="number" value={article.likes || 0} onChange={(event) => patchMpArticle(article.id, { likes: Number(event.target.value) })} />
                  <input type="number" value={article.shares || 0} onChange={(event) => patchMpArticle(article.id, { shares: Number(event.target.value) })} />
                  <button onClick={() => deleteMpArticle(article.id)}>删除</button>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>反馈管理</h2>
            <div className="run-list">
              {(state.feedback || []).slice(0, 30).map((item) => (
                <div className="run-item" key={item.id}>
                  <strong>{item.status} · {formatTime(item.createdAt)} · {item.contact || "匿名"}</strong>
                  <span>{item.message}</span>
                  {item.status !== "closed" && <button onClick={() => closeFeedback(item.id)}>关闭</button>}
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>日报记录</h2>
            <div className="run-list">
              {(state.dailyDigests || []).slice(0, 12).map((digest) => (
                <div className="run-item" key={digest.id}>
                  <strong>{digest.headline}</strong>
                  <span>{formatTime(digest.generatedAt)} · {digest.sections.map((section) => `${section.title} ${section.items.length}`).join(" / ")}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>事件聚合</h2>
            <div className="cluster-list">
              {(state.clusters || []).slice(0, 20).map((cluster) => (
                <div className="cluster-item" key={cluster.id}>
                  <strong>{cluster.title}</strong>
                  <span>{cluster.size} 条相关内容 · {cluster.sources.join(" / ")} · 最高分 {cluster.topScore}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>内容管理</h2>
            <div className="admin-list">
              {state.items.slice(0, 80).map((item) => (
                <div className="admin-item" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.sourceName} · {item.score} · {formatTime(item.publishedAt)}
                    </span>
                  </div>
                  <button title="精选" onClick={() => patchItem(item.id, { pinned: !item.pinned })}>
                    {item.pinned ? <Star fill="currentColor" size={17} /> : <Star size={17} />}
                  </button>
                  <button title="隐藏" onClick={() => patchItem(item.id, { hidden: !item.hidden })}>
                    {item.hidden ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                  <button title="删除" onClick={() => deleteItem(item.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
