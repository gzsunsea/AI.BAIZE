const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "llm",
  "model",
  "agent",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "mistral",
  "hugging face",
  "diffusion",
  "multimodal",
  "copilot",
  "prompt",
  "inference",
  "training",
  "大模型",
  "模型",
  "智能体",
  "多模态",
  "推理",
  "开源",
  "生成式",
  "教育",
  "学习",
  "教学",
  "文化",
  "艺术",
  "创意",
  "edtech",
  "education",
  "learning",
  "culture",
  "art",
  "creative",
  "x 高价值",
  "social signal",
];

const STRONG_AI_RE = /(?:^|[^A-Za-z])AI(?:$|[^A-Za-z])|AIGC|AGI|artificial intelligence|machine learning|LLM|large language model|agent|OpenAI|ChatGPT|GPT-|Anthropic|Claude|Claude Code|Gemini|DeepMind|Mistral|Llama|xAI|Grok|Hugging Face|Copilot|Codex|Cursor|OpenRouter|diffusion|multimodal|inference|benchmark|eval|RAG|大模型|人工智能|智能体|多模态|推理|训练|模型|开源模型|生成式|文生图|文生视频|机器人/i;
const CORE_AI_RE = /AIGC|AGI|artificial intelligence|machine learning|LLM|large language model|agent|OpenAI|ChatGPT|GPT-|Anthropic|Claude|Claude Code|Gemini|DeepMind|Mistral|Llama|xAI|Grok|Hugging Face|Copilot|Codex|Cursor|OpenRouter|diffusion|multimodal|inference|benchmark|eval|RAG|大模型|人工智能|智能体|多模态|推理|训练|模型|开源模型|生成式|文生图|文生视频|机器人|AI\s*芯片|AI\s*编程|AI\s*应用|AI\s*模型|AI\s*算力/i;
const EDUCATION_CULTURE_RE = /education|edtech|learning|teaching|student|teacher|classroom|tutor|culture|creative|art|music|film|movie|game|copyright|publishing|museum|教育|教学|课堂|学生|教师|课程|学习|辅导|文化|艺术|创意|音乐|影视|电影|游戏|版权|出版|博物馆/i;
const CN_NOISE_RE = /汽车|车型|新车|纯电|增程|电池|手机|平板|耳机|显卡|主板|路由器|消费电子|相机|镜头|家电|财报|净利润|营收|股票|芯片股|半导体设备|光模块|光纤|商务部|会见|法拉第未来|贾跃亭|预售|续航/i;
const CN_PROMO_NOISE_RE = /京东|淘宝|天猫|拼多多|红包|优惠券|消费券|折扣|补贴|PLUS|88VIP|领券|凑单|好价|直达链接|会员专享|大促|618|超级\s*18|全品类|家电|制冰机|洗衣机|电动车|电动摩托|耳机|AirPods/i;
const HARD_LOW_VALUE_RE = /含能材料|火炸药|燃烧实验|单颗粒|悬浮燃烧|炸药|烟火剂|枪炮弹丸|会员专享|无门槛红包|至高\s*\d+\s*元|打开京东APP|政府补贴|以旧换新/i;
const CN_AUTO_PROMO_RE = /汽车|车型|新车|SUV|轿车|纯电|增程|混动|电池|续航|CLTC|售价|万元|上市|预售|闪充|座舱|智驾/i;
const CN_AUTO_CORE_AI_TITLE_RE = /Robotaxi|FSD|自动驾驶|无人驾驶|端到端|智能驾驶|辅助驾驶系统|智驾系统|自动泊车/i;
const BROAD_OFFICIAL_RE = /GitHub Changelog|GitHub Blog|Cloudflare|Apple Machine Learning Research|NVIDIA AI Blog/i;

const tagRules = [
  ["Agent", ["agent", "智能体", "browser use", "operator"]],
  ["模型发布", ["model", "模型", "release", "weights", "checkpoint"]],
  ["开源/仓库", ["github", "open source", "开源", "repository", "repo"]],
  ["多模态", ["multimodal", "video", "audio", "image", "多模态", "视频", "图像", "音频"]],
  ["编码", ["code", "coding", "developer", "programming", "编程", "代码"]],
  ["产品更新", ["api", "launch", "released", "产品", "上线", "发布"]],
  ["论文/研究", ["paper", "arxiv", "research", "研究", "论文"]],
  ["部署/工程", ["inference", "deploy", "gpu", "serving", "推理", "部署", "工程"]],
  ["政策/监管", ["policy", "copyright", "safety", "regulation", "版权", "监管", "安全"]],
  ["教育科技", ["education", "edtech", "teaching", "classroom", "school", "student", "course", "curriculum", "tutor", "tutoring", "教育", "教学", "课堂", "学校", "教师", "学生", "课程", "学习辅助", "智能辅导", "家教"]],
  ["文化创意", ["culture", "ai art", "generative art", "music", "film", "movie", "game", "creator", "creative", "copyright", "museum", "publishing", "文化", "艺术", "音乐", "影视", "电影", "短剧", "游戏", "出版", "版权", "创意"]],
  ["X 高价值", ["x 高价值", "social signal", "twitter", "tweet", "推文", "x · @"]],
];

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `item-${hash.toString(36)}`;
}

