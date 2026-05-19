const { readState, writeState } = require("../lib/store");
const { isQualityCandidate } = require("../lib/scoring");

const SOURCE_KIND_CAPS = {
  hn: 80,
  github: 60,
  arxiv: 60,
  devto: 0,
};

function cleanupQuality() {
  const state = readState();
  const before = state.items.length;
  const sourceKindCounts = new Map();
  state.items = state.items
    .filter((item) => item.pinned || isQualityCandidate(item))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .filter((item) => {
      const cap = SOURCE_KIND_CAPS[item.sourceKind];
      if (cap === undefined || item.pinned) return true;
      const count = sourceKindCounts.get(item.sourceKind) || 0;
      if (count >= cap) return false;
      sourceKindCounts.set(item.sourceKind, count + 1);
      return true;
    });
  state.settings = {
    ...state.settings,
    qualityCleanedAt: new Date().toISOString(),
  };
  writeState(state);
  return {
    before,
    after: state.items.length,
    removed: before - state.items.length,
    sourceKindCounts: Object.fromEntries(sourceKindCounts.entries()),
  };
}

if (require.main === module) {
  console.log(JSON.stringify(cleanupQuality(), null, 2));
}

module.exports = {
  cleanupQuality,
};
