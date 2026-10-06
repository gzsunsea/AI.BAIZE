const ENTITY_PATTERNS = [
  ["claude_code", /\bclaude\s+code\b/iu],
  ["claude_marketplace", /\bclaude\s+marketplace\b/iu],
  ["claude_tag", /\bclaude\s+tag\b/iu],
  ["midjourney", /\bmidjourney\b/iu],
  ["semianalysis", /\bsemi[\s-]?analysis\b/iu],
  ["project_suncatcher", /\bproject\s+suncatcher\b/iu],
  ["openai", /\bopenai\b/iu],
  ["anthropic", /\banthropic\b/iu],
  ["google", /\bgoogle\b|谷歌/iu],
  ["copilot", /\bcopilot\b/iu],
  ["chatgpt", /\bchat\s*gpt\b/iu],
  ["codex", /\bcodex\b/iu],
  ["cursor", /\bcursor\b/iu],
  ["windsurf", /\bwindsurf\b/iu],
  ["replit", /\breplit\b/iu],
  ["openrouter", /\bopen\s*router\b/iu],
  ["perplexity", /\bperplexity\b/iu],
  ["odyssey", /\bodyssey\b/iu],
  ["epoch_ai", /\bepoch\s+ai\b/iu],
  ["stanford_together_sat", /stanford.{0,30}together\s+ai.{0,90}(?:self[-\s]?organizing\s+agent\s+teams|\bSAT\b)|(?:self[-\s]?organizing\s+agent\s+teams|\bSAT\b).{0,90}stanford.{0,30}together\s+ai/iu],
  ["ming_image_0_1_design", /\bming[-\s]?image[-\s]?0[.]1[-\s]?design\b/iu],
  ["nemotron_3_diarization", /\bnemotron\s+3\s+diarization\b/iu],
  ["openrouter_jev_router", /\bopen\s*router\b.{0,55}\bjev(?:\s*router)?\b|\bjev(?:\s*router)?\b.{0,55}\bopen\s*router\b/iu],
  ["rabbit_os3", /\brabbit\b.{0,25}\bos\s*3\b|\bos\s*3\b.{0,25}\brabbit\b/iu],
  ["meta_muse_openclaw_response", /(?=.*\bmeta\b)(?=.*\bmuse\b)(?=.*\bopenclaw\b)(?=.*(?:admits?|acknowledges?|inspired|承认|启发))/iu],
  ["huggingface", /\bhugging\s*face\b/iu],
];

const MODEL_PATTERN = /\b(gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|sora|opus|mimo)\s*[- ]?\s*(opus|sonnet|haiku|flash|pro|mini|air|thinking|image)?\s*[- ]?\s*v?(\d+(?:\.\d+)*)(?:\s*[- ]?\s*(flash|pro|mini|air|thinking|sol|instant|turbo))?/giu;
const PRODUCT_PATTERNS = [
  ["claude_marketplace", /\bclaude\s+marketplace\b/iu],
  ["copilot", /\bcopilot\b/iu],
  ["chatgpt", /\bchat\s*gpt\b/iu],
  ["codex", /\bcodex\b/iu],
  ["cursor", /\bcursor\b/iu],
  ["windsurf", /\bwindsurf\b/iu],
  ["replit", /\breplit\b/iu],
  ["openrouter", /\bopen\s*router\b/iu],
  ["opencode", /\bopen\s*code\b/iu],
  ["huggingface", /\bhugging\s*face\b/iu],
];

const USER_IMAGE_COUNT_PATTERN = /53\s*张\s*(?:用户(?:提供的?)?\s*)?图片|53\s+(?:user[-\s]+(?:provided[-\s]+)?images?|images?\s+(?:from|provided\s+by)\s+(?:ChatGPT\s+)?users?)/iu;
const USER_IMAGE_INCIDENT_PATTERN = /53\s*起(?:事件)?[\s\S]{0,180}(?:智能体.{0,50})?(?:ChatGPT\s*)?用户图片|53\s+incidents?[\s\S]{0,180}(?:agents?.{0,50})?(?:user[-\s]+images?|images?\s+(?:from|provided\s+by)\s+(?:ChatGPT\s+)?users?)/iu;
const USER_IMAGE_DISCLOSURE_ACTION_PATTERN = /发布|上传|放到|张贴|泄露|外泄|转移|外传|posted|uploaded|leaked|exposed|transferred/iu;
const USER_IMAGE_EXTERNAL_TARGET_PATTERN = /公开图床|公开图片托管|public image hosts?|image hosts?|image hosting|internet|online|unlisted links?|外部/iu;
function isUserImageExposureEvidence(evidence) {
  const value = String(evidence || "").slice(0, 500);
  return (USER_IMAGE_COUNT_PATTERN.test(value) || USER_IMAGE_INCIDENT_PATTERN.test(value))
    && USER_IMAGE_DISCLOSURE_ACTION_PATTERN.test(value)
    && USER_IMAGE_EXTERNAL_TARGET_PATTERN.test(value);
}

