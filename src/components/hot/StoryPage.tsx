import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import type { Item, StoryDetail } from "../../types";
import { itemLocation, shouldInterceptLinkClick } from "../../lib/navigation";

type StoryPageProps = {
  story: StoryDetail | null;
  loading: boolean;
  error: string;
  notFound: boolean;
  backLabel: string;
  onBack: () => void;
  onOpenItem: (item: Item) => void;
  onRetry: () => void;
};

function formatTime(value?: string) {
  if (!value) return "暂无时间";
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ItemLink({ item, onOpenItem }: { item: Item; onOpenItem: (item: Item) => void }) {
  return <article className="story-item">
    <div><span>{item.sourceName}</span><time dateTime={item.publishedAt}>{formatTime(item.publishedAt)}</time></div>
    <a className="story-item-title" href={itemLocation(item.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenItem(item); }}>{item.title}</a>
    {(item.summary || item.reason) && <p>{item.summary || item.reason}</p>}
    <a href={item.url} target="_blank" rel="noreferrer">查看原文 <ArrowUpRight size={14} /></a>
  </article>;
}

export function StoryPage({ story, loading, error, notFound, backLabel, onBack, onOpenItem, onRetry }: StoryPageProps) {
  if (loading) return <section className="story-page story-loading" aria-live="polite">正在加载事件详情…</section>;
  if (!story) return <section className="story-page story-missing" aria-live="polite"><button className="story-back" type="button" onClick={onBack}><ArrowLeft size={16} />{backLabel}</button><strong>{notFound ? "404：未找到这个热点事件" : "该事件暂时不可用"}</strong><p>{notFound ? "这个链接可能已过期，或事件尚未达到展示条件。" : error || "故事详情加载失败。"}</p>{!notFound && <button className="primary" type="button" onClick={onRetry}><RefreshCw size={16} />重试</button>}</section>;

  const representative = story.event.representative;
  return <article className="story-page" aria-labelledby="story-page-title">
    <button className="story-back" type="button" onClick={onBack}><ArrowLeft size={16} />{backLabel}</button>
    <header className="story-page-head">
      <span>EVENT #{String(story.event.rank).padStart(2, "0")}</span>
      <h1 id="story-page-title">{story.event.title}</h1>
      <p>{story.summary}</p>
      <div><b>热度 {story.event.heat}</b><b>{story.event.sourceCount} 个独立信源</b><b>{story.event.status === "new" ? "新出现" : "持续发酵"}</b></div>
    </header>

    {story.event.lifecycle && <section className="story-lifecycle" aria-labelledby="story-lifecycle-title"><header><div><span>EVENT LIFECYCLE</span><h2 id="story-lifecycle-title">生命周期</h2></div><b className={`lifecycle-state ${story.event.lifecycle.state}`}>{story.event.lifecycle.label}</b></header><div><span>首次出现<strong>{formatTime(story.event.lifecycle.firstSeenAt)}</strong></span><span>最近更新<strong>{formatTime(story.event.lifecycle.lastUpdatedAt)}</strong></span><span>下一步核验<strong>{story.event.lifecycle.nextCheck}</strong></span></div></section>}

    <section className="story-summary" aria-labelledby="story-latest-title">
      <h2 id="story-latest-title">最新进展</h2>
      {story.latestUpdates.length ? story.latestUpdates.map((item) => <ItemLink key={item.id} item={item} onOpenItem={onOpenItem} />) : <ItemLink item={representative} onOpenItem={onOpenItem} />}
    </section>

    <section className="story-timeline" aria-labelledby="story-timeline-title">
      <h2 id="story-timeline-title">事件时间线</h2>
      {story.timeline.length ? story.timeline.map((item) => <ItemLink key={item.id} item={item} onOpenItem={onOpenItem} />) : <p>暂未形成更多可核对的时间线节点。</p>}
    </section>

    <section className="story-sources" aria-labelledby="story-sources-title"><h2 id="story-sources-title">确认信源</h2><p>{story.sources.join(" / ") || representative.sourceName}</p></section>
  </article>;
}
