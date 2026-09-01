import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  MessageSquareText,
  Sparkles,
  X,
} from "lucide-react";
import type { AskResult, Item } from "../../types";
import { creatorCardForItem, itemToMarkdown } from "../../lib/experience.mts";

function formatTime(value?: string | null) {
  if (!value) return "暂无";
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
}

function EditorialBrief({ item }: { item: Item }) {
  const brief = item.editorialBrief;
  if (!brief || (!brief.fact && !brief.impact && !brief.scenario)) return <p className="reader-summary">{item.summary}</p>;
  return (
    <div className="reader-brief">
      {brief.fact && <section><span>事实</span><p>{brief.fact}</p></section>}
      {brief.impact && <section><span>影响</span><p>{brief.impact}</p></section>}
      {brief.scenario && <section><span>场景</span><p>{brief.scenario}</p></section>}
    </div>
  );
}

function EvidenceBoundary({ item }: { item: Item }) {
  const evidence = item.evidenceMeta;
  if (!evidence) return null;
  const generatedByLabel = evidence.generatedBy === "local_llm" ? "本地模型整理" : evidence.generatedBy === "editor" ? "人工编辑" : "规则整理";
  return (
    <section className="reader-evidence-boundary">
      <header><span>证据边界</span><b className={`evidence-badge ${evidence.evidenceLevel}`}>{evidence.evidenceLabel}</b></header>
      <p>{evidence.evidenceGaps.length ? evidence.evidenceGaps.join("；") : "已有多个独立来源交叉确认，仍建议阅读原文了解上下文。"}</p>
      <small>{generatedByLabel} · 事实与建议分开呈现</small>
    </section>
  );
}

function CreatorCard({ item }: { item: Item }) {
  const card = creatorCardForItem(item);
  if (!card) return null;
  const generatedByLabel = card.generatedBy === "local_llm" ? "本地模型整理" : card.generatedBy === "editor" ? "人工编辑" : "系统整理/生成建议";
  return (
    <section className="creator-card">
      <header><span>创作卡片</span><small>{generatedByLabel}</small></header>
      <strong>{card.angle}</strong>
      <div><span>可引用事实</span>{card.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>
      <div><span>建议补证</span><p>{card.gaps.join("；")}</p></div>
      <small>适合形式：{card.format}</small>
    </section>
  );
}

const feedbackOptions = [
  ["useful", "有价值"],
  ["duplicate", "重复/噪音"],
  ["verify", "事实需核对"],
] as const;

function ContentFeedback({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const submit = async (kind: string, label: string) => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: `内容反馈：${label} · ${item.title}`,
          kind,
          itemId: item.id,
          page: window.location.pathname,
          context: window.location.pathname + window.location.search,
        }),
      });
      if (!response.ok) throw new Error("feedback failed");
      setStatus("感谢反馈，我们会用它调整选题与信源。");
    } catch {
      setStatus("反馈暂时没发出去，阅读仍可继续。");
    } finally {
      setBusy(false);
    }
  };
  return <section className="reader-feedback" aria-label="内容质量反馈"><header><span>帮助我们改进</span><small>只反馈这条内容，不影响阅读</small></header><div>{feedbackOptions.map(([kind, label]) => <button type="button" key={kind} disabled={busy} onClick={() => submit(kind, label)}>{label}</button>)}</div>{status && <p role="status">{status}</p>}</section>;
}

