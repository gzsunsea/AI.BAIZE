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

const CORE_AI_RE = /AIGC|AGI|artificial intelligence|machine learning|deep learning|neural network|\bLLMs?\b|large language model|generative AI|foundation model|frontier model|AI[-\s]?(?:agent|agents|model|models|tool|tools|app|apps|coding|developer|search|assistant|video|image|music|education|safety|alignment|workflow|inference|training|chip|compute|assisted|powered|generated|native|driven|mediated|enabled)|agentic|Claude Code|OpenAI|ChatGPT|GPT-\d|Anthropic|Claude|Gemini|DeepMind|Mistral|Llama|xAI|Grok|Hugging Face|Copilot|Codex|Cursor|OpenRouter|diffusion|stable diffusion|multimodal|inference|fine-?tuning|benchmark|eval|RAG|RLHF|transformer|embedding|vector database|大模型|基础模型|前沿模型|人工智能|智能体|智能代理|多模态|推理|训练|微调|评测|基准|向量数据库|检索增强|模型发布|开源模型|生成式\s*AI|生成式人工智能|文生图|文生视频|AI\s*编程|AI\s*应用|AI\s*模型|AI\s*工具|AI\s*助手|AI\s*搜索|AI\s*教育|AI\s*安全|AI\s*芯片|AI\s*算力|端到端自动驾驶|Robotaxi|FSD/i;
const AI_ENTITY_RE = /OpenAI|Anthropic|Claude|DeepMind|Google AI|Gemini|xAI|Grok|Mistral|Llama|Hugging Face|OpenRouter|Cursor|Copilot|Codex|Runway|Midjourney|Stability AI|Perplexity|DeepSeek|智谱|月之暗面|MiniMax|百川|通义|千问|豆包|讯飞星火|腾讯元宝|元宝|Kimi|商汤|阶跃星辰/i;
const AI_INFRA_RE = /GPU|NPU|TPU|CUDA|ROCm|算力|AI\s*芯片|accelerator|inference|推理|训练|集群|数据中心|Stargate|星际之门|cloud|云平台|serverless|edge|边缘/i;
const AI_INFRA_CONTEXT_RE = /LLM|大模型|AI\s*模型|foundation model|frontier model|agent|智能体|推理|训练|inference|training|fine-?tuning|serving|部署|GPU\s*memory|模型服务|AI\s*应用|AI\s*产品/i;
const EDUCATION_CULTURE_RE = /AI\s*(education|tutor|learning|classroom|art|music|film|movie|game|copyright|creator)|generative\s*(art|music|video|film)|education|edtech|tutor|culture|creative|copyright|publishing|AI\s*教育|AI\s*教学|AI\s*课堂|AI\s*辅导|AI\s*艺术|AI\s*音乐|AI\s*影视|AI\s*游戏|AI\s*版权|生成式艺术|生成式音乐|生成式视频|生成式动画|文生图|文生视频/i;
const WEAK_INDUSTRY_RE = /融资|募资|估值|IPO|上市辅导|股价|市值|财报|营收|利润|净利润|裁员|岗位|就业|招聘|薪资|人事|任命|离职|退休|CEO|高管|董事长|总裁|创始人|黄仁勋|董事会|诉讼|起诉|庭审|判决|收购|投资|控股|股东|代言|官宣|出口管制|监管|政策|补贴|研发中心|基地启用|训练场|设立|合作伙伴|数据中心建设阻力|community engagement|valuation|funding|fundraise|IPO|layoff|job losses|hiring|lawsuit|trial|CEO|executive|board|stock|revenue|profit|acquisition|partnership|compute deal/i;
const CN_NOISE_RE = /汽车|车型|新车|纯电|增程|电池|手机|平板|耳机|显卡|主板|路由器|消费电子|相机|镜头|家电|财报|净利润|营收|股票|芯片股|半导体设备|光模块|光纤|商务部|会见|法拉第未来|贾跃亭|预售|续航|跑步官|代言|鸿蒙版|Switch|直板旗舰/i;
const CN_PROMO_NOISE_RE = /京东|淘宝|天猫|拼多多|红包|优惠券|消费券|折扣|补贴|PLUS|88VIP|领券|凑单|好价|直达链接|会员专享|大促|618|超级\s*18|全品类|家电|制冰机|洗衣机|电动车|电动摩托|耳机|AirPods/i;
const HARD_LOW_VALUE_RE = /含能材料|火炸药|燃烧实验|单颗粒|悬浮燃烧|炸药|烟火剂|枪炮弹丸|会员专享|无门槛红包|至高\s*\d+\s*元|打开京东APP|政府补贴|以旧换新|首席跑步官|多行星物种/i;
const CN_AUTO_PROMO_RE = /汽车|车型|新车|SUV|轿车|纯电|增程|混动|电池|续航|CLTC|售价|万元|上市|预售|闪充|座舱|智驾|Robotaxi|Waymo/i;
const CN_AUTO_CORE_AI_TITLE_RE = /Robotaxi|Waymo|FSD|自动驾驶|无人驾驶|端到端|大模型|自动泊车/i;
const CN_AUTO_STRONG_AI_RE = /Robotaxi|Waymo|FSD|端到端|大模型|自动驾驶.*(?:安全|监管|交规|测试|事故|模型|算法|训练|推理)|无人驾驶|L4|L5/i;
const CN_AUTO_NON_PRODUCT_RE = /自动驾驶.*(?:安全|监管|交规|法规|事故|测试|评测|研究)|无人驾驶.*(?:安全|监管|测试|研究)/i;
const CN_AUTO_COMMENTARY_NOISE_RE = /(?:对谈|专访|采访).*(?:蔚来|理想|小鹏|比亚迪|特斯拉|车企|董事长|CEO|创始人)|(?:蔚来|理想|小鹏|比亚迪|特斯拉).*(?:发布会|上市|预售|车展|售价|订单|销量|交付)/i;
const CN_DEVICE_PROMO_RE = /新机|机型|预装|无需更新系统|AIOS|努比亚|HMD|豆包手机|华为\s*Mate|iPhone|手机(?:终于|将|已|发布|上市|预装|支持|搭载)|AI\s*手机|App\s*获|鸿蒙版|官方降价|国行\s*Switch/i;
const CN_MOBILE_CHIP_RE = /联发科|天玑|骁龙|移动平台|手机.*处理器|处理器.*手机|Gemini Nano|LLM Booster/i;
const CN_CONSUMER_DEVICE_RE = /vivo|OPPO|荣耀|小米|红米|Redmi|华为|Mate|Pura|iPhone|摩托罗拉|Motorola|努比亚|HMD|联发科|天玑|骁龙|移动平台|处理器|智能手机|手机|平板|耳机|跑分|CPU|GHz|内存|Edge\s*\d|S60/i;
const DEVICE_CORE_AI_RE = /端侧大模型|本地大模型|AI\s*(?:模型|Agent|智能体|编程|开发|推理|训练)|LLM|多模态模型|生成式\s*AI/i;
const REAL_AI_INFRA_RE = /(?:AI|大模型|LLM).*(?:训练|推理|算力|服务器|数据中心|集群|部署)|(?:GPU|NPU).*(?:训练|推理|大模型|服务器|数据中心|集群)/i;
const DIGEST_OR_ROUNDUP_RE = /早报|晚报|日报|周报|一图看懂|汇总|合集|盘点|要闻|morning brief|daily brief|weekly roundup/i;
const WEAK_GITHUB_RE = /awesome[-_\s]|curated list|course list|summer ?school|books?|lectures?|papers?\.?$|pack(?:s|ing)? your entire repository|AI-friendly file|WhatsApp Web|customer service|use your imagination|OSINT|intelligence gathering|situational analysis/i;
const BROAD_OFFICIAL_RE = /GitHub Changelog|GitHub Blog|Cloudflare|Apple Machine Learning Research|NVIDIA AI Blog/i;
const LOW_INFORMATION_TITLE_RE = /^\s*(?:未命名动态|(?:release\s*)?v?\d+(?:\.\d+){1,4}(?:[-+][\w.-]+)?)\s*$/i;
const BROKEN_SUMMARY_RE = /\[object Object\]/i;

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