const EVENT_PATTERNS = [
  ["graceful_stop", /graceful(?:ly)?\s+stop|five[-\s]?hour.{0,45}(?:graceful|stop|finish)|5[-\s]?hour.{0,45}(?:graceful|stop|finish)|(?:五|5)小时.{0,45}(?:收尾|优雅停止|停止|结束)|触发.{0,20}上限.{0,25}合适收尾点/iu],
  ["agent_data_reconnaissance", /transluce.{0,75}(?:openai|澳大利亚|澳政府).{0,90}(?:智能体|agent|日志|database|数据库|活动|攻击)|openai.{0,50}智能体集群.{0,50}(?:在线数据库|数据库|冷门数据)/iu],
  ["orbital_prototype", /prototype.{0,50}(?:satellite|orbit|space|tpu)|(?:satellite|orbit|space).{0,50}prototype|原型卫星|轨道原型|实验卫星|在轨.{0,20}(?:测试|ai)|tpu.{0,50}(?:轨道|太空)|(?:轨道|太空).{0,50}tpu/iu],
  ["court_ruling", /(?:appeals?|appellate) court.{0,70}(?:rules?|ruling|upholds?|affirms?|designation)|(?:rules?|ruling|upholds?|affirms?).{0,70}(?:appeals?|appellate) court|上诉法院.{0,70}(?:裁定|判决|认定|维持|允许|驳回|暂停)|(?:裁定|判决|认定|维持|允许|驳回|暂停).{0,70}上诉法院/iu],
  ["model_release", /(?:release[sd]?|launch(?:es|ed)?|debut(?:s|ed)?).{0,50}(?:model|gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|sora)|(?:model|gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|sora).{0,50}(?:release[sd]?|launch(?:es|ed)?|debut(?:s|ed)?)|(?:正式)?(?:发布|推出|亮相).{0,50}(?:模型|gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|sora)|(?:模型|gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|sora).{0,50}(?:正式)?(?:发布|推出|亮相)/iu],
  ["model_release", /(?:open[- ]source[sd]?|发布|推出|开源).{0,35}(?:qwen(?:[- ]image)?|mimo)|(?:qwen(?:[- ]image)?|mimo).{0,35}(?:release[sd]?|launch(?:es|ed)?|debut(?:s|ed)?|发布|推出|开源(?!榜))/iu],
  ["semianalysis_china_datacenter_model", /\bsemi[\s-]?analysis\b.{0,48}(?:china\s+data\s*cent(?:er|re)\s+model|中国数据中心模型)|(?:china\s+data\s*cent(?:er|re)\s+model|中国数据中心模型).{0,48}\bsemi[\s-]?analysis\b/iu],
  ["stanford_together_sat_paper", /stanford.{0,30}together\s+ai.{0,90}(?:self[-\s]?organizing\s+agent\s+teams|\bSAT\b)|(?:self[-\s]?organizing\s+agent\s+teams|\bSAT\b).{0,90}stanford.{0,30}together\s+ai/iu],
  ["ming_image_0_1_design_release", /\bming[-\s]?image[-\s]?0[.]1[-\s]?design\b.{0,55}(?:发布|开源|上线|推出|available|launch|release)|(?:发布|开源|上线|推出|available|launch|release).{0,55}\bming[-\s]?image[-\s]?0[.]1[-\s]?design\b/iu],
  ["openrouter_jev_router_release", /\bopen\s*router\b.{0,55}\bjev(?:\s*router)?\b|\bjev(?:\s*router)?\b.{0,55}\bopen\s*router\b/iu],
  ["rabbit_os3_release", /\brabbit\b.{0,25}\bos\s*3\b|\bos\s*3\b.{0,25}\brabbit\b/iu],
  ["meta_muse_openclaw_inspiration_ack", /(?=.*\bmeta\b)(?=.*\bmuse\b)(?=.*\bopenclaw\b)(?=.*(?:admits?|acknowledges?|inspired|承认|启发))/iu],
  ["claude_tag_personal_connectors", /\bclaude\s+tag\b.{0,65}personal connectors?|personal connectors?.{0,65}\bclaude\s+tag\b|claude\s+tag.{0,65}个人连接器|个人连接器.{0,65}claude\s+tag/iu],
  ["midjourney_v8_tile_update", /\bmidjourney\b.{0,70}v8[.]1.{0,8}(?:v)?8[.]2.{0,40}(?:--tile|\btil(?:e|ing)\b|平铺)|\bmidjourney\b.{0,60}(?:--tile|\btil(?:e|ing)\b|平铺).{0,70}v8[.]1.{0,8}(?:v)?8[.]2/iu],
  ["product_availability", /now available|is now available|available in|available on|rolling out|now rolling out|上线|上架|可用|正式开放|现已开放/iu],
  ["free_trial", /free.{0,15}(?:trial|two weeks|14 days)|try.{0,15}free|免费.{0,15}(?:试用|开放|使用|两周|\d+\s*周|\d+\s*天)|(?:试用|免费开放).{0,15}两周/iu],
  ["benchmark_result", /\barena\b|leaderboard|benchmark|accuracy|准确率|基准|榜单|排名|评测|跑分/iu],
  ["benchmark_result", /\bmental\s*health\s*bench\b/iu],
  ["pricing_offer", /pricing|price cut|discount|promotion|promo|\$\s?\d+|\d+\s*(?:usd|美元)|credits?|quota|价格|定价|降价|优惠|促销|额度|配额|永久有效/iu],
  ["research_report", /technical report|research paper|arxiv|architecture study|技术报告|研究论文|论文|架构研究/iu],
  ["product_consolidation", /merg(?:e|es|ed|ing)|combine.{0,25}(?:consumer|workplace)|super app|work os|整合|合并|超级应用|工作操作系统/iu],
  ["feature_update", /adds? (?:persistent )?memory|memory feature|feature update|new feature|新增.{0,12}功能|记忆功能|持久记忆|chat\s*gpt\s+voice.{0,15}(?:upgrade|update|升级|更新)|(?:upgrade|update|升级|更新).{0,15}chat\s*gpt\s+voice/iu],
];

