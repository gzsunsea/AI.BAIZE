const assert = require("node:assert/strict");
const test = require("node:test");

const { scrapeSource } = require("./scrapers");

function rss(title, link = "https://x.com/second/status/1") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel><item>
  <title>${title}</title>
  <link>${link}</link>
  <description>OpenAI agent model update with benchmark details</description>
  <pubDate>Tue, 16 Jun 2026 10:00:00 GMT</pubDate>
</item></channel></rss>`;
}

test("x profile scraping continues to later handles after one handle exhausts mirrors", async (t) => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/first/")) {
      return { ok: false, status: 502, statusText: "Bad Gateway", text: async () => "" };
    }
    return { ok: true, text: async () => rss("OpenAI ships an AI agent model update") };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const items = await scrapeSource({
    id: "x-ai-leaders",
    name: "X AI Leaders",
    kind: "x_profiles",
    enabled: true,
    handles: ["first", "second"],
    mirrors: ["https://mirror-a.test/{handle}/rss", "https://mirror-b.test/{handle}/rss"],
    priorityTier: "preferred_x",
    tier: "social",
    preferred: true,
    maxAttempts: 2,
    limit: 10,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].sourceName, "X · @second");
  assert.equal(items[0].sourceKind, "x");
  assert.equal(requested.some((url) => url.includes("/second/")), true);
});

test("aihot reference cards resolve relative item pages to original X links", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <article class="timeline-card">
            <a class="timeline-title" href="/items/x-signal">OpenAI agent model launch</a>
            <p class="timeline-summary">OpenAI launches an AI agent model with benchmark details.</p>
            <span class="timeline-source">OpenAI</span>
            <span class="timeline-score">88</span>
          </article>
        `,
      };
    }
    if (String(url) === "https://aihot.example/items/x-signal") {
      return {
        ok: true,
        text: async () => `<a href="https://x.com/OpenAI/status/123">Original X post</a>`,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const items = await scrapeSource({
    id: "aihot-public",
    name: "AIHOT 公开页",
    kind: "aihot",
    enabled: true,
    url: "https://aihot.example/",
    priorityTier: "reference",
    tier: "reference",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.com/OpenAI/status/123");
});

test("aihot detail resolution ignores generic X profile links", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <article class="timeline-card">
            <a class="timeline-title" href="/items/article-signal">AI model article</a>
            <p class="timeline-summary">OpenAI launches an AI model update.</p>
            <span class="timeline-source">AIHOT</span>
          </article>
        `,
      };
    }
    if (String(url) === "https://aihot.example/items/article-signal") {
      return {
        ok: true,
        text: async () => `
          <a href="https://x.com/Khazix0918">Founder profile</a>
          <a href="https://example.com/original-ai-model-article">Original article</a>
        `,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const items = await scrapeSource({
    id: "aihot-public",
    name: "AIHOT 公开页",
    kind: "aihot",
    enabled: true,
    url: "https://aihot.example/",
    priorityTier: "reference",
    tier: "reference",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://example.com/original-ai-model-article");
});

test("x reference bridge resolves AIHOT cards into preferred X items", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <article class="timeline-card">
            <a class="timeline-title" href="/items/x-bridge">Ethan Mollick AI agent signal</a>
            <p class="timeline-summary">A high-signal AI agent observation from X.</p>
            <span class="timeline-source">Ethan Mollick</span>
          </article>
        `,
      };
    }
    if (String(url) === "https://aihot.example/items/x-bridge") {
      return {
        ok: true,
        text: async () => `<a href="https://x.com/emollick/status/456">Original X post</a>`,
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const items = await scrapeSource({
    id: "x-aihot-bridge",
    name: "X 高价值聚合线索",
    kind: "x_reference",
    enabled: true,
    url: "https://aihot.example/",
    priorityTier: "preferred_x",
    tier: "social",
    preferred: true,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.com/emollick/status/456");
  assert.equal(items[0].sourceKind, "x");
  assert.equal(items[0].priorityTier, "preferred_x");
});
