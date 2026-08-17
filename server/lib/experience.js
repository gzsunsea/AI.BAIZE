const { isPublicItem } = require("./scoring");

function clusterItemIds(cluster = {}) {
  return (cluster.items || [])
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean);
}

const HOT_TIER_WEIGHTS = {
  first_party: 12,
  official_first_party: 12,
  preferred_x: 11,
  expert: 10,
  expert_rss: 10,
  research: 9,
  cn_media: 8,
  education: 7,
  culture: 7,
  media: 6,
  social: 5,
  community: 4,
  community_fallback: 4,
  reference: 3,
  custom: 2,
};

const HOT_RULES = {
  version: 1,
  windowHours: 72,
  trendAvailable: false,
  components: {
    sourceQualityScore: { description: "信源层级权重之和", cap: 30 },
    sourceCountBonus: { description: "第二个及后续独立信源每个加 8 分", perAdditionalSource: 8, cap: 25 },
    freshnessBonus: { description: "20 分起，每 4 小时衰减 1 分", initial: 20, decayHours: 4, floor: 0 },
    selectedScoreBonus: { description: "代表内容精选分除以 4", divisor: 4, cap: 25 },
  },
  tierWeights: HOT_TIER_WEIGHTS,
};

function itemTierWeight(item = {}) {
  for (const tier of [item.priorityTier, item.sourceTier, item.tier]) {
    if (Object.hasOwn(HOT_TIER_WEIGHTS, tier)) return HOT_TIER_WEIGHTS[tier];
  }
  return 1;
}

function hotHeat(topic) {
  const sourceQualityScore = Math.min(30, topic.relatedItems.reduce((sum, item) => (
    sum + itemTierWeight(item)
  ), 0));
  const sourceCountBonus = Math.min(25, Math.max(0, topic.sourceCount - 1) * 8);
  const freshnessBonus = Math.max(0, Math.round(20 - topic.ageHours / 4));
  const selectedScoreBonus = Math.min(25, Math.round(topic.topScore / 4));
  return Math.max(0, Math.min(100, sourceQualityScore + sourceCountBonus + freshnessBonus + selectedScoreBonus));
}

function hotStatus(topic) {
  if (topic.ageHours <= 6) return "new";
  return "active";
}

function buildHotTopics(state = {}, options = {}) {
  const nowMs = new Date(options.now || Date.now()).getTime();
  const threshold = Number(options.selectedThreshold || 70);
  const enrichItem = options.enrichItem || ((item) => item);
  const limit = options.limit === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Number(options.limit || 10);
  const itemsById = new Map((state.items || []).map((item) => [item.id, item]));

  const items = (state.clusters || [])
    .map((cluster) => {
      const relatedItems = clusterItemIds(cluster)
        .map((id) => itemsById.get(id))
        .filter(Boolean)
        .filter(isPublicItem)
        .filter((item) => nowMs - new Date(item.publishedAt || 0).getTime() <= 72 * 60 * 60 * 1000);
      const sourceNamesByIdentity = new Map();
      for (const item of relatedItems) {
        const identity = item.sourceId || item.sourceName;
        if (identity && !sourceNamesByIdentity.has(identity)) {
          sourceNamesByIdentity.set(identity, item.sourceName || item.sourceId);
        }
      }
      const sources = [...sourceNamesByIdentity.values()].filter(Boolean);
      const representative = [...relatedItems].sort((a, b) => (
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        || (b.score || 0) - (a.score || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      ))[0];

      if (!representative) return null;
      if (sources.length < 2 && !(representative.pinned && representative.score >= threshold)) return null;

      const topic = {
        id: cluster.id || representative.eventId || representative.id,
        title: cluster.title || representative.title,
        sourceCount: sources.length,
        sources: sources.slice(0, 6),
        topScore: Math.max(cluster.topScore || 0, ...relatedItems.map((item) => item.score || 0)),
        publishedAt: representative.publishedAt,
        latestAt: relatedItems.reduce((latest, item) => (
          new Date(item.publishedAt || 0).getTime() > new Date(latest || 0).getTime() ? item.publishedAt : latest
        ), representative.publishedAt),
        summary: representative.editorialBrief?.fact || representative.summary || representative.reason || cluster.title || representative.title,
        representative: enrichItem(representative),
        relatedItems: relatedItems.map(enrichItem),
      };
      topic.ageHours = Math.max(0, (nowMs - new Date(topic.latestAt || 0).getTime()) / (60 * 60 * 1000));
      topic.heat = hotHeat(topic);
      topic.status = hotStatus(topic);
      topic.rules = HOT_RULES;
      return topic;
    })
    .filter(Boolean)
    .sort((a, b) => (
      b.heat - a.heat
      || b.sourceCount - a.sourceCount
      || b.topScore - a.topScore
      || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    ))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    windowHours: HOT_RULES.windowHours,
    rules: HOT_RULES,
    items,
  };
}

