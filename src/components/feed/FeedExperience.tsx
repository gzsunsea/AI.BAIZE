import { useMemo, useState } from "react";
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  List,
  MessageSquareText,
  RefreshCw,
  Rows3,
  Search,
  Settings2,
  Share2,
  Sparkles,
} from "lucide-react";
import type { HotTopic, Item, Stats, TodaySignal } from "../../types";
import { formatDayHeading, groupItemsByLocalDate, shanghaiDateKey, todayIssueSummary, todaySignalLabel, todaySignalSummary } from "../../lib/experience.mts";
import { itemLocation, shouldInterceptLinkClick, storyLocation } from "../../lib/navigation";

const channelTabs = [
  { key: "", label: "全部" },
  { key: "first_party", label: "一手信源" },
  { key: "news", label: "资讯" },
  { key: "social", label: "观点" },
  { key: "community", label: "论文 / 开源" },
];

function formatTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isFinite(diff) && diff < 36e5) return `${Math.max(1, Math.round(diff / 60000))} 分钟前`;
  if (Number.isFinite(diff) && diff < 864e5) return `${Math.round(diff / 36e5)} 小时前`;
  return date.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export type FeedExperienceProps = {
  mode: string;
  items: Item[];
  feedTotal: number;
  stats: Stats | null;
  hotTopics: HotTopic[];
  hotTopicsLoading: boolean;
  hotTopicsError: string;
  todaySignals?: TodaySignal[];
  todaySignalsLoading?: boolean;
  todaySignalsError?: string;
  loading: boolean;
  error: string;
  query: string;
  searchMode: "direct" | "full";
  activeTag: string;
  activeChannel: string;
  statusFilter: string;
  density: string;
  readItems: Set<string>;
  savedIds: Set<string>;
  processedItems: Set<string>;
  shareMessage: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSearchModeChange: (value: "direct" | "full") => void;
  onTagChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDensityChange: (value: string) => void;
  onOpen: (item: Item, relatedItems?: Item[]) => void;
  onOpenStory: (id: string) => void;
  onAsk: (item?: Item) => void;
  onToggleRead: (id: string) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
  onRefresh: () => void;
  onRetryHotTopics: () => void;
  onRetryToday?: () => void;
  onOpenHotPage: () => void;
  onBookmarkSite: () => void;
  onShareSite: () => void;
  onLoadMore: () => void;
  pageTitle?: string;
  pageDescription?: string;
};

function pageCopy(mode: string) {
  if (mode === "all") return { title: "全部 AI 动态", description: "完整公开池，按时间查看进入系统的 AI 信号。" };
  if (mode === "reading") return { title: "稍后读", description: "保存在这台设备上的阅读清单，可继续处理或导出。" };
  return { title: "精选", description: "先看正在形成共识的事件，再进入按时间整理的高价值动态。" };
}

function CurrentSignals({ topics, loading, error, onOpenStory, onRetry, onOpenHotPage }: {
  topics: HotTopic[];
  loading: boolean;
  error: string;
  onOpenStory: (id: string) => void;
  onRetry: () => void;
  onOpenHotPage: () => void;
}) {
  if (loading) return <div className="current-signals-skeleton" aria-label="正在加载当前热点" />;
  if (error) return <div className="signal-error"><span>当前热点暂时不可用，时间线不受影响。</span><button type="button" onClick={onRetry}>重试</button></div>;
  if (topics.length < 2) return null;
  return (
    <section className="current-signals" aria-labelledby="current-signals-title">
      <header>
        <div><span>NOW</span><h2 id="current-signals-title">当前热点</h2></div>
        <p>由独立信源数量、质量与时效共同确认</p><a href="/hot" onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenHotPage(); }}>查看完整热点榜</a>
      </header>
      <div className="current-signal-list">
        {topics.map((topic, index) => (
          <a href={storyLocation(topic.id)} key={topic.id} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenStory(topic.id); }}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span>
              <strong>{topic.title}</strong>
              <small>{topic.sourceCount} 个独立信源 · {topic.sources.slice(0, 3).join(" / ")} · 最新 {formatTime(topic.latestAt)}</small>
              <small>{topic.summary || topic.representative.summary}</small>
            </span>
            <em className={`hot-status ${topic.status}`}>{topic.status === "new" ? "新出现" : "持续发酵"} · 热度 {topic.heat}</em>
          </a>
        ))}
      </div>
    </section>
  );
}

