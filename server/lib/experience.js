const { isCuratedSourceAllowed, isPublicItem, isSelectedFeedEligible, selectedRankingScore } = require("./scoring");
const { evidenceMeta } = require("./editorial");

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

function normalizedSourceIdentity(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[（(]\s*rss\s*[)）]/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sourceLedger(cluster = {}, relatedItems = [], representative = {}) {
  const entries = [
    ...relatedItems.map((item) => ({ identity: item.sourceId || item.sourceName, name: item.sourceName || item.sourceId })),
    ...(cluster.sources || []).map((name) => ({ identity: name, name })),
    ...(representative.duplicateSources || []).map((name) => ({ identity: name, name })),
  ].filter((entry) => entry.identity && entry.name && !/^AIHOT(?:\s*公开页)?$/i.test(String(entry.name)));
  const byIdentity = new Map();
  for (const entry of entries) {
    const identity = normalizedSourceIdentity(entry.identity);
    if (identity && !byIdentity.has(identity)) byIdentity.set(identity, String(entry.name).trim());
  }
  return [...byIdentity.values()];
}

function buildEventLifecycle(items = [], now = Date.now(), persistedSources = []) {
  const nowMs = new Date(now).getTime();
  const dated = items
    .map((item) => ({ item, time: new Date(item?.publishedAt || 0).getTime() }))
    .filter(({ time }) => Number.isFinite(time));
  if (!dated.length) return null;
  const firstSeenAt = new Date(Math.min(...dated.map(({ time }) => time))).toISOString();
  const lastUpdatedAt = new Date(Math.max(...dated.map(({ time }) => time))).toISOString();
  const sourceIds = new Set(dated
    .map(({ item }) => normalizedSourceIdentity(item.sourceId || item.sourceName))
    .filter(Boolean));
  for (const source of persistedSources) {
    const identity = normalizedSourceIdentity(source);
    if (identity) sourceIds.add(identity);
  }
  const ageHours = Math.max(0, (nowMs - new Date(lastUpdatedAt).getTime()) / 36e5);
  const state = ageHours > 72 ? "stale" : sourceIds.size >= 2 ? "confirmed" : ageHours <= 6 ? "emerging" : "developing";
  const copy = {
    emerging: { label: "刚出现", nextCheck: "等待第二个独立信源或一手细节" },
    confirmed: { label: "多源确认", nextCheck: "继续观察后续影响与独立数据" },
    developing: { label: "持续发展", nextCheck: "核对后续更新与实际落地" },
    stale: { label: "暂缓追踪", nextCheck: "如无新证据，暂不继续扩散" },
  }[state];
  return { state, label: copy.label, firstSeenAt, lastUpdatedAt, nextCheck: copy.nextCheck };
}

function candidateEvidence(item) {
  const evidence = evidenceMeta(item);
  if (evidence.evidenceLevel === "unverified") return evidence;
  return {
    ...evidence,
    evidenceLevel: "single_source",
    evidenceLabel: "单一来源",
    evidenceGaps: ["独立信源仍不足"],
  };
}

function buildHotCandidates(items = [], confirmedIds = new Set(), nowMs = Date.now(), threshold = 72, enrichItem = (item) => item) {
  const groups = new Map();
  for (const item of items) {
    const published = new Date(item.publishedAt || 0).getTime();
    if (!isPublicItem(item) || !isCuratedSourceAllowed(item) || String(item.priorityTier || item.sourceTier || item.tier || "").toLowerCase() === "reference") continue;
    if (!Number.isFinite(published) || nowMs - published < 0 || nowMs - published > 72 * 60 * 60 * 1000) continue;
    if (!isSelectedFeedEligible(item, threshold)) continue;
    const sources = sourceLedger({}, [item], item);
    if (sources.length !== 1) continue;
    const key = todaySignalGroupKey(item) || item.id;
    if (confirmedIds.has(key) || confirmedIds.has(item.eventId) || confirmedIds.has(item.canonicalUrl)) continue;
    const current = groups.get(key);
    if (!current || selectedRankingScore(item) > selectedRankingScore(current)) groups.set(key, item);
  }

  const selected = [];
  const sourceCounts = new Map();
  for (const item of [...groups.values()].sort((a, b) => (
    selectedRankingScore(b) - selectedRankingScore(a)
    || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  ))) {
    const sourceName = item.sourceName || item.sourceId || "未知来源";
    const sourceKey = normalizedSourceIdentity(sourceName) || "unknown";
    if ((sourceCounts.get(sourceKey) || 0) >= 2) continue;
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    const publicItem = enrichItem(item);
    selected.push({
      ...publicItem,
      availability: "candidate",
      status: "emerging",
      sourceCount: 1,
      sources: [sourceName],
      evidenceMeta: candidateEvidence(item),
    });
    if (selected.length >= 5) break;
  }
  return selected;
}

function todaySignalGroupKey(item = {}) {
  return item.eventId || item.canonicalUrl || item.url || item.id;
}

function todaySignalEvidenceWeight(level) {
  return {
    multi_source: 40,
    first_party: 32,
    expert_analysis: 26,
    single_source: 14,
    unverified: 0,
  }[level] || 0;
}

function todayIssueMeta(items = []) {
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

function buildTodaySignals(state = {}, options = {}) {
  const nowMs = new Date(options.now || Date.now()).getTime();
  const threshold = Number(options.selectedThreshold || state.settings?.rules?.selectedThreshold || 72);
  const limit = Math.min(5, Math.max(1, Number(options.limit || 5)));
  const enrichItem = options.enrichItem || ((item) => item);
  const itemsById = new Map((state.items || []).map((item) => [item.id, item]));
  const groups = new Map();
  const assigned = new Set();

  for (const cluster of state.clusters || []) {
    const members = clusterItemIds(cluster).map((id) => itemsById.get(id)).filter(Boolean);
    if (!members.length) continue;
    const key = cluster.id || todaySignalGroupKey(members[0]);
    groups.set(key, members);
    for (const member of members) assigned.add(member.id);
  }
  for (const item of state.items || []) {
    if (assigned.has(item.id)) continue;
    const key = todaySignalGroupKey(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  const candidates = [];
  for (const [groupId, rawMembers] of groups.entries()) {
    const members = [...new Map(rawMembers.map((item) => [item.id, item])).values()]
      .filter(isPublicItem)
      .filter(isCuratedSourceAllowed)
      .filter((item) => isSelectedFeedEligible(item, threshold))
      .filter((item) => {
        const published = new Date(item.publishedAt || 0).getTime();
        return Number.isFinite(published) && nowMs - published >= 0 && nowMs - published <= 36 * 60 * 60 * 1000;
      });
    if (!members.length) continue;
    const representative = [...members].sort((a, b) => (
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || selectedRankingScore(b) - selectedRankingScore(a)
      || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    ))[0];
    const identities = new Map();
    for (const member of members) {
      const identity = String(member.sourceId || member.sourceName || "").trim().toLowerCase();
      if (identity && !identities.has(identity)) identities.set(identity, member.sourceName || member.sourceId);
    }
    const latestAt = members.reduce((latest, item) => (
      new Date(item.publishedAt || 0).getTime() > new Date(latest || 0).getTime() ? item.publishedAt : latest
    ), representative.publishedAt);
    const ageHours = Math.max(0, (nowMs - new Date(latestAt || 0).getTime()) / 36e5);
    const evidence = evidenceMeta(representative, members);
    const representativePublic = enrichItem(representative);
    const relatedItems = members.map(enrichItem);
    candidates.push({
      ...representativePublic,
      id: groupId,
      latestAt,
      sourceCount: identities.size,
      sources: [...identities.values()].filter(Boolean).slice(0, 6),
      status: ageHours <= 6 ? "new" : "active",
      creatorValue: evidence.creatorValue,
      evidenceMeta: evidence,
      representative: representativePublic,
      relatedItems,
      _rank: todaySignalEvidenceWeight(evidence.evidenceLevel)
        + Math.min(16, identities.size * 5)
        + Math.max(0, Math.round(18 - ageHours / 2))
        + selectedRankingScore(representative),
    });
  }

  const items = candidates
    .sort((a, b) => b._rank - a._rank || new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime())
    .slice(0, limit)
    .map(({ _rank, ...item }) => item);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    limit,
    ...todayIssueMeta(items),
    items,
  };
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
        .filter(isCuratedSourceAllowed)
        .filter((item) => {
          const age = nowMs - new Date(item.publishedAt || 0).getTime();
          return age >= 0 && age <= 72 * 60 * 60 * 1000;
        });
      const representative = [...relatedItems].sort((a, b) => (
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        || (b.score || 0) - (a.score || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      ))[0];

      if (!representative) return null;
      const sources = sourceLedger(cluster, relatedItems, representative);
      if (sources.length < 2) return null;

      const topic = {
        id: cluster.id || representative.eventId || representative.id,
        title: representative.title,
        sourceCount: sources.length,
        sources: sources.slice(0, 6),
        topScore: Math.max(0, ...relatedItems.map((item) => Number(item.score || 0))),
        publishedAt: representative.publishedAt,
        latestAt: relatedItems.reduce((latest, item) => (
          new Date(item.publishedAt || 0).getTime() > new Date(latest || 0).getTime() ? item.publishedAt : latest
        ), representative.publishedAt),
        summary: representative.editorialBrief?.fact || representative.summary || representative.reason || representative.title,
        representative: enrichItem(representative),
        relatedItems: relatedItems.map(enrichItem),
      };
      topic.ageHours = Math.max(0, (nowMs - new Date(topic.latestAt || 0).getTime()) / (60 * 60 * 1000));
      topic.heat = hotHeat(topic);
      topic.status = hotStatus(topic);
      topic.lifecycle = buildEventLifecycle(topic.relatedItems, nowMs, sources);
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

  const confirmedIds = new Set(items.flatMap((item) => [item.id, item.representative?.eventId, item.representative?.canonicalUrl, item.representative?.url]).filter(Boolean));
  const candidates = buildHotCandidates(state.items || [], confirmedIds, nowMs, threshold, enrichItem);
  const availability = items.length ? "confirmed" : candidates.length ? "candidate" : "empty";

  return {
    generatedAt: new Date(nowMs).toISOString(),
    windowHours: HOT_RULES.windowHours,
    rules: HOT_RULES,
    availability,
    items,
    candidates,
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

function isReportEligible(item = {}) {
  if (item.hidden) return false;
  const tier = String(item.priorityTier || item.sourceTier || item.tier || "").toLowerCase();
  if (tier === "reference") return false;
  // Keep lightweight in-memory report fixtures usable while applying the full
  // public/curated policy to persisted URL-backed items.
  if (!item.url) return true;
  return isPublicItem(item) && isCuratedSourceAllowed(item);
}

function mergeDigestSections(daily = [], itemLimit = Number.POSITIVE_INFINITY) {
  const selected = new Map();
  for (const { digest } of daily) {
    for (const section of digest.sections || []) {
      for (const item of section.items || []) {
        if (!isReportEligible(item)) continue;
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

const TREND_EVIDENCE_RANK = { multi_source: 4, first_party: 3, expert_analysis: 2, single_source: 1, unverified: 0 };

function reportTrendLines(items = []) {
  const groups = new Map();
  for (const item of items.filter(isReportEligible)) {
    const labels = (item.tags || []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 3);
    const fallback = item.categoryLabel || item.category || "行业动态";
    for (const label of labels.length ? labels : [fallback]) {
      const key = String(label).toLowerCase();
      const group = groups.get(key) || { key, label, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const sources = new Set(group.items.map((item) => String(item.sourceId || item.sourceName || "").trim().toLowerCase()).filter(Boolean));
      const eventKeys = new Set(group.items.map(reportItemKey).filter(Boolean));
      const evidenceLevel = group.items
        .map((item) => evidenceMeta(item, group.items).evidenceLevel)
        .sort((a, b) => (TREND_EVIDENCE_RANK[b] || 0) - (TREND_EVIDENCE_RANK[a] || 0))[0] || "single_source";
      const sampleItems = [...group.items]
        .sort((a, b) => (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, 3);
      return {
        key: group.key,
        label: group.label,
        count: group.items.length,
        eventCount: eventKeys.size,
        sourceCount: sources.size,
        latestAt: group.items.reduce((latest, item) => new Date(item.publishedAt || 0).getTime() > new Date(latest || 0).getTime() ? item.publishedAt : latest, group.items[0]?.publishedAt || null),
        evidenceLevel,
        sampleItems,
      };
    })
    .sort((a, b) => b.count - a.count || b.eventCount - a.eventCount || b.sourceCount - a.sourceCount || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, 6);
}

function reportWatchItems(items = []) {
  return items
    .filter(isReportEligible)
    .filter((item) => item.unverified || ["community_fallback", "reference"].includes(String(item.priorityTier || item.sourceTier || item.tier || "")))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime() || (b.score || 0) - (a.score || 0))
    .slice(0, 5);
}

function reportEditorialSummary(period, storyCount, trendLines, watchItems) {
  const prefix = period === "monthly" ? "本月" : period === "weekly" ? "本周" : "今日";
  if (!storyCount) return `${prefix}暂无足够的精选内容形成主线。`;
  const lead = trendLines[0]?.label ? `最集中的方向是“${trendLines[0].label}”` : "当前信号分布较分散";
  const watch = watchItems.length ? `另有 ${watchItems.length} 条线索需要继续核验。` : "暂未发现需要单独挂起的低确认线索。";
  return `${prefix}共有 ${storyCount} 条精选内容，${lead}。${watch}`;
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
  const trendLines = reportTrendLines(allItems);
  const watchItems = reportWatchItems(allItems);
  const nextDate = shiftReportDate(period, anchor, 1);
  return {
    period,
    issueId: `${period}:${range.startKey}`,
    range: { start: range.startKey, end: range.endKey },
    coverage: reportCoverage(period, range, daily, now),
    headline: reportHeadline(period, storyCount),
    editorialSummary: reportEditorialSummary(period, storyCount, trendLines, watchItems),
    storyCount,
    estimatedReadingMinutes: Math.max(1, Math.ceil(storyCount / 5)),
    themes: reportThemes(sections),
    trendLines,
    watchItems,
    sections,
    navigation: {
      previousDate: shiftReportDate(period, anchor, -1),
      nextDate: nextDate <= shanghaiDateKey(now) ? nextDate : null,
    },
  };
}

module.exports = {
  buildEventLifecycle,
  buildHotTopics,
  buildStory,
  buildReport,
  buildTodaySignals,
};
