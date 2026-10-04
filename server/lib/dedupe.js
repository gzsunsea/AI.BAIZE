const { makeId } = require("./scoring");
const { canonicalUrl, titleFingerprint } = require("./contentIdentity");

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

function coverageRecord(item = {}) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    sourceKind: item.sourceKind,
    priorityTier: item.priorityTier || item.sourceTier || item.tier,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  };
}

function mergeRelatedCoverage(...items) {
  const coverage = new Map();
  for (const item of items.flat()) {
    if (!item) continue;
    const record = item.url ? coverageRecord(item) : item;
    const key = canonicalUrl(record.url) || `${record.sourceId || record.sourceName || "source"}:${record.title || ""}`;
    if (!key || !record.sourceName || !record.url) continue;
    if (!coverage.has(key)) coverage.set(key, record);
  }
  return [...coverage.values()];
}

function mergeDuplicateEvidence(winner, loser) {
  winner.duplicateSources = [...new Set([...(winner.duplicateSources || []), loser.sourceName].filter(Boolean))];
  winner.relatedCoverage = mergeRelatedCoverage(
    winner.relatedCoverage || [],
    coverageRecord(winner),
    loser.relatedCoverage || [],
    coverageRecord(loser),
  );
  winner.duplicateCount = (winner.duplicateCount || 0) + 1 + (loser.duplicateCount || 0);
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
    mergeDuplicateEvidence(winner, loser);
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
    mergeDuplicateEvidence(winner, loser);
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
        coverage: [],
        topScore: 0,
        duplicateCount: 0,
      };
      duplicateCluster.items.push(item.id);
      duplicateCluster.sources.add(item.sourceName);
      for (const source of item.duplicateSources || []) duplicateCluster.sources.add(source);
      duplicateCluster.coverage.push(...mergeRelatedCoverage(item.relatedCoverage || [], coverageRecord(item)));
      duplicateCluster.topScore = Math.max(duplicateCluster.topScore, item.score || 0);
      duplicateCluster.duplicateCount += item.duplicateCount || 0;
      clusters.set(duplicateCluster.id, duplicateCluster);
      continue;
    }
    const key = item.eventId || eventKey(item);
    const cluster = clusters.get(key) || { id: key, title: item.title, items: [], sources: new Set(), coverage: [], topScore: 0 };
    cluster.items.push(item.id);
    cluster.sources.add(item.sourceName);
    cluster.coverage.push(...mergeRelatedCoverage(item.relatedCoverage || [], coverageRecord(item)));
    cluster.topScore = Math.max(cluster.topScore, item.score || 0);
    clusters.set(key, cluster);
  }
  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      sources: [...cluster.sources],
      coverage: mergeRelatedCoverage(cluster.coverage),
      size: cluster.items.length,
    }))
    .filter((cluster) => cluster.size > 1 || cluster.sources.length > 1 || cluster.duplicateCount > 0)
    .sort((a, b) => b.topScore - a.topScore);
}

module.exports = {
  canonicalUrl,
  compactDuplicates,
  mergeRelatedCoverage,
  enrichDedupe,
  eventClusters,
  eventKey,
  titleFingerprint,
};
