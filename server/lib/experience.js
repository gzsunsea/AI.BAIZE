function clusterItemIds(cluster = {}) {
  return (cluster.items || [])
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean);
}

function buildHotTopics(state = {}, options = {}) {
  const nowMs = new Date(options.now || Date.now()).getTime();
  const threshold = Number(options.selectedThreshold || 70);
  const enrichItem = options.enrichItem || ((item) => item);
  const itemsById = new Map((state.items || []).map((item) => [item.id, item]));

  const items = (state.clusters || [])
    .map((cluster) => {
      const relatedItems = clusterItemIds(cluster)
        .map((id) => itemsById.get(id))
        .filter(Boolean)
        .filter((item) => nowMs - new Date(item.publishedAt || 0).getTime() <= 72 * 60 * 60 * 1000);
      const sources = [...new Set(relatedItems
        .map((item) => item.sourceId || item.sourceName)
        .filter(Boolean))];
      const representative = [...relatedItems].sort((a, b) => (
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        || (b.score || 0) - (a.score || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      ))[0];

      if (!representative) return null;
      if (sources.length < 2 && !(representative.pinned && representative.score >= threshold)) return null;

      return {
        id: cluster.id || representative.eventId || representative.id,
        title: cluster.title || representative.title,
        sourceCount: sources.length,
        sources: sources.slice(0, 6),
        topScore: Math.max(cluster.topScore || 0, ...relatedItems.map((item) => item.score || 0)),
        publishedAt: representative.publishedAt,
        representative: enrichItem(representative),
        relatedItems: relatedItems.map(enrichItem),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      b.sourceCount - a.sourceCount
      || b.topScore - a.topScore
      || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    ))
    .slice(0, 5);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    items,
  };
}

const REPORT_PERIODS = new Set(["daily", "weekly", "monthly"]);
const REPORT_SECTION_ORDER = ["model", "product", "industry", "research", "opinion", "education", "culture", "opensource"];

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw badRequest("invalid date");
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw badRequest("invalid date");
  }
  return date;
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shanghaiDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("invalid date");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addUtcDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function enumerateDateKeys(startKey, endKey) {
  const keys = [];
  for (let cursor = parseDateKey(startKey); cursor <= parseDateKey(endKey); cursor = addUtcDays(cursor, 1)) {
    keys.push(utcDateKey(cursor));
  }
  return keys;
}

function reportRange(period, anchor) {
  if (period === "daily") {
    const key = utcDateKey(anchor);
    return { startKey: key, endKey: key };
  }
  if (period === "weekly") {
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    const start = addUtcDays(anchor, -mondayOffset);
    return { startKey: utcDateKey(start), endKey: utcDateKey(addUtcDays(start, 6)) };
  }
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 12));
  return { startKey: utcDateKey(start), endKey: utcDateKey(end) };
}

function latestDigestPerLocalDay(digests = [], range) {
  const latest = new Map();
  for (const digest of digests) {
    const key = shanghaiDateKey(digest.generatedAt);
    if (key < range.startKey || key > range.endKey) continue;
    const current = latest.get(key);
    if (!current || new Date(digest.generatedAt).getTime() > new Date(current.generatedAt).getTime()) latest.set(key, digest);
  }
  return [...latest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, digest]) => ({ dateKey, digest }));
}