function itemText(item = {}) {
  return `${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`;
}

function itemSourceText(item = {}) {
  return `${item.sourceName || ""} ${item.sourceKind || ""} ${item.priorityTier || ""} ${item.sourceTier || ""}`;
}

function isCommunitySource(item = {}) {
  return item.priorityTier === "community_fallback" || ["hn", "github", "devto", "arxiv"].includes(item.sourceKind);
}

function isChineseMediaSource(item = {}) {
  return item.priorityTier === "cn_media" || /IT之家|爱范儿|极客公园|量子位|机器之心|新智元/i.test(itemSourceText(item));
}

function isBroadOfficialSource(item = {}) {
  return item.priorityTier === "official_first_party" && BROAD_OFFICIAL_RE.test(itemSourceText(item));
}

function isAiInfraCandidate(item = {}) {
  const text = itemText(item);
  return AI_INFRA_RE.test(text) && AI_INFRA_CONTEXT_RE.test(text);
}

function isCoreAiCandidate(item = {}) {
  const text = itemText(item);
  if (!text.trim()) return false;
  if (CORE_AI_RE.test(text)) return true;
  if (EDUCATION_CULTURE_RE.test(text)) return true;
  if (CN_AUTO_CORE_AI_TITLE_RE.test(item.title || "")) return true;
  return isAiInfraCandidate(item);
}

