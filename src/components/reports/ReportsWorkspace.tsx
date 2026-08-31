import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CalendarDays, Clock3, Download, Loader2, RefreshCw, Rss } from "lucide-react";
import type { Item, Report } from "../../types";
import { coverageLabel, reportToMarkdown } from "../../lib/experience.mts";

const periods: Array<{ key: Report["period"]; label: string; kicker: string }> = [
  { key: "daily", label: "日报", kicker: "DAY" },
  { key: "weekly", label: "周报", kicker: "WEEK" },
  { key: "monthly", label: "月报", kicker: "MONTH" },
];

async function getReport(period: Report["period"], date: string) {
  const params = new URLSearchParams({ period });
  if (date) params.set("date", date);
  const response = await fetch(`/api/public/reports?${params}`);
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "报告加载失败");
  return response.json() as Promise<Report>;
}

export function ReportsWorkspace({ onOpen }: { onOpen: (item: Item) => void }) {
  const [period, setPeriod] = useState<Report["period"]>("daily");
  const [date, setDate] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const topRef = useRef<HTMLElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await getReport(period, date));
    } catch (err) {
      setError(err instanceof Error ? err.message : "报告加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period, date]);

  const changePeriod = (next: Report["period"]) => {
    setPeriod(next);
    setDate("");
  };
  const navigate = (nextDate: string | null) => {
    if (!nextDate) return;
    setDate(nextDate);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([reportToMarkdown(report)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aibaize-${report.period}-${report.range.start}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="reports-workspace" ref={topRef}>
      <header className="reports-page-head">
        <div><span>AI · BAIZE REPORTS</span><h1>报告</h1><p>从逐日信号退后一步，看见一周与一个月真正形成的主线。</p></div>
        <nav className="report-period-tabs" aria-label="报告周期">
          {periods.map((item) => <button className={period === item.key ? "active" : ""} type="button" key={item.key} onClick={() => changePeriod(item.key)} aria-current={period === item.key ? "page" : undefined}><small>{item.kicker}</small><strong>{item.label}</strong></button>)}
        </nav>
      </header>

      {loading && <div className="report-loading"><Loader2 className="spin" size={22} /><span>正在整理报告</span></div>}
      {error && <div className="report-error"><div><strong>报告暂时没有加载出来</strong><p>{error}</p></div><div><button type="button" onClick={load}><RefreshCw size={16} />重试</button>{period !== "daily" && <button type="button" onClick={() => changePeriod("daily")}><CalendarDays size={16} />查看日报</button>}</div></div>}

      {!loading && !error && report && (
        <>
          <section className="report-issue-nav" aria-label="期刊导航">
            <button type="button" onClick={() => navigate(report.navigation.previousDate)}><ArrowLeft size={16} />上一期</button>
            <div><span>{report.range.start === report.range.end ? report.range.start : `${report.range.start} — ${report.range.end}`}</span><small>{coverageLabel(report.coverage)}</small></div>
            <button type="button" onClick={() => navigate(report.navigation.nextDate)} disabled={!report.navigation.nextDate}>下一期<ArrowRight size={16} /></button>
          </section>

          {report.storyCount ? (
            <article className="report-paper">
              <header className="report-lead">
                <div className="report-volume"><span>{period.toUpperCase()}</span><b>{report.issueId.split(":")[1]}</b></div>
                <h2>{report.headline}</h2>
                <div className="report-meta"><span><BookOpen size={15} />{report.storyCount} 条精选</span><span><Clock3 size={15} />约 {report.estimatedReadingMinutes} 分钟</span></div>
                <p className="report-editorial-summary">{report.editorialSummary}</p>
                <div className="report-actions"><button type="button" onClick={exportReport}><Download size={15} />导出本期</button><a href="/feed.xml" target="_blank" rel="noreferrer"><Rss size={15} />订阅 RSS</a></div>
              </header>
              {report.themes.length > 0 && <section className="report-themes"><span>本期主题</span><div>{report.themes.map((theme) => <b key={theme.key}>{theme.label}<small>{theme.count}</small></b>)}</div></section>}
              {report.trendLines.length > 0 && <section className="report-trends" aria-labelledby="report-trends-title"><header><div><span>EDITORIAL THREADS</span><h3 id="report-trends-title">本期主线</h3></div><small>按出现频率、事件数量和证据强度整理</small></header><div className="report-trend-grid">{report.trendLines.map((line) => <article key={line.key}><div><strong>{line.label}</strong><b>{line.count} 条</b></div><p>{line.eventCount} 个事件 · {line.sourceCount} 个信源 · {line.evidenceLevel === "multi_source" ? "多源确认" : line.evidenceLevel === "first_party" ? "一手信源" : "仍需核验"}</p>{line.sampleItems[0] && <button type="button" onClick={() => onOpen(line.sampleItems[0])}>查看代表内容</button>}</article>)}</div></section>}
              {report.watchItems.length > 0 && <section className="report-watch" aria-labelledby="report-watch-title"><header><div><span>KEEP WATCHING</span><h3 id="report-watch-title">继续观察</h3></div><small>这些内容有价值，但证据还不够完整</small></header><div>{report.watchItems.map((item) => <button type="button" key={item.id} onClick={() => onOpen(item)}><span>{item.sourceName}</span><strong>{item.title}</strong><small>{item.evidenceMeta?.evidenceGaps?.join("；") || "请对照原文继续核验"}</small></button>)}</div></section>}
              <div className="report-sections">
                {report.sections.map((section, sectionIndex) => (
                  <section className="report-section" key={section.key}>
                    <header><span>{String(sectionIndex + 1).padStart(2, "0")}</span><div><h3>{section.title}</h3><small>{section.items.length} STORIES</small></div><ArrowDown size={17} /></header>
                    <div className="report-story-list">
                      {section.items.map((item, itemIndex) => (
                        <button type="button" key={item.id} onClick={() => onOpen(item)}>
                          <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                          <div><small>{item.sourceName} · {item.channelLabel || item.categoryLabel || "资讯"} · {item.score}</small><strong>{item.title}</strong><p>{item.reason || item.summary}</p></div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ) : (
            <div className="report-empty"><CalendarDays size={28} /><strong>当前周期暂无可用内容</strong><p>所选日期范围内没有符合质量规则的资讯，可以继续查看上一期。</p>{period !== "daily" && <button type="button" onClick={() => changePeriod("daily")}>返回日报</button>}</div>
          )}
          <button className="back-to-report-top" type="button" onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}><ArrowUp size={16} />返回顶部</button>
        </>
      )}
    </section>
  );
}