function stableUrlKey(url = "") {
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

function summarize(text = "", fallback = "") {
  const clean = stripHtml(text || fallback);
  if (clean.length <= 420) return clean;
  return `${clean.slice(0, 420)}...`;
}

function isMostlyEnglish(text = "") {
  const value = String(text);
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const chinese = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin > 80 && latin > chinese * 3;
}

function topicHints(text = "") {
  const lower = text.toLowerCase();
  const hints = [];
  if (/agent|tool use|workflow|automation|智能体|工作流/.test(lower)) hints.push("智能体工作流");
  if (/model|llm|inference|training|模型|推理|训练/.test(lower)) hints.push("模型能力与工程");
  if (/benchmark|eval|评测|基准/.test(lower)) hints.push("评测与基准");
  if (/education|edtech|student|teacher|课堂|教育|学生|教师/.test(lower)) hints.push("教育应用");
  if (/culture|creative|art|music|film|copyright|文化|创意|艺术|版权/.test(lower)) hints.push("文化创意");
  if (/open source|github|repo|开源/.test(lower)) hints.push("开源生态");
  if (/api|product|launch|发布|上线|产品/.test(lower)) hints.push("产品发布");
  return hints.slice(0, 3);
}

function sourcePriorityScore(raw = {}) {
  const tier = raw.priorityTier || raw.sourceTier || raw.tier || "";
  const base = {
    preferred_x: 24,
    official_first_party: 24,
    expert_rss: 18,
    reference: 16,
    cn_media: 8,
    community_fallback: -10,
  }[tier] || 0;
  const preferred = raw.preferred ? 8 : 0;
  const penalty = Number(raw.noisePenalty || 0);
  const boosts = raw.topicBoosts || {};
  const hints = topicHints(`${raw.title || ""} ${raw.summary || ""} ${raw.description || ""}`).join(" ").toLowerCase();
  const topicBoost = Object.entries(boosts).reduce((sum, [topic, value]) => (hints.includes(topic) ? sum + Number(value || 0) : sum), 0);
  return Math.round(base + preferred + topicBoost - penalty);
}

function enrichSummary(title = "", summary = "", sourceName = "") {
  const clean = summarize(summary, title);
  const hints = topicHints(`${title} ${clean}`);
  if (!isMostlyEnglish(`${title} ${clean}`)) {
    if (clean.length >= 90) return clean;
    return `${clean} 这条动态来自 ${sourceName || "公开来源"}，可重点关注${hints.join("、") || "其对 AI 应用和产业节奏的影响"}。`;
  }
  const lead = hints.length ? `这条英文动态主要涉及${hints.join("、")}。` : "这条英文动态讨论了 AI 领域的新进展。";
  return `${lead}原文要点：${clean}`;
}

function inferTags(title = "", summary = "") {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = tagRules
    .filter(([, words]) => words.some((word) => text.includes(word.toLowerCase())))
    .map(([tag]) => tag);
  return [...new Set(tags)].slice(0, 5);
}

function scoreItem({ title = "", summary = "", sourceKind = "", publishedAt, stars = 0, comments = 0, priorityTier = "", preferred = false, noisePenalty = 0, topicBoosts = {} }) {
  const text = `${title} ${summary}`.toLowerCase();
  const keywordScore = AI_KEYWORDS.reduce((score, word) => score + (text.includes(word) ? 5 : 0), 0);
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt || Date.now()).getTime()) / 36e5);
  const freshness = Math.max(0, 24 - Math.min(24, ageHours));
  const authority = sourceKind === "aihot" ? 25 : sourceKind === "x" ? 20 : sourceKind === "arxiv" ? 12 : sourceKind === "github" ? 6 : sourceKind === "hn" || sourceKind === "devto" ? 2 : 10;
  const social = Math.min(20, Math.log10(Math.max(1, stars + comments + 1)) * 8);
  const sourceScore = sourcePriorityScore({ title, summary, priorityTier, preferred, noisePenalty, topicBoosts });
  return Math.max(1, Math.min(99, Math.round(28 + keywordScore + freshness + authority + social + sourceScore)));
}

