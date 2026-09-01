const { editorialReasonFor } = require("./scoring");

function textOf(item) {
  return `${item.sourceName || ""} ${item.sourceKind || ""} ${item.url || ""} ${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`;
}

function tierOf(item = {}) {
  return item.priorityTier || item.sourceTier || item.tier || "";
}

function sourceChannel(item) {
  const text = textOf(item);
  const tier = tierOf(item);
  if (tier === "expert_rss") {
    return "expert_analysis";
  }
  if (tier === "official_first_party") {
    return "first_party";
  }
  if (tier === "preferred_x" || /X · @|x\.com|twitter|推文/i.test(text)) {
    return "social";
  }
  if (tier === "cn_media" || /IT之家|量子位|机器之心|新智元|爱范儿|极客公园|公众号|微信|中文|国内|火山|字节|豆包|商汤|智谱|月之暗面|百度|阿里|腾讯|华为|MiniMax|DeepSeek/i.test(`${item.sourceName || ""} ${item.sourceKind || ""}`)) {
    return "cn_media";
  }
  if (/OpenAI|Anthropic|DeepMind|Google|xAI|Mistral|Meta|Hugging Face|NVIDIA|Apple|Cloudflare|官方|Newsroom/i.test(text)) {
    return "first_party";
  }
  if (/github|dev\.to|hacker news|hn|arxiv|repository|开源|论文/i.test(text)) {
    return "community";
  }
  return "news";
}

function itemCategory(item) {
  const text = textOf(item).toLowerCase();
  if (/教育|教学|课堂|学校|教师|学生|课程|高考|中小学|大学|学习辅助|智能辅导|家教|edtech|education|teaching|classroom|school|teacher|student|course|curriculum|tutor|tutoring/.test(text)) return "education";
  if (/文化|文旅|艺术|音乐|影视|电影|短剧|游戏|出版|版权|博物馆|非遗|创意|内容创作|culture|ai art|generative art|\bart\b|music|film|movie|game|publishing|copyright|museum|creative|creator/.test(text)) return "culture";
  if (/论文|研究|arxiv|paper|benchmark|research/.test(text)) return "research";
  if (/github|开源|repository|repo|hugging face|weights|模型权重/.test(text)) return "opensource";
  if (/模型|model|llm|多模态|推理|inference|training|checkpoint/.test(text)) return "model";
  if (/api|产品|上线|发布|launch|released|connectors|agent api|功能|更新/.test(text)) return "product";
  if (/观点|分析|访谈|opinion|think|趋势|行业/.test(text)) return "opinion";
  return "industry";
}

function categoryLabel(category) {
  return {
    model: "模型发布/更新",
    product: "产品发布/更新",
    industry: "行业动态",
    research: "论文研究",
    opinion: "技巧与观点",
    opensource: "开源项目",
    education: "教育科技",
    culture: "文化创意",
  }[category] || "行业动态";
}

function channelLabel(channel) {
  return {
    first_party: "一手信源",
    expert_analysis: "专家解读",
    cn_media: "中文资讯",
    community: "社区/开源",
    social: "推文替代",
    news: "资讯聚合",
  }[channel] || "资讯聚合";
}

function evidenceMeta(item = {}, relatedItems = []) {
  const members = [item, ...(Array.isArray(relatedItems) ? relatedItems : [])];
  const identities = new Set(members
    .map((member) => String(member?.sourceId || member?.sourceName || "").trim().toLowerCase())
    .filter(Boolean));
  const tier = tierOf(item).toLowerCase();
  const sourceCount = identities.size;
  let evidenceLevel = "single_source";
  if (sourceCount >= 2) evidenceLevel = "multi_source";
  else if (["official_first_party", "preferred_x"].includes(tier)) evidenceLevel = "first_party";
  else if (tier === "expert_rss") evidenceLevel = "expert_analysis";
  else if (tier === "reference" || item.unverified || item.evidenceLevel === "unverified") evidenceLevel = "unverified";

  const evidenceLabel = {
    first_party: "一手发布",
    multi_source: "多源确认",
    expert_analysis: "专家解读",
    single_source: "单一来源",
    unverified: "待验证线索",
  }[evidenceLevel];
  const evidenceGaps = {
    first_party: ["第三方效果与长期稳定性尚未独立验证"],
    multi_source: [],
    expert_analysis: ["一手数据或官方细节仍需对照"],
    single_source: ["独立信源仍不足"],
    unverified: ["当前证据不足，引用前请核对原文"],
  }[evidenceLevel];
  const category = itemCategory(item);
  const creatorValue = ["model", "product"].includes(category)
    ? "适合核对功能边界、使用条件与迁移成本。"
    : ["opensource", "research"].includes(category)
      ? "适合拆解实现路径、验证条件与可复用方法。"
      : ["education", "culture"].includes(category)
        ? "适合提炼具体案例、内容角度与可复用做法。"
        : category === "opinion"
          ? "适合比较观点、提炼方法并补充一手证据。"
          : "适合提炼对工作流、创作或产品决策的具体影响。";
  const provider = String(item.llmProvider || "");
  const generatedBy = item.editorialSource === "editor" || item.editor === true
    ? "editor"
    : provider.startsWith("ollama:")
      ? "local_llm"
      : "rules";
  return { evidenceLevel, evidenceLabel, evidenceGaps, creatorValue, generatedBy };
}

