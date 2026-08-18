const { enrichItem, itemCategory, sourceChannel } = require("./editorial");
const { isSelectedFeedEligible } = require("./scoring");

const STOP_WORDS = new Set([
  "ai", "的", "了", "和", "与", "是", "在", "有", "什么", "最近", "当前", "一下",
  "the", "and", "for", "with", "what", "latest", "recent",
]);

function tokens(value = "") {
  const text = String(value).toLowerCase();
  const latin = text.match(/[a-z0-9][a-z0-9.+-]{1,}/g) || [];
  const chinese = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set([...latin, ...chinese].filter((token) => !STOP_WORDS.has(token)))].slice(0, 24);
}

function itemText(item = {}) {
  return `${item.title || ""} ${item.summary || ""} ${item.reason || ""} ${item.sourceName || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
}

function retrievalScore(item, queryTokens, focusId) {
  const text = itemText(item);
  const matches = queryTokens.reduce((sum, token) => sum + (text.includes(token) ? (token.length > 3 ? 14 : 8) : 0), 0);
  const tier = {
    preferred_x: 20,
    official_first_party: 18,
    expert_rss: 14,
    reference: 8,
    cn_media: 4,
    community_fallback: -6,
  }[item.priorityTier] || 0;
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt || 0).getTime()) / 36e5);
  const freshness = Math.max(0, 18 - Math.min(18, ageHours / 12));
  return matches + tier + freshness + Number(item.score || 0) / 5 + (item.id === focusId ? 200 : 0);
}

function retrieveItems(state, { question = "", itemId = "", limit = 8, diversify = false } = {}) {
  const queryTokens = tokens(question);
  const selectedThreshold = Number(state.settings?.rules?.selectedThreshold || 72);
  const ranked = (state.items || [])
    .filter((item) => isSelectedFeedEligible(item, selectedThreshold))
    .map((item) => ({ item, rank: retrievalScore(item, queryTokens, itemId) }))
    .filter(({ item, rank }) => item.id === itemId || !queryTokens.length || rank >= 20)
    .sort((a, b) => b.rank - a.rank || new Date(b.item.publishedAt || 0) - new Date(a.item.publishedAt || 0));
  const bounded = Math.min(12, Math.max(3, limit));
  if (!diversify) return ranked.slice(0, bounded).map(({ item }) => enrichItem(item));
  const selected = [];
  const sources = new Set();
  for (const candidate of ranked) {
    const source = candidate.item.sourceName || candidate.item.sourceId || "unknown";
    if (sources.has(source)) continue;
    selected.push(candidate);
    sources.add(source);
    if (selected.length >= bounded) break;
  }
  for (const candidate of ranked) {
    if (selected.length >= bounded) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected.map(({ item }) => enrichItem(item));
}

function compact(value = "", length = 150) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function factOf(item) {
  return compact(item.editorialBrief?.fact || item.summary || item.reason || item.title, 180);
}

function sourceType(item) {
  if (item.priorityTier === "official_first_party") return "一手官方";
  if (item.priorityTier === "preferred_x") return "专家/X 线索";
  if (item.priorityTier === "expert_rss") return "专家分析";
  if (item.priorityTier === "reference") return "参考聚合";
  if (item.priorityTier === "cn_media") return "中文媒体";
  if (item.priorityTier === "community_fallback") return "社区/研究";
  const channel = sourceChannel(item);
  if (channel === "first_party") return "一手官方";
  if (channel === "expert_analysis") return "专家分析";
  if (channel === "social") return "专家/X 线索";
  if (channel === "community") return "社区/研究";
  if (channel === "cn_media") return "中文媒体";
  return "公开资讯";
}

function commonTopics(items) {
  const counts = new Map();
  for (const item of items) {
    for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
}

function buildBrief(items) {
  const topics = commonTopics(items);
  const lead = topics.length ? `当前证据主要集中在${topics.join("、")}。` : "当前证据集中在模型、产品与行业变化。";
  const points = items.slice(0, 4).map((item, index) => `${index + 1}. ${item.title}：${factOf(item)}`);
  return `${lead}\n${points.join("\n")}`;
}

function buildComparison(items) {
  const bySource = new Map();
  for (const item of items) {
    if (!bySource.has(item.sourceName)) bySource.set(item.sourceName, item);
  }
  const distinct = [...bySource.values()].slice(0, 5);
  if (distinct.length < 2) return `当前只有一个足够相关的信源：${distinct[0]?.sourceName || "暂无"}。建议等待更多独立来源后再判断。`;
  return distinct
    .map((item) => `- ${item.sourceName}（${sourceType(item)}）：${factOf(item)}`)
    .join("\n");
}

function buildTimeline(items) {
  return [...items]
    .sort((a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0))
    .slice(-8)
    .map((item) => `${new Date(item.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${item.sourceName}：${item.title}`)
    .join("\n");
}

function buildImpact(items) {
  const impacts = items
    .map((item) => item.editorialBrief?.impact || item.reason)
    .filter(Boolean)
    .slice(0, 4)
    .map((impact) => `- ${compact(impact, 170)}`);
  const categories = [...new Set(items.map(itemCategory))];
  const scope = categories.includes("education")
    ? "教育产品、教学流程与学习服务"
    : categories.includes("culture")
      ? "内容生产、版权与文化创意工作流"
      : categories.includes("research")
        ? "研究判断、评测和技术路线"
        : "产品路线、开发实践和行业竞争";
  return `主要影响面是${scope}：\n${impacts.join("\n")}`;
}

function buildSources(items) {
  return items.slice(0, 8).map((item, index) => `${index + 1}. ${sourceType(item)} · ${item.sourceName} · ${item.title}`).join("\n");
}

function buildNext(items) {
  const item = items[0];
  if (!item) return "当前没有足够相关的高质量内容。";
  return `建议先读《${item.title}》。它来自${sourceType(item)}“${item.sourceName}”，推荐理由是：${compact(item.reason || factOf(item), 190)}`;
}

function inferCommand(question = "", explicit = "") {
  if (explicit) return explicit.replace(/^\//, "");
  if (/时间线|timeline|过程|先后/.test(question)) return "timeline";
  if (/比较|对比|差异|各家|多个来源|compare/.test(question)) return "compare";
  if (/影响|意味着|价值|impact/.test(question)) return "impact";
  if (/信源|来源|依据|source/.test(question)) return "sources";
  if (/推荐|先读|下一篇|next/.test(question)) return "next";
  return "brief";
}

function answerQuestion(state, input = {}) {
  const command = inferCommand(input.question, input.command);
  const items = retrieveItems(state, {
    question: input.question,
    itemId: input.itemId,
    limit: command === "timeline" ? 10 : 8,
    diversify: command === "compare" || command === "sources",
  });
  const builders = {
    brief: buildBrief,
    compare: buildComparison,
    timeline: buildTimeline,
    impact: buildImpact,
    sources: buildSources,
    next: buildNext,
  };
  const answer = (builders[command] || buildBrief)(items);
  return {
    command,
    answer,
    grounded: items.length > 0,
    citations: items.map((item, index) => ({
      id: item.id,
      index: index + 1,
      title: item.title,
      sourceName: item.sourceName,
      sourceType: sourceType(item),
      publishedAt: item.publishedAt,
      url: item.url,
    })),
  };
}

module.exports = {
  answerQuestion,
  inferCommand,
  retrieveItems,
  tokens,
};
