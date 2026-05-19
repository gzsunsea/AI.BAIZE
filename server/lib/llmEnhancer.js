const { readState, writeState } = require("./store");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";
const RULES_RETRY_MS = Number(process.env.LLM_RULES_RETRY_MS || 12 * 60 * 60 * 1000);

function isMostlyEnglish(text = "") {
  const value = String(text);
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const chinese = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin > 120 && latin > chinese * 2;
}

function sourceText(item) {
  const raw = item?.raw || {};
  const rawJson = raw.rawJson || {};
  const parts = [
    item?.title,
    item?.summary,
    raw.title,
    raw.description,
    raw.summary,
    raw.story_text,
    raw.content,
    raw.content_text,
    rawJson.text,
    rawJson.full_text,
    rawJson.content,
  ];
  return parts
    .filter(Boolean)
    .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldEnhance(item, force = false) {
  if (!item || item.hidden) return false;
  if (!force && item.llmProvider?.startsWith("ollama:")) return false;
  if (!force && item.llmProvider === "rules") {
    const enhancedAt = new Date(item.llmEnhancedAt || 0).getTime();
    if (enhancedAt && Date.now() - enhancedAt < RULES_RETRY_MS) return false;
  }
  const text = sourceText(item);
  return item.preferred || ["preferred_x", "official_first_party", "expert_rss"].includes(item.priorityTier) || isMostlyEnglish(text) || String(item.summary || "").length < 120;
}

function clip(text = "", length = 1800) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, length);
}

function parseJsonBlock(text = "") {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function compactSentence(text = "", maxLength = 120) {
  return clip(text, maxLength).replace(/[。；;，,]\s*$/, "");
}

function editorialSummary({ fact, impact, scenario }) {
  return [
    `事实摘要：${compactSentence(fact, 180)}。`,
    `影响判断：${compactSentence(impact, 150)}。`,
    `场景价值：${compactSentence(scenario, 140)}。`,
  ].join("");
}

function fallbackEnhance(item) {
  const text = sourceText(item).toLowerCase();
  const topics = [];
  if (/agent|workflow|tool|browser|自动化|智能体/.test(text)) topics.push("智能体工作流");
  if (/model|llm|inference|training|模型|推理|训练/.test(text)) topics.push("模型能力与工程");
  if (/benchmark|eval|评测|基准/.test(text)) topics.push("评测与基准");
  if (/education|student|teacher|课堂|教育|学生|教师/.test(text)) topics.push("教育应用");
  if (/culture|creative|art|music|film|版权|文化|艺术|创意/.test(text)) topics.push("文化创意");
  if (/github|open source|repo|开源/.test(text)) topics.push("开源生态");
  const focus = topics.slice(0, 3).join("、") || "AI 应用价值";
  const base = sourceText(item) || item.title;
  const fact = isMostlyEnglish(base) ? `这条英文动态主要涉及${focus}，原文信息显示：${clip(base, 260)}` : clip(base, 260);
  const impact = `它可能改变${focus}相关的产品判断、研究节奏或内容生产方式`;
  const scenario = `适合用于跟踪${focus}方向的选题、竞品观察和落地方案筛选`;
  return {
    summary: editorialSummary({ fact, impact, scenario }),
    reason: `它和${focus}直接相关，可能影响产品设计、研究判断、教育/文化场景落地或开发实践。`,
    editorialBrief: { fact, impact, scenario },
    provider: "rules",
  };
}

async function callOllama(item) {
  if (process.env.OLLAMA_DISABLED === "1") throw new Error("ollama disabled");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_TIMEOUT_MS || 8000));
  const prompt = `你是 AI 资讯主编。请把下面资讯的英文正文改写成中文编辑稿，风格参考高质量 AI 情报站：克制、具体、有判断，不像机器摘要。

要求：
1. 只输出 JSON，不要 Markdown。
2. fact 90-160 个中文字符：说清楚发生了什么，保留关键主体、产品/模型/论文/数据。
3. impact 70-130 个中文字符：判断它对行业、产品、研究或开发者意味着什么。
4. scenario 50-100 个中文字符：说明适合谁关注、可用在哪些场景。
5. reason 60-120 个中文字符：用编辑口吻解释为什么值得推荐。
6. 不要编造原文没有的信息；英文标题不必逐字翻译；避免空话套话。

标题：${item.title || ""}
来源：${item.sourceName || ""}
标签：${(item.tags || []).join("、")}
原文/摘要：${clip(sourceText(item) || item.summary || item.title, 2400)}

输出格式：
{"fact":"...","impact":"...","scenario":"...","reason":"..."}`;
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 420,
        },
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    const parsed = parseJsonBlock(data.response || "");
    if ((!parsed?.summary && !parsed?.fact) || !parsed?.reason) throw new Error("invalid llm json");
    const fact = String(parsed.fact || parsed.summary || "").trim();
    const impact = String(parsed.impact || "这条动态可能影响相关产品路线、研究判断或开发实践。").trim();
    const scenario = String(parsed.scenario || "适合关注 AI 产品、研究和行业应用的人快速判断后续价值。").trim();
    return {
      summary: editorialSummary({ fact, impact, scenario }),
      reason: String(parsed.reason).trim(),
      editorialBrief: { fact, impact, scenario },
      provider: `ollama:${OLLAMA_MODEL}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function enhanceItem(item) {
  try {
    return await callOllama(item);
  } catch {
    return fallbackEnhance(item);
  }
}

async function enhanceRecentItems({ limit = 40, force = false } = {}) {
  const state = readState();
  const candidates = state.items
    .filter((item) => shouldEnhance(item, force))
    .sort((a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)) || (b.score || 0) - (a.score || 0) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, limit);
  if (!candidates.length) return { enhanced: 0, provider: "none" };

  const enhancedById = new Map();
  const queue = [...candidates];
  const concurrency = Math.max(1, Number(process.env.LLM_ENHANCE_CONCURRENCY || 2));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const item = queue.shift();
        const enhanced = await enhanceItem(item);
        enhancedById.set(item.id, enhanced);
      }
    }),
  );

  const now = new Date().toISOString();
  let provider = "none";
  state.items = state.items.map((item) => {
    const enhanced = enhancedById.get(item.id);
    if (!enhanced) return item;
    provider = provider === "none" ? enhanced.provider : provider;
    return {
      ...item,
      summary: enhanced.summary,
      reason: enhanced.reason,
      editorialBrief: enhanced.editorialBrief || item.editorialBrief || null,
      llmEnhancedAt: now,
      llmProvider: enhanced.provider,
    };
  });
  writeState(state);
  return { enhanced: enhancedById.size, provider };
}

module.exports = {
  enhanceRecentItems,
  sourceText,
};
