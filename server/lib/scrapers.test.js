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

test("aihot detail resolution ignores beian footer links and keeps the original article", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <div class="m-row-wrap" data-item-id="cmsx-article">
            <a class="m-row m-row-all" href="/items/article-with-beian">
              <span class="m-row-body">
                <span class="m-row-meta"><span class="m-row-src">OpenAI Newsroom</span></span>
                <span class="m-row-title">OpenAI launches a new model</span>
                <span class="m-row-summary">Official launch summary.</span>
              </span>
            </a>
          </div>
        `,
      };
    }
    if (String(url) === "https://aihot.example/items/article-with-beian") {
      return {
        ok: true,
        text: async () => `
          <script type="application/ld+json">
            {"@context":"https://schema.org","url":"https://aihot.example/items/article-with-beian"}
          </script>
          <a href="https://aihot.example/about">关于</a>
          <a href="https://beian.miit.gov.cn/">备案号</a>
          <article><a href="https://openai.com/index/new-model">原始文章</a></article>
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
  assert.equal(items[0].url, "https://openai.com/index/new-model");
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

test("x reference bridge parses AIHOT mobile row cards after the public page redesign", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <div class="m-row-wrap" data-item-id="cmsx-mobile-x">
            <a class="m-row m-row-all" href="/items/mobile-x-bridge">
              <span class="m-row-time">07:22</span>
              <span class="m-row-body">
                <span class="m-row-meta">
                  <span class="m-row-src">Ethan Mollick</span>
                  <span class="m-score m-score-mid">82</span>
                </span>
                <span class="m-row-title">Agent workflow signal from X</span>
                <span class="m-row-summary">A high-signal X post about agent evals and production workflows.</span>
                <span class="m-row-reason-block">
                  <span class="m-row-reason-clamp">
                    <span class="m-row-reason-label">推荐理由：</span>
                    这条线索直接点出 agent 评测与部署约束。
                  </span>
                </span>
              </span>
            </a>
          </div>
        `,
      };
    }
    if (String(url) === "https://aihot.example/items/mobile-x-bridge") {
      return {
        ok: true,
        text: async () => `<a href="https://x.com/emollick/status/789">Original X post</a>`,
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
  assert.equal(items[0].url, "https://x.com/emollick/status/789");
  assert.equal(items[0].sourceKind, "x");
  assert.equal(items[0].priorityTier, "preferred_x");
});

test("x reference bridge parses embedded initialItems from Next flight data", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === "https://aihot.example/") {
      return {
        ok: true,
        text: async () => `
          <script>
            self.__next_f.push([1,"31:[\\"$\\",\\"$L33\\",\\"mobile-selected-all----latest-1\\",{\\"returnStateKey\\":\\"mobile-selected-all----latest-1\\",\\"variant\\":\\"selected\\",\\"initialItems\\":[{\\"id\\":\\"cmsx-embedded\\",\\"url\\":\\"https://x.com/emollick/status/999\\",\\"title\\":\\"https://x.com/emollick/status/999\\",\\"titleZh\\":\\"嵌入脚本里的 X 高价值线索\\",\\"summaryZh\\":\\"这是一条来自 Next flight 数据的 X 线索。\\",\\"publishedAt\\":\\"2026-08-18T00:00:00.000Z\\",\\"aiSelected\\":true,\\"publicSelectedVisible\\":true,\\"aiSelectedReason\\":\\"脚本内已经直接提供原始 X 链接与中文摘要。\\",\\"finalScore\\":82,\\"aiTags\\":[{\\"tag\\":\\"Agent\\"}],\\"source\\":{\\"name\\":\\"Ethan Mollick\\",\\"kind\\":\\"x\\"}}],\\"initialHasNext\\":false}]\n"]);
          </script>
        `,
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
  assert.equal(items[0].url, "https://x.com/emollick/status/999");
  assert.equal(items[0].title, "嵌入脚本里的 X 高价值线索");
  assert.equal(items[0].sourceKind, "x");
});