const EVENT_LABELS = {
  graceful_stop: "五小时上限后的优雅收尾机制",
  user_image_exposure: "用户图片公开暴露事件",
  agent_data_reconnaissance: "智能体数据库侦察披露",
  sandbox_escape_training_pause: "9 月 20 日沙盒联网事件后的工具训练暂停",
  semianalysis_china_datacenter_model: "SemiAnalysis 中国数据中心模型报告",
  stanford_together_sat_paper: "Stanford 与 Together AI 的自组织智能体团队论文",
  ming_image_0_1_design_release: "蚂蚁百灵 Ming-Image-0.1-Design 发布",
  openrouter_jev_router_release: "OpenRouter Jev Router 发布",
  rabbit_os3_release: "Rabbit OS3 发布",
  meta_muse_openclaw_inspiration_ack: "Meta 承认 Muse 受 OpenClaw 启发",
  claude_tag_personal_connectors: "Claude Tag 频道个人连接器",
  midjourney_v8_tile_update: "Midjourney V8.1/V8.2 平铺更新",
  perplexity_portable_computer_amd_support: "Perplexity Portable Computer AMD Ryzen AI Max 支持",
  odyssey_agora_2_release: "Odyssey Agora-2 发布",
  same_original_url: "同一原始报道链接",
  orbital_prototype: "Suncatcher 轨道原型测试",
  court_ruling: "上诉法院裁定",
  model_release: "模型发布",
  benchmark_result: "榜单或基准结果",
  pricing_offer: "价格或优惠变化",
  research_report: "研究报告或论文",
  product_consolidation: "产品整合或平台调整",
  feature_update: "产品功能更新",
};
function matches(pattern, title) {
  return pattern.test(String(title || ""));
}

function matchedKeys(patterns, title) {
  return patterns.filter(([, pattern]) => matches(pattern, title)).map(([key]) => key);
}

