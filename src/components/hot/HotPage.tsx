import { Flame, RefreshCw } from "lucide-react";
import type { HotCandidate, HotRules, HotTopic, Item } from "../../types";
import { itemLocation, shouldInterceptLinkClick, storyLocation } from "../../lib/navigation";

export type HotPageData = {
  generatedAt?: string;
  windowHours?: number;
  rules?: HotRules;
  items: HotTopic[];
  candidates?: HotCandidate[];
  availability?: "confirmed" | "candidate" | "empty";
};

type HotPageProps = {
  data: HotPageData | null;
  loading: boolean;
  error: string;
  onOpenStory: (id: string) => void;
  onOpenItem: (item: Item) => void;
  onOpenFeed: () => void;
  onRetry: () => void;
};

function formatTime(value?: string) {
  if (!value) return "暂无更新时间";
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HotPage({ data, loading, error, onOpenStory, onOpenItem, onOpenFeed, onRetry }: HotPageProps) {
  const topics = data?.items || [];
  const candidates = data?.candidates || [];
  return (
    <section className="hot-page" aria-labelledby="hot-page-title">
      <header className="hot-page-head">
        <div>
          <span>HOT NOW</span>
          <h1 id="hot-page-title"><Flame size={28} />热点榜</h1>
          <p>近 72 小时内由多个独立信源确认的 AI 事件，按热度、质量和时效综合排序；尚未完成交叉确认的高质量信号会单独标注。</p>
        </div>
        <button className="hot-retry" type="button" onClick={onRetry} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button>
      </header>

      {data?.rules && <details className="hot-rules">
        <summary>规则说明（v{data.rules.version}）</summary>
        <p>热度 = 信源质量 + 多源确认 + 时效 + 精选分，总分限制在 0–100。信源质量按每条关联内容的层级权重累加，最高 {data.rules.components.sourceQualityScore.cap} 分。</p>
        <p>多源确认从第 2 个独立信源起，每增加 1 个加 {data.rules.components.sourceCountBonus.perAdditionalSource} 分，最高 {data.rules.components.sourceCountBonus.cap} 分。时效以最新报道为准，从 {data.rules.components.freshnessBonus.initial} 分起，每 {data.rules.components.freshnessBonus.decayHours} 小时衰减 1 分，最低 {data.rules.components.freshnessBonus.floor} 分。精选分取代表内容最高分除以 {data.rules.components.selectedScoreBonus.divisor} 后四舍五入，最高 {data.rules.components.selectedScoreBonus.cap} 分。</p>
        <p>信源层级权重：{Object.entries(data.rules.tierWeights).map(([tier, weight]) => `${tier} ${weight}`).join(" · ")}。候选只代表正在形成的信号，不等同于多源确认。</p>
      </details>}

      {loading ? <div className="hot-loading" aria-live="polite">正在核对多源热点…</div> : error ? (
        <div className="hot-empty hot-error" role="alert"><strong>热点暂时不可用</strong><p>{error}</p><button className="primary" type="button" onClick={onRetry}>重试</button></div>
      ) : (
        <>
          {topics.length > 0 ? <ol className="hot-ranking-list" role="list">
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
          </ol> : candidates.length > 0 ? (
            <div className="hot-empty hot-empty-compact"><strong>近 72 小时暂无达到多源确认阈值的热点</strong><p>先看下方正在形成的信号；它们经过精选门槛，但仍在等待独立信源确认。</p></div>
          ) : (
            <div className="hot-empty"><strong>近 72 小时暂无达到多源确认阈值的热点</strong><p>我们会继续核对信源与事件关联，避免把单条消息当作共识。</p><button className="primary" type="button" onClick={onOpenFeed}>查看精选时间线</button></div>
          )}

          {candidates.length > 0 && <section className="hot-candidates" aria-labelledby="hot-candidates-title">
            <header className="hot-section-head">
              <div>
                <span>EMERGING SIGNALS</span>
                <h2 id="hot-candidates-title">正在形成的热点</h2>
                <p>这些内容已通过精选门槛，但目前只有一个可用来源；请把它们当作线索，不当作共识。</p>
              </div>
              <b>{candidates.length} 条待核对</b>
            </header>
            <ol className="hot-candidate-list" role="list">
              {candidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <a href={itemLocation(candidate.id)} onClick={(event) => { if (!shouldInterceptLinkClick(event)) return; event.preventDefault(); onOpenItem(candidate); }}>
                    <b className="hot-rank">{String(index + 1).padStart(2, "0")}</b>
                    <span className="hot-topic-copy">
                      <strong>{candidate.title}</strong>
                      <small>{candidate.sourceName} · 发布 {formatTime(candidate.publishedAt)}</small>
                      <span className="hot-topic-summary">{candidate.summary || candidate.reason}</span>
                      <span className="hot-evidence-gap">{candidate.evidenceMeta?.evidenceGaps?.join("、") || "独立信源仍不足"}</span>
                    </span>
                    <span className="hot-topic-signals"><em className="hot-status emerging">待确认</em><b>精选 {candidate.score}</b></span>
                  </a>
                </li>
              ))}
            </ol>
          </section>}
        </>
      )}
    </section>
  );
}
