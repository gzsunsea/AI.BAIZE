const cheerio = require("cheerio");
const { XMLParser } = require("fast-xml-parser");
const { isOriginalHttpUrl, normalizeItem, stripHtml } = require("./scoring");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
let arxivNextRequestAt = 0;

async function waitForArxivSlot(delayMs = 1500) {
  const now = Date.now();
  const waitMs = Math.max(0, arxivNextRequestAt - now);
  arxivNextRequestAt = Math.max(now, arxivNextRequestAt) + delayMs;
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

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

function isGenericMediaUrl(url = "") {
  return /^https?:\/\/avatars\.githubusercontent\.com\//i.test(String(url));
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
    .filter((asset) => !isGenericMediaUrl(asset.url))
    .filter((asset) => {
      if (seen.has(asset.url)) return false;
      seen.add(asset.url);
      return true;
    })
    .slice(0, 3);
}

function externalUrlsFromHtml(html = "", base = "") {
  const baseHost = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "";
    }
  })();
  const normalized = String(html).replaceAll("\\/", "/").replaceAll("\\u002F", "/");
  return [...normalized.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)]
    .map((match) => match[0].replace(/&amp;/g, "&"))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        if (baseHost && parsed.host === baseHost) return false;
        if (/schema\.org|w3\.org|tailwindcss|cdn\./i.test(parsed.host)) return false;
        return true;
      } catch {
        return false;
      }
    });
}

