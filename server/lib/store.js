const fs = require("node:fs");
const path = require("node:path");
const { compactDuplicates, enrichDedupe, eventClusters } = require("./dedupe");
const { mergeDefaultSources } = require("./sources");
const { isQualityCandidate, scoreItem } = require("./scoring");

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const defaultState = {
  items: [],
  sources: mergeDefaultSources([]),
  runs: [],
  clusters: [],
  feedback: [],
  dailyDigests: [],
  mpArticles: [],
  settings: {
    refreshedAt: null,
    cron: "*/30 * * * *",
    rules: {
      selectedThreshold: 72,
      selectedCommunityLimit: 6,
      maxItems: 2000,
      rssLimit: 40,
    },
  },
};

function ensureState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeState(defaultState);
  }
}

function readState() {
  ensureState();
  const raw = fs.readFileSync(DB_FILE, "utf8");
  const parsed = { ...defaultState, ...JSON.parse(raw) };
  parsed.sources = mergeDefaultSources(parsed.sources);
  const sourceById = new Map(parsed.sources.map((source) => [source.id, source]));
  const sourceByNameKind = new Map(parsed.sources.map((source) => [`${source.name}::${source.kind}`, source]));
  parsed.items = (parsed.items || []).map((item) => {
    const source = sourceById.get(item.sourceId) || sourceByNameKind.get(`${item.sourceName}::${item.sourceKind}`) || null;
    if (!source || item.priorityTier) return item;
    const next = {
      ...item,
      sourceId: source.id,
      sourceTier: source.tier,
      priorityTier: source.priorityTier || source.tier,
      preferred: Boolean(source.preferred),
      noisePenalty: Number(source.noisePenalty || 0),
    };
    if (!next.pinned) {
      next.score = scoreItem({
        title: next.title,
        summary: next.summary,
        sourceKind: next.sourceKind,
        publishedAt: next.publishedAt,
        stars: next.raw?.stars,
        comments: next.raw?.comments,
        priorityTier: next.priorityTier,
        preferred: next.preferred,
        noisePenalty: next.noisePenalty,
        topicBoosts: source.topicBoosts || {},
      });
    }
    return next;
  });
  parsed.settings = {
    ...defaultState.settings,
    ...(parsed.settings || {}),
    rules: {
      ...defaultState.settings.rules,
      ...(parsed.settings?.rules || {}),
      maxItems: Math.max(Number(parsed.settings?.rules?.maxItems || 0), defaultState.settings.rules.maxItems),
    },
  };
  return parsed;
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
}

function upsertItems(nextItems) {
  const state = readState();
  const byKey = new Map();

  for (const item of state.items) {
    const clean = enrichDedupe(item);
    byKey.set(clean.canonicalUrl || clean.url || clean.id, clean);
  }

  for (const item of nextItems.map(enrichDedupe)) {
    const key = item.canonicalUrl || item.url || item.id;
    const prev = byKey.get(key);
    byKey.set(key, {
      ...prev,
      ...item,
      id: prev?.id || item.id,
      publishedAt: prev?.publishedAt || item.publishedAt,
      hidden: prev?.hidden ?? false,
      pinned: prev?.pinned ?? false,
      updatedAt: new Date().toISOString(),
    });
  }

  const compacted = compactDuplicates([...byKey.values()]);
  const maxItems = Number(state.settings?.rules?.maxItems || 2000);
  const sourceKindCaps = {
    hn: 80,
    github: 60,
    arxiv: 60,
    devto: 0,
  };
  const sourceKindCounts = new Map();
  state.items = compacted.items
    .filter((item) => item.pinned || isQualityCandidate(item))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .filter((item) => {
      const cap = sourceKindCaps[item.sourceKind];
      if (cap === undefined || item.pinned) return true;
      const count = sourceKindCounts.get(item.sourceKind) || 0;
      if (count >= cap) return false;
      sourceKindCounts.set(item.sourceKind, count + 1);
      return true;
    })
    .sort((a, b) => {
      const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinned) return pinned;
      return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    })
    .slice(0, maxItems);
  state.clusters = eventClusters(state.items).slice(0, 80);
  state.settings.refreshedAt = new Date().toISOString();
  writeState(state);
  return state.items;
}

function updateSourceHealth(healthUpdates) {
  const state = readState();
  const byId = new Map(healthUpdates.map((item) => [item.id, item]));
  state.sources = state.sources.map((source) => ({
    ...source,
    health: byId.get(source.id) || source.health || null,
  }));
  writeState(state);
  return state.sources;
}

function recordRun(run) {
  const state = readState();
  state.runs = [{ ...run, at: new Date().toISOString() }, ...(state.runs || [])].slice(0, 50);
  writeState(state);
}

module.exports = {
  DB_FILE,
  readState,
  writeState,
  upsertItems,
  recordRun,
  updateSourceHealth,
};
