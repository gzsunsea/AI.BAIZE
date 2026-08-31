const path = require("node:path");
const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const express = require("express");
const cron = require("node-cron");
const { readState, writeState } = require("./lib/store");
const { refreshAll } = require("./jobs/refresh");
const { attachRelated, categoryLabel, enrichItem, itemCategory, serializePublicItem, sourceChannel } = require("./lib/editorial");
const { enhanceRecentItems } = require("./lib/llmEnhancer");
const {
  canAppearInSelectedFeed,
  isCuratedSourceAllowed,
  isOriginalHttpUrl,
  isPublicItem,
  isQualityCandidate,
  isSelectedFeedEligible,
  isSelectedQualityCandidate,
  makeId,
  selectedRankingScore,
} = require("./lib/scoring");
const { canonicalUrl, titleFingerprint } = require("./lib/dedupe");
const { answerQuestion } = require("./lib/askBaize");
const { buildHotTopics, buildReport, buildStory, buildTodaySignals } = require("./lib/experience");

const PORT = Number(process.env.PORT || 8080);
const DEFAULT_ADMIN_TOKEN = "aihot-admin";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN;
const app = express();

function readAppState() {
  return typeof app.locals.readState === "function" ? app.locals.readState() : readState();
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use((req, res, next) => {
  if (req.headers.host === "aibaize.cc") {
    res.redirect(301, `https://www.aibaize.cc${req.originalUrl || req.url}`);
    return;
  }
  next();
});

function clientKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "unknown").split(",")[0].trim();
}

function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = clientKey(req);
    const current = hits.get(key);
    if (!current || now >= current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({ error: message || "Too many requests" });
      return;
    }
    next();
  };
}

const publicWriteLimit = rateLimit({
  windowMs: Number(process.env.PUBLIC_WRITE_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.PUBLIC_WRITE_RATE_MAX || 30),
});

const adminWriteLimit = rateLimit({
  windowMs: Number(process.env.ADMIN_WRITE_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.ADMIN_WRITE_RATE_MAX || 60),
});