function reasonFor(item) {
  const tags = item.tags?.length ? item.tags.join("、") : "AI";
  if (item.sourceKind === "aihot" && item.reason) return item.reason;
  const hints = topicHints(`${item.title} ${item.summary}`);
  const focus = hints.length ? `重点看${hints.join("、")}` : `与 ${tags} 相关`;
  const sourceSignal = item.preferred ? "优先信源" : item.priorityTier === "community_fallback" ? "社区热度补充" : "公开信源";
  return `来自 ${item.sourceName} 的最新 ${tags} 动态，${focus}。系统按${sourceSignal}、时效、主题相关性和可操作性入选，适合判断它是否会影响产品、研究、教育/文化应用或开发实践。`;
}

function isQualityCandidate(item) {
  const sourceText = `${item.sourceName || ""} ${item.sourceKind || ""}`;
  const bodyText = `${item.title || ""} ${item.summary || ""}`;
  const contentText = `${bodyText} ${(item.tags || []).join(" ")}`;
  if (item.sourceKind === "devto") return false;
  const isCommunity = item.priorityTier === "community_fallback" || ["hn", "github", "devto"].includes(item.sourceKind);
  const hasStrongAi = STRONG_AI_RE.test(bodyText);
  const hasCoreAi = CORE_AI_RE.test(bodyText);
  const hasEducationCulture = EDUCATION_CULTURE_RE.test(bodyText) && hasStrongAi;
  if (HARD_LOW_VALUE_RE.test(contentText) && !hasStrongAi) return false;
  if (isCommunity && !hasStrongAi) return false;
  const isCnMedia = item.priorityTier === "cn_media" || /IT之家|爱范儿|极客公园|量子位|机器之心|新智元/i.test(sourceText);
  if (isCnMedia && CN_AUTO_PROMO_RE.test(contentText) && !CN_AUTO_CORE_AI_TITLE_RE.test(item.title || "")) return false;
  if (isCnMedia && (CN_NOISE_RE.test(contentText) || CN_PROMO_NOISE_RE.test(contentText)) && !hasCoreAi && !hasEducationCulture) return false;
  if (isCnMedia && !hasStrongAi && !hasEducationCulture) return false;
  const isBroadOfficial = item.priorityTier === "official_first_party" && BROAD_OFFICIAL_RE.test(sourceText);
  if (isBroadOfficial && !hasStrongAi) return false;
  return true;
}

function normalizeItem(raw) {
  const title = stripHtml(raw.titleZh || raw.title || "未命名动态");
  const summary = enrichSummary(title, raw.summaryZh || raw.summary || raw.description || raw.title, raw.sourceName || raw.source?.name || raw.source || "未知来源");
  const tags = raw.tags || raw.aiTags?.map((item) => item.tag).filter(Boolean) || inferTags(title, summary);
  const publishedAt = raw.publishedAt || raw.createdAt || new Date().toISOString();
  const sourceName = raw.sourceName || raw.source?.name || raw.source || "未知来源";
  const sourceKind = raw.sourceKind || raw.source?.kind || "web";
  const url = raw.url || raw.link || "#";
  const priorityTier = raw.priorityTier || raw.source?.priorityTier || raw.tier || "";
  const preferred = Boolean(raw.preferred || raw.source?.preferred);
  const noisePenalty = Number(raw.noisePenalty || raw.source?.noisePenalty || 0);
  const topicBoosts = raw.topicBoosts || raw.source?.topicBoosts || {};
  const baseScore = raw.finalScore || raw.qualityScore || scoreItem({ title, summary, sourceKind, publishedAt, stars: raw.stars, comments: raw.comments, priorityTier, preferred, noisePenalty, topicBoosts });
  const score = Math.max(1, Math.min(99, Math.round(baseScore + (raw.finalScore || raw.qualityScore ? sourcePriorityScore({ title, summary, priorityTier, preferred, noisePenalty, topicBoosts }) : 0))));
  const item = {
    id: raw.id || makeId(stableUrlKey(url) || title),
    url,
    title,
    summary,
    sourceName,
    sourceKind,
    sourceId: raw.sourceId || raw.source?.id || null,
    sourceTier: raw.sourceTier || raw.source?.tier || raw.tier || null,
    priorityTier,
    preferred,
    noisePenalty,
    sourcePriorityScore: sourcePriorityScore({ title, summary, priorityTier, preferred, noisePenalty, topicBoosts }),
    author: raw.author || null,
    publishedAt,
    score,
    tags: [...new Set(tags)].slice(0, 6),
    reason: raw.aiSelectedReason || raw.editorialJudgment || raw.reason || "",
    media: raw.media || raw.rawJson?.media || (raw.image || raw.thumbnail ? [{ url: raw.image || raw.thumbnail, type: "image" }] : []),
    raw,
  };
  item.reason = reasonFor(item);
  return item;
}

module.exports = {
  inferTags,
  isQualityCandidate,
  makeId,
  normalizeItem,
  scoreItem,
  stripHtml,
  summarize,
};
