import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Flame,
  GraduationCap,
  Heart,
  ListFilter,
  Loader2,
  Lock,
  Menu,
  Monitor,
  MessageCircle,
  Moon,
  Palette,
  RefreshCw,
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
import "./styles.css";

type Item = {
  id: string;
  url: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: string;
  author?: string | null;
  publishedAt: string;
  score: number;
  tags: string[];
  reason: string;
  media?: { url?: string; type?: string; thumbnail?: string; alt?: string }[];
  channel?: string;
  channelLabel?: string;
  category?: string;
  categoryLabel?: string;
  scoreBreakdown?: { key: string; label: string; value: number }[];
  mpMetrics?: { reads: number; likes: number; shares: number; abnormal: number };
  mpTitle?: string;
  mpMeta?: {
    accountType: string;
    accountLabel: string;
    accountWeight: number;
    metricSource: string;
    metricLabel: string;
    titleEdited?: boolean;
    qualityTier?: string;
    qualityLabel?: string;
    qualityRank?: number;
    trendKey?: string;
    trendLabel?: string;
    editorNote?: string;
  };
  related?: { count: number; sources: string[]; topScore: number };
  editorialBrief?: { fact?: string; impact?: string; scenario?: string } | null;
  hidden?: boolean;
  pinned?: boolean;
};

type Stats = {
  total: number;
  selected: number;
  sources: number;
  refreshedAt: string | null;
  tags: { tag: string; count: number }[];
  channels?: { channel: string; count: number }[];
  clusters?: { id: string; title: string; size: number; sources: string[]; topScore: number }[];
  healthySources?: number;
  failingSources?: number;
  runs: { at: string; fetched: number; total: number; errors: { source: string; message: string }[] }[];
};

type ApiState = {
  items: Item[];
  sources: {
    id: string;
    name: string;
    kind: string;
    url: string;
    enabled: boolean;
    tier?: string;
    priorityTier?: string;
    preferred?: boolean;
    noisePenalty?: number;
    health?: { ok: boolean; count: number; attempts: number; durationMs: number; checkedAt: string; message?: string } | null;
  }[];
  clusters?: Stats["clusters"];
  feedback?: { id: string; message: string; contact?: string; page?: string; status: string; createdAt: string }[];
  dailyDigests?: { id: string; headline: string; generatedAt: string; sections: { title: string; items: Item[] }[] }[];
  mpArticles?: MpArticle[];
  runs: Stats["runs"];
  settings: { refreshedAt: string | null; cron: string; rules?: { selectedThreshold: number; selectedCommunityLimit?: number; maxItems: number; rssLimit: number } };
};

type MpArticle = {
  id: string;
  title: string;
  url: string;
  account: string;
  publishedAt: string;
  summary?: string;
  reads: number;
  likes: number;
  shares: number;
  accountBaseline: number;
  original?: boolean;
};

type DailyDigest = {
  id?: string;
  generatedAt: string;
  headline: string;
  summary: string;
  items: Item[];
  sections: { key: string; title: string; items: Item[] }[];
  fromSnapshot?: boolean;
};

type MpDigest = {
  items: Array<Item & Partial<MpArticle> & { account?: string }>;
  groups?: { key: string; label: string; count: number }[];
  trends?: { key: string; label: string; count: number }[];
  tiers?: { key: string; label: string; count: number }[];
  note: string;
  refreshedAt?: string | null;
};

