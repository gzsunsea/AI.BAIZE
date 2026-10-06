const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "using",
  "about",
  "this",
  "that",
  "your",
  "their",
  "发布",
  "推出",
  "更新",
  "正式",
  "宣布",
  "支持",
  "通过",
  "实现",
]);

function canonicalUrl(url = "") {
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

function titleFingerprint(title = "") {
  const normalized = String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .slice(0, 14)
    .join(" ");
  return normalized || String(title).slice(0, 40).toLowerCase();
}

module.exports = { canonicalUrl, titleFingerprint };
