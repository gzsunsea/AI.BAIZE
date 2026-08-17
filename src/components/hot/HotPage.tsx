import { Flame, RefreshCw } from "lucide-react";
import type { HotRules, HotTopic } from "../../types";
import { shouldInterceptLinkClick, storyLocation } from "../../lib/navigation";

export type HotPageData = {
  generatedAt?: string;
  windowHours?: number;
  rules?: HotRules;
  items: HotTopic[];
};

type HotPageProps = {
  data: HotPageData | null;
  loading: boolean;
  error: string;
  onOpenStory: (id: string) => void;
  onRetry: () => void;
};

function formatTime(value?: string) {
  if (!value) return "暂无更新时间";
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HotPage({ data, loading, error, onOpenStory, onRetry }: HotPageProps) {
  const topics = data?.items || [];
  return (
    <section className="hot-page" aria-labelledby="hot-page-title">
      <header className="hot-page-head">
        <div>
          <span>HOT NOW</span>
          <h1 id="hot-page-title"><Flame size={28} />热点榜</h1>
          <p>近 72 小时内由多个独立信源确认的 AI 事件，按热度、质量和时效综合排序。</p>
        </div>
        <button className="hot-retry" type="button" onClick={onRetry} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button>
      </header>

      {data?.rules && <details className="hot-rules">
        <summary>规则说明（v{data.rules.version}）</summary>
        <p>热度 = 信源质量（最高 {data.rules.components.sourceQualityScore.cap}）+ 多源确认（最高 {data.rules.components.sourceCountBonus.cap}）+ 时效（初始 {data.rules.components.freshnessBonus.initial}）+ 精选分（最高 {data.rules.components.selectedScoreBonus.cap}）。</p>
        <p>信源层级权重：{Object.entries(data.rules.tierWeights).map(([tier, weight]) => `${tier} ${weight}`).join(" · ")}。当前不提供趋势变化量。</p>
      </details>}

      {loading ? <div className="hot-loading" aria-live="polite">正在核对多源热点…</div> : error ? (
        <div className="hot-empty hot-error" role="alert"><strong>热点暂时不可用</strong><p>{error}</p><button className="primary" type="button" onClick={onRetry}>重试</button></div>
      ) : topics.length === 0 ? (
        <div className="hot-empty"><strong>近 72 小时暂无达到多源确认阈值的热点</strong><p>我们会继续核对信源与事件关联，避免把单条消息当作共识。</p></div>
      ) : (
        <ol className="hot-ranking-list" role="list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <a href={storyLocation(topic.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenStory(topic.id); }}>
                <b className="hot-rank">{String(topic.rank).padStart(2, "0")}</b>
                <span className="hot-topic-copy">
                  <strong>{topic.title}</strong>
                  <small>{topic.sourceCount} 个独立信源 · {topic.sources.slice(0, 4).join(" / ")} · 最新 {formatTime(topic.latestAt)}</small>
                  <span className="hot-topic-summary">{topic.summary || topic.representative.summary}</span>
                </span>
                <span className="hot-topic-signals"><em className={`hot-status ${topic.status}`}>{topic.status === "new" ? "新出现" : "持续发酵"}</em><b>热度 {topic.heat}</b></span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