function normalizedTitle(value = "") {
  return String(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function reportItemKey(item = {}) {
  return item.eventId || item.canonicalUrl || item.url || item.titleFingerprint || normalizedTitle(item.title) || item.id;
}

function mergeDigestSections(daily = []) {
  const selected = new Map();
  for (const { digest } of daily) {
    for (const section of digest.sections || []) {
      for (const item of section.items || []) {
        const key = reportItemKey(item);
        if (!key) continue;
        const current = selected.get(key);
        const currentTime = new Date(current?.item?.publishedAt || current?.digestAt || 0).getTime();
        const candidateTime = new Date(item.publishedAt || digest.generatedAt || 0).getTime();
        if (!current || (item.score || 0) > (current.item.score || 0) || ((item.score || 0) === (current.item.score || 0) && candidateTime > currentTime)) {
          selected.set(key, {
            sectionKey: section.key || item.category || "industry",
            sectionTitle: section.title || section.key || "行业动态",
            item,
            digestAt: digest.generatedAt,
          });
        }
      }
    }
  }

  const groups = new Map();
  for (const value of selected.values()) {
    const group = groups.get(value.sectionKey) || { key: value.sectionKey, title: value.sectionTitle, items: [] };
    group.items.push(value.item);
    groups.set(value.sectionKey, group);
  }
  return [...groups.values()]
    .map((section) => ({
      ...section,
      items: section.items.sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()),
    }))
    .sort((a, b) => {
      const aIndex = REPORT_SECTION_ORDER.indexOf(a.key);
      const bIndex = REPORT_SECTION_ORDER.indexOf(b.key);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex) || a.key.localeCompare(b.key);
    });
}

function reportThemes(sections = []) {
  const counts = new Map();
  for (const section of sections) {
    counts.set(section.title, (counts.get(section.title) || 0) + section.items.length);
    for (const item of section.items) {
      for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 6)
    .map(([label, count]) => ({ key: normalizedTitle(label) || label, label, count }));
}

function reportCoverage(period, range, daily, now) {
  const todayKey = shanghaiDateKey(now);
  let requiredEnd = range.endKey;
  if (period === "monthly" && todayKey >= range.startKey && todayKey <= range.endKey) requiredEnd = todayKey;
  const required = range.startKey > todayKey ? [] : enumerateDateKeys(range.startKey, requiredEnd);
  const covered = daily.map((entry) => entry.dateKey);
  return {
    complete: required.length > 0 && required.every((key) => covered.includes(key)),
    days: covered.length,
    requiredDays: required.length,
    start: covered[0] || null,
    end: covered.at(-1) || null,
  };
}

function shiftReportDate(period, anchor, direction) {
  if (period === "daily") return utcDateKey(addUtcDays(anchor, direction));
  if (period === "weekly") return utcDateKey(addUtcDays(anchor, direction * 7));
  return utcDateKey(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + direction, 1, 12)));
}

function buildReport(state = {}, options = {}) {
  const period = String(options.period || "daily");
  if (!REPORT_PERIODS.has(period)) throw badRequest("invalid period");
  const now = new Date(options.now || Date.now());
  const latestSnapshot = [...(state.dailyDigests || [])]
    .filter((digest) => !Number.isNaN(new Date(digest.generatedAt).getTime()))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
  const defaultDate = latestSnapshot ? shanghaiDateKey(latestSnapshot.generatedAt) : shanghaiDateKey(now);
  const anchor = parseDateKey(options.date || defaultDate);
  const range = reportRange(period, anchor);
  const daily = latestDigestPerLocalDay(state.dailyDigests || [], range);
  const sections = mergeDigestSections(daily);
  const allItems = sections.flatMap((section) => section.items);
  const headlineItem = [...allItems].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const storyCount = allItems.length;
  const nextDate = shiftReportDate(period, anchor, 1);
  return {
    period,
    issueId: `${period}:${range.startKey}`,
    range: { start: range.startKey, end: range.endKey },
    coverage: reportCoverage(period, range, daily, now),
    headline: headlineItem?.title || "",
    storyCount,
    estimatedReadingMinutes: Math.max(1, Math.ceil(storyCount / 5)),
    themes: reportThemes(sections),
    sections,
    navigation: {
      previousDate: shiftReportDate(period, anchor, -1),
      nextDate: nextDate <= shanghaiDateKey(now) ? nextDate : null,
    },
  };
}

module.exports = {
  buildHotTopics,
  buildReport,
};
