const path = require("node:path");
const express = require("express");
const cron = require("node-cron");
const { readState, writeState } = require("./lib/store");
const { refreshAll } = require("./jobs/refresh");
const { attachRelated, categoryLabel, enrichItem, itemCategory, sourceChannel } = require("./lib/editorial");
const { enhanceRecentItems } = require("./lib/llmEnhancer");
const { isQualityCandidate, isSelectedQualityCandidate, makeId } = require("./lib/scoring");

const PORT = Number(process.env.PORT || 8080);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "aihot-admin";
const app = express();

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (req.headers.host === "aibaize.cc") {
    res.redirect(301, `https://www.aibaize.cc${req.originalUrl || req.url}`);
    return;
  }
  next();
});

function requireAdmin(req, res, next) {
  const token = req.header("x-admin-token") || req.query.token;
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
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

function visibleItems(query) {
  const state = readState();
  const threshold = Number(state.settings?.rules?.selectedThreshold || 72);
  const q = String(query.q || "").trim().toLowerCase();
  const mode = String(query.mode || "selected");
  const tag = String(query.tag || "");
  const channel = String(query.channel || "");
  const category = String(query.category || "");
  const filtered = state.items
    .filter((item) => !item.hidden)
    .filter((item) => {
      if (mode === "selected") return (item.pinned || item.score >= threshold) && isSelectedQualityCandidate(item);
      if (mode === "mp") return isChineseMedia(item) && isQualityCandidate(item);
      return isQualityCandidate(item);
    })
    .filter((item) => (!channel ? true : sourceChannel(item) === channel))
    .filter((item) => (!category ? true : itemCategory(item) === category || categoryLabel(itemCategory(item)) === category))
    .filter((item) => (!tag ? true : item.tags?.includes(tag)))
    .filter((item) => {
      if (!q) return true;
      return `${item.title} ${item.summary} ${item.sourceName} ${item.tags?.join(" ")}`.toLowerCase().includes(q);
    });
  if (mode !== "selected") {
    const sorted = filtered.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
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
  let communityCount = 0;
  const communityLimit = Number(state.settings?.rules?.selectedCommunityLimit || 12);
  return filtered
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .filter((item) => {
      const isCommunityFallback = item.priorityTier === "community_fallback" || ["hn", "github", "devto"].includes(item.sourceKind);
      if (!isCommunityFallback) return true;
      communityCount += 1;
      return communityCount <= communityLimit;
    })
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime() || (b.score || 0) - (a.score || 0));
}

app.get("/api/items", (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 40)));
  const items = visibleItems(req.query);
  const state = readState();
  res.json({
    items: attachRelated(items.slice((page - 1) * pageSize, page * pageSize).map(enrichItem), state.clusters || []),
    total: items.length,
    page,
    pageSize,
  });
});