function TodaySignalsPanel({ signals, loading, error, onOpen, onOpenStory, onRetry }: {
  signals: TodaySignal[];
  loading: boolean;
  error: string;
  onOpen: (item: Item, relatedItems?: Item[]) => void;
  onOpenStory: (id: string) => void;
  onRetry?: () => void;
}) {
  if (loading) return <div className="today-signals-skeleton" aria-label="正在加载今日先看" />;
  if (error) return <div className="today-signals-state error"><span>今日先看暂时不可用，完整时间线仍可浏览。</span>{onRetry && <button type="button" onClick={onRetry}>重试</button>}</div>;
  const issue = todayIssueSummary({ items: signals });
  return (
    <section className="today-signals" aria-labelledby="today-signals-title">
      <header>
        <div><span>{issue.issueLabel} · TODAY'S SIGNALS</span><h2 id="today-signals-title">今日先看</h2></div>
        <div className="today-signals-copy"><p>{issue.summary}</p><small>{issue.selectionNote}</small></div>
      </header>
      {signals.length ? (
        <div className="today-signal-list">
          {signals.map((signal, index) => {
            const representative = signal.representative || signal;
            return (
              <article className="today-signal-card" key={signal.id}>
                <a className="today-signal-main" href={itemLocation(representative.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpen(representative, signal.relatedItems); }}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>
                    <strong>{signal.title}</strong>
                    <small><em className={`evidence-badge ${signal.evidenceMeta?.evidenceLevel || "single_source"}`}>{todaySignalLabel(signal)}</em> · {signal.sourceCount} 个信源 · 最新 {formatTime(signal.latestAt || signal.publishedAt)}</small>
                    <span>{todaySignalSummary(signal)}</span>
                  </span>
                </a>
                {signal.sourceCount > 1 && <button type="button" className="today-signal-story" onClick={() => onOpenStory(signal.id)}>查看事件</button>}
              </article>
            );
          })}
        </div>
      ) : <div className="today-signals-state"><strong>{issue.issueLabel}</strong><span>{issue.selectionNote}</span></div>}
    </section>
  );
}

function mediaProxyUrl(src = "") {
  if (!src || src.startsWith("/") || src.startsWith(window.location.origin)) return src;
  return `/api/media?url=${encodeURIComponent(src)}`;
}

function FeedMediaPreview({ item }: { item: Item }) {
  const media = (item.media || []).filter((asset) => asset.url || asset.thumbnail).slice(0, 2);
  if (!media.length) {
    return (
      <div className="feed-card-media single placeholder" aria-label="暂无配图">
        <div><span>暂无配图</span><small>{item.channelLabel || item.categoryLabel || "AI.BAIZE"}</small></div>
      </div>
    );
  }

  return (
    <div className={`feed-card-media ${media.length > 1 ? "multi" : "single"}`}>
      {media.map((asset, index) => {
        const src = asset.thumbnail || asset.url || "";
        const isVideo = /video|mp4|webm|mov/i.test(`${asset.type || ""} ${asset.url || ""}`);
        return (
          <a href={item.url} key={`${src}-${index}`} target="_blank" rel="noreferrer" aria-label={`查看原文图片：${item.title}`}>
            <img alt={asset.alt || item.title} loading="lazy" src={mediaProxyUrl(src)} />
            {isVideo && <span>VIDEO</span>}
          </a>
        );
      })}
    </div>
  );
}

