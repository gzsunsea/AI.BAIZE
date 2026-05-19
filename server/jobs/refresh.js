const { readState, recordRun, updateSourceHealth, upsertItems } = require("../lib/store");
const { enhanceRecentItems } = require("../lib/llmEnhancer");
const { scrapeSource } = require("../lib/scrapers");
const { isQualityCandidate } = require("../lib/scoring");

const priorityRank = { preferred_x: 0, official_first_party: 1, expert_rss: 2, cn_media: 3, reference: 4, community_fallback: 5 };
let refreshInFlight = false;
let enhancementInFlight = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceTimeout(source) {
  const defaultMs = source.priorityTier === "community_fallback" ? 9000 : source.kind === "web_list" ? 14000 : 12000;
  const configured = Number(source.timeoutMs || process.env.SOURCE_TIMEOUT_MS || defaultMs);
  if (source.health && !source.health.ok) return Math.min(configured, Number(process.env.DEGRADED_SOURCE_TIMEOUT_MS || 8000));
  return configured;
}

function previousFailures(source) {
  return Number(source.health?.consecutiveFailures || (source.health && !source.health.ok ? 1 : 0));
}

function sourceRetries(source) {
  if (source.retries !== undefined) return Number(source.retries);
  if (source.health && !source.health.ok) return 0;
  return Number(process.env.SOURCE_RETRIES || 0);
}

function degradedCooldownMs(source) {
  if (source.preferred || ["preferred_x", "official_first_party", "expert_rss"].includes(source.priorityTier)) {
    return Number(process.env.PREFERRED_SOURCE_COOLDOWN_MS || 20 * 60 * 1000);
  }
  if (source.priorityTier === "community_fallback") return Number(process.env.COMMUNITY_SOURCE_COOLDOWN_MS || 6 * 60 * 60 * 1000);
  return Number(process.env.DEGRADED_SOURCE_COOLDOWN_MS || 90 * 60 * 1000);
}

function shouldSkipDegradedSource(source, now = Date.now()) {
  if (!source.health || source.health.ok) return false;
  const failures = previousFailures(source);
  if (failures < 2) return false;
  const checkedAt = new Date(source.health.checkedAt || 0).getTime();
  if (!checkedAt) return false;
  return now - checkedAt < degradedCooldownMs(source);
}

async function scrapeWithRetry(source, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const timeoutMs = sourceTimeout(source);
      return {
        items: await Promise.race([
          scrapeSource(source),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Source timeout after ${timeoutMs}ms`)), timeoutMs)),
        ]),
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, worker) {
  const queue = [...items];
  const output = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      output.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return output;
}

async function scrapeOneSource(source) {
  const started = Date.now();
  try {
    const retries = sourceRetries(source);
    const scraped = await scrapeWithRetry(source, retries);
    const cleanItems = scraped.items.filter((item) => item.url && item.url !== "#" && item.title && item.title !== "未命名动态" && isQualityCandidate(item));
    return {
      items: cleanItems,
      health: {
        id: source.id,
        ok: true,
        count: cleanItems.length,
        attempts: scraped.attempts,
        durationMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      },
    };
  } catch (error) {
    return {
      items: [],
      error: { source: source.id, message: error.message },
      health: {
        id: source.id,
        ok: false,
        count: 0,
        attempts: sourceRetries(source) + 1,
        durationMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
        message: error.message,
        consecutiveFailures: previousFailures(source) + 1,
      },
    };
  }
}

function scheduleEnhancement(limit = Number(process.env.LLM_ENHANCE_LIMIT || 40)) {
  if (process.env.LLM_ENHANCE_ASYNC === "0" || enhancementInFlight) return { scheduled: false, reason: enhancementInFlight ? "enhancement_in_progress" : "disabled" };
  enhancementInFlight = true;
  enhanceRecentItems({ limit })
    .then((enhanced) => {
      recordRun({ ok: true, type: "enhance", enhanced });
    })
    .catch((error) => {
      recordRun({ ok: false, type: "enhance", enhanced: { enhanced: 0, provider: "none" }, errors: [{ source: "llmEnhancer", message: error.message }] });
      console.error("[enhance]", error);
    })
    .finally(() => {
      enhancementInFlight = false;
    });
  return { scheduled: true, limit };
}

async function refreshAll() {
  if (refreshInFlight) return { ok: false, skipped: true, reason: "refresh_in_progress" };
  refreshInFlight = true;
  const state = readState();
  const now = Date.now();
  const skipped = [];
  const enabled = state.sources
    .filter((source) => source.enabled)
    .filter((source) => {
      if (!shouldSkipDegradedSource(source, now)) return true;
      skipped.push({
        source: source.id,
        message: `Skipped degraded source after ${previousFailures(source)} consecutive failures`,
      });
      return false;
    })
    .sort((a, b) => (priorityRank[a.priorityTier] ?? 9) - (priorityRank[b.priorityTier] ?? 9));
  const results = [];
  const errors = [...skipped];
  const health = [];

  try {
    for (const rank of [...new Set(enabled.map((source) => priorityRank[source.priorityTier] ?? 9))].sort((a, b) => a - b)) {
      const group = enabled.filter((source) => (priorityRank[source.priorityTier] ?? 9) === rank);
      const concurrency = rank <= 2 ? Number(process.env.PREFERRED_REFRESH_CONCURRENCY || 5) : Number(process.env.REFRESH_CONCURRENCY || 4);
      const groupResults = await mapConcurrent(group, concurrency, scrapeOneSource);
      for (const result of groupResults) {
        results.push(...result.items);
        health.push(result.health);
        if (result.error) errors.push(result.error);
      }
    }

    const items = upsertItems(results);
    updateSourceHealth(health);
    const enhanced = scheduleEnhancement();
    const slowSources = health
      .filter((item) => item.durationMs >= Number(process.env.SLOW_SOURCE_MS || 10000))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);
    const run = {
      ok: errors.length === 0,
      fetched: results.length,
      total: items.length,
      enhanced,
      skipped: skipped.length,
      slowSources,
      errors,
    };
    recordRun(run);
    return run;
  } finally {
    refreshInFlight = false;
  }
}

if (require.main === module) {
  refreshAll()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  refreshAll,
  scheduleEnhancement,
};