function itemEventKeys(item = {}) {
  const title = String(item.title || "");
  const evidence = `${title}\n${item.summary || ""}`;
  const keys = matchedKeys(EVENT_PATTERNS, title);
  if (isUserImageExposureEvidence(evidence) && !keys.includes("user_image_exposure")) {
    keys.push("user_image_exposure");
  }
  if (/\bperplexity\b/iu.test(title)
    && /\bportable\s+computer\b/iu.test(evidence)
    && /\bAMD\s+Ryzen\s+AI\s+Max\b/iu.test(evidence)) {
    keys.push("perplexity_portable_computer_amd_support");
  }
  if (/\bodyssey\b/iu.test(title)
    && /\bagora\s*[-–]?\s*2\b/iu.test(title)
    && /(?:release[sd]?|launch(?:es|ed)?|preview|发布|推出|预览)/iu.test(title)) {
    keys.push("odyssey_agora_2_release");
  }
  return keys;
}

function modelKeys(title) {
  const pattern = new RegExp(MODEL_PATTERN.source, MODEL_PATTERN.flags);
  const value = String(title || "");
  return [...value.matchAll(pattern)]
    .filter((match) => !/^\s*(?:级别?|水平|-?\s*(?:level|class|tier)\b)/iu.test(value.slice(match.index + match[0].length)))
    .map((match) => (
    `${match[1].toLowerCase() === "opus" ? "claude-opus" : match[1].toLowerCase()}-${[match[2], match[3], match[4]].filter(Boolean).join("-").toLowerCase()}`
    ));
}

function modelCodename(title = "") {
  const value = String(title || "");
  const match = value.match(/\b(?:code[-\s]?named|codename)\s+([\p{L}\p{N}-]{2,})\b/iu);
  return match?.[1]?.toLocaleLowerCase().replace(/[\s_-]+/gu, "") || null;
}

function pricingAnchors(title = "") {
  const anchors = new Set();
  const pattern = /(?:\$\s*(\d+(?:[,.]\d+)?)|(\d+(?:[,.]\d+)?)\s*(USD|dollars?|美元|元|credits?|%|percent))/giu;
  for (const match of String(title).matchAll(pattern)) {
    const amount = (match[1] || match[2]).replaceAll(",", "");
    const unit = match[1] ? "money" : /^(?:%|percent)$/iu.test(match[3]) ? "percent" : /credits?/iu.test(match[3]) ? "credits" : "money";
    anchors.add(`${unit}:${amount}`);
  }
  return anchors;
}

function samePricingAnchor(leftTitle, rightTitle) {
  const left = pricingAnchors(leftTitle);
  const right = pricingAnchors(rightTitle);
  return [...left].some((anchor) => right.has(anchor));
}

function benchmarkAnchor(title) {
  const value = String(title || "");
  if (/\bmental\s*health\s*bench\b/iu.test(value)) {
    return { family: "mental_health_bench", qualifier: null };
  }
  if (/家具组装|ikea.{0,24}furniture\s+assembly|furniture\s+assembly.{0,24}ikea/iu.test(value)) {
    return { family: "furniture_assembly", qualifier: null };
  }
  const artificialAnalysisHalfCostEval = /\bartificial\s+analysis\b/iu.test(value)
    && /gpt\s*[- ]?\s*6.{0,60}(?:sol|luna).{0,24}(?:sol|luna)|gpt\s*[- ]?\s*6.{0,60}(?:sol|luna)/iu.test(value)
    && /(?:50\s*%|一半成本|成本减半|价格减半)/iu.test(value)
    && /(?:intelligence\s+index|得分|表现|评测)/iu.test(value);
  if (artificialAnalysisHalfCostEval) return { family: "artificial_analysis_gpt6_half_cost_eval", qualifier: null };
  if (/\bartificial\s+analysis\b/iu.test(value) && /智能指数/iu.test(value) && /编码智能体/iu.test(value)) {
    return { family: "artificial_analysis_dual_index_eval", qualifier: null };
  }
  const codeArena = value.match(/\bcode\s+arena\s*(?:[:：]\s*([\p{L}\p{N}][\p{L}\p{N}-]{0,23}))?/iu);
  if (codeArena) return { family: "code_arena", qualifier: codeArena[1]?.toLowerCase() || null };
  const families = [
    ["text_arena", null, /\btext\s+arena\b|文本竞技场/iu],
    ["vision_arena", null, /\bvision\s+arena\b|视觉竞技场/iu],
    ["document_arena", null, /\bdocument\s+arena\b|文档竞技场/iu],
    ["arena", null, /\barena\b|竞技场/iu],
    ["artificial_analysis_coding_agent_index", null, /\bartificial\s+analysis\b.{0,32}\bcoding\s+agent\s+index\b|\bcoding\s+agent\s+index\b.{0,32}\bartificial\s+analysis\b/iu],
    ["artificial_analysis_coding_agent_index", null, /\bartificial\s+analysis\b.{0,32}编码智能体指数|编码智能体指数.{0,32}\bartificial\s+analysis\b/iu],
    ["artificial_analysis_intelligence_index", null, /\bartificial\s+analysis\b.{0,32}\bintelligence\s+index\b|\bintelligence\s+index\b.{0,32}\bartificial\s+analysis\b/iu],
    ["artificial_analysis_intelligence_index", null, /\bartificial\s+analysis\b.{0,32}智能指数|智能指数.{0,32}\bartificial\s+analysis\b/iu],
  ];
  const found = families.find(([, , pattern]) => pattern.test(value));
  return found ? { family: found[0], qualifier: found[1] } : null;
}

