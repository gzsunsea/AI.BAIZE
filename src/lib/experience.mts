import type { Item } from "../types";

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
  return [...groups.entries()].map(([date, groupItems]) => ({ date, items: groupItems }));
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