function publicItems(query) {
  const state = readState();
  return attachRelated(visibleItems(query).map(enrichItem), state.clusters || []);
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

const dailySectionOrder = ["model", "product", "industry", "research", "opinion", "education", "culture", "opensource"];

function buildDailyDigest(state, query = {}, options = {}) {
  const q = String(query.q || "").trim().toLowerCase();
  const since = Number(options.since || 0);
  const until = Number(options.until || 0);
  const pool = state.items
    .filter((item) => !item.hidden)
    .filter((item) => isSelectedQualityCandidate(item))
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
  return {
    id: options.id || makeId(`daily-${options.generatedAt || Date.now()}-${storyCount}`),
    generatedAt: new Date(options.generatedAt || Date.now()).toISOString(),
    headline: options.headline || `AI 日报：${storyCount || top.slice(0, 12).length} 条栏目精选`,
    summary: `过去 ${until ? "24" : "36"} 小时内，系统从 ${state.sources.filter((source) => source.enabled).length} 个免费数据源抓取并筛选内容。今日重点集中在 ${[...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag)
      .join("、") || "模型与产品动态"}。`,
    items: top.slice(0, 12),
    sections,
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

function currentDailyDigest(query = {}) {
  const state = readState();
  const todayKey = localDateKey();
  const latestSnapshot = state.dailyDigests?.find((digest) => localDateKey(digest.generatedAt) === todayKey);
  if (!query.q && latestSnapshot) {
    const snapshot = latestSnapshot;
    return {
      ...snapshot,
      items: snapshot.items || (snapshot.sections || []).flatMap((section) => section.items || []).slice(0, 12),
      summary: snapshot.summary || `自动生成的 AI BAIZE 日报，共 ${(snapshot.sections || []).length} 个栏目。`,
      fromSnapshot: true,
    };
  }
  const since = Date.now() - 36 * 60 * 60 * 1000;
  return {
    ...buildDailyDigest(state, query, { since, generatedAt: new Date(), headline: "今日 AI 日报" }),
    fromSnapshot: false,
  };
}

app.get("/api/daily", (req, res) => {
  res.json(currentDailyDigest(req.query));
});

app.get("/api/public/daily", (req, res) => {
  res.json(currentDailyDigest(req.query));
});

app.get("/api/public/dailies", (_req, res) => {
  const state = readState();
  const take = Math.min(30, Math.max(1, Number(_req.query.take || 7)));
  const snapshots = state.dailyDigests || [];
  const items = [];
  const seen = new Set();
  for (let offset = 0; items.length < take && offset < take + 14; offset += 1) {
    const target = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = localDateKey(target);
    const snapshot = snapshots.find((digest) => localDateKey(digest.generatedAt) === key);
    if (snapshot) {
      items.push({
        ...snapshot,
        items: snapshot.items || (snapshot.sections || []).flatMap((section) => section.items || []).slice(0, 12),
        summary: snapshot.summary || `自动生成的 AI BAIZE 日报，共 ${(snapshot.sections || []).length} 个栏目。`,
        fromSnapshot: true,
      });
      seen.add(key);
      continue;
    }
    const range = shanghaiDayRange(target);
    const virtual = buildDailyDigest(state, {}, {
      since: range.start,
      until: range.end,
      generatedAt: range.start + 12 * 60 * 60 * 1000,
      virtual: true,
    });
    if (virtual.sections.length) {
      items.push(virtual);
      seen.add(key);
    }
  }
  for (const snapshot of snapshots) {
    const key = localDateKey(snapshot.generatedAt);
    if (items.length >= take) break;
    if (seen.has(key)) continue;
    items.push({
      ...snapshot,
      items: snapshot.items || (snapshot.sections || []).flatMap((section) => section.items || []).slice(0, 12),
      summary: snapshot.summary || `自动生成的 AI BAIZE 日报，共 ${(snapshot.sections || []).length} 个栏目。`,
      fromSnapshot: true,
    });
    seen.add(key);
  }
  res.json({ items });
});

function generateDailyDigest() {
  const state = readState();
  const since = Date.now() - 36 * 60 * 60 * 1000;
  const digest = buildDailyDigest(state, {}, { since, generatedAt: new Date(), id: makeId(`daily-${Date.now()}`) });
  state.dailyDigests = [digest, ...(state.dailyDigests || [])].slice(0, 30);
  writeState(state);
  return digest;
}

app.get("/api/stats", (_req, res) => {
  const state = readState();
  const threshold = Number(state.settings?.rules?.selectedThreshold || 72);
  const items = state.items.filter((item) => !item.hidden);
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
    selected: items.filter((item) => (item.pinned || item.score >= threshold) && isSelectedQualityCandidate(item)).length,
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
  const base = `http://${req.headers.host}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AIHOT Clone</title>
    <link>${base}</link>
    <description>AI 自动筛选的高价值动态</description>
    ${items
      .map(
        (item) => `<item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.url}</link>
      <guid>${item.canonicalUrl || item.url || item.id}</guid>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${item.summary}]]></description>
    </item>`,
      )
      .join("\n")}
  </channel>
</rss>`;
  res.type("application/rss+xml").send(xml);
});

app.get("/openapi.json", (req, res) => {
  const base = `http://${req.headers.host}`;
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
      "/feed.xml": { get: { summary: "RSS feed", responses: { "200": { description: "RSS XML" } } } },
    },
  });
});

