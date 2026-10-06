const { makeId } = require("./scoring");
const { canonicalUrl, titleFingerprint } = require("./contentIdentity");

function eventKey(item) {
  const tags = (item.tags || []).slice(0, 3).join("-");
  return makeId(`${titleFingerprint(item.title)}:${tags}`);
}

// Conservative, source-text anchors for announcements with translated headlines.
// A common company/model mention alone is never enough to merge reports.
function announcementAnchor(item = {}) {
  const title = String(item.raw?.title || item.originalTitle || item.title || '').normalize('NFKC');
  if (/[;；]|\bdaily\s+(?:brief|roundup|digest)\b|日报|早报/iu.test(title)) return null;
  const sourceText = `${title}\n${item.raw?.summary || ''}`;
  if (!/\bOpenAI\b/iu.test(sourceText)) return null;
  if (/(?:\bEU\b|European Union|欧盟)/iu.test(title)
    && /text\s+(?:provenance|watermark)|文本.{0,30}水印/iu.test(title)
    && /watermark|水印/iu.test(sourceText)) return 'openai:eu:text-watermark';
  const duration = title.match(/(\d+)\s*(?:天|[- ]day)/iu)?.[1];
  if (duration && /\bOpenAI\b/iu.test(title) && /reset|重置/iu.test(title)
    && /(?:plan|pledge|promise|improv|feature|计划|承诺|改进|功能)/iu.test(title)) return `openai:product-improvement-reset:${duration}days`;
  return null;
}

function anchoredEventClusters(items = []) {
  const groups = new Map();
  for (const item of [...items].sort((a,b) => Date.parse(a.publishedAt)-Date.parse(b.publishedAt))) {
    const anchor = announcementAnchor(item), at = Date.parse(item.publishedAt);
    if (!anchor || !Number.isFinite(at)) continue;
    const windows = groups.get(anchor) || [];
    let group = windows.at(-1);
    if (!group || at - group.startedAt > 72 * 36e5) {
      group = { id: makeId(`announcement:${anchor}:${new Date(at).toISOString().slice(0,10)}`), startedAt: at, members: [] };
      windows.push(group);
      groups.set(anchor, windows);
    }
    group.members.push(item);
  }
  return [...groups.values()].flat().filter(g => g.members.length > 1).map(g => ({
    id: g.id, title: g.members[0].title, items: g.members.map(i => i.id),
    sources: [...new Set(g.members.flatMap(i => [i.sourceName, ...(i.duplicateSources || [])]).filter(Boolean))],
    coverage: mergeRelatedCoverage(g.members.flatMap(i => [...(i.relatedCoverage || []), coverageRecord(i)])),
    topScore: Math.max(...g.members.map(i => Number(i.score || 0))), size: g.members.length,
    matchMethod: 'announcement_anchor',
  }));
}

function withAnnouncementClusters(items, clusters = []) {
  const anchored = anchoredEventClusters(items);
  const assigned = new Set(anchored.flatMap(c => c.items));
  // Preserve the existing event id when a persisted group expands with another report.
  for (const cluster of anchored) {
    const previous = clusters.find(c => (c.items || []).length && c.items.every(id => cluster.items.includes(id)));
    if (previous) cluster.id = previous.id;
  }
  return [...clusters.filter(c => c.matchMethod !== 'announcement_anchor' && !(c.items || []).some(id => assigned.has(id))), ...anchored];
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
  const exact = [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      sources: [...cluster.sources],
      coverage: mergeRelatedCoverage(cluster.coverage),
      size: cluster.items.length,
    }))
    .filter((cluster) => cluster.size > 1 || cluster.sources.length > 1 || cluster.duplicateCount > 0)
    .sort((a, b) => b.topScore - a.topScore);
  return withAnnouncementClusters(items, exact).sort((a,b) => b.topScore-a.topScore);
}

module.exports = {
  canonicalUrl,
  compactDuplicates,
  mergeRelatedCoverage,
  enrichDedupe,
  eventClusters,
  eventKey,
  titleFingerprint,
  withAnnouncementClusters,
};
