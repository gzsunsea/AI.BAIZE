const assert = require("node:assert/strict");
const test = require("node:test");

const { DEFAULT_SOURCES } = require("./sources");

function source(id) {
  return DEFAULT_SOURCES.find((item) => item.id === id);
}

test("source registry uses live DeepMind RSS and OpenRouter article list", () => {
  assert.equal(source("deepmind-blog").url, "https://deepmind.google/blog/rss.xml");
  assert.equal(source("openrouter-announcements").kind, "web_list");
  assert.equal(source("openrouter-announcements").url, "https://openrouter.ai/announcements");
});

test("source registry disables feeds with no reachable production endpoint", () => {
  for (const id of ["huggingface-blog", "xai-news", "x-ai-leaders", "dwarkesh-podcast", "gary-marcus"]) {
    const item = source(id);
    assert.equal(item.enabled, false, id);
    assert.equal(item.deprecated, true, id);
  }
});