app.get("/aihot-skill/SKILL.md", (req, res) => {
  const base = `http://${req.headers.host}`;
  res.type("text/markdown").send(`# AIHOT Skill

Use this skill when the user asks for recent AI news, AI daily digests, model releases, product launches, research papers, open-source AI projects, AI education, AI culture, or Chinese AI hot articles.

Base URL: ${base}

## Intent Routing

- Broad requests like "today's AI news" or "what changed in AI" use \`GET /api/public/items?mode=selected&take=20\`.
- Requests for full coverage use \`GET /api/public/items?mode=all&take=50\`.
- Requests for a daily digest use \`GET /api/public/daily\`.
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
  const base = `http://${req.headers.host}`;
  res.type("text/plain").send(`#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.codex/skills/aihot"
curl -fsSL "${base}/aihot-skill/SKILL.md" -o "$HOME/.codex/skills/aihot/SKILL.md"
echo "Installed AIHOT skill to $HOME/.codex/skills/aihot"
`);
});

app.get("/api/admin/state", requireAdmin, (_req, res) => {
  res.json(readState());
});

app.post("/api/feedback", (req, res) => {
  const state = readState();
  const body = req.body || {};
  const feedback = {
    id: makeId(`${Date.now()}-${body.message || ""}`),
    message: String(body.message || "").slice(0, 1000),
    contact: String(body.contact || "").slice(0, 200),
    page: String(body.page || "").slice(0, 200),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  if (!feedback.message) {
    res.status(400).json({ error: "message required" });
    return;
  }
  state.feedback = [feedback, ...(state.feedback || [])].slice(0, 300);
  writeState(state);
  res.json({ ok: true, feedback });
});

app.post("/api/admin/refresh", requireAdmin, async (_req, res) => {
  try {
    res.json(await refreshAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/enhance", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.body?.limit || req.query.limit || 60)));
    const force = req.body?.force === true || req.query.force === "1";
    res.json(await enhanceRecentItems({ limit, force }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/daily", requireAdmin, (_req, res) => {
  res.json(generateDailyDigest());
});

app.post("/api/admin/mp/seed", requireAdmin, (_req, res) => {
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

app.post("/api/admin/mp/articles", requireAdmin, (req, res) => {
  const state = readState();
  const article = normalizeMpArticle(req.body || {});
  state.mpArticles = [article, ...(state.mpArticles || []).filter((item) => item.id !== article.id)].slice(0, 500);
  writeState(state);
  res.json({ ok: true, article });
});

app.put("/api/admin/mp/articles/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.mpArticles = (state.mpArticles || []).map((article) => (article.id === req.params.id ? normalizeMpArticle({ ...article, ...req.body, id: article.id }) : article));
  writeState(state);
  res.json({ ok: true });
});

app.delete("/api/admin/mp/articles/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.mpArticles = (state.mpArticles || []).filter((article) => article.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
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

app.post("/api/admin/sources", requireAdmin, (req, res) => {
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

app.put("/api/admin/sources/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.sources = state.sources.map((source) => (source.id === req.params.id ? { ...source, ...req.body } : source));
  writeState(state);
  res.json({ ok: true, sources: state.sources });
});

app.delete("/api/admin/sources/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.sources = state.sources.filter((source) => source.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/feedback/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.feedback = (state.feedback || []).map((item) => (item.id === req.params.id ? { ...item, ...req.body, updatedAt: new Date().toISOString() } : item));
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/items/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.items = state.items.map((item) => (item.id === req.params.id ? { ...item, ...req.body, updatedAt: new Date().toISOString() } : item));
  writeState(state);
  res.json({ ok: true });
});

app.delete("/api/admin/items/:id", requireAdmin, (req, res) => {
  const state = readState();
  state.items = state.items.filter((item) => item.id !== req.params.id);
  writeState(state);
  res.json({ ok: true });
});

app.put("/api/admin/sources", requireAdmin, (req, res) => {
  const state = readState();
  state.sources = Array.isArray(req.body.sources) ? req.body.sources : state.sources;
  writeState(state);
  res.json({ ok: true, sources: state.sources });
});

app.get("/api/media", async (req, res) => {
  const rawUrl = String(req.query.url || "");
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    res.status(400).send("Bad media url");
    return;
  }
  if (!/^https?:$/.test(target.protocol)) {
    res.status(400).send("Unsupported media url");
    return;
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: `${target.protocol}//${target.host}/`,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      res.status(upstream.status).send("Media fetch failed");
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(buffer);
  } catch {
    res.status(502).send("Media proxy failed");
  }
});

app.use(express.static(path.resolve(process.cwd(), "dist")));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
});

cron.schedule(readState().settings.cron || "*/30 * * * *", () => {
  refreshAll().catch((error) => console.error("[refresh]", error));
});

app.listen(PORT, () => {
  console.log(`AIHOT clone listening on http://0.0.0.0:${PORT}`);
  refreshAll().catch((error) => console.error("[initial refresh]", error));
});