function FeedCard({ item, density, read, saved, processed, onOpen, onAsk, onToggleRead, onToggleSaved, onToggleProcessed }: {
  item: Item;
  density: string;
  read: boolean;
  saved: boolean;
  processed: boolean;
  onOpen: (item: Item) => void;
  onAsk: (item: Item) => void;
  onToggleRead: (id: string) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
}) {
  const brief = item.editorialBrief;
  const recommendation = item.reason || item.summary;
  return (
    <article className={`editorial-feed-card ${density} ${read ? "is-read" : ""}`}>
      <div className="feed-card-meta">
        <span className="source-kind">{item.channelLabel || item.categoryLabel || "资讯"}</span>
        <span>{item.sourceName}</span>
        <time dateTime={item.publishedAt}>{formatTime(item.publishedAt)}</time>
        {read && <span className="state-label"><Eye size={13} />已读</span>}
      </div>
      <a className="feed-card-title" href={itemLocation(item.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpen(item); }}>{item.title}</a>
      {recommendation && <p className="feed-card-recommendation"><Sparkles size={15} />{recommendation}</p>}
      <FeedMediaPreview item={item} />
      {density !== "compact" && brief && (brief.fact || brief.impact || brief.scenario) && (
        <div className="feed-card-brief">
          {brief.fact && <p><span>事实</span>{brief.fact}</p>}
          {brief.impact && <p><span>影响</span>{brief.impact}</p>}
          {brief.scenario && <p><span>场景</span>{brief.scenario}</p>}
        </div>
      )}
      <footer className="feed-card-footer">
        <div className="feed-card-signals">
          <b>{item.score}</b>
          {item.related?.count && item.related.count > 1 ? <span>{item.related.count} 条关联</span> : null}
          {item.tags?.slice(0, density === "compact" ? 1 : 3).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="feed-card-actions">
          <button type="button" onClick={() => onAsk(item)} title="问白泽"><MessageSquareText size={16} /><span>分析</span></button>
          <button className={read ? "active" : ""} type="button" onClick={() => onToggleRead(item.id)} aria-pressed={read} title={read ? "标为未读" : "标为已读"}>{read ? <EyeOff size={16} /> : <Eye size={16} />}<span>{read ? "未读" : "已读"}</span></button>
          <button className={saved ? "active" : ""} type="button" onClick={() => onToggleSaved(item)} aria-pressed={saved} title="稍后读"><Bookmark size={16} /><span>收藏</span></button>
          <button className={processed ? "active" : ""} type="button" onClick={() => onToggleProcessed(item.id)} aria-pressed={processed} title="标记已处理"><CheckCircle2 size={16} /><span>处理</span></button>
          <button type="button" onClick={() => onOpen(item)} title="打开阅读工作台"><ExternalLink size={16} /><span>阅读</span></button>
        </div>
      </footer>
    </article>
  );
}

export function FeedExperience(props: FeedExperienceProps) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const defaultCopy = pageCopy(props.mode);
  const copy = { title: props.pageTitle || defaultCopy.title, description: props.pageDescription || defaultCopy.description };
  const groups = useMemo(() => groupItemsByLocalDate(props.items), [props.items]);
  const todayKey = shanghaiDateKey(new Date());
  const visibleTags = props.stats?.tags.slice(0, 10) || [];
  const toggleDate = (date: string) => {
    if (date === todayKey) return;
    setCollapsedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  return (
    <section className="feed-experience">
      <header className="editorial-page-head">
        <div><span>AI · BAIZE</span><h1>{copy.title}</h1><p>{copy.description}</p></div>
        <div className="page-utilities">
          <small><Clock3 size={14} />更新于 {formatTime(props.stats?.refreshedAt)}</small>
          <button type="button" onClick={props.onBookmarkSite} title="收藏本站"><Bookmark size={17} /></button>
          <button type="button" onClick={props.onShareSite} title="分享本站"><Share2 size={17} /></button>
          <button type="button" onClick={props.onRefresh} title="刷新"><RefreshCw className={props.loading ? "spin" : ""} size={17} /></button>
          <button type="button" onClick={() => props.onAsk()} title="问白泽"><MessageSquareText size={17} /></button>
        </div>
      </header>
      {props.shareMessage && <div className="toast">{props.shareMessage}</div>}

      <section className="feed-toolbar" aria-label="搜索与筛选">
        <label className="editorial-search"><Search size={17} /><input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onSearch()} placeholder="搜索标题、摘要或来源" /></label>
        <button className="search-submit" type="button" onClick={props.onSearch}>搜索</button>
        <details className="display-menu">
          <summary><Settings2 size={17} />显示</summary>
          <div className="display-menu-panel">
            <span>阅读状态</span>
            <div>{[["all", "全部"], ["unread", "未读"], ["saved", "稍后读"], ["processed", "已处理"]].map(([key, label]) => <button className={props.statusFilter === key ? "active" : ""} type="button" key={key} onClick={() => props.onStatusChange(key)}>{label}</button>)}</div>
            <span>信息密度</span>
            <div><button className={props.density === "comfortable" ? "active" : ""} type="button" onClick={() => props.onDensityChange("comfortable")}><Rows3 size={15} />舒展</button><button className={props.density === "compact" ? "active" : ""} type="button" onClick={() => props.onDensityChange("compact")}><List size={15} />紧凑</button></div>
            <small>快捷键：J / K 切换，M 已读，B 收藏</small>
          </div>
        </details>
      </section>
      <div className="search-mode-tabs" role="tablist" aria-label="搜索范围">
        <button type="button" role="tab" aria-selected={props.searchMode === "direct"} className={props.searchMode === "direct" ? "active" : ""} onClick={() => props.onSearchModeChange("direct")}>直接匹配</button>
        <button type="button" role="tab" aria-selected={props.searchMode === "full"} className={props.searchMode === "full" ? "active" : ""} onClick={() => props.onSearchModeChange("full")}>全文相关</button>
      </div>

      {(props.mode === "selected" || props.mode === "all") && (
        <div className="primary-filters">
          {channelTabs.map((tab) => <button className={props.activeChannel === tab.key ? "active" : ""} key={tab.key || "all"} type="button" onClick={() => props.onChannelChange(tab.key)}>{tab.label}{tab.key && <span>{props.stats?.channels?.find((entry) => entry.channel === tab.key)?.count || 0}</span>}</button>)}
        </div>
      )}
      {props.mode !== "reading" && (
        <div className="topic-filters"><button className={!props.activeTag ? "active" : ""} type="button" onClick={() => props.onTagChange("")}>全部主题</button>{visibleTags.map((tag) => <button className={props.activeTag === tag.tag ? "active" : ""} type="button" key={tag.tag} onClick={() => props.onTagChange(tag.tag)}>{tag.tag}<span>{tag.count}</span></button>)}</div>
      )}

      {props.mode === "selected" && props.statusFilter === "all" && <TodaySignalsPanel signals={props.todaySignals || []} loading={Boolean(props.todaySignalsLoading)} error={props.todaySignalsError || ""} onOpen={props.onOpen} onOpenStory={props.onOpenStory} onRetry={props.onRetryToday} />}
      {props.error && <div className="notice error">{props.error}</div>}
      {props.loading && <div className="feed-skeleton" aria-label="正在加载"><i /><i /><i /></div>}
      {!props.loading && groups.length === 0 && <div className="feed-empty"><strong>{props.mode === "reading" ? "稍后读还是空的" : "当前条件没有匹配内容"}</strong><p>{props.mode === "reading" ? "在精选或全部动态里收藏内容后，会出现在这里。" : "可以清除搜索词或切换筛选条件。"}</p></div>}

      {!props.loading && <div className="date-group-list">
        {groups.map((group) => {
          const collapsed = collapsedDates.has(group.date);
          return (
            <section className="feed-date-group" key={group.date}>
              <header className="feed-date-heading">
                <div><span>{formatDayHeading(group.date)}</span><small>{group.date} · {group.items.length} 条</small></div>
                {group.date !== todayKey && <button type="button" onClick={() => toggleDate(group.date)} aria-expanded={!collapsed}><ChevronDown className={collapsed ? "collapsed" : ""} size={17} />{collapsed ? "展开" : "收起"}</button>}
              </header>
              {!collapsed && <div className="editorial-feed-list">{group.items.map((item) => <FeedCard key={item.id} item={item} density={props.density} read={props.readItems.has(item.id)} saved={props.savedIds.has(item.id)} processed={props.processedItems.has(item.id)} onOpen={(value) => props.onOpen(value)} onAsk={props.onAsk} onToggleRead={props.onToggleRead} onToggleSaved={props.onToggleSaved} onToggleProcessed={props.onToggleProcessed} />)}</div>}
            </section>
          );
        })}
      </div>}

      {props.items.length < props.feedTotal && <div className="load-more"><button className="primary" type="button" onClick={props.onLoadMore} disabled={props.loading}>{props.loading ? "加载中" : `加载更多 ${props.items.length}/${props.feedTotal}`}</button></div>}
    </section>
  );
}