function buildStory(state = {}, id, options = {}) {
  const topics = buildHotTopics(state, { ...options, limit: Number.POSITIVE_INFINITY }).items;
  const topic = topics.find((item) => item.id === id);
  if (!topic) return null;
  const timeline = [...(topic.relatedItems || [])].sort((a, b) => (
    new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  ));
  const { relatedItems, ...event } = topic;
  return {
    event,
    summary: topic.representative.editorialBrief?.fact || topic.representative.summary || topic.title,
    latestUpdates: timeline.slice(0, 3),
    timeline,
    sources: topic.sources,
    rules: topic.rules || HOT_RULES,
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

function mergeDigestSections(daily = [], itemLimit = Number.POSITIVE_INFINITY) {
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
      items: section.items
        .sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, itemLimit),
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

function latestReportDate(state, now) {
  const nowMs = now.getTime();
  const candidates = [
    ...(state.dailyDigests || []).map((digest) => digest.generatedAt),
    ...(state.items || []).filter((item) => !item.hidden).map((item) => item.publishedAt),
  ]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() <= nowMs)
    .sort((a, b) => b.getTime() - a.getTime());
  return shanghaiDateKey(candidates[0] || now);
}

function reportDailyEntries(state, range, options, now) {
  const entries = new Map(latestDigestPerLocalDay(state.dailyDigests || [], range).map((entry) => [entry.dateKey, entry]));
  if (typeof options.buildVirtualDigest !== "function") return [...entries.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const todayKey = shanghaiDateKey(now);
  const endKey = range.endKey < todayKey ? range.endKey : todayKey;
  if (range.startKey > endKey) return [...entries.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  for (const dateKey of enumerateDateKeys(range.startKey, endKey)) {
    if (entries.has(dateKey)) continue;
    const digest = options.buildVirtualDigest(dateKey);
    const hasStories = (digest?.sections || []).some((section) => (section.items || []).length > 0);
    if (hasStories) entries.set(dateKey, { dateKey, digest });
  }
  return [...entries.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function reportHeadline(period, storyCount) {
  const prefix = period === "weekly" ? "本周" : period === "monthly" ? "本月" : "今日";
  return storyCount ? `${prefix}值得关注的 ${storyCount} 条 AI 动态` : "";
}

function buildReport(state = {}, options = {}) {
  const period = String(options.period || "daily");
  if (!REPORT_PERIODS.has(period)) throw badRequest("invalid period");
  const now = new Date(options.now || Date.now());
  const defaultDate = latestReportDate(state, now);
  const anchor = parseDateKey(options.date || defaultDate);
  const range = reportRange(period, anchor);
  const daily = reportDailyEntries(state, range, options, now);
  const sectionLimit = period === "monthly" ? 18 : period === "weekly" ? 12 : 6;
  const sections = mergeDigestSections(daily, sectionLimit);
  const allItems = sections.flatMap((section) => section.items);
  const storyCount = allItems.length;
  const nextDate = shiftReportDate(period, anchor, 1);
  return {
    period,
    issueId: `${period}:${range.startKey}`,
    range: { start: range.startKey, end: range.endKey },
    coverage: reportCoverage(period, range, daily, now),
    headline: reportHeadline(period, storyCount),
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
  buildStory,
  buildReport,
};