function isWeakIndustryCandidate(item = {}) {
  const text = itemText(item);
  const title = item.title || "";
  if (!WEAK_INDUSTRY_RE.test(text)) return false;
  if (/CEO|高管|董事长|总裁|黄仁勋|创始人/i.test(title) && !/发布|推出|开源|更新|接入|支持|可用|release|launch|模型发布/i.test(title)) return true;
  const coreActionInTitle = /发布|推出|上线|开源|更新|接入|支持|可用|preview|available|release|launch|模型发布|API|SDK|工具|平台|论文|研究|benchmark|eval|inference|training|训练|推理|Agent|智能体|Copilot|Codex|Claude Code|Grok/i.test(title);
  if (WEAK_INDUSTRY_RE.test(title) && !coreActionInTitle) return true;
  return !coreActionInTitle && !isAiInfraCandidate(item);
}

function isNoiseCandidate(item = {}) {
  const text = itemText(item);
  const contentText = `${item.title || ""} ${item.summary || ""}`;
  const sourceText = itemSourceText(item);
  if (item.sourceKind === "devto") return true;
  if (LOW_INFORMATION_TITLE_RE.test(item.title || "")) return true;
  if (BROKEN_SUMMARY_RE.test(text)) return true;
  if (HARD_LOW_VALUE_RE.test(text)) return true;
  if (CN_PROMO_NOISE_RE.test(text)) return true;
  if (DIGEST_OR_ROUNDUP_RE.test(item.title || "")) return true;
  if (item.sourceKind === "github" && WEAK_GITHUB_RE.test(text)) return true;
  if (isChineseMediaSource(item) && CN_DEVICE_PROMO_RE.test(text)) return true;
  if (isChineseMediaSource(item) && CN_MOBILE_CHIP_RE.test(contentText) && !REAL_AI_INFRA_RE.test(contentText)) return true;
  if (isChineseMediaSource(item) && CN_CONSUMER_DEVICE_RE.test(contentText) && !DEVICE_CORE_AI_RE.test(contentText)) return true;
  if (isChineseMediaSource(item) && CN_AUTO_COMMENTARY_NOISE_RE.test(contentText) && !CN_AUTO_NON_PRODUCT_RE.test(item.title || "")) return true;
  if (isChineseMediaSource(item) && CN_AUTO_PROMO_RE.test(contentText) && !CN_AUTO_NON_PRODUCT_RE.test(item.title || "")) return true;
  if (isChineseMediaSource(item) && CN_NOISE_RE.test(text) && !isCoreAiCandidate(item)) return true;
  if (/Hacker News 热门|buzzing\.cc/i.test(sourceText) && !isCoreAiCandidate(item)) return true;
  return false;
}

