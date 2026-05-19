const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");
const { normalizeItem, stripHtml } = require("./scoring");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function sourceMeta(source) {
  return {
    sourceId: source.id,
    sourceTier: source.tier,
    priorityTier: source.priorityTier || source.tier || "custom",
    preferred: Boolean(source.preferred),
    noisePenalty: Number(source.noisePenalty || 0),
    topicBoosts: source.topicBoosts || {},
  };
}

async function fetchText(url, headers = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
      ...headers,
    },
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

function fetchTimeout(source = {}, fallbackMs = 10000) {
  return Number(source.fetchTimeoutMs || source.timeoutMs || process.env.SOURCE_FETCH_TIMEOUT_MS || fallbackMs);
}

function extractPublishedAt(text = "") {
  const value = String(text).replace(/\s+/g, " ");
  const patterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i,
    /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  ];
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const english = value.match(patterns[0]);
  if (english) {
    return new Date(Date.UTC(Number(english[3]), monthMap[english[1].slice(0, 3).toLowerCase()], Number(english[2]), 12)).toISOString();
  }
  const numeric = value.match(patterns[1]);
  if (numeric) return new Date(Date.UTC(Number(numeric[1]), Number(numeric[2]) - 1, Number(numeric[3]), 12)).toISOString();
  return "";
}

function articlePublishedAtFromHtml(html = "") {
  const $ = cheerio.load(html);
  const value =
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='pubdate']").attr("content") ||
    $("meta[name='publishdate']").attr("content") ||
    $("meta[name='date']").attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    $("time").first().text() ||
    "";
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return extractPublishedAt(value);
}

function articleSummaryFromHtml(html = "") {
  const $ = cheerio.load(html);
  const meta =
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    $("meta[name='twitter:description']").attr("content") ||
    "";
  const paragraphs = $("article p, main p, .post-content p, .entry-content p")
    .toArray()
    .map((node) => $(node).text().replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 60)
    .slice(0, 3)
    .join(" ");
  return stripHtml(meta || paragraphs);
}