async function postQuestion(item: Item | null, question: string, command: string) {
  const prompt = question.trim() || (item ? `分析 ${item.title}` : "最近最值得关注的 AI 变化");
  const response = await fetch("/api/public/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: prompt, command, itemId: item?.id || "" }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "问答失败");
  return response.json() as Promise<AskResult>;
}

function AskBaize({ item }: { item: Item | null }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const commands = [["brief", "一句话摘要"], ["compare", "多来源比较"], ["timeline", "事件时间线"], ["impact", "影响判断"], ["sources", "查看信源"]];

  const ask = async (command = "") => {
    setLoading(true);
    setError("");
    try {
      setResult(await postQuestion(item, question, command));
    } catch (err) {
      setError(err instanceof Error ? err.message : "问答失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ask-baize">
      <div className="ask-context"><Sparkles size={18} /><div><strong>问白泽</strong><span>{item ? `正在分析：${item.title}` : "基于 AI.BAIZE 精选库回答，并附原始信源"}</span></div></div>
      <div className="ask-commands">{commands.map(([key, label]) => <button key={key} type="button" onClick={() => ask(key)} disabled={loading}>{label}</button>)}</div>
      <label className="ask-input">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") ask(); }} placeholder="例如：比较各家对这次发布的判断" />
        <button type="button" onClick={() => ask()} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <MessageSquareText size={16} />}提问</button>
      </label>
      {error && <div className="notice error">{error}。阅读原文、收藏和导出仍可使用。</div>}
      {result && <div className="ask-result"><div className="ask-answer">{result.answer.split("\n").map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div><div className="ask-citations"><span>引用信源</span>{result.citations.map((citation) => <a href={citation.url} key={`${citation.id}-${citation.index}`} target="_blank" rel="noreferrer"><b>{citation.index}</b><span><strong>{citation.title}</strong><small>{citation.sourceType} · {citation.sourceName} · {formatTime(citation.publishedAt)}</small></span></a>)}</div></div>}
    </section>
  );
}

type ReadingWorkspaceProps = {
  item: Item | null;
  relatedItems?: Item[];
  initialTab: "reader" | "ask";
  saved: boolean;
  processed: boolean;
  onClose: () => void;
  onRead: (id: string) => void;
  onOpenRelated: (item: Item) => void;
  onToggleSaved: (item: Item) => void;
  onToggleProcessed: (id: string) => void;
};

export function ReadingWorkspace({ item, relatedItems = [], initialTab, saved, processed, onClose, onRead, onOpenRelated, onToggleSaved, onToggleProcessed }: ReadingWorkspaceProps) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"reader" | "ask">(initialTab);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => setTab(initialTab), [initialTab, item?.id]);
  useEffect(() => {
    closeRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], textarea, input, select, [tabindex]:not([tabindex='-1'])") || [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const shareItem = async () => {
    if (!item) return;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text: item.reason || item.summary, url: item.url });
      else await navigator.clipboard.writeText(`${item.title}\n${item.reason || item.summary}\n${item.url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const exportItem = () => {
    if (!item) return;
    const blob = new Blob([itemToMarkdown(item)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aibaize-${item.id}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openOriginal = () => {
    if (!item) return;
    onRead(item.id);
    window.open(item.url, "_blank", "noopener,noreferrer");
  };
  const visibleRelated = relatedItems.filter((related) => related.id !== item?.id).slice(0, 6);

  return (
    <div className="reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <article ref={dialogRef} className="reader-workspace" role="dialog" aria-modal="true" aria-label="阅读工作台" onKeyDown={trapFocus}>
        <div className="reader-grabber"><ChevronDown size={18} /></div>
        <header className="reader-tabs">
          <div role="tablist"><button className={tab === "reader" ? "active" : ""} type="button" role="tab" aria-selected={tab === "reader"} onClick={() => setTab("reader")} disabled={!item}><BookOpen size={15} />阅读</button><button className={tab === "ask" ? "active" : ""} type="button" role="tab" aria-selected={tab === "ask"} onClick={() => setTab("ask")}><MessageSquareText size={15} />问白泽</button></div>
          <button ref={closeRef} className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读工作台"><X size={18} /></button>
        </header>
        {tab === "reader" && item ? (
          <>
            <div className="reader-scroll">
              <header className="reader-story-head"><span>{item.sourceName} · {formatTime(item.publishedAt)}</span><h2>{item.title}</h2><div><b>{item.categoryLabel || "行业动态"}</b><b>{item.channelLabel || "资讯聚合"}</b>{item.evidenceMeta && <b className={`evidence-badge ${item.evidenceMeta.evidenceLevel}`}>{item.evidenceMeta.evidenceLabel}</b>}<strong>{item.score}</strong></div></header>
              <EditorialBrief item={item} />
              {item.reason && <section className="reader-reason"><span>推荐理由</span><p>{item.reason}</p></section>}
              {item.evidenceMeta?.creatorValue && <section className="reader-creator-value"><span>对创作者的用处</span><p>{item.evidenceMeta.creatorValue}</p></section>}
              <EvidenceBoundary item={item} />
              {(visibleRelated.length > 0 || (item.related && item.related.count > 1)) && <section className="reader-related"><header><span>关联报道</span><small>{visibleRelated.length || item.related?.count || 0} 条</small></header>{visibleRelated.length > 0 ? <div>{visibleRelated.map((related) => <button key={related.id} type="button" onClick={() => onOpenRelated(related)}><span>{related.sourceName} · {formatTime(related.publishedAt)}</span><strong>{related.title}</strong></button>)}</div> : <p>{item.related?.sources.slice(0, 6).join(" / ")}</p>}</section>}
                  <CreatorCard item={item} />
                  <ContentFeedback item={item} />
                  <div className="reader-tags">{item.tags?.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
            <footer className="reader-actions">
              <button className="primary" type="button" onClick={openOriginal}>阅读原文<ArrowUpRight size={16} /></button>
              <button className={saved ? "active" : ""} type="button" onClick={() => onToggleSaved(item)}><Bookmark size={16} />{saved ? "已收藏" : "稍后读"}</button>
              <button className={processed ? "active" : ""} type="button" onClick={() => onToggleProcessed(item.id)}><CheckCircle2 size={16} />{processed ? "已处理" : "标记处理"}</button>
              <button type="button" onClick={exportItem}><Download size={16} />导出</button>
              <button type="button" onClick={shareItem}><Copy size={16} />{copied ? "已复制" : "分享"}</button>
            </footer>
          </>
        ) : <AskBaize item={item} />}
      </article>
    </div>
  );
}