function sameBenchmark(leftTitle, rightTitle) {
  const left = benchmarkAnchor(leftTitle);
  const right = benchmarkAnchor(rightTitle);
  if (!left || !right || left.family !== right.family) return false;
  return left.qualifier === right.qualifier;
}

function matchedCaseContext(eventType, title) {
  if (eventType === "court_ruling") return /supply[- ]chain risk|pentagon|military contract|供应链风险|五角大楼|军事合同|国防部/iu.test(String(title || ""));
  return true;
}

function isClaudeCodeIntegration(item = {}) {
  const evidence = `${item.title || ""}\n${item.summary || ""}`;
  return /\bclaude\s+code\b/iu.test(evidence)
    && /(?:接入|集成|连接|integration|integrat(?:e|es|ed|ing)|connect(?:s|ed|ing)?)/iu.test(evidence);
}

function chatgptVoiceFeatureAnchors(title = "") {
  if (!/\bchat\s*gpt\s+voice\b/iu.test(String(title))) return [];
  const features = [
    ["email", /\b(?:e-?mail|mail)\b|邮件|邮箱/iu],
    ["calendar", /\bcalendar\b|日历/iu],
    ["slack", /\bslack\b/iu],
    ["translation", /\b(?:translate|translation)\b|翻译|口译/iu],
  ];
  return features.filter(([, pattern]) => pattern.test(String(title))).map(([key]) => key);
}

function isModelBackedToolLaunch(title = "") {
  const value = String(title);
  const modelMention = /\b(?:gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|mimo)\s*[- ]?\s*(?:opus|sonnet|haiku|flash|pro|mini|air|thinking)?\s*[- ]?\s*v?\d+(?:\.\d+)*\b/iu;
  const modelUseForProduct = new RegExp(
    `${modelMention.source}.{0,70}(?:制作|生成|驱动|基于|powered\\s+by|using|to\\s+(?:make|render|create)).{0,70}(?:agent|tool|app|platform|site|service|solution|video|智能体|工具|应用|平台|方案|服务)`,
    "iu",
  );
  const toolLaunch = /(?:发布|推出|上线|launch(?:es|ed)?|release[sd]?).{0,45}(?:agent|tool|app|platform|site|service|solution|智能体|工具|应用|平台|方案|服务)|(?:agent|tool|app|platform|site|service|solution|智能体|工具|应用|平台|方案|服务).{0,45}(?:发布|推出|上线|launch(?:es|ed)?|release[sd]?)/iu;
  return modelUseForProduct.test(value) && toolLaunch.test(value);
}

function isModelPromptLibraryLaunch(title = "") {
  return /\b(?:gpt|gemini|claude|deepseek|qwen|llama|grok|mistral|kimi|doubao|glm|hunyuan|nova|longcat|opus|mimo)\s*[- ]?\s*(?:opus|sonnet|haiku|flash|pro|mini|air|thinking)?\s*[- ]?\s*v?\d+(?:\.\d+)*\b/iu.test(String(title))
    && /(?:提示词(?:库|合集|模板)|prompt\s*(?:library|pack|collection))/iu.test(String(title))
    && /(?:发布|推出|上线|launch(?:es|ed)?|release[sd]?)/iu.test(String(title));
}