function scoreBreakdown(item) {
  const channel = sourceChannel(item);
  const category = itemCategory(item);
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt || Date.now()).getTime()) / 36e5);
  const fresh = Math.max(0, Math.round(18 - Math.min(18, ageHours / 2)));
  const source = channel === "first_party" ? 26 : channel === "social" ? 24 : channel === "expert_analysis" ? 22 : channel === "cn_media" ? 16 : channel === "community" ? 8 : 12;
  const actionable = /API|代码|开源|GitHub|教程|部署|使用|上线|支持|接入|发布/i.test(textOf(item)) ? 14 : 8;
  const novelty = /首次|首款|新|发布|推出|open-source|benchmark|正式/i.test(textOf(item)) ? 14 : 8;
  const relevance = Math.max(10, Math.min(20, Math.round((item.tags?.length || 1) * 4 + (category === "model" || category === "product" || category === "education" || category === "culture" ? 8 : 4))));
  return [
    { key: "source", label: "来源可信", value: source },
    { key: "fresh", label: "时效", value: fresh },
    { key: "novelty", label: "新颖", value: novelty },
    { key: "actionable", label: "可操作", value: actionable },
    { key: "relevance", label: "相关性", value: relevance },
  ];
}

function mpMetrics(item) {
  const base = Math.max(1000, item.score * 130);
  const sourceBoost = sourceChannel(item) === "cn_media" ? 1.8 : 1;
  const titleBoost = /爆|首|刚刚|重磅|全网|免费|教程|实测|开源/.test(item.title || "") ? 1.35 : 1;
  const reads = Math.round(base * sourceBoost * titleBoost);
  const likes = Math.round(reads * (0.025 + (item.score % 8) / 1000));
  const shares = Math.round(reads * (0.012 + (item.score % 5) / 1000));
  const abnormal = Number((reads / Math.max(3000, base * 0.75)).toFixed(2));
  return { reads, likes, shares, abnormal };
}

function enrichItem(item) {
  const channel = sourceChannel(item);
  const category = itemCategory(item);
  return {
    ...item,
    reason: editorialReasonFor(item),
    channel,
    channelLabel: channelLabel(channel),
    category,
    categoryLabel: categoryLabel(category),
    scoreBreakdown: scoreBreakdown(item),
    mpMetrics: mpMetrics(item),
    evidenceMeta: evidenceMeta(item),
  };
}

// The public experience APIs must not expose fields used for moderation,
// source management, ranking internals, or runtime bookkeeping.
function serializePublicItem(item = {}) {
  const publicItem = { ...item, reason: editorialReasonFor(item), evidenceMeta: item.evidenceMeta || evidenceMeta(item) };
  const fields = [
    "id", "url", "title", "summary", "sourceName", "sourceKind", "author",
    "publishedAt", "score", "tags", "reason", "media", "channel", "channelLabel",
    "category", "categoryLabel", "scoreBreakdown", "mpMetrics", "mpTitle", "related",
    "editorialBrief",
    "evidenceMeta",
  ];
  return Object.fromEntries(fields
    .filter((field) => publicItem[field] !== undefined)
    .map((field) => [field, publicItem[field]]));
}

function attachRelated(items, clusters = []) {
  const byItem = new Map();
  for (const cluster of clusters || []) {
    for (const itemId of cluster.items || []) {
      byItem.set(itemId, cluster);
    }
  }
  return items.map((item) => {
    const cluster = byItem.get(item.id);
    if (!cluster && !item.duplicateCount) return item;
    return {
      ...item,
      related: {
        count: Math.max(cluster?.size || 0, 1) + (cluster?.duplicateCount || item.duplicateCount || 0),
        sources: cluster?.sources || item.duplicateSources || [],
        topScore: cluster?.topScore || item.score,
      },
    };
  });
}

module.exports = {
  attachRelated,
  categoryLabel,
  channelLabel,
  evidenceMeta,
  enrichItem,
  itemCategory,
  mpMetrics,
  scoreBreakdown,
  serializePublicItem,
  sourceChannel,
};
