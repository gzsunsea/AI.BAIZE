const { makeId } = require("./scoring");

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "using",
  "about",
  "this",
  "that",
  "your",
  "their",
  "发布",
  "推出",
  "更新",
  "正式",
  "宣布",
  "支持",
  "通过",
  "实现",
]);

function canonicalUrl(url = "") {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^spm$|^from$|^ref$|^fbclid$|^gclid$/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").trim();
  }
}

function titleFingerprint(title = "") {
  const normalized = String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .slice(0, 14)
    .join(" ");
  return normalized || String(title).slice(0, 40).toLowerCase();
}

function eventKey(item) {
  const tags = (item.tags || []).slice(0, 3).join("-");
  return makeId(`${titleFingerprint(item.title)}:${tags}`);
}

function enrichDedupe(item) {
  const canonical = canonicalUrl(item.url);
  return {
    ...item,
    canonicalUrl: canonical,
    titleFingerprint: titleFingerprint(item.title),
    eventId: eventKey(item),
  };
}

function compactDuplicates(items) {
  const byCanonical = new Map();
  const duplicates = [];
  for (const raw of items.map(enrichDedupe)) {
    const key = raw.canonicalUrl || raw.url || raw.id;
    const prev = byCanonical.get(key);
    if (!prev) {
      byCanonical.set(key, raw);
      continue;
    }
    const winner = raw.score > prev.score ? raw : prev;
    const loser = winner === raw ? prev : raw;
    winner.duplicateSources = [...new Set([...(winner.duplicateSources || []), loser.sourceName].filter(Boolean))];
    winner.duplicateCount = (winner.duplicateCount || 0) + 1 + (loser.duplicateCount || 0);
    byCanonical.set(key, winner);
    duplicates.push(loser);
  }

  const byTitle = new Map();
  for (const raw of byCanonical.values()) {
    const key = raw.titleFingerprint;
    const prev = byTitle.get(key);
    if (!prev) {
      byTitle.set(key, raw);
      continue;
    }
    const winner = raw.score > prev.score ? raw : prev;
    const loser = winner === raw ? prev : raw;
    winner.duplicateSources = [...new Set([...(winner.duplicateSources || []), loser.sourceName].filter(Boolean))];
    winner.duplicateCount = (winner.duplicateCount || 0) + 1 + (loser.duplicateCount || 0);
    byTitle.set(key, winner);
    duplicates.push(loser);
  }
  return { items: [...byTitle.values()], duplicates };
}

function eventClusters(items) {
  const clusters = new Map();
  for (const item of items) {
    if (item.duplicateCount > 0) {
      const duplicateCluster = clusters.get(item.eventId || eventKey(item)) || {
        id: item.eventId || eventKey(item),
        title: item.title,
        items: [],
        sources: new Set(),
        topScore: 0,
        duplicateCount: 0,
      };
      duplicateCluster.items.push(item.id);
      duplicateCluster.sources.add(item.sourceName);
      for (const source of item.duplicateSources || []) duplicateCluster.sources.add(source);
      duplicateCluster.topScore = Math.max(duplicateCluster.topScore, item.score || 0);
      duplicateCluster.duplicateCount += item.duplicateCount || 0;
      clusters.set(duplicateCluster.id, duplicateCluster);
      continue;
    }
    const key = item.eventId || eventKey(item);
    const cluster = clusters.get(key) || { id: key, title: item.title, items: [], sources: new Set(), topScore: 0 };
    cluster.items.push(item.id);
    cluster.sources.add(item.sourceName);
    cluster.topScore = Math.max(cluster.topScore, item.score || 0);
    clusters.set(key, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      sources: [...cluster.sources],
      size: cluster.items.length,
    }))
    .filter((cluster) => cluster.size > 1 || cluster.sources.length > 1 || cluster.duplicateCount > 0)
    .sort((a, b) => b.topScore - a.topScore);
}

module.exports = {
  canonicalUrl,
  compactDuplicates,
  enrichDedupe,
  eventClusters,
  eventKey,
  titleFingerprint,
};