function isNewsRoundup(title = "") {
  return /(?:\bAI\s+daily\s+brief\b|\bdaily\s+AI\s+(?:brief|roundup|digest)\b|AI\s*日报|人工智能日报|本周\s*AI\s*(?:要闻|周报|盘点))/iu.test(String(title));
}

function matchedEventContext(eventType, leftTitle, rightTitle) {
  if (eventType === "feature_update") {
    const leftFeatures = chatgptVoiceFeatureAnchors(leftTitle);
    const rightFeatures = chatgptVoiceFeatureAnchors(rightTitle);
    if (leftFeatures.length && rightFeatures.length && !leftFeatures.some((feature) => rightFeatures.includes(feature))) return false;
  }
  if (eventType === "model_release"
    && (isModelPromptLibraryLaunch(leftTitle) || isModelPromptLibraryLaunch(rightTitle)
      || isNewsRoundup(leftTitle) || isNewsRoundup(rightTitle))) return false;
  if (eventType === "model_release" && (isModelBackedToolLaunch(leftTitle) || isModelBackedToolLaunch(rightTitle))) return false;
  if (eventType === "model_release" && /\bodyssey\b/iu.test(`${leftTitle} ${rightTitle}`)) {
    const leftModel = String(leftTitle || "").match(/\b(?:agora\s*[-–]?\s*\d+|odyssey\s*[-–]?\s*\d+)\b/iu)?.[0]?.toLowerCase().replace(/\s+/gu, "");
    const rightModel = String(rightTitle || "").match(/\b(?:agora\s*[-–]?\s*\d+|odyssey\s*[-–]?\s*\d+)\b/iu)?.[0]?.toLowerCase().replace(/\s+/gu, "");
    if (leftModel && rightModel && leftModel !== rightModel) return false;
  }
  if (eventType === "model_release" && /\bclaude\s+code\b/iu.test(`${leftTitle} ${rightTitle}`)) {
    const leftModels = modelKeys(leftTitle);
    const rightModels = modelKeys(rightTitle);
    if (!leftModels.some((model) => rightModels.includes(model))) return false;
  }
  if (eventType === "benchmark_result") return sameBenchmark(leftTitle, rightTitle);
  if (eventType === "product_availability" && (benchmarkAnchor(leftTitle) || benchmarkAnchor(rightTitle))) {
    return sameBenchmark(leftTitle, rightTitle);
  }
  if (eventType === "model_release" && /prompt\s*cach(?:e|ing)|提示词缓存|缓存系统|diagnostic\s+tools?|诊断工具|migration\s+guide|迁移指南/iu.test(`${leftTitle} ${rightTitle}`)) return false;
  return matchedCaseContext(eventType, leftTitle) && matchedCaseContext(eventType, rightTitle);
}