const nav = [
  { key: "selected", label: "精选" },
  { key: "all", label: "全部 AI 动态" },
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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function App() {
  const [mode, setMode] = useState("selected");
  const [themeMode, setThemeMode] = useState(localStorage.getItem("aihot-theme-mode") || "dark");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [activeChannel, setActiveChannel] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [feedPage, setFeedPage] = useState(1);
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

  const load = async (page = 1, append = false) => {
    setLoading(true);
    setError("");
    try {
      const nextStats = await api<Stats>("/api/stats");
      let nextItems: Item[] = [];
      let nextFeedTotal = 0;
      let nextDaily: DailyDigest | null = null;
      let nextDailyArchive: DailyDigest[] = [];
      let nextMp: MpDigest | null = null;
      if (mode === "daily") {
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
      } else {
        const categoryMode = mode === "education" ? "education" : mode === "culture" ? "culture" : "";
        const apiMode = mode === "all" || categoryMode ? "all" : "selected";
        const pageSize = apiMode === "all" ? 120 : 80;
        const feed = await api<{ items: Item[]; total: number; page: number; pageSize: number }>(
          `/api/items?mode=${apiMode}&q=${encodeURIComponent(query)}&tag=${encodeURIComponent(activeTag)}&channel=${encodeURIComponent(mode === "all" ? activeChannel : "")}&category=${encodeURIComponent(categoryMode)}&page=${page}&pageSize=${pageSize}`,
        );
        nextItems = feed.items;
        nextFeedTotal = feed.total;
      }
      setItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setFeedPage(page);
      setFeedTotal(nextFeedTotal);
      setDaily(nextDaily);
      setDailyArchive(nextDailyArchive);
      setMp(nextMp);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, false);
  }, [mode, activeTag, activeChannel]);

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
    <main className="app">
      <header className="mobile-topbar">
        <button className="mobile-menu-button" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="打开导航">
          <Menu size={22} />
        </button>
        <a className="mobile-wordmark" href="#" onClick={(event) => { event.preventDefault(); setMode("selected"); }}>
          AI <span>BAIZE</span>
        </a>
        <button className="mobile-theme-button" type="button" onClick={() => setThemeMode(themeMode === "dark" ? "light" : themeMode === "light" ? "auto" : "dark")} aria-label="切换显示模式">
          {themeMode === "light" ? <Sun size={18} /> : themeMode === "auto" ? <Monitor size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <button className={`mobile-drawer-scrim ${mobileMenuOpen ? "open" : ""}`} type="button" aria-label="关闭导航" onClick={() => setMobileMenuOpen(false)} />
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <button className="drawer-close" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="关闭导航">
          <X size={22} />
        </button>
        <a className="brand" href="#" onClick={() => setMode("selected")}>
          <span>AI</span>
          <i />
          <b>BAIZE</b>
        </a>
        <div className="mobile-utility">
          <a className="mobile-icp" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">粤ICP备2026046158号-2</a>
          <ThemeToggle value={themeMode} onChange={setThemeMode} />
        </div>
        <nav className="side-nav" aria-label="主导航">
          {nav.map((item) => (
            <button className={mode === item.key ? "active" : ""} key={item.key} onClick={() => { setMode(item.key); setMobileMenuOpen(false); }}>
              {item.key === "selected" && <Flame size={18} />}
              {item.key === "all" && <ListFilter size={18} />}
              {item.key === "education" && <GraduationCap size={18} />}
              {item.key === "culture" && <Palette size={18} />}
              {item.key === "daily" && <Database size={18} />}
              {item.key === "mp" && <Sparkles size={18} />}
              {item.key === "agent" && <Monitor size={18} />}
              {item.key === "about" && <Heart size={18} />}
              {item.key === "admin" && <Settings size={18} />}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ThemeToggle value={themeMode} onChange={setThemeMode} />
          <a className="icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            粤ICP备2026046158号-2
          </a>
        </div>
      </aside>

      <section className="main">
        {mode === "admin" ? (
          <AdminPanel onChanged={() => load(1, false)} />
        ) : mode === "agent" ? (
          <AgentPage />
        ) : mode === "about" ? (
          <About stats={stats} />
        ) : (
          <>
            {mode !== "daily" && (
              <>
                <header className="page-head compact-head">
                  <div>
                    <h1>{mode === "all" ? "全部 AI 动态" : mode === "mp" ? "公众号爆文" : mode === "education" ? "AI 教育" : mode === "culture" ? "AI 文化" : "精选"}</h1>
                    <p>{mode === "mp" ? "中文媒体、公众号与国内 AI 动态聚合。" : mode === "education" ? "教育、学习、课堂、教师工具与 EdTech 场景中的 AI 最新动态。" : mode === "culture" ? "文化、艺术、影视、音乐、游戏、版权与创意产业中的 AI 最新动态。" : mode === "all" ? "完整抓取结果，包含精选之外的长尾内容。" : "AI 自动挑选的高价值内容，按热度、时效、来源可信度排序。"}</p>
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
                      onKeyDown={(event) => event.key === "Enter" && load(1, false)}
                    />
                  </label>
                  <button className="primary" onClick={() => load(1, false)}>
                    <Check size={17} />
                    筛选
                  </button>
                </section>
              </>
            )}

            {mode === "all" && <div className="tag-row">
              {
                channelTabs.map((tab) => (
                  <button className={activeChannel === tab.key ? "active" : ""} key={tab.key || "all"} onClick={() => setActiveChannel(tab.key)}>
                    {tab.label}
                    {tab.key && <span>{stats?.channels?.find((item) => item.channel === tab.key)?.count || 0}</span>}
                  </button>
                ))}
            </div>}

            {mode !== "daily" && mode !== "mp" && mode !== "education" && mode !== "culture" && <div className="tag-row">
              <button className={!activeTag ? "active" : ""} onClick={() => setActiveTag("")}>
                全部
              </button>
              {visibleTags.map((tag) => (
                <button className={activeTag === tag.tag ? "active" : ""} key={tag.tag} onClick={() => setActiveTag(tag.tag)}>
                  {tag.tag}
                  <span>{tag.count}</span>
                </button>
              ))}
            </div>}

            {error && <div className="notice error">{error}</div>}
            {loading && <div className="notice">正在加载真实数据...</div>}
            {!loading && items.length === 0 && <div className="notice">暂无数据，可以到后台点击“立即抓取”。</div>}

            {mode === "daily" && daily ? <DailyMagazine daily={daily} archive={dailyArchive} /> : mode === "mp" && mp ? <MpTable mp={mp} /> : (
              <>
                <Feed items={items} />
                {items.length < feedTotal && (
                  <div className="load-more">
                    <button className="primary" onClick={() => load(feedPage + 1, true)} disabled={loading}>
                      {loading ? "加载中..." : `加载更多 ${items.length}/${feedTotal}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
      {showBookmarkGuide && <BookmarkGuide onClose={() => setShowBookmarkGuide(false)} />}
    </main>
  );
}

function BookmarkGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="bookmark-modal" role="dialog" aria-modal="true" aria-label="收藏 AI.BAIZE" onClick={(event) => event.stopPropagation()}>
        <div className="bookmark-modal-head">
          <Smartphone size={20} />
          <strong>收藏 AI.BAIZE</strong>
        </div>
        <p>链接已复制。不同浏览器出于安全限制，不能由网页直接写入书签；你可以按下面方式添加。</p>
        <div className="bookmark-steps">
          <span>iPhone Safari：点击底部分享按钮，然后选择“添加到主屏幕”。</span>
          <span>Android Chrome：点击浏览器菜单，选择“安装应用”或“添加到主屏幕”。</span>
          <span>桌面浏览器：按 <b>⌘D</b> 或 <b>Ctrl+D</b> 加入书签。</span>
        </div>
        <button className="primary" onClick={onClose}>知道了</button>
      </section>
    </div>
  );
}

function ThemeToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [
    { key: "dark", icon: Moon, label: "暗色" },
    { key: "auto", icon: Monitor, label: "跟随系统" },
    { key: "light", icon: Sun, label: "亮色" },
  ];
  return (
    <div className="theme-switch" aria-label="配色方案">
      {options.map((item) => {
        const Icon = item.icon;
        return (
          <button className={value === item.key ? "active" : ""} key={item.key} onClick={() => onChange(item.key)} title={item.label}>
            <Icon size={18} />
          </button>
        );
      })}
    </div>
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

function sourceBadge(item: Item) {
  if (item.category === "education") return "教育";
  if (item.category === "culture") return "文化";
  if (item.sourceKind === "paper" || item.category === "research") return "研究";
  if (item.sourceKind === "repo" || item.category === "opensource") return "开源";
  if (item.channel === "first_party") return "官方";
  if (item.channel === "social") return "社区";
  return "资讯";
}

function DailyMagazine({ daily, archive }: { daily: DailyDigest; archive: DailyDigest[] }) {
  const [showAllArchive, setShowAllArchive] = useState(false);
  const [activeDaily, setActiveDaily] = useState(daily);
  useEffect(() => setActiveDaily(daily), [daily.generatedAt]);
  const issue = formatIssueDate(activeDaily.generatedAt);
  const storyCount = activeDaily.sections.reduce((sum, section) => sum + section.items.length, 0);
  const savedArchive = archive.length ? archive : [];
  const fullArchive = savedArchive.some((item) => localDateKey(item.generatedAt) === localDateKey(daily.generatedAt)) ? savedArchive : [daily, ...savedArchive];
  const archiveList = showAllArchive ? fullArchive : fullArchive.slice(0, 8);
  const currentMonth = formatIssueDate(daily.generatedAt).month;
  return (
    <section className="daily-magazine">
      <aside className="daily-archive" aria-label="日报期刊">
        <button className={localDateKey(activeDaily.generatedAt) === localDateKey(daily.generatedAt) ? "daily-latest active" : "daily-latest"} type="button" onClick={() => setActiveDaily(daily)}>
          <b>最新一期</b>
          <span>{localDateKey(daily.generatedAt)}</span>
        </button>
        <div className="daily-month-head">
          <span>{currentMonth}</span>
          <b>{archiveList.length}</b>
        </div>
        <div className="daily-archive-list">
          {archiveList.map((issueItem, index) => {
            const itemDate = formatIssueDate(issueItem.generatedAt);
            const title = issueItem.sections?.[0]?.items?.[0]?.title || issueItem.headline || "AI 日报";
            const isActive = localDateKey(issueItem.generatedAt) === localDateKey(activeDaily.generatedAt);
            return (
              <button className={isActive ? "active" : ""} key={issueItem.id || issueItem.generatedAt} onClick={() => setActiveDaily(issueItem)}>
                <span>{itemDate.archiveDay}</span>
                <b>{title}</b>
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
            <small>DAILY · 每日八时</small>
          </div>
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

function Feed({ items }: { items: Item[] }) {
  const timelineItems = [...items].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime() || (b.score || 0) - (a.score || 0));
  const groups = timelineItems.reduce<Record<string, Item[]>>((acc, item) => {
    const label = new Date(item.publishedAt).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
    acc[label] = acc[label] || [];
    acc[label].push(item);
    return acc;
  }, {});

  return (
    <section className="timeline">
      {Object.entries(groups).map(([date, dateItems]) => (
        <div className="timeline-day" key={date}>
          <div className="date-label">{date}</div>
          {dateItems.map((item) => (
            <article className="timeline-item" key={item.id}>
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
                    {(item.pinned || item.score >= 60) && <b>精选</b>}
                    <strong className="score-pill">{item.score}</strong>
                  </div>
                </div>
                <a className="title" href={item.url} target="_blank" rel="noreferrer">
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
                <a className="read" href={item.url} target="_blank" rel="noreferrer">
                  阅读原文
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </article>
          ))}
        </div>
      ))}
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

  const headers = { "content-type": "application/json", "x-admin-token": token };

  const loadAdmin = async () => {
    setMessage("");
    try {
      const next = await api<ApiState>("/api/admin/state", { headers });
      setState(next);
      setThreshold(next.settings.rules?.selectedThreshold || 72);
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
    await api("/api/admin/settings", { method: "PUT", headers, body: JSON.stringify({ rules: { selectedThreshold: threshold } }) });
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

createRoot(document.getElementById("root")!).render(<App />);