function preferredOriginalUrl(html = "", base = "") {
  const urls = externalUrlsFromHtml(html, base).filter((url) => !/https?:\/\/beian\.miit\.gov\.cn\/?/i.test(url));
  const statusUrl = urls.find((url) => /https?:\/\/(x|twitter)\.com\/[^"'\s<>\\]+\/status\//i.test(url));
  if (statusUrl) return statusUrl;
  return urls.find((url) => !/https?:\/\/(x|twitter)\.com\//i.test(url)) || "";
}

async function resolveAihotItemUrls(items = [], source = {}) {
  const limit = Number(source.detailResolveLimit || 16);
  let resolved = 0;
  const base = source.url || "";
  const timeoutMs = Number(source.detailTimeoutMs || 3500);
  const output = [];
  for (const item of items) {
    let next = item;
    const url = String(item.url || "");
    if (!isOriginalHttpUrl(url) && resolved < limit && /^\/items\//.test(url)) {
      resolved += 1;
      try {
        const detailUrl = absolutizeUrl(url, base);
        const html = await fetchText(detailUrl, {}, timeoutMs);
        const originalUrl = preferredOriginalUrl(html, base);
        if (originalUrl) next = { ...item, url: originalUrl };
      } catch {
        next = item;
      }
    }
    output.push(next);
  }
  return output;
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

function findJsonArrayAfterMarker(text = "", marker = '"initialItems":') {
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const arrStart = text.indexOf("[", start + marker.length);
  if (arrStart < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrStart; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(arrStart, index + 1);
    }
  }
  return "";
}

function parseAihotJson(html) {
  const candidates = [
    String(html || ""),
    String(html || "")
      .replace(/\\"/g, '"')
      .replace(/\\u002F/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\n/g, " "),
  ];
  for (const candidate of candidates) {
    const raw = findJsonArrayAfterMarker(candidate);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return [];
}

function normalizeAihotCard($, node, source) {
  const card = $(node);
  const isMobileRow = card.is(".m-row-wrap");
  const link = isMobileRow
    ? card.find(".m-row[href], a[href]").first()
    : card.find(".timeline-title[href], .timeline-title a[href], a[href]").first();
  const bodyText = isMobileRow
    ? card.find(".m-row-title").first().text() || card.find(".m-row-summary").first().text()
    : card.find(".timeline-title").text() || card.find(".uc-body, .uc-body-p").text() || card.find(".timeline-summary").text();
  const title = bodyText.replace(/\s+/g, " ").trim();
  const summary = (isMobileRow
    ? card.find(".m-row-summary").first().text() || card.find(".m-row-reason-clamp").first().text()
    : card.find(".timeline-summary").text() || card.find(".uc-quoted").text() || title)
    .replace(/\s+/g, " ")
    .trim();
  const reason = (isMobileRow ? card.find(".m-row-reason-clamp").first().text() : card.find(".timeline-reason").text())
    .replace("推荐理由：", "")
    .replace(/\s+/g, " ")
    .trim();
  const scoreText = isMobileRow ? card.find(".m-score").first().text() : card.find(".timeline-score").text();
  const tagNodes = isMobileRow ? card.find(".m-row-tags .tag, .m-tag, .m-chip") : card.find(".timeline-tags .tag");
  return normalizeItem({
    url: link.attr("href"),
    title: title.length > 96 ? `${title.slice(0, 96)}...` : title,
    summary: summary || title,
    sourceName: (isMobileRow ? card.find(".m-row-src").first().text() : card.find(".timeline-source").text()) || source.name,
    sourceKind: "aihot",
    ...sourceMeta(source),
    publishedAt: new Date().toISOString(),
    finalScore: Number(scoreText) || undefined,
    tags: tagNodes
      .toArray()
      .map((tag) => $(tag).text().trim())
      .filter(Boolean),
    reason,
    media: compactMedia([
      ...card.find("img").toArray().map((img) => ({ url: $(img).attr("src") || $(img).attr("data-src"), type: "image", alt: $(img).attr("alt") || "" })),
      ...card.find("video, video source").toArray().map((video) => ({ url: $(video).attr("src") || $(video).attr("poster"), thumbnail: $(video).attr("poster"), type: "video" })),
    ]),
  });
}

async function scrapeAihot(source) {
  const html = await fetchText(source.url, {}, fetchTimeout(source, 9000));
  const embedded = parseAihotJson(html);
  if (embedded.length) {
    const items = embedded
      .map((item) =>
        normalizeItem({
          ...item,
          sourceKind: "aihot",
          sourceName: item.source?.name || "AIHOT 公开页",
          ...sourceMeta(source),
        }),
      );
    return (await resolveAihotItemUrls(items, source)).filter((item) => isOriginalHttpUrl(item.url));
  }

  const $ = cheerio.load(html);
  const items = $(".timeline-card, .m-row-wrap")
    .toArray()
    .map((node) => normalizeAihotCard($, node, source))
    .filter((item) => item.title && item.url);
  return (await resolveAihotItemUrls(items, source)).filter((item) => isOriginalHttpUrl(item.url));
}

async function scrapeXReference(source) {
  const items = await scrapeAihot(source);
  return items
    .filter((item) => /https?:\/\/(x|twitter)\.com\/[^"'\s<>\\]+\/status\//i.test(item.url || ""))
    .map((item) => ({
      ...item,
      sourceKind: "x",
      priorityTier: "preferred_x",
      preferred: true,
      tags: [...new Set([...(item.tags || []), "X 高价值", "社交信号"])].slice(0, 8),
    }))
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
  await waitForArxivSlot(Number(source.requestDelayMs || 1500));
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
  const items = rssEntriesToItems(xml, source);
  if (!source.hydrateMedia || !Number(source.mediaHydrationLimit || 0)) return items;
  const candidates = items
    .filter((item) => !item.media?.length && isOriginalHttpUrl(item.url))
    .slice(0, Math.max(0, Number(source.mediaHydrationLimit || 0)));
  const concurrency = Math.max(1, Math.min(3, Number(source.mediaHydrationConcurrency || 2)));
  const queue = [...candidates];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const html = await fetchText(item.url, {}, Number(source.articleTimeoutMs || 4500));
        const media = articleMediaFromHtml(html, item.url);
        if (media.length) item.media = media;
      } catch {
        // RSS remains usable when an article page blocks or times out.
      }
    }
  });
  await Promise.all(workers);
  return items;
}

function feedEntriesFromXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const channel = data.rss?.channel || data.feed;
  const entries = channel?.item || channel?.entry || [];
  return (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
}

function entryText(value = "") {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(entryText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return entryText(value["#text"] || value.__cdata || value._ || value.text || value.title || value.name || "");
  }
  return "";
}

function entryLink(entry = {}, sourceUrl = "") {
  const raw = Array.isArray(entry.link) ? entry.link.find((item) => item?.["@_href"] || item?.href) : entry.link;
  return raw?.["@_href"] || raw?.href || raw || entry.guid?.["#text"] || entry.guid || sourceUrl;
}

function releaseTitleFromSummary(title = "", summary = "", sourceName = "") {
  const cleanTitle = stripHtml(entryText(title)).trim();
  const cleanSummary = stripHtml(entryText(summary)).trim();
  const versionOnly = /^v?\d+(?:\.\d+){1,4}(?:[-+][\w.-]+)?$/i.test(cleanTitle);
  if (!versionOnly) return cleanTitle;
  const bullets = cleanSummary
    .replace(/^what'?s changed[:：]?\s*/i, "")
    .split(/(?:\n|•|。|；|;|\s-\s)+/)
    .map((item) => stripHtml(item).replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 18 && !/^what'?s changed$/i.test(item));
  const lead = bullets[0] || cleanSummary;
  if (!lead) return cleanTitle;
  const compact = lead.length > 58 ? `${lead.slice(0, 58)}...` : lead;
  return `${sourceName || "Release"} ${cleanTitle}：${compact}`;
}

function rssEntriesToItems(xml, source, extra = {}) {
  return feedEntriesFromXml(xml).slice(0, source.limit || 40).map((entry) => {
    const url = entryLink(entry, source.url);
    const summary = stripHtml(entryText(entry.description || entry.summary || entry.content || ""));
    const title = releaseTitleFromSummary(entry.title, summary, extra.sourceName || source.name);
    return normalizeItem({
      url,
      title,
      summary,
      sourceName: extra.sourceName || source.name,
      sourceKind: extra.sourceKind || "rss",
      ...sourceMeta(source),
      publishedAt: entry.pubDate || entry.published || entry.updated || new Date().toISOString(),
      author: entryText(entry.creator || entry.author?.name || entry.author),
      tags: extra.tags,
      media: compactMedia([
        ...mediaFromHtmlFragment(`${entryText(entry["content:encoded"])} ${entryText(entry.content)} ${entryText(entry.summary)} ${entryText(entry.description)}`, url),
        ...(Array.isArray(entry.enclosure) ? entry.enclosure : entry.enclosure ? [entry.enclosure] : []).map((item) => ({ url: item["@_url"] || item.url, type: item["@_type"] || item.type || "image" })),
        ...(Array.isArray(entry["media:content"]) ? entry["media:content"] : entry["media:content"] ? [entry["media:content"]] : []).map((item) => ({ url: item["@_url"] || item.url, type: item["@_medium"] || item["@_type"] || "image" })),
        ...(Array.isArray(entry["media:thumbnail"]) ? entry["media:thumbnail"] : entry["media:thumbnail"] ? [entry["media:thumbnail"]] : []).map((item) => ({ url: item["@_url"] || item.url, type: "image" })),
        { url: entry.image?.url || entry.image, type: "image" },
      ]),
    });
  });
}

function isHighValueXText(text = "") {
  return /AI|agent|LLM|model|OpenAI|Claude|Anthropic|DeepMind|Gemini|Hugging Face|benchmark|eval|research|paper|robot|education|edtech|culture|creative|copyright|模型|智能体|多模态|推理|教育|文化|艺术|版权|开源/i.test(text);
}

async function fetchFirstMirror(handle, mirrors = [], budget = { attempts: 0, maxAttempts: 8 }, timeoutMs = 2500) {
  const errors = [];
  for (const template of mirrors) {
    if (budget.attempts >= budget.maxAttempts) break;
    budget.attempts += 1;
    const url = template.replaceAll("{handle}", handle);
    try {
      return { url, xml: await fetchText(url, { accept: "application/rss+xml,application/xml,text/xml,*/*" }, timeoutMs) };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.slice(0, 3).join(" | "));
}

async function scrapeXProfiles(source) {
  const handles = (source.handles || []).slice(0, Number(source.maxHandles || 28));
  const mirrors = source.mirrors?.length ? source.mirrors : [source.url || "https://twiiit.com/{handle}/rss"];
  const items = [];
  const errors = [];
  const perHandleAttempts = Math.max(1, Number(source.perHandleMaxAttempts || source.maxAttempts || Math.min(3, mirrors.length || 1)));
  const mirrorTimeoutMs = Number(source.mirrorTimeoutMs || 2500);
  for (const handle of handles) {
    try {
      const { xml } = await fetchFirstMirror(handle, mirrors, { attempts: 0, maxAttempts: perHandleAttempts }, mirrorTimeoutMs);
      const nextItems = rssEntriesToItems(xml, { ...source, limit: 8 }, {
        sourceName: `X · @${handle}`,
        sourceKind: "x",
        tags: ["X 高价值", "社交信号"],
      }).filter((item) => isHighValueXText(`${item.title} ${item.summary}`));
      items.push(...nextItems);
    } catch (error) {
      errors.push(`@${handle}: ${error.message}`);
    }
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
