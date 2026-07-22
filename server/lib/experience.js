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

module.exports = {
  buildHotTopics,
};
