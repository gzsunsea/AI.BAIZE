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