function safeEqual(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  const token = req.header("x-admin-token") || "";
  if (process.env.NODE_ENV === "production" && ADMIN_TOKEN === DEFAULT_ADMIN_TOKEN && process.env.ALLOW_DEFAULT_ADMIN_TOKEN !== "1") {
    res.status(503).json({ error: "Admin token is not configured" });
    return;
  }
  if (!safeEqual(token, ADMIN_TOKEN)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function trimTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function publicBaseUrl(req) {
  const configured = trimTrailingSlash(process.env.PUBLIC_BASE_URL || "");
  if (/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  const host = String(req.headers.host || "").toLowerCase();
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return `http://${host}`;
  return "http://localhost:8080";
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value = "") {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function isChineseMedia(item) {
  return sourceChannel(item) === "cn_media";
}

function mpMetricsFromArticle(article) {
  const reads = Number(article.reads || 0);
  const likes = Number(article.likes || 0);
  const shares = Number(article.shares || 0);
  const baseline = Math.max(1000, Number(article.accountBaseline || 3000));
  const estimated = reads || Math.round((article.score || 60) * baseline / 80);
  return {
    reads: estimated,
    likes: likes || Math.round(estimated * 0.025),
    shares: shares || Math.round(estimated * 0.012),
    abnormal: Number((estimated / baseline).toFixed(2)),
  };
}

function mpAccountProfile(item) {
  const text = `${item.account || ""} ${item.sourceName || ""} ${item.sourceKind || ""} ${item.author || ""} ${item.url || ""}`;
  if (/OpenAI|Anthropic|DeepMind|Google|NVIDIA|Microsoft|Meta|xAI|官方|Newsroom|Blog/i.test(text)) {
    return { type: "official", label: "官方/机构", weight: 1.25 };
  }
  if (/IT之家|机器之心|量子位|新智元|爱范儿|极客公园|少数派|36氪|虎嗅|钛媒体|界面|财新|澎湃|晚点|媒体|RSS/i.test(text)) {
    return { type: "media", label: "中文媒体", weight: 1.18 };
  }
  if (/宝玉|歸藏|向阳乔木|Berryxia|阿萨姆|Orange|公众号|微信|个人|博客|Substack/i.test(text)) {
    return { type: "creator", label: "自媒体/公众号", weight: 1.12 };
  }
  if (/Andrew|Karpathy|Ng|Mollick|Simon|Jim Fan|X · @|twitter|x\.com|推文/i.test(text)) {
    return { type: "expert", label: "专家/X线索", weight: 1.08 };
  }
  return { type: "aggregator", label: "聚合线索", weight: 1 };
}

function mpMetricSource(item, metrics) {
  if (item.sourceKind === "mp_manual" && Number(item.reads || 0) > 0) {
    return { type: "manual_real", label: "后台补录/真实" };
  }
  if (item.sourceKind === "mp_manual") {
    return { type: "manual_estimated", label: "后台补录/估算" };
  }
  if (metrics?.estimated === false) {
    return { type: "real", label: "真实指标" };
  }
  return { type: "estimated", label: "系统估算" };
}

function rewriteMpTitle(item) {
  const title = String(item.title || "").replace(/\s+/g, " ").trim();
  const text = `${title} ${item.summary || ""}`;
  const titleOnly = title;
  if (!title) return "未命名爆文";
  if (/^「.+」：/.test(title) || /^.+：.+/.test(title)) return title;

  let subject = "";
  if (/腾讯|混元|Agent Memory/i.test(text)) subject = "腾讯";
  else if (/OpenAI|ChatGPT/i.test(text)) subject = "OpenAI";
  else if (/Claude|Anthropic/i.test(text)) subject = "Claude";
  else if (/Gemini|Google/i.test(text)) subject = "Google";
  else if (/DeepSeek/i.test(text)) subject = "DeepSeek";
  else if (/豆包|字节/i.test(text)) subject = "字节";
  else if (/Kimi|Moonshot|月之暗面/i.test(text)) subject = "月之暗面";
  else if (/AI 教育|教育|课堂|教师|学生|课程|学校/.test(titleOnly)) subject = "AI教育";
  else if (/文化|艺术|创意|影视|游戏|版权|音乐|出版/.test(titleOnly)) subject = "AI文化";

  const angle = /开源/.test(text)
    ? "开源进展"
    : /发布|推出|上线|更新/.test(text)
      ? "产品更新"
      : /融资|投资|资本|估值/.test(text)
        ? "产业信号"
        : /教程|攻略|实测|方法/.test(text)
          ? "实践方法"
          : /反对|争议|监管|版权|风险/.test(text)
            ? "风险观察"
            : "热点动态";
  const compact = title.length > 42 ? `${title.slice(0, 42)}...` : title;
  return subject ? `${subject}${angle}：${compact}` : compact;
}

function mpTrendSignal(item) {
  const text = `${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`;
  if (/监管|伦理|版权|法院|判决|安全|风险|反对|审查|诉讼|侵权|赔偿/.test(text)) return { key: "risk", label: "风险监管" };
  if (/融资|投资|估值|收入|成本|价格|商业化|微软|资本/.test(text)) return { key: "business", label: "商业信号" };
  if (/教育|教学|课堂|教师|学生|课程|学校|学习|家教|辅导/.test(text)) return { key: "education", label: "教育科技" };
  if (/文化|艺术|创意|影视|电影|音乐|游戏|版权|出版|博物馆|文旅/.test(text)) return { key: "culture", label: "文化创意" };
  if (/开源|GitHub|仓库|代码|CLI|工具|框架/.test(text)) return { key: "opensource", label: "开源工具" };
  if (/模型|推理|多模态|语音|视频|图像|训练|参数/.test(text)) return { key: "model", label: "模型能力" };
  return { key: "industry", label: "行业动态" };
}

function mpQualityTier(item, metrics) {
  const abnormal = metrics.abnormal || 1;
  const score = Number(item.score || 0);
  const edited = rewriteMpTitle(item) !== item.title;
  if (abnormal >= 3.2 || metrics.reads >= 24000 || score >= 82) return { key: "s", label: "强烈关注", rank: 3 };
  if (abnormal >= 2.2 || metrics.reads >= 15000 || score >= 72 || edited) return { key: "a", label: "值得跟进", rank: 2 };
  return { key: "b", label: "观察备用", rank: 1 };
}

function mpEditorNote(item, metrics, profile, signal, tier) {
  const title = item.mpTitle || item.title || "这条动态";
  const metricLabel = metrics.abnormal >= 2.5 ? `热度约为账号基准的 ${metrics.abnormal.toFixed(2)} 倍` : "热度接近账号常态";
  const value = signal.key === "education"
    ? "适合关注 AI 在课堂、学习产品和教育服务中的落地机会。"
    : signal.key === "culture"
      ? "适合观察 AI 内容生产、版权和文化创意工具的变化。"
      : signal.key === "opensource"
        ? "适合评估是否能直接进入产品原型或工作流。"
        : signal.key === "risk"
          ? "适合用于判断政策、版权和社会接受度的边界。"
          : "适合用来判断产品、产业或开发实践的短期变化。";
  return `${tier.label}：${profile.label}来源，${metricLabel}；${title.length > 34 ? `${title.slice(0, 34)}...` : title}。${value}`;
}

function decorateMpItem(item) {
  const profile = mpAccountProfile(item);
  const metrics = item.mpMetrics || mpMetricsFromArticle(item);
  const weightedMetrics = {
    ...metrics,
    reads: Math.round((metrics.reads || 0) * profile.weight),
    likes: Math.round((metrics.likes || 0) * profile.weight),
    shares: Math.round((metrics.shares || 0) * profile.weight),
    abnormal: Number(((metrics.abnormal || 1) * profile.weight).toFixed(2)),
  };
  const metricSource = mpMetricSource(item, weightedMetrics);
  const signal = mpTrendSignal(item);
  const tier = mpQualityTier(item, weightedMetrics);
  const mpTitle = rewriteMpTitle(item);
  return {
    ...item,
    mpTitle,
    mpMetrics: weightedMetrics,
    mpMeta: {
      accountType: profile.type,
      accountLabel: profile.label,
      accountWeight: profile.weight,
      metricSource: metricSource.type,
      metricLabel: metricSource.label,
      titleEdited: mpTitle !== item.title,
      qualityTier: tier.key,
      qualityLabel: tier.label,
      qualityRank: tier.rank,
      trendKey: signal.key,
      trendLabel: signal.label,
      editorNote: mpEditorNote({ ...item, mpTitle }, weightedMetrics, profile, signal, tier),
    },
  };
}

function normalizeMpArticle(article) {
  return {
    id: article.id || makeId(`${article.url}-${article.title}`),
    title: String(article.title || "未命名文章"),
    url: String(article.url || "#"),
    account: String(article.account || article.sourceName || "未知账号"),
    publishedAt: article.publishedAt || new Date().toISOString(),
    summary: String(article.summary || ""),
    original: Boolean(article.original),
    accountBaseline: Number(article.accountBaseline || 3000),
    reads: Number(article.reads || 0),
    likes: Number(article.likes || 0),
    shares: Number(article.shares || 0),
    score: Number(article.score || 60),
    tags: article.tags || [],
    createdAt: article.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mpArticleToItem(article) {
  return {
    ...article,
    sourceName: article.account,
    sourceKind: "mp_manual",
    mpMetrics: mpMetricsFromArticle(article),
  };
}

function isLikelyChineseHotItem(item) {
  const text = `${item.sourceName || ""} ${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`;
  const contentText = `${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`;
  const strongAi = /AI|AIGC|AGI|人工智能|大模型|智能体|Agent|LLM|OpenAI|Claude|Gemini|DeepSeek|Kimi|豆包|通义|混元|智谱|月之暗面|MiniMax|多模态|生成式|文生图|文生视频|推理|训练|机器人|教育科技|AI教育|文化创意|AI文化/i.test(item.title || "");
  const aiRelevant = strongAi || /AI|AIGC|AGI|人工智能|大模型|智能体|Agent|LLM|OpenAI|Claude|Gemini|DeepSeek|Kimi|豆包|通义|混元|智谱|月之暗面|MiniMax|多模态|生成式|文生图|文生视频|推理|训练|机器人|教育科技|AI教育|文化创意|AI文化/i.test(contentText);
  const genericTech = /光纤|光模块|汽车|车型|预售|商务部|会见高通|纯电|电池|手机销量|显卡价格|芯片股|半导体设备|铠侠|净利润|日元|贾跃亭|法拉第未来|新融资|筹资|财报|营收|季度利润/.test(item.title || "");
  if (["github", "hn", "devto", "arxiv"].includes(item.sourceKind)) return false;
  if (/Hacker News|GitHub|Dev\.to|arXiv/i.test(item.sourceName || "")) return false;
  if (genericTech && !strongAi) return false;
  if (!aiRelevant) return false;
  return isChineseMedia(item) || /IT之家|机器之心|量子位|新智元|爱范儿|极客公园|少数派|公众号|微信|中文|国内|火山|字节|豆包|商汤|智谱|月之暗面|百度|阿里|腾讯|华为|MiniMax|DeepSeek|Kimi|阶跃星辰|昆仑万维|生数科技|可灵|快手|抖音|歸藏|宝玉|向阳乔木/i.test(text);
}

function buildMpItems(state, query = {}) {
  const q = String(query.q || "").trim().toLowerCase();
  const manual = (state.mpArticles || []).map(mpArticleToItem);
  const dynamic = state.items
    .filter((item) => !item.hidden && isLikelyChineseHotItem(item))
    .map(enrichItem);
  const byUrl = new Map();
  for (const item of [...dynamic, ...manual]) {
    const key = item.url || item.id;
    const prev = byUrl.get(key);
    if (!prev || (item.mpMetrics?.reads || 0) > (prev.mpMetrics?.reads || 0) || (item.publishedAt || "") > (prev.publishedAt || "")) {
      byUrl.set(key, item);
    }
  }
  return [...byUrl.values()]
    .map(decorateMpItem)
    .filter((item) => {
      if (!q) return true;
      return `${item.mpTitle || ""} ${item.title || ""} ${item.summary || ""} ${item.sourceName || ""} ${item.mpMeta?.accountLabel || ""} ${(item.tags || []).join(" ")}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aRecent = new Date(a.publishedAt || 0).getTime();
      const bRecent = new Date(b.publishedAt || 0).getTime();
      const aScore = (a.mpMetrics?.abnormal || 0) * 1000 + (a.mpMetrics?.reads || 0) / 100 + (a.score || 0) + ((a.mpMeta?.accountWeight || 1) - 1) * 100 + (a.mpMeta?.qualityRank || 0) * 120;
      const bScore = (b.mpMetrics?.abnormal || 0) * 1000 + (b.mpMetrics?.reads || 0) / 100 + (b.score || 0) + ((b.mpMeta?.accountWeight || 1) - 1) * 100 + (b.mpMeta?.qualityRank || 0) * 120;
      return bScore - aScore || bRecent - aRecent;
    });
}

function visibleItems(query, state = readState()) {
  const threshold = Number(state.settings?.rules?.selectedThreshold || 72);
  const q = String(query.q || "").trim().toLowerCase();
  const searchMode = query.searchMode === "full" ? "full" : "direct";
  const mode = String(query.mode || "selected");
  const tag = String(query.tag || "");
  const channel = String(query.channel || "");
  const category = String(query.category || "");
  const sort = searchMode === "full" && q && query.sort !== "published_desc" ? "relevance" : "published_desc";
  const filtered = state.items
    .filter((item) => {
      if (mode === "selected") return isSelectedFeedEligible(item, threshold);
      if (item.hidden || !isOriginalHttpUrl(item.url)) return false;
      if (mode === "mp") return isChineseMedia(item) && isQualityCandidate(item);
      return isQualityCandidate(item);
    })
    .filter((item) => (!channel ? true : sourceChannel(item) === channel))
    .filter((item) => (!category ? true : itemCategory(item) === category || categoryLabel(itemCategory(item)) === category))
    .filter((item) => (!tag ? true : item.tags?.includes(tag)))
    .filter((item) => {
      if (!q) return true;
      const directFields = [item.title, item.summary, item.sourceName, item.tags?.join(" ")].map((value) => String(value || "")).join(" ");
      const fullFields = [item.content, item.raw?.content, item.raw?.description, item.reason, item.editorialBrief?.fact, item.editorialBrief?.impact, item.editorialBrief?.scenario].map((value) => String(value || "")).join(" ");
      return `${directFields}${searchMode === "full" ? ` ${fullFields}` : ""}`.toLowerCase().includes(q);
    });
  const searchRank = (item) => {
    if (!q || searchMode !== "full") return 0;
    const fields = [
      [item.title, 8],
      [item.summary, 6],
      [item.reason, 5],
      [item.editorialBrief?.fact, 5],
      [item.editorialBrief?.impact, 4],
      [item.editorialBrief?.scenario, 4],
      [item.sourceName, 3],
      [item.tags?.join(" "), 3],
      [item.content, 2],
      [item.raw?.content, 2],
      [item.raw?.description, 2],
    ];
    return fields.reduce((score, [value, weight]) => score + (String(value || "").toLowerCase().includes(q) ? weight : 0), 0);
  };
  const compareByPublishedAt = (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
  const compareBySearch = (a, b) => searchRank(b) - searchRank(a) || compareByPublishedAt(a, b);
  if (mode !== "selected") {
    const sorted = filtered.sort(sort === "relevance" ? compareBySearch : compareByPublishedAt);
    if (mode !== "all") return sorted;
    const caps = { hn: 20, github: 16, arxiv: 16, devto: 0 };
    const counts = new Map();
    return sorted.filter((item) => {
      const cap = caps[item.sourceKind];
      if (cap === undefined) return true;
      const count = counts.get(item.sourceKind) || 0;
      if (count >= cap) return false;
      counts.set(item.sourceKind, count + 1);
      return true;
    });
  }
  const selected = selectCuratedItems(filtered, state.settings?.rules);
  if (!q) return selected;
  return selected.sort(sort === "relevance" ? compareBySearch : compareByPublishedAt);
}

function selectedRank(item) {
  const tierBoost = {
    preferred_x: 24,
    official_first_party: 22,
    expert_rss: 18,
    reference: 8,
    cn_media: 2,
    community_fallback: -16,
  }[item.priorityTier] || 0;
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt || 0).getTime()) / 36e5);
  const freshness = Math.max(0, 18 - Math.min(18, ageHours / 4));
  return Number(Boolean(item.pinned)) * 1000 + selectedRankingScore(item) + tierBoost + freshness;
}

function isXStatusSignal(item) {
  return /https?:\/\/(x|twitter)\.com\/[^"'\s<>\\]+\/status\//i.test(item.url || "");
}

function selectCuratedItems(items = [], rules = {}) {
  const limit = Math.min(100, Math.max(20, Number(rules?.selectedFeedLimit || 60)));
  const sourceLimit = Math.max(3, Math.floor(limit * Number(rules?.selectedSourceShare || 0.2)));
  const communityLimit = Math.min(limit, Math.max(0, Number(rules?.selectedCommunityLimit || 6)));
  const cnMediaLimit = Math.min(limit, Math.max(6, Number(rules?.selectedCnMediaLimit || 18)));
  const cnSourceLimit = Math.min(sourceLimit, Math.max(1, Number(rules?.selectedCnSourceLimit || 5)));
  const preferredTarget = Math.ceil(limit * Number(rules?.selectedPreferredShare || 0.6));
  const xTarget = Math.ceil(limit * Number(rules?.selectedXShare || 0.2));
  const ranked = items
    .filter((item) => isOriginalHttpUrl(item.url))
    .filter((item) => canAppearInSelectedFeed(item))
    .sort((a, b) => selectedRank(b) - selectedRank(a) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  const selected = [];
  const selectedIds = new Set();
  const sourceCounts = new Map();
  let communityCount = 0;
  let cnMediaCount = 0;
  let xCount = 0;

  const isPreferred = (item) => ["preferred_x", "official_first_party", "expert_rss"].includes(item.priorityTier);
  const isPreferredX = (item) => item.priorityTier === "preferred_x" || item.sourceKind === "x" || isXStatusSignal(item);
  const canTake = (item) => {
    if (selected.length >= limit || selectedIds.has(item.id)) return false;
    const sourceKey = item.sourceId || item.sourceName || item.sourceKind || "unknown";
    if (!item.pinned && (sourceCounts.get(sourceKey) || 0) >= sourceLimit) return false;
    const community = item.priorityTier === "community_fallback" || ["hn", "github", "devto", "arxiv"].includes(item.sourceKind);
    if (!item.pinned && community && communityCount >= communityLimit) return false;
    if (!item.pinned && isPreferredX(item) && xCount >= xTarget) return false;
    const cnMedia = item.priorityTier === "cn_media";
    if (!item.pinned && cnMedia && (sourceCounts.get(sourceKey) || 0) >= cnSourceLimit) return false;
    if (!item.pinned && cnMedia && cnMediaCount >= cnMediaLimit) return false;
    return true;
  };
  const take = (item) => {
    if (!canTake(item)) return false;
    const sourceKey = item.sourceId || item.sourceName || item.sourceKind || "unknown";
    selected.push(item);
    selectedIds.add(item.id);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    if (item.priorityTier === "community_fallback" || ["hn", "github", "devto", "arxiv"].includes(item.sourceKind)) communityCount += 1;
    if (item.priorityTier === "cn_media") cnMediaCount += 1;
    if (isPreferredX(item)) xCount += 1;
    return true;
  };

  for (const item of ranked.filter((candidate) => candidate.pinned)) take(item);
  for (const item of ranked.filter(isPreferredX)) {
    if (selected.filter(isPreferredX).length >= xTarget) break;
    take(item);
  }
  for (const item of ranked.filter(isPreferred)) {
    if (selected.filter(isPreferred).length >= preferredTarget) break;
    take(item);
  }
  for (const item of ranked.filter((candidate) => !isPreferred(candidate))) take(item);
  for (const item of ranked) take(item);

  const ordered = selected.sort((a, b) => selectedRank(b) - selectedRank(a) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  const pinned = ordered.filter((item) => item.pinned);
  const xSignals = ordered.filter((item) => !item.pinned && isPreferredX(item));
  const otherSignals = ordered.filter((item) => !item.pinned && !isPreferredX(item));
  if (!xSignals.length || !otherSignals.length) return ordered;

  const interval = Math.max(1, Math.floor((xSignals.length + otherSignals.length) / xSignals.length));
  const interleaved = [];
  while (xSignals.length || otherSignals.length) {
    for (let index = 1; index < interval && otherSignals.length; index += 1) interleaved.push(otherSignals.shift());
    if (xSignals.length) interleaved.push(xSignals.shift());
    else interleaved.push(...otherSignals.splice(0));
  }
  return [...pinned, ...interleaved];
}

function itemsResponse(query, state = readState()) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(200, Math.max(10, Number(query.pageSize || 40)));
  const items = visibleItems(query, state);
  return {
    items: attachRelated(items.slice((page - 1) * pageSize, page * pageSize).map(enrichItem), state.clusters || []),
    total: items.length,
    page,
    pageSize,
    search: {
      query: String(query.q || "").trim(),
      mode: query.searchMode === "full" ? "full" : "direct",
      sort: query.searchMode === "full" && String(query.q || "").trim() && query.sort !== "published_desc" ? "relevance" : "published_desc",
    },
  };
}

function publicItemDetail(state, id) {
  const item = (state.items || []).find((candidate) => candidate.id === id && isPublicItem(candidate));
  if (!item) return null;
  const cluster = (state.clusters || []).find((candidate) => (candidate.items || []).some((member) => (
    (typeof member === "string" ? member : member?.id) === id
  )));
  const decorated = enrichItem(item);
  if (cluster) {
    const itemsById = new Map((state.items || []).map((candidate) => [candidate.id, candidate]));
    const publicMembers = (cluster.items || [])
      .map((member) => itemsById.get(typeof member === "string" ? member : member?.id))
      .filter(Boolean)
      .filter(isPublicItem);
    const sourceNamesByIdentity = new Map();
    for (const member of publicMembers) {
      const identity = member.sourceId || member.sourceName;
      if (identity && !sourceNamesByIdentity.has(identity)) {
        sourceNamesByIdentity.set(identity, member.sourceName || member.sourceId);
      }
    }
    decorated.related = {
      count: publicMembers.length,
      sources: [...sourceNamesByIdentity.values()].filter(Boolean),
      topScore: Math.max(0, ...publicMembers.map((member) => Number(member.score || 0))),
    };
  }
  return { item: serializePublicItem(decorated) };
}

app.get("/api/items", (req, res) => {
  res.json(itemsResponse(req.query));
});

function publicItems(query) {
  const state = readState();
  return attachRelated(visibleItems(query).map(enrichItem), state.clusters || []).map(serializePublicItem);
}

function publicToday(query = {}, state = readState()) {
  const limit = Math.min(5, Math.max(1, Number(query.limit || 5)));
  const result = buildTodaySignals(state, {
    now: new Date(),
    limit,
    selectedThreshold: state.settings?.rules?.selectedThreshold || 72,
    enrichItem,
  });
  return {
    ...result,
    items: result.items.map((signal) => ({
      ...serializePublicItem(signal),
      latestAt: signal.latestAt,
      sourceCount: signal.sourceCount,
      sources: signal.sources,
      status: signal.status,
      creatorValue: signal.creatorValue,
      evidenceMeta: signal.evidenceMeta,
      representative: serializePublicItem(signal.representative),
      relatedItems: signal.relatedItems.map(serializePublicItem),
    })),
  };
}

function publicHotTopics(state) {
  const result = buildHotTopics(state, {
    selectedThreshold: state.settings?.rules?.selectedThreshold || 70,
    enrichItem,
  });
  return {
    ...result,
    items: result.items.map((topic) => ({
      ...topic,
      representative: serializePublicItem(topic.representative),
      relatedItems: topic.relatedItems.map(serializePublicItem),
    })),
  };
}

function localDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function shanghaiDayRange(value = new Date()) {
  const [year, month, day] = localDateKey(value).split("-").map(Number);
  const start = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function dailyIssueMeta(value = new Date()) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const minutes = hour * 60 + minute;
  const label = minutes < 11 * 60 ? "早报" : minutes < 15 * 60 ? "午间更新" : "晚间更新";
  return {
    issueKey: `${localDateKey(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    issueLabel: label,
    issueTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

const dailySectionOrder = ["model", "product", "industry", "research", "opinion", "education", "culture", "opensource"];

function digestItemKeys(item = {}) {
  return [
    item.id,
    item.canonicalUrl,
    item.url ? canonicalUrl(item.url) : "",
    item.eventId,
    item.titleFingerprint,
    item.title ? titleFingerprint(item.title) : "",
  ].filter(Boolean);
}

function collectDailyDigestItemKeys(digests = [], generatedAt = new Date()) {
  const targetKey = localDateKey(generatedAt);
  const keys = new Set();
  for (const digest of digests || []) {
    if (localDateKey(digest.generatedAt) !== targetKey) continue;
    const items = [
      ...(digest.items || []),
      ...(digest.sections || []).flatMap((section) => section.items || []),
    ];
    for (const item of items) {
      for (const key of digestItemKeys(item)) keys.add(key);
    }
  }
  return keys;
}

function buildDailyDigest(state, query = {}, options = {}) {
  const q = String(query.q || "").trim().toLowerCase();
  const since = Number(options.since || 0);
  const until = Number(options.until || 0);
  const excludeKeys = options.excludeKeys || new Set();
  let excludedCount = 0;
  const pool = state.items
    .filter((item) => !item.hidden)
    .filter((item) => isSelectedQualityCandidate(item))
    .filter((item) => isCuratedSourceAllowed(item))
    .filter((item) => {
      if (!excludeKeys.size) return true;
      const alreadyCovered = digestItemKeys(item).some((key) => excludeKeys.has(key));
      if (alreadyCovered) excludedCount += 1;
      return !alreadyCovered;
    })
    .filter((item) => {
      const published = new Date(item.publishedAt || 0).getTime();
      if (since && published < since) return false;
      if (until && published >= until) return false;
      return true;
    })
    .filter((item) => {
      if (!q) return true;
      return `${item.title} ${item.summary} ${item.sourceName} ${item.tags?.join(" ")}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aRecent = since ? new Date(a.publishedAt || 0).getTime() >= since ? 1 : 0 : 0;
      const bRecent = since ? new Date(b.publishedAt || 0).getTime() >= since ? 1 : 0 : 0;
      const aCommunity = a.priorityTier === "community_fallback" || ["hn", "github", "arxiv", "devto"].includes(a.sourceKind) ? 1 : 0;
      const bCommunity = b.priorityTier === "community_fallback" || ["hn", "github", "arxiv", "devto"].includes(b.sourceKind) ? 1 : 0;
      return bRecent - aRecent || aCommunity - bCommunity || b.score - a.score || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  const dailyCommunityCaps = { hn: 8, github: 8, arxiv: 8, devto: 0 };
  const dailyCommunityCounts = new Map();
  const ranked = pool
    .filter((item) => {
      const cap = dailyCommunityCaps[item.sourceKind];
      if (cap === undefined) return true;
      const count = dailyCommunityCounts.get(item.sourceKind) || 0;
      if (count >= cap) return false;
      dailyCommunityCounts.set(item.sourceKind, count + 1);
      return true;
    })
    .map(enrichItem);
  const top = ranked.slice(0, 60);
  const tagCounts = new Map();
  for (const item of top) {
    for (const tag of item.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const sections = dailySectionOrder
    .map((category) => ({
      key: category,
      title: categoryLabel(category),
      items: ranked.filter((item) => item.category === category).slice(0, 6),
    }))
    .filter((section) => section.items.length > 0);
  const storyCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const generatedAt = new Date(options.generatedAt || Date.now()).toISOString();
  const issue = dailyIssueMeta(generatedAt);
  const summary = storyCount
    ? `过去 ${until ? "24" : "36"} 小时内，系统从 ${state.sources.filter((source) => source.enabled).length} 个免费数据源抓取并筛选内容。今日重点集中在 ${[...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([tag]) => tag)
        .join("、") || "模型与产品动态"}。`
    : options.emptySummary || "当前窗口内暂无符合质量规则的新增内容。";
  return {
    id: options.id || makeId(`daily-${generatedAt}-${storyCount}`),
    generatedAt,
    ...issue,
    headline: options.headline || (storyCount ? `AI ${issue.issueLabel}：${storyCount} 条新增精选` : `AI ${issue.issueLabel}：暂无新增高价值内容`),
    summary,
    items: top.slice(0, 12),
    sections,
    excludedFromEarlierToday: excludedCount,
    fromSnapshot: Boolean(options.fromSnapshot),
    virtual: Boolean(options.virtual),
  };
}

app.get("/api/public/items", (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const take = Math.min(100, Math.max(1, Number(req.query.take || req.query.pageSize || 30)));
  const since = req.query.since ? new Date(String(req.query.since)).getTime() : 0;
  const category = String(req.query.category || "");
  const items = publicItems(req.query)
    .filter((item) => (!since ? true : new Date(item.publishedAt || 0).getTime() >= since))
    .filter((item) => (!category ? true : item.category === category || item.categoryLabel === category))
    .slice((page - 1) * take, page * take);
  res.json({ items, page, take });
});

app.get("/api/public/items/:id", (req, res) => {
  const detail = publicItemDetail(readAppState(), String(req.params.id));
  if (!detail) return res.status(404).json({ error: "item not found" });
  return res.json(detail);
});

app.get("/api/public/today", (req, res) => {
  res.json(publicToday(req.query));
});

app.get("/api/public/hot", (_req, res) => {
  const state = readAppState();
  res.json(publicHotTopics(state));
});

app.get("/api/public/stories/:id", (req, res) => {
  const state = readAppState();
  const story = buildStory(state, String(req.params.id), {
    selectedThreshold: state.settings?.rules?.selectedThreshold || 70,
    enrichItem,
  });
  if (!story) return res.status(404).json({ error: "story not found" });
  return res.json({
    ...story,
    event: {
      ...story.event,
      representative: serializePublicItem(story.event.representative),
    },
    latestUpdates: story.latestUpdates.map(serializePublicItem),
    timeline: story.timeline.map(serializePublicItem),
  });
});

app.get("/api/public/hot-topics", (_req, res) => {
  const state = readAppState();
  res.json(publicHotTopics(state));
});

app.get("/api/public/reports", (req, res) => {
  try {
    const state = readState();
    const report = buildReport(state, {
      period: String(req.query.period || "daily"),
      date: req.query.date ? String(req.query.date) : undefined,
      buildVirtualDigest: (dateKey) => {
        const range = shanghaiDayRange(`${dateKey}T12:00:00+08:00`);
        return buildDailyDigest(state, {}, {
          since: range.start,
          until: range.end,
          generatedAt: range.start + 12 * 60 * 60 * 1000,
          virtual: true,
        });
      },
    });
    res.json(serializePublicReport(report));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "report generation failed" });
  }
});

function serializePublicReport(report = {}) {
  return {
    ...report,
    sections: (report.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map(serializePublicItem),
    })),
    trendLines: (report.trendLines || []).map((line) => ({
      ...line,
      sampleItems: (line.sampleItems || []).map(serializePublicItem),
    })),
    watchItems: (report.watchItems || []).map(serializePublicItem),
  };
}

app.get("/api/public/trends", (req, res) => {
  try {
    const state = readState();
    const report = buildReport(state, {
      period: String(req.query.period || "weekly"),
      date: req.query.date ? String(req.query.date) : undefined,
      buildVirtualDigest: (dateKey) => {
        const range = shanghaiDayRange(`${dateKey}T12:00:00+08:00`);
        return buildDailyDigest(state, {}, {
          since: range.start,
          until: range.end,
          generatedAt: range.start + 12 * 60 * 60 * 1000,
          virtual: true,
        });
      },
    });
    res.json({
      period: report.period,
      range: report.range,
      summary: report.editorialSummary,
      items: (report.trendLines || []).map((line) => ({
        ...line,
        sampleItems: (line.sampleItems || []).map(serializePublicItem),
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "trend generation failed" });
  }
});

function currentDailyDigest(query = {}) {
  const state = readState();
  const todayKey = localDateKey();
  const latestSnapshot = state.dailyDigests?.find((digest) => localDateKey(digest.generatedAt) === todayKey);
  if (!query.q && latestSnapshot) {
    const snapshot = latestSnapshot;
    return {
      ...snapshot,
      ...dailyIssueMeta(snapshot.generatedAt),
      items: snapshot.items || (snapshot.sections || []).flatMap((section) => section.items || []).slice(0, 12),
      summary: snapshot.summary || `自动生成的 AI BAIZE 日报，共 ${(snapshot.sections || []).length} 个栏目。`,
      fromSnapshot: true,
    };
  }
  const since = Date.now() - 36 * 60 * 60 * 1000;
  return {
    ...buildDailyDigest(state, query, { since, generatedAt: new Date() }),
    fromSnapshot: false,
  };
}

app.get("/api/daily", (req, res) => {
  res.json(currentDailyDigest(req.query));
});

app.get("/api/public/daily", (req, res) => {
  res.json(currentDailyDigest(req.query));
});

function buildDailyArchive(state, take = 7, now = new Date()) {
  const snapshots = [...(state.dailyDigests || [])].sort((a, b) => new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime());
  const items = [];
  const snapshotDays = new Set(snapshots.map((digest) => localDateKey(digest.generatedAt)));
  const seenIssues = new Set();
  for (const snapshot of snapshots) {
    if (items.length >= take) break;
    const issue = dailyIssueMeta(snapshot.generatedAt);
    const issueKey = snapshot.id || issue.issueKey;
    if (seenIssues.has(issueKey)) continue;
    items.push({
      ...snapshot,
      ...issue,
      items: snapshot.items || (snapshot.sections || []).flatMap((section) => section.items || []).slice(0, 12),
      summary: snapshot.summary || `自动生成的 AI BAIZE 日报，共 ${(snapshot.sections || []).length} 个栏目。`,
      fromSnapshot: true,
    });
    seenIssues.add(issueKey);
  }
  for (let offset = 0; items.length < take && offset < take + 14; offset += 1) {
    const target = new Date(new Date(now).getTime() - offset * 24 * 60 * 60 * 1000);
    const key = localDateKey(target);
    if (snapshotDays.has(key)) continue;
    const range = shanghaiDayRange(target);
    const virtual = buildDailyDigest(state, {}, {
      since: range.start,
      until: range.end,
      generatedAt: range.start + 12 * 60 * 60 * 1000,
      virtual: true,
    });
    if (virtual.sections.length) {
      items.push(virtual);
      snapshotDays.add(key);
    }
  }
  return items
    .sort((a, b) => new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime())
    .slice(0, take);
}

app.get("/api/public/dailies", (_req, res) => {
  const state = readState();
  const take = Math.min(30, Math.max(1, Number(_req.query.take || 7)));
  res.json({ items: buildDailyArchive(state, take) });
});

app.post("/api/public/ask", publicWriteLimit, (req, res) => {
  const question = String(req.body?.question || "").trim();
  const command = String(req.body?.command || "").trim();
  const itemId = String(req.body?.itemId || "").trim();
  if (!question && !command) {
    res.status(400).json({ error: "question or command is required" });
    return;
  }
  res.json(answerQuestion(readState(), { question, command, itemId }));
});

function generateDailyDigest() {
  const state = readState();
  const since = Date.now() - 36 * 60 * 60 * 1000;
  const generatedAt = new Date();
  const excludeKeys = collectDailyDigestItemKeys(state.dailyDigests || [], generatedAt);
  const digest = buildDailyDigest(state, {}, {
    since,
    generatedAt,
    id: makeId(`daily-${Date.now()}`),
    excludeKeys,
    emptySummary: excludeKeys.size
      ? "本期未发现未报道的高质量候选，已避免复用今日早前快报内容。"
      : "当前窗口内暂无符合质量规则的新增内容。",
  });
  state.dailyDigests = [digest, ...(state.dailyDigests || [])].slice(0, 30);
  writeState(state);
  return digest;
}

app.get("/api/stats", (_req, res) => {
  const state = readState();
  const items = state.items.filter((item) => !item.hidden);
  const selected = visibleItems({ mode: "selected" });
  const tags = new Map();
  for (const item of items) {
    for (const tag of item.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  const channels = new Map();
  for (const item of items) {
    const channel = sourceChannel(item);
    channels.set(channel, (channels.get(channel) || 0) + 1);
  }
  const sourceTiers = new Map();
  for (const source of state.sources) {
    const key = source.health && !source.health.ok ? "failed" : source.noisePenalty >= 10 || source.priorityTier === "community_fallback" ? "lowered" : source.preferred ? "preferred" : "normal";
    sourceTiers.set(key, (sourceTiers.get(key) || 0) + 1);
  }
  res.json({
    total: items.length,
    selected: selected.length,
    sources: state.sources.length,
    refreshedAt: state.settings.refreshedAt,
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    channels: [...channels.entries()].map(([channel, count]) => ({ channel, count })),
    sourceTiers: [...sourceTiers.entries()].map(([tier, count]) => ({ tier, count })),
    clusters: state.clusters || [],
    healthySources: state.sources.filter((source) => source.health?.ok).length,
    failingSources: state.sources.filter((source) => source.health && !source.health.ok).length,
    runs: state.runs || [],
  });
});

app.get("/api/mp", (req, res) => {
  const state = readState();
  const articles = buildMpItems(state, req.query);
  const manualCount = state.mpArticles?.length || 0;
  const groups = articles.reduce((acc, item) => {
    const key = item.mpMeta?.accountType || "aggregator";
    const label = item.mpMeta?.accountLabel || "聚合线索";
    const current = acc.get(key) || { key, label, count: 0 };
    current.count += 1;
    acc.set(key, current);
    return acc;
  }, new Map());
  const trends = articles.reduce((acc, item) => {
    const key = item.mpMeta?.trendKey || "industry";
    const label = item.mpMeta?.trendLabel || "行业动态";
    const current = acc.get(key) || { key, label, count: 0 };
    current.count += 1;
    acc.set(key, current);
    return acc;
  }, new Map());
  const tiers = articles.reduce((acc, item) => {
    const key = item.mpMeta?.qualityTier || "b";
    const label = item.mpMeta?.qualityLabel || "观察备用";
    const current = acc.get(key) || { key, label, count: 0 };
    current.count += 1;
    acc.set(key, current);
    return acc;
  }, new Map());
  res.json({
    items: articles.slice(0, 300),
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    trends: [...trends.values()].sort((a, b) => b.count - a.count),
    tiers: [...tiers.values()].sort((a, b) => b.count - a.count),
    note: `公众号爆文池：后台补录 ${manualCount} 条，实时中文动态 ${Math.max(0, articles.length - manualCount)} 条；已加入中文信源权重、账号类型分组和编辑标题。真实阅读优先展示，缺失指标标记为系统估算。`,
    refreshedAt: state.settings?.refreshedAt || null,
  });
});

app.get("/api/sources", (_req, res) => {
  res.json(readState().sources);
});

app.get("/feed.xml", (req, res) => {
  const items = publicItems({ mode: req.query.mode || "selected" }).slice(0, 50);
  const base = publicBaseUrl(req);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AIHOT Clone</title>
    <link>${xmlEscape(base)}</link>
    <description>AI 自动筛选的高价值动态</description>
    ${items
      .map(
        (item) => `<item>
      <title>${cdata(item.title)}</title>
      <link>${xmlEscape(item.url)}</link>
      <guid>${xmlEscape(item.canonicalUrl || item.url || item.id)}</guid>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      <description>${cdata(item.summary)}</description>
    </item>`,
      )
      .join("\n")}
  </channel>
</rss>`;
  res.type("application/rss+xml").send(xml);
});

app.get("/openapi.json", (req, res) => {
  const base = publicBaseUrl(req);
  res.json({
    openapi: "3.1.0",
    info: { title: "AIHOT Public API", version: "1.0.0" },
    servers: [{ url: base }],
    paths: {
      "/api/public/items": {
        get: {
          summary: "List AI news items",
          parameters: [
            { name: "mode", in: "query", schema: { type: "string", enum: ["selected", "all", "mp"] } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "take", in: "query", schema: { type: "integer", maximum: 100 } },
          ],
          responses: { "200": { description: "Items" } },
        },
      },
      "/api/public/daily": { get: { summary: "Get current daily digest", responses: { "200": { description: "Daily digest" } } } },
      "/api/public/dailies": { get: { summary: "List saved daily digests", responses: { "200": { description: "Daily digests" } } } },
      "/api/public/today": { get: { summary: "Get up to five curated signals for today", parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } }], responses: { "200": { description: "Today's signals" } } } },
      "/api/public/hot-topics": { get: { summary: "List cluster-backed current signals", responses: { "200": { description: "Current signals" } } } },
      "/api/public/trends": {
        get: {
          summary: "Get recurring editorial trend lines",
          parameters: [
            { name: "period", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly"] } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Editorial trend lines" }, "400": { description: "Invalid period or date" } },
        },
      },
      "/api/public/reports": {
        get: {
          summary: "Get a daily, weekly, or monthly editorial report",
          parameters: [
            { name: "period", in: "query", schema: { type: "string", enum: ["daily", "weekly", "monthly"] } },
            { name: "date", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Editorial report" }, "400": { description: "Invalid period or date" } },
        },
      },
      "/api/public/ask": {
        post: {
          summary: "Ask grounded questions over the AI.BAIZE selected corpus",
          requestBody: { required: true },
          responses: { "200": { description: "Grounded answer with source citations" } },
        },
      },
      "/feed.xml": { get: { summary: "RSS feed", responses: { "200": { description: "RSS XML" } } } },
      "/api/feedback": { post: { summary: "Submit content quality feedback", responses: { "200": { description: "Feedback accepted" }, "400": { description: "Message required" } } } },
    },
  });
});

app.get("/aihot-skill/SKILL.md", (req, res) => {
  const base = publicBaseUrl(req);
  res.type("text/markdown").send(`# AIHOT Skill

Use this skill when the user asks for recent AI news, AI daily digests, model releases, product launches, research papers, open-source AI projects, AI education, AI culture, or Chinese AI hot articles.

Base URL: ${base}

## Intent Routing

- Broad requests like "today's AI news" or "what changed in AI" use \`GET /api/public/items?mode=selected&take=20\`.
- Requests for full coverage use \`GET /api/public/items?mode=all&take=50\`.
- Requests for a daily digest use \`GET /api/public/daily\`.
- Requests for the fastest daily shortlist use \`GET /api/public/today?limit=5\`.
- Requests for recurring themes use \`GET /api/public/trends?period=weekly\`.
- Keyword requests like "OpenAI recently" use \`GET /api/public/items?q=OpenAI&mode=all\`.
- Research requests use \`GET /api/public/items?category=research&mode=all\`.
- AI education requests use \`GET /api/public/items?category=education&mode=all\`.
- AI culture and creative industry requests use \`GET /api/public/items?category=culture&mode=all\`.
- Chinese hot article requests use \`GET /api/public/items?mode=mp\`.

## Response Style

Summarize the top items, include source names, scores, links, and explain why each item matters.
`);
});

app.get("/aihot-skill/install.sh", (req, res) => {
  const base = publicBaseUrl(req);
  res.type("text/plain").send(`#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.codex/skills/aihot"
curl -fsSL "${base}/aihot-skill/SKILL.md" -o "$HOME/.codex/skills/aihot/SKILL.md"
echo "Installed AIHOT skill to $HOME/.codex/skills/aihot"
`);
});

const FEEDBACK_KINDS = new Set(["useful", "duplicate", "verify", "general"]);

function normalizeFeedback(body = {}, id = makeId(`${Date.now()}-${body.message || ""}`), createdAt = new Date().toISOString()) {
  const kind = FEEDBACK_KINDS.has(String(body.kind || "")) ? String(body.kind) : "general";
  return {
    id,
    message: String(body.message || "").trim().slice(0, 1000),
    contact: String(body.contact || "").trim().slice(0, 200),
    page: String(body.page || "").trim().slice(0, 200),
    kind,
    itemId: String(body.itemId || "").trim().slice(0, 120),
    context: String(body.context || "").trim().slice(0, 240),
    status: "open",
    createdAt,
  };
}

app.get("/api/admin/state", requireAdmin, (_req, res) => {
  res.json(readState());
});

app.post("/api/feedback", publicWriteLimit, (req, res) => {
  const state = readState();
  const feedback = normalizeFeedback(req.body || {});
  if (!feedback.message) {
    res.status(400).json({ error: "message required" });
    return;
  }
  state.feedback = [feedback, ...(state.feedback || [])].slice(0, 300);
  writeState(state);
  res.json({ ok: true, feedback });
});

app.post("/api/admin/refresh", requireAdmin, adminWriteLimit, async (_req, res) => {
  try {
    res.json(await refreshAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/enhance", requireAdmin, adminWriteLimit, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.body?.limit || req.query.limit || 60)));
    const force = req.body?.force === true || req.query.force === "1";
    res.json(await enhanceRecentItems({ limit, force }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/daily", requireAdmin, adminWriteLimit, (_req, res) => {
  res.json(generateDailyDigest());
});

app.post("/api/admin/mp/seed", requireAdmin, adminWriteLimit, (_req, res) => {
  const state = readState();
  const existing = new Set((state.mpArticles || []).map((article) => article.url));
  const seeds = state.items
    .filter((item) => !item.hidden && isLikelyChineseHotItem(item) && item.url && !existing.has(item.url))
    .slice(0, 50)
    .map((item) =>
      normalizeMpArticle({
        title: item.title,
        url: item.url,
        account: item.sourceName,
        publishedAt: item.publishedAt,
        summary: item.summary,
        score: item.score,
        tags: item.tags,
        accountBaseline: 5000,
      }),
    );
  state.mpArticles = [...seeds, ...(state.mpArticles || [])].slice(0, 500);
  writeState(state);
  res.json({ ok: true, added: seeds.length });
});

app.post("/api/admin/mp/articles", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  const article = normalizeMpArticle(req.body || {});
  state.mpArticles = [article, ...(state.mpArticles || []).filter((item) => item.id !== article.id)].slice(0, 500);
  writeState(state);
  res.json({ ok: true, article });
});

app.put("/api/admin/mp/articles/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.mpArticles = (state.mpArticles || []).map((article) => (article.id === req.params.id ? normalizeMpArticle({ ...article, ...req.body, id: article.id }) : article));
  writeState(state);
  res.json({ ok: true });
});

app.delete("/api/admin/mp/articles/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.mpArticles = (state.mpArticles || []).filter((article) => article.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/settings", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.settings = {
    ...state.settings,
    ...req.body,
    rules: {
      ...(state.settings.rules || {}),
      ...(req.body.rules || {}),
    },
  };
  writeState(state);
  res.json({ ok: true, settings: state.settings });
});

app.post("/api/admin/sources", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  const body = req.body || {};
  const source = {
    id: body.id || makeId(`${body.name}-${body.url}`),
    name: String(body.name || "新信源"),
    kind: String(body.kind || "rss"),
    url: String(body.url || ""),
    enabled: body.enabled ?? true,
    tier: String(body.tier || "custom"),
    priorityTier: String(body.priorityTier || body.tier || "custom"),
    preferred: Boolean(body.preferred),
    noisePenalty: Number(body.noisePenalty || 0),
    topicBoosts: body.topicBoosts || {},
    limit: Number(body.limit || 30),
    health: null,
  };
  if (!source.url) {
    res.status(400).json({ error: "url required" });
    return;
  }
  state.sources = [source, ...state.sources.filter((item) => item.id !== source.id)];
  writeState(state);
  res.json({ ok: true, source });
});

app.put("/api/admin/sources/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.sources = state.sources.map((source) => (source.id === req.params.id ? { ...source, ...req.body } : source));
  writeState(state);
  res.json({ ok: true, sources: state.sources });
});

app.delete("/api/admin/sources/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.sources = state.sources.filter((source) => source.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/feedback/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.feedback = (state.feedback || []).map((item) => (item.id === req.params.id ? { ...item, ...req.body, updatedAt: new Date().toISOString() } : item));
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/items/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.items = state.items.map((item) => (item.id === req.params.id ? { ...item, ...req.body, updatedAt: new Date().toISOString() } : item));
  writeState(state);
  res.json({ ok: true });
});

app.delete("/api/admin/items/:id", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.items = state.items.filter((item) => item.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/sources", requireAdmin, adminWriteLimit, (req, res) => {
  const state = readState();
  state.sources = Array.isArray(req.body.sources) ? req.body.sources : state.sources;
  writeState(state);
  res.json({ ok: true, sources: state.sources });
});

function ipv6Value(address = "") {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const octets = value.slice(lastColon + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    value = `${value.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) + BigInt(`0x${group}`), 0n);
}

function ipv6InCidr(value, network, prefix) {
  const networkValue = ipv6Value(network);
  if (value === null || networkValue === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (networkValue >> shift);
}

const NON_PUBLIC_IPV6_CIDRS = [
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

// IANA IPv6 Global Unicast Address Space allocations, updated 2025-10-10:
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/
// Unlisted address space within 2000::/3 remains reserved for future allocation.
const ALLOCATED_GLOBAL_IPV6_CIDRS = [
  ["2001::", 23],
  ["2001:200::", 23],
  ["2001:400::", 23],
  ["2001:600::", 23],
  ["2001:800::", 22],
  ["2001:c00::", 23],
  ["2001:e00::", 23],
  ["2001:1200::", 23],
  ["2001:1400::", 22],
  ["2001:1800::", 23],
  ["2001:1a00::", 23],
  ["2001:1c00::", 22],
  ["2001:2000::", 19],
  ["2001:4000::", 23],
  ["2001:4200::", 23],
  ["2001:4400::", 23],
  ["2001:4600::", 23],
  ["2001:4800::", 23],
  ["2001:4a00::", 23],
  ["2001:4c00::", 23],
  ["2001:5000::", 20],
  ["2001:8000::", 19],
  ["2001:a000::", 20],
  ["2001:b000::", 20],
  ["2002::", 16],
  ["2003::", 18],
  ["2400::", 12],
  ["2410::", 12],
  ["2600::", 12],
  ["2610::", 23],
  ["2620::", 23],
  ["2630::", 12],
  ["2800::", 12],
  ["2a00::", 12],
  ["2a10::", 12],
  ["2c00::", 12],
];

// Globally reachable more-specific assignments inside the otherwise non-global 2001::/23:
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const GLOBAL_IPV6_SPECIAL_PURPOSE_CIDRS = [
  ["2001:1::1", 128],
  ["2001:1::2", 128],
  ["2001:1::3", 128],
  ["2001:3::", 32],
  ["2001:4:112::", 48],
  ["2001:20::", 28],
  ["2001:30::", 28],
];

// IANA IPv4 Special-Purpose Address Registry entries that are not globally reachable.
const NON_GLOBAL_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4Value(address = "") {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function ipv4InCidr(value, network, prefix) {
  const networkValue = ipv4Value(network);
  if (value === null || networkValue === null) return false;
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(value / blockSize) === Math.floor(networkValue / blockSize);
}

function isGloballyRoutableIp(address = "") {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const family = net.isIP(normalized);
  if (family === 4) {
    const value = ipv4Value(normalized);
    if (value === null) return false;
    const ietfProtocolAssignments = ipv4InCidr(value, "192.0.0.0", 24);
    const globallyReachableIetfAnycast = normalized === "192.0.0.9" || normalized === "192.0.0.10";
    if (ietfProtocolAssignments && !globallyReachableIetfAnycast) return false;
    return !NON_GLOBAL_IPV4_CIDRS.some(([network, prefix]) => ipv4InCidr(value, network, prefix));
  }
  if (family === 6) {
    const value = ipv6Value(normalized);
    if (value === null) return false;
    const embeddedIpv4Prefix = [
      ["::", 96],
      ["::ffff:0:0", 96],
      ["::ffff:0:0:0", 96],
      ["64:ff9b::", 96],
    ].find(([network, prefix]) => ipv6InCidr(value, network, prefix));
    if (embeddedIpv4Prefix) {
      const ipv4 = Number(value & 0xffffffffn);
      return isGloballyRoutableIp(`${(ipv4 >>> 24) & 255}.${(ipv4 >>> 16) & 255}.${(ipv4 >>> 8) & 255}.${ipv4 & 255}`);
    }
    const isAllocatedGlobalUnicast = ALLOCATED_GLOBAL_IPV6_CIDRS
      .some(([network, prefix]) => ipv6InCidr(value, network, prefix));
    if (!isAllocatedGlobalUnicast) return false;
    if (GLOBAL_IPV6_SPECIAL_PURPOSE_CIDRS.some(([network, prefix]) => ipv6InCidr(value, network, prefix))) {
      return true;
    }
    return !NON_PUBLIC_IPV6_CIDRS.some(([network, prefix]) => ipv6InCidr(value, network, prefix));
  }
  return false;
}

async function assertPublicHttpTarget(target, lookup = dns.lookup) {
  if (!/^https?:$/.test(target.protocol)) {
    throw new Error("Unsupported media url");
  }
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Blocked private media url");
  }
  if (net.isIP(hostname)) {
    if (!isGloballyRoutableIp(hostname)) throw new Error("Blocked private media url");
    return { address: hostname, family: net.isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isGloballyRoutableIp(entry.address))) {
    throw new Error("Blocked private media url");
  }
  return addresses[0];
}

function createPinnedLookup(resolved) {
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
      return;
    }
    callback(null, resolved.address, resolved.family);
  };
}

function requestMediaHop(target, resolved) {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request(target, {
      headers: {
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: `${target.protocol}//${target.host}/`,
      },
      lookup: createPinnedLookup(resolved),
    }, (upstream) => {
      const chunks = [];
      let size = 0;
      upstream.on("data", (chunk) => {
        size += chunk.length;
        if (size > 15 * 1024 * 1024) {
          request.destroy(new Error("Media response too large"));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on("end", () => resolve({
        status: upstream.statusCode || 502,
        headers: upstream.headers,
        body: Buffer.concat(chunks),
      }));
      upstream.on("error", reject);
    });
    request.setTimeout(12000, () => request.destroy(new Error("Media request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicMedia(target, options = {}, redirectCount = 0) {
  const resolved = await assertPublicHttpTarget(target, options.lookup || dns.lookup);
  const response = await (options.requestHop || requestMediaHop)(target, resolved);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers?.location;
    if (!location) throw new Error("Media redirect missing location");
    if (redirectCount >= 4) throw new Error("Too many media redirects");
    return fetchPublicMedia(new URL(location, target), options, redirectCount + 1);
  }
  return response;
}

app.get("/api/media", async (req, res) => {
  const rawUrl = String(req.query.url || "");
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    res.status(400).send("Bad media url");
    return;
  }
  try {
    const upstream = await fetchPublicMedia(target);
    if (upstream.status < 200 || upstream.status >= 300) {
      res.status(upstream.status).send("Media fetch failed");
      return;
    }
    res.set("Content-Type", upstream.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(upstream.body);
  } catch (error) {
    if (/unsupported|private media|bad media/i.test(error.message || "")) {
      res.status(400).send(error.message || "Bad media url");
      return;
    }
    res.status(502).send("Media proxy failed");
  }
});

app.use(express.static(path.resolve(process.cwd(), "dist")));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
});

function startServer() {
  cron.schedule(readState().settings.cron || "*/30 * * * *", () => {
    refreshAll().catch((error) => console.error("[refresh]", error));
  });

  app.listen(PORT, () => {
    console.log(`AIHOT clone listening on http://0.0.0.0:${PORT}`);
    refreshAll().catch((error) => console.error("[initial refresh]", error));
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  buildDailyArchive,
  buildDailyDigest,
  collectDailyDigestItemKeys,
  createPinnedLookup,
  dailyIssueMeta,
  digestItemKeys,
  fetchPublicMedia,
  generateDailyDigest,
  itemsResponse,
  localDateKey,
  publicItemDetail,
  publicToday,
  requestMediaHop,
  selectCuratedItems,
  normalizeFeedback,
  startServer,
};
