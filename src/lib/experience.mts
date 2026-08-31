import type { Item, Report, TodaySignal, TodaySignalsResponse } from "../types";

export function shanghaiDateKey(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function groupItemsByLocalDate<T extends Pick<Item, "publishedAt">>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = shanghaiDateKey(item.publishedAt);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupItems]) => ({
      date,
      items: [...groupItems].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    }));
}

export function formatDayHeading(dateKey: string) {
  const today = shanghaiDateKey(new Date());
  const yesterday = shanghaiDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (dateKey === today) return "今天";
  if (dateKey === yesterday) return "昨天";
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai" });
}

export type TopicDefinition = {
  key: string;
  label: string;
  description: string;
  query: { categories: string[]; terms?: string[] };
};

export const topicDefinitions: Record<string, TopicDefinition> = {
  "topic-models": {
    key: "topic-models",
    label: "模型",
    description: "模型发布、能力更新、评测结果与训练方法。",
    query: { categories: ["model"] },
  },
  "topic-agents": {
    key: "topic-agents",
    label: "Agent",
    description: "智能体产品、框架、协议与真正可复用的工程实践。",
    query: { categories: [], terms: ["Agent", "智能体", "MCP"] },
  },
  "topic-opensource": {
    key: "topic-opensource",
    label: "开源",
    description: "值得跟进的开源模型、工具、框架与基础设施。",
    query: { categories: ["opensource"] },
  },
  "topic-education": {
    key: "topic-education",
    label: "AI 教育",
    description: "课堂、学习、教师工具与 EdTech 场景中的 AI 变化。",
    query: { categories: ["education"] },
  },
  "topic-culture": {
    key: "topic-culture",
    label: "AI 文化",
    description: "艺术、影视、音乐、游戏、版权与创意产业中的 AI 变化。",
    query: { categories: ["culture"] },
  },
};

export function topicForMode(mode: string) {
  const normalized = mode === "education" ? "topic-education" : mode === "culture" ? "topic-culture" : mode;
  return topicDefinitions[normalized] || null;
}

export function topicRequestUrls(topic: TopicDefinition) {
  const base = "/api/items?mode=all";
  if (topic.query.categories.length) {
    return topic.query.categories.map((category) => `${base}&category=${encodeURIComponent(category)}&page=1&pageSize=80`);
  }
  return (topic.query.terms || []).slice(0, 3).map((term) => `${base}&q=${encodeURIComponent(term)}&page=1&pageSize=80`);
}

export function todaySignalLabel(signal: Pick<TodaySignal, "evidenceMeta">) {
  return signal.evidenceMeta?.evidenceLabel || "待验证线索";
}

export function todaySignalSummary(signal: Pick<TodaySignal, "evidenceMeta" | "summary" | "creatorValue">) {
  return signal.evidenceMeta?.creatorValue || signal.creatorValue || signal.summary;
}

export function todayIssueSummary(response: Pick<TodaySignalsResponse, "items">) {
  const items = response.items || [];
  if (!items.length) {
    return {
      issueLabel: "今日暂无可用信号",
      summary: "今天没有达到精选门槛的新增事件。",
      selectionNote: "继续核对一手信源，不降级、不用低质量内容填充。",
    };
  }
  const confirmed = items.filter((item) => item.evidenceMeta?.evidenceLevel === "multi_source").length;
  return {
    issueLabel: "今日先看",
    summary: `今天有 ${items.length} 条达到精选门槛的信号，优先关注${confirmed ? "已形成独立确认的" : "仍在变化中的"}变化。`,
    selectionNote: "按信源质量、独立确认、时效与可复用价值排序。",
  };
}

export type CreatorCard = {
  angle: string;
  facts: string[];
  gaps: string[];
  format: string;
  generatedBy: "rules" | "local_llm" | "editor";
};

export function creatorCardForItem(item: Item): CreatorCard | null {
  const brief = item.editorialBrief || {};
  const evidence = item.evidenceMeta;
  const facts = [brief.fact || item.summary].filter((value): value is string => Boolean(value?.trim()));
  if (!item.title?.trim() || (!facts.length && !item.reason && !evidence?.creatorValue)) return null;
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const format = /教程|部署|代码|开源|workflow|agent|工作流/.test(text) ? "方法拆解" : /模型|api|产品|工具|发布|更新/.test(text) ? "产品观察" : "事实解读";
  return {
    angle: evidence?.creatorValue || item.reason || `围绕“${item.title}”拆解事实、影响与证据边界。`,
    facts,
    gaps: evidence?.evidenceGaps || ["引用前请核对原文"],
    format,
    generatedBy: evidence?.generatedBy || "rules",
  };
}

export function coverageLabel(coverage: { complete: boolean; days: number; requiredDays: number; start: string | null; end: string | null }) {
  if (!coverage.days || !coverage.start || !coverage.end) return "当前周期暂无快照";
  if (coverage.complete) return `${coverage.days}/${coverage.requiredDays} 天完整覆盖`;
  return `覆盖 ${coverage.days}/${coverage.requiredDays} 天 · ${coverage.start} 至 ${coverage.end}`;
}

export function itemToMarkdown(item: Item) {
  const brief = item.editorialBrief || {};
  const sections: string[] = [
    `# ${item.title}`,
    `- 来源：${item.sourceName}`,
    `- 发布时间：${new Date(item.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    `- AI.BAIZE ID：${item.id}`,
    `- 原文：${item.url}`,
  ];
  if (brief.fact) sections.push(`## 事实\n\n${brief.fact}`);
  if (brief.impact) sections.push(`## 影响\n\n${brief.impact}`);
  if (brief.scenario) sections.push(`## 场景\n\n${brief.scenario}`);
  if (item.reason) sections.push(`## 推荐理由\n\n${item.reason}`);
  else if (item.summary) sections.push(`## 摘要\n\n${item.summary}`);
  return sections.join("\n\n");
}

export function reportToMarkdown(report: Report) {
  const lines = [
    `# AI.BAIZE ${report.period === "weekly" ? "周报" : report.period === "monthly" ? "月报" : "日报"}`,
    `- 周期：${report.range.start} 至 ${report.range.end}`,
    `- 精选：${report.storyCount} 条 · 预计阅读 ${report.estimatedReadingMinutes} 分钟`,
    `- 覆盖：${coverageLabel(report.coverage)}`,
    "",
    `## 编辑摘要\n\n${report.editorialSummary || report.headline}`,
  ];
  if (report.trendLines?.length) {
    lines.push("## 本期主线", ...report.trendLines.map((line) => `- ${line.label}：${line.count} 条内容、${line.eventCount} 个事件、${line.sourceCount} 个信源（${line.evidenceLevel}）`));
  }
  for (const section of report.sections || []) {
    lines.push(`## ${section.title}`);
    for (const item of section.items || []) lines.push(`- [${item.title}](${item.url}) · ${item.sourceName} · ${item.reason || item.summary}`);
  }
  if (report.watchItems?.length) {
    lines.push("## 继续观察", ...report.watchItems.map((item) => `- [${item.title}](${item.url}) · ${item.sourceName} · ${item.evidenceMeta?.evidenceGaps?.join("；") || "请核对原文"}`));
  }
  return lines.join("\n\n");
}