function absolutizeUrl(url = "", base = "") {
  if (!url) return "";
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function compactMedia(media = []) {
  const seen = new Set();
  return media
    .map((asset) => ({
      url: asset.url || asset.thumbnail || "",
      thumbnail: asset.thumbnail || asset.url || "",
      type: asset.type || "image",
      alt: asset.alt || "",
    }))
    .filter((asset) => /^https?:\/\//i.test(asset.url))
    .filter((asset) => {
      if (seen.has(asset.url)) return false;
      seen.add(asset.url);
      return true;
    })
    .slice(0, 3);
}

function articleMediaFromHtml(html = "", base = "") {
  const $ = cheerio.load(html);
  const media = [];
  const ogImage = $("meta[property='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content");
  const ogVideo = $("meta[property='og:video']").attr("content") || $("meta[property='og:video:url']").attr("content");
  if (ogImage) media.push({ url: absolutizeUrl(ogImage, base), type: "image" });
  if (ogVideo) media.push({ url: absolutizeUrl(ogVideo, base), thumbnail: absolutizeUrl(ogImage, base), type: "video" });
  $("article img, main img, .post-content img, .entry-content img").slice(0, 2).each((_, node) => {
    const src = $(node).attr("src") || $(node).attr("data-src");
    if (src) media.push({ url: absolutizeUrl(src, base), type: "image", alt: $(node).attr("alt") || "" });
  });
  $("video, video source").slice(0, 1).each((_, node) => {
    const src = $(node).attr("src");
    const poster = $(node).attr("poster");
    if (src || poster) media.push({ url: absolutizeUrl(src || poster, base), thumbnail: absolutizeUrl(poster || ogImage || src, base), type: "video" });
  });
  return compactMedia(media);
}

function mediaFromHtmlFragment(html = "", base = "") {
  if (!html) return [];
  const $ = cheerio.load(html);
  const media = [];
  $("img").slice(0, 3).each((_, node) => {
    const src = $(node).attr("src") || $(node).attr("data-src") || $(node).attr("data-original");
    if (src) media.push({ url: absolutizeUrl(src, base), type: "image", alt: $(node).attr("alt") || "" });
  });
  $("video, video source").slice(0, 1).each((_, node) => {
    const src = $(node).attr("src");
    const poster = $(node).attr("poster");
    if (src || poster) media.push({ url: absolutizeUrl(src || poster, base), thumbnail: absolutizeUrl(poster || src, base), type: "video" });
  });
  return compactMedia(media);
}

async function scrapeWebList(source) {
  const html = await fetchText(source.url, {}, fetchTimeout(source, 9000));
  const $ = cheerio.load(html);
  const origin = new URL(source.url).origin;
  const seen = new Set();
  const candidates = [];
  $("a[href]").each((_, node) => {
    if (candidates.length >= 24) return;
    const href = $(node).attr("href");
    const text = $(node).text().replace(/\s+/g, " ").trim();
    if (!href || text.length < 18) return;
    const url = href.startsWith("http") ? href : `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
    if (!url.startsWith(origin) || seen.has(url)) return;
    if (!/news|research|blog|index|\/\d{4}\//i.test(url)) return;
    const publishedAt = extractPublishedAt(`${text} ${url}`);
    if (!publishedAt && source.tier === "first_party") return;
    seen.add(url);
    candidates.push({ url, title: text, publishedAt });
  });
  const items = [];
  for (const candidate of candidates.slice(0, source.limit || 18)) {
    let summary = candidate.title;
    let media = [];
    let publishedAt = candidate.publishedAt;
    try {
      const articleHtml = await fetchText(candidate.url, {}, Number(source.articleTimeoutMs || process.env.ARTICLE_FETCH_TIMEOUT_MS || 4500));
      summary = articleSummaryFromHtml(articleHtml) || summary;
      media = articleMediaFromHtml(articleHtml, candidate.url);
      publishedAt = articlePublishedAtFromHtml(articleHtml) || publishedAt;
    } catch {
      summary = candidate.title;
    }
    items.push(
      normalizeItem({
        url: candidate.url,
        title: candidate.title,
        summary,
        sourceName: source.name,
        sourceKind: "web_list",
        ...sourceMeta(source),
        publishedAt: publishedAt || new Date().toISOString(),
        tags: source.tier === "first_party" ? ["一手信源"] : [],
        media,
      }),
    );
  }
  return items;
}

function parseAihotJson(html) {
  const marker = '"initialItems":';
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const arrStart = html.indexOf("[", start + marker.length);
  const endMarker = ',"initialHasNext"';
  const arrEnd = html.indexOf(endMarker, arrStart);
  if (arrStart < 0 || arrEnd < 0) return [];
  const raw = html.slice(arrStart, arrEnd);
  return JSON.parse(raw);
}

async function scrapeAihot(source) {
  const html = await fetchText(source.url, {}, fetchTimeout(source, 9000));
  const embedded = parseAihotJson(html);
  if (embedded.length) {
    return embedded.map((item) =>
      normalizeItem({
        ...item,
        sourceKind: "aihot",
        sourceName: item.source?.name || "AIHOT 公开页",
        ...sourceMeta(source),
      }),
    );
  }

  const $ = cheerio.load(html);
  return $(".timeline-card")
    .toArray()
    .map((node) => {
      const card = $(node);
      return normalizeItem({
        url: card.find(".timeline-title").attr("href"),
        title: card.find(".timeline-title").text(),
        summary: card.find(".timeline-summary").text(),
        sourceName: card.find(".timeline-source").text() || source.name,
        sourceKind: "aihot",
        ...sourceMeta(source),
        publishedAt: new Date().toISOString(),
        finalScore: Number(card.find(".timeline-score").text()) || undefined,
        tags: card
          .find(".timeline-tags .tag")
          .toArray()
          .map((tag) => $(tag).text().trim())
          .filter(Boolean),
        reason: card.find(".timeline-reason").text().replace("推荐理由：", "").trim(),
        media: compactMedia([
          ...card.find("img").toArray().map((img) => ({ url: $(img).attr("src") || $(img).attr("data-src"), type: "image", alt: $(img).attr("alt") || "" })),
          ...card.find("video, video source").toArray().map((video) => ({ url: $(video).attr("src") || $(video).attr("poster"), thumbnail: $(video).attr("poster"), type: "video" })),
        ]),
      });
    });
}

async function scrapeXReference(source) {
  const html = await fetchText(source.url, {}, fetchTimeout(source, 9000));
  const embedded = parseAihotJson(html);
  return embedded
    .map((item) =>
      normalizeItem({
        ...item,
        sourceKind: "x",
        sourceName: item.source?.name ? `X · ${item.source.name}` : "X 高价值聚合线索",
        ...sourceMeta(source),
        tags: [...new Set([...(item.tags || []), "X 高价值", "社交信号"])],
      }),
    )
    .filter((item) => /https?:\/\/(x|twitter)\.com\//i.test(item.url || ""))
    .slice(0, source.limit || 40);
}

async function scrapeHn(source) {
  const data = JSON.parse(await fetchText(source.url, { accept: "application/json" }, fetchTimeout(source, 8000)));
  return (data.hits || [])
    .filter((hit) => hit.title && hit.url)
    .map((hit) =>
      normalizeItem({
        url: hit.url,
        title: hit.title,
        summary: hit.story_text || hit.title,
        sourceName: source.name,
        sourceKind: "hn",
        ...sourceMeta(source),
        publishedAt: hit.created_at,
        author: hit.author,
        comments: hit.num_comments,
        tags: ["海外动态"],
      }),
    );
}

async function scrapeGithub(source) {
  const data = JSON.parse(await fetchText(source.url, { accept: "application/vnd.github+json" }, fetchTimeout(source, 8000)));
  return (data.items || []).map((repo) =>
    normalizeItem({
      url: repo.html_url,
      title: `${repo.full_name}: ${repo.description || "AI open-source repository"}`,
      summary: `${repo.description || "AI 开源项目"}。Stars: ${repo.stargazers_count}, language: ${repo.language || "unknown"}.`,
      sourceName: source.name,
      sourceKind: "github",
      ...sourceMeta(source),
      publishedAt: repo.updated_at,
      stars: repo.stargazers_count,
      tags: ["开源/仓库", "部署/工程"],
    }),
  );
}

async function scrapeArxiv(source) {
  const xml = await fetchText(source.url, { accept: "application/atom+xml" }, fetchTimeout(source, 9000));
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const entries = Array.isArray(data.feed?.entry) ? data.feed.entry : data.feed?.entry ? [data.feed.entry] : [];
  return entries.map((entry) => {
    const link = Array.isArray(entry.link) ? entry.link.find((item) => item["@_href"])?.["@_href"] : entry.link?.["@_href"];
    return normalizeItem({
      url: link,
      title: entry.title,
      summary: entry.summary,
      sourceName: source.name,
      sourceKind: "arxiv",
      ...sourceMeta(source),
      publishedAt: entry.published || entry.updated,
      author: Array.isArray(entry.author) ? entry.author.map((a) => a.name).join(", ") : entry.author?.name,
      tags: ["论文/研究"],
    });
  });
}

async function scrapeDevto(source) {
  const data = JSON.parse(await fetchText(source.url, { accept: "application/json" }, fetchTimeout(source, 8000)));
  return (Array.isArray(data) ? data : []).map((article) =>
    normalizeItem({
      url: article.url,
      title: article.title,
      summary: article.description,
      sourceName: source.name,
      sourceKind: "devto",
      ...sourceMeta(source),
      publishedAt: article.published_at,
      author: article.user?.name,
      comments: article.comments_count,
      tags: ["教程/实践"],
    }),
  );
}

async function scrapeRss(source) {
  const xml = await fetchText(source.url, { accept: "application/rss+xml,application/xml" }, fetchTimeout(source, 9000));
  return rssEntriesToItems(xml, source);
}

function feedEntriesFromXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const channel = data.rss?.channel || data.feed;
  const entries = channel?.item || channel?.entry || [];
  return (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
}

function rssEntriesToItems(xml, source, extra = {}) {
  return feedEntriesFromXml(xml).slice(0, source.limit || 40).map((entry) =>
    normalizeItem({
      url: entry.link?.["@_href"] || entry.link || entry.guid?.["#text"] || entry.guid,
      title: entry.title?.["#text"] || entry.title,
      summary: stripHtml(entry.description || entry.summary || entry.content || ""),
      sourceName: extra.sourceName || source.name,
      sourceKind: extra.sourceKind || "rss",
      ...sourceMeta(source),
      publishedAt: entry.pubDate || entry.published || entry.updated || new Date().toISOString(),
      author: entry.creator || entry.author?.name || entry.author,
      tags: extra.tags,
      media: compactMedia([
        ...mediaFromHtmlFragment(`${entry["content:encoded"] || ""} ${entry.content || ""} ${entry.summary || ""} ${entry.description || ""}`, entry.link?.["@_href"] || entry.link || source.url),
        ...(Array.isArray(entry.enclosure) ? entry.enclosure : entry.enclosure ? [entry.enclosure] : []).map((item) => ({ url: item["@_url"] || item.url, type: item["@_type"] || item.type || "image" })),
        ...(Array.isArray(entry["media:content"]) ? entry["media:content"] : entry["media:content"] ? [entry["media:content"]] : []).map((item) => ({ url: item["@_url"] || item.url, type: item["@_medium"] || item["@_type"] || "image" })),
        ...(Array.isArray(entry["media:thumbnail"]) ? entry["media:thumbnail"] : entry["media:thumbnail"] ? [entry["media:thumbnail"]] : []).map((item) => ({ url: item["@_url"] || item.url, type: "image" })),
        { url: entry.image?.url || entry.image, type: "image" },
      ]),
    }),
  );
}

function isHighValueXText(text = "") {
  return /AI|agent|LLM|model|OpenAI|Claude|Anthropic|DeepMind|Gemini|Hugging Face|benchmark|eval|research|paper|robot|education|edtech|culture|creative|copyright|模型|智能体|多模态|推理|教育|文化|艺术|版权|开源/i.test(text);
}

async function fetchFirstMirror(handle, mirrors = [], budget = { attempts: 0, maxAttempts: 8 }) {
  const errors = [];
  for (const template of mirrors) {
    if (budget.attempts >= budget.maxAttempts) break;
    budget.attempts += 1;
    const url = template.replaceAll("{handle}", handle);
    try {
      return { url, xml: await fetchText(url, { accept: "application/rss+xml,application/xml,text/xml,*/*" }, 4500) };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.slice(0, 3).join(" | "));
}

async function scrapeXProfiles(source) {
  const handles = (source.handles || []).slice(0, 12);
  const mirrors = source.mirrors?.length ? source.mirrors : [source.url || "https://twiiit.com/{handle}/rss"];
  const items = [];
  const errors = [];
  const budget = { attempts: 0, maxAttempts: Number(source.maxAttempts || 8) };
  for (const handle of handles) {
    try {
      const { xml } = await fetchFirstMirror(handle, mirrors, budget);
      const nextItems = rssEntriesToItems(xml, { ...source, limit: 8 }, {
        sourceName: `X · @${handle}`,
        sourceKind: "x",
        tags: ["X 高价值", "社交信号"],
      }).filter((item) => isHighValueXText(`${item.title} ${item.summary}`));
      items.push(...nextItems);
    } catch (error) {
      errors.push(`@${handle}: ${error.message}`);
    }
    if (budget.attempts >= budget.maxAttempts) break;
    if (items.length >= (source.limit || 36)) break;
  }
  if (!items.length && errors.length) throw new Error(errors.slice(0, 4).join(" || "));
  return items.slice(0, source.limit || 36);
}

async function scrapeSource(source) {
  if (!source.enabled) return [];
  if (source.kind === "aihot") return scrapeAihot(source);
  if (source.kind === "x_reference") return scrapeXReference(source);
  if (source.kind === "hn") return scrapeHn(source);
  if (source.kind === "github") return scrapeGithub(source);
  if (source.kind === "arxiv") return scrapeArxiv(source);
  if (source.kind === "devto") return scrapeDevto(source);
  if (source.kind === "rss") return scrapeRss(source);
  if (source.kind === "x_profiles") return scrapeXProfiles(source);
  if (source.kind === "web_list") return scrapeWebList(source);
  throw new Error(`Unsupported source kind: ${source.kind}`);
}

module.exports = {
  scrapeSource,
};