function qualityClass(item = {}) {
  if (isNoiseCandidate(item)) return "noise";
  if (isWeakIndustryCandidate(item) || (AI_ENTITY_RE.test(itemText(item)) && WEAK_INDUSTRY_RE.test(itemText(item)))) return "industry_weak";
  if (isCoreAiCandidate(item)) return isAiInfraCandidate(item) && !CORE_AI_RE.test(itemText(item)) ? "ai_infra" : "core_ai";
  return "noise";
}

function isSelectedQualityCandidate(item = {}) {
  if (item.pinned) return true;
  if (!isQualityCandidate(item)) return false;
  if (qualityClass(item) === "industry_weak") return false;
  if (!isCoreAiCandidate(item)) return false;
  if (isCommunitySource(item) && !isCoreAiCandidate(item)) return false;
  if (isChineseMediaSource(item) && !isCoreAiCandidate(item)) return false;
  return true;
}

function sourcePriorityScore(raw = {}) {
  const tier = raw.priorityTier || raw.sourceTier || raw.tier || "";
  const base = {
    preferred_x: 24,
    official_first_party: 24,
    expert_rss: 18,
    reference: 10,
    cn_media: 4,
    community_fallback: -14,
  }[tier] || 0;
  const preferred = raw.preferred ? 8 : 0;
  const penalty = Number(raw.noisePenalty || 0);
  const boosts = raw.topicBoosts || {};
  const hints = topicHints(`${raw.title || ""} ${raw.summary || ""} ${raw.description || ""}`).join(" ").toLowerCase();
  const topicBoost = Object.entries(boosts).reduce((sum, [topic, value]) => (hints.includes(topic) ? sum + Number(value || 0) : sum), 0);
  const sample = { title: raw.title, summary: raw.summary || raw.description, tags: raw.tags || [], priorityTier: tier };
  const qualityBoost = isCoreAiCandidate(sample) ? 8 : isWeakIndustryCandidate(sample) ? -16 : -8;
  return Math.round(base + preferred + topicBoost + qualityBoost - penalty);
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
  const sample = { title, summary, sourceKind, priorityTier };
  const qualityScore = isCoreAiCandidate(sample) ? 14 : isWeakIndustryCandidate(sample) ? -24 : -18;
  return Math.max(1, Math.min(99, Math.round(24 + keywordScore + freshness + authority + social + sourceScore + qualityScore)));
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
  if (!item || isNoiseCandidate(item)) return false;
  if (isWeakIndustryCandidate(item)) return false;
  const hasCoreAi = isCoreAiCandidate(item);
  if (isCommunitySource(item) && !hasCoreAi) return false;
  if (isChineseMediaSource(item) && !hasCoreAi) return false;
  if (isBroadOfficialSource(item) && !hasCoreAi) return false;
  if (hasCoreAi) return true;
  return AI_ENTITY_RE.test(itemText(item)) && !isWeakIndustryCandidate(item);
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
    qualityClass: qualityClass({ title, summary, tags, sourceName, sourceKind, priorityTier, sourceTier: raw.sourceTier || raw.source?.tier || raw.tier || null }),
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
  isCoreAiCandidate,
  isNoiseCandidate,
  isQualityCandidate,
  isSelectedQualityCandidate,
  isWeakIndustryCandidate,
  makeId,
  normalizeItem,
  qualityClass,
  scoreItem,
  stripHtml,
  summarize,
};
