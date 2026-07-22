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
import type { HotTopic, Item, Stats } from "../../types";
import { formatDayHeading, groupItemsByLocalDate, shanghaiDateKey } from "../../lib/experience.mts";

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

type FeedExperienceProps = {
  mode: string;
  items: Item[];
  feedTotal: number;
  stats: Stats | null;
  hotTopics: HotTopic[];
  hotTopicsLoading: boolean;
  hotTopicsError: string;
  loading: boolean;
  error: string;
  query: string;
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
  onTagChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDensityChange: (value: string) => void;
  onOpen: (item: Item, relatedItems?: Item[]) => void;
  onAsk: (item?: Item) => void;
  onToggleRead: (id: string) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
  onRefresh: () => void;
  onRetryHotTopics: () => void;
  onBookmarkSite: () => void;
  onShareSite: () => void;
  onLoadMore: () => void;
};

function pageCopy(mode: string) {
  if (mode === "all") return { title: "全部 AI 动态", description: "完整公开池，按时间查看进入系统的 AI 信号。" };
  if (mode === "reading") return { title: "稍后读", description: "保存在这台设备上的阅读清单，可继续处理或导出。" };
  return { title: "精选", description: "先看正在形成共识的事件，再进入按时间整理的高价值动态。" };
}

function CurrentSignals({ topics, loading, error, onOpen, onRetry }: {
  topics: HotTopic[];
  loading: boolean;
  error: string;
  onOpen: (item: Item, relatedItems?: Item[]) => void;
  onRetry: () => void;
}) {
  if (loading) return <div className="current-signals-skeleton" aria-label="正在加载当前热点" />;
  if (error) return <div className="signal-error"><span>当前热点暂时不可用，时间线不受影响。</span><button type="button" onClick={onRetry}>重试</button></div>;
  if (topics.length < 2) return null;
  return (
    <section className="current-signals" aria-labelledby="current-signals-title">
      <header>
        <div><span>NOW</span><h2 id="current-signals-title">当前热点</h2></div>
        <p>由独立信源数量、质量与时效共同确认</p>
      </header>
      <div className="current-signal-list">
        {topics.map((topic, index) => (
          <button type="button" key={topic.id} onClick={() => onOpen(topic.representative, topic.relatedItems)}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span>
              <strong>{topic.title}</strong>
              <small>{topic.sourceCount} 个独立信源 · {topic.sources.slice(0, 3).join(" / ")} · {formatTime(topic.publishedAt)}</small>
            </span>
            <em>{topic.topScore}</em>
          </button>
        ))}
      </div>
    </section>
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
      <button className="feed-card-title" type="button" onClick={() => onOpen(item)}>{item.title}</button>
      {recommendation && <p className="feed-card-recommendation"><Sparkles size={15} />{recommendation}</p>}
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
  const copy = pageCopy(props.mode);
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

      {(props.mode === "selected" || props.mode === "all") && (
        <div className="primary-filters">
          {channelTabs.map((tab) => <button className={props.activeChannel === tab.key ? "active" : ""} key={tab.key || "all"} type="button" onClick={() => props.onChannelChange(tab.key)}>{tab.label}{tab.key && <span>{props.stats?.channels?.find((entry) => entry.channel === tab.key)?.count || 0}</span>}</button>)}
        </div>
      )}
      {props.mode !== "reading" && (
        <div className="topic-filters"><button className={!props.activeTag ? "active" : ""} type="button" onClick={() => props.onTagChange("")}>全部主题</button>{visibleTags.map((tag) => <button className={props.activeTag === tag.tag ? "active" : ""} type="button" key={tag.tag} onClick={() => props.onTagChange(tag.tag)}>{tag.tag}<span>{tag.count}</span></button>)}</div>
      )}

      {props.mode === "selected" && props.statusFilter === "all" && <CurrentSignals topics={props.hotTopics} loading={props.hotTopicsLoading} error={props.hotTopicsError} onOpen={props.onOpen} onRetry={props.onRetryHotTopics} />}
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