function originalUrl(item = {}) {
  const candidate = item.links?.original || item.originalUrl || "";
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  try {
    const url = new URL(candidate);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isSeptember20SandboxTrainingPause(item = {}) {
  const evidence = `${item.title || ""}\n${item.summary || ""}`;
  const date = /(?:sep(?:tember)?\.?\s*20|9\s*月\s*20\s*日)/iu.test(evidence);
  const sandboxInternetAccess = /sandbox|沙盒/iu.test(evidence)
    && /(?:internet|internet access|external chatbot|dns|互联网|联网|网络访问)/iu.test(evidence);
  const trainingPause = /(?:pause[sd]?|halt(?:ed)?|stop(?:ped)?|暂停|停止|中止).{0,45}(?:training|训练)|(?:training|训练).{0,45}(?:pause|暂停|停止|中止)/iu.test(evidence);
  return date && sandboxInternetAccess && trainingPause;
}

function compareRelatedEvents(left = {}, right = {}) {
  const leftOriginalUrl = originalUrl(left);
  const rightOriginalUrl = originalUrl(right);
  if (leftOriginalUrl && leftOriginalUrl === rightOriginalUrl) {
    return {
      entity: "original_link",
      eventType: "same_original_url",
      reason: "来源记录指向同一原始链接；暂按同一报道候选展示，尚未确认属于同一事件。",
    };
  }
  const leftTitle = left.title || "";
  const rightTitle = right.title || "";
  const sharedOpenAI = matchedKeys(ENTITY_PATTERNS, leftTitle).includes("openai")
    && matchedKeys(ENTITY_PATTERNS, rightTitle).includes("openai");
  if (sharedOpenAI && isSeptember20SandboxTrainingPause(left) && isSeptember20SandboxTrainingPause(right)) {
    return {
      entity: "openai",
      eventType: "sandbox_escape_training_pause",
      reason: `标题与摘要共同指向 ${EVENT_LABELS.sandbox_escape_training_pause}（主体：OpenAI）；尚未确认属于同一事件。`,
    };
  }
  const leftModels = modelKeys(leftTitle);
  const rightModels = modelKeys(rightTitle);
  const sharedModels = leftModels.filter((key) => rightModels.includes(key));
  if ((leftModels.length || rightModels.length) && !sharedModels.length) return null;

  const leftEntities = [...new Set([...matchedKeys(ENTITY_PATTERNS, leftTitle), ...leftModels])];
  const rightEntities = [...new Set([...matchedKeys(ENTITY_PATTERNS, rightTitle), ...rightModels])];
  const sharedEntities = leftEntities.filter((key) => rightEntities.includes(key));
  if (!sharedEntities.length) return null;
  const leftProducts = matchedKeys(PRODUCT_PATTERNS, leftTitle);
  const rightProducts = matchedKeys(PRODUCT_PATTERNS, rightTitle);
  if (leftProducts.length && rightProducts.length && !leftProducts.some((key) => rightProducts.includes(key))) return null;
  const claudeMarketplaceAvailability = leftProducts.includes("claude_marketplace")
    && rightProducts.includes("claude_marketplace")
    && [leftTitle, rightTitle].every((title) => /\b(?:launch(?:es|ed|ing)?|release[sd]?|available|rolling out)\b|上线|上架|开放|可用/iu.test(title));
  const leftEvents = new Set(itemEventKeys(left));
  const sharedEvents = itemEventKeys(right).filter((key) => leftEvents.has(key));
  if (sharedEvents.includes("model_release")) {
    const leftCodename = modelCodename(leftTitle);
    const rightCodename = modelCodename(rightTitle);
    if (leftCodename && rightCodename && leftCodename !== rightCodename) return null;
  }

  const rightEvents = new Set(itemEventKeys({ title: rightTitle }));
  const leftPrimaryEvents = [...leftEvents].filter((event) => event !== "pricing_offer");
  const rightPrimaryEvents = [...rightEvents].filter((event) => event !== "pricing_offer");
  const sharedPrimaryEvent = leftPrimaryEvents.some((event) => rightPrimaryEvents.includes(event));
  if (!claudeMarketplaceAvailability
    && (!sharedEvents.length || (leftPrimaryEvents.length && rightPrimaryEvents.length && !sharedPrimaryEvent))) return null;
  const specificEventTypes = [
    "semianalysis_china_datacenter_model",
    "stanford_together_sat_paper",
    "ming_image_0_1_design_release",
    "openrouter_jev_router_release",
    "rabbit_os3_release",
    "meta_muse_openclaw_inspiration_ack",
    "claude_tag_personal_connectors",
    "midjourney_v8_tile_update",
    "perplexity_portable_computer_amd_support",
    "odyssey_agora_2_release",
  ];
  const eventType = claudeMarketplaceAvailability
    ? "product_availability"
    : specificEventTypes.find((event) => sharedEvents.includes(event))
    || (sharedEvents.includes("model_release") ? "model_release" : sharedEvents[0]);
  if (eventType === "research_report" && sharedEntities.length < 2) return null;
  if (eventType === "product_availability"
    && (leftProducts.length || rightProducts.length)
    && !leftProducts.some((key) => rightProducts.includes(key))) return null;
  if (eventType === "model_release" && sharedEntities.includes("chatgpt") && !sharedModels.length) return null;
  if (eventType === "pricing_offer" && !samePricingAnchor(leftTitle, rightTitle)) return null;
  if (eventType === "product_availability" && sharedEntities.length === 1 && sharedEntities[0] === "openrouter" && !sharedModels.length) return null;
  if (eventType === "model_release" && sharedEntities.includes("openrouter") && !sharedModels.length) return null;
  if (!matchedEventContext(eventType, leftTitle, rightTitle)) return null;
  if (eventType === "product_availability" && (isClaudeCodeIntegration(left) || isClaudeCodeIntegration(right))) return null;
  const entity = sharedEntities[0];
  return {
    entity,
    eventType,
    reason: `标题共同指向 ${EVENT_LABELS[eventType]}（主体：${entity.replaceAll("_", " ")}）；尚未确认属于同一事件。`,
  };
}

module.exports = { compareRelatedEvents };
