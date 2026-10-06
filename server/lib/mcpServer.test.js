const assert = require("node:assert/strict");
const test = require("node:test");

async function connectMcpClient(t, providers) {
  const { createReadOnlyMcpHandler } = await import("./mcpServer.mjs");
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const handler = createReadOnlyMcpHandler({
    createProviders: () => providers,
    allowedHosts: ["test.local"],
    allowedOrigins: ["test.local"],
  });
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: "aibaize-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  t.after(async () => {
    await client.close();
    await transport.close();
    await handler.close();
  });
  await client.connect(transport);
  return client;
}

test("MCP server module loads through dynamic import from CommonJS", async () => {
  const module = await import("./mcpServer.mjs");
  assert.equal(typeof module.createReadOnlyMcpHandler, "function");
});

test("MCP client discovers only the five read-only AI.BAIZE tools", async (t) => {
  const client = await connectMcpClient(t, {
    getSelectedFeed: async () => ({ items: [] }),
    searchItems: async () => ({ items: [] }),
    getHotTopics: async () => ({ items: [] }),
    getEventTimeline: async () => null,
    getDigest: async () => ({ period: "daily" }),
  });

  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["get_digest", "get_event_timeline", "get_hot_topics", "get_selected_feed", "search_items"]);
});

test("MCP tools validate bounded inputs and apply their documented defaults", async (t) => {
  const calls = [];
  const client = await connectMcpClient(t, Object.fromEntries([
    ["getSelectedFeed", async (input) => { calls.push(["getSelectedFeed", input]); return { items: [{ id: "selected" }] }; }],
    ["searchItems", async (input) => { calls.push(["searchItems", input]); return { items: [{ id: "search" }] }; }],
    ["getHotTopics", async (input) => { calls.push(["getHotTopics", input]); return { items: [{ id: "hot" }] }; }],
    ["getEventTimeline", async (input) => { calls.push(["getEventTimeline", input]); return { event: { id: input.eventId } }; }],
    ["getDigest", async (input) => { calls.push(["getDigest", input]); return { period: input.period }; }],
  ]));

  const feed = await client.callTool({ name: "get_selected_feed", arguments: {} });
  const search = await client.callTool({ name: "search_items", arguments: { query: "Claude" } });
  const hot = await client.callTool({ name: "get_hot_topics", arguments: {} });
  const story = await client.callTool({ name: "get_event_timeline", arguments: { eventId: "event-1" } });
  const digest = await client.callTool({ name: "get_digest", arguments: {} });

  assert.deepEqual(feed.structuredContent, { items: [{ id: "selected" }] });
  assert.deepEqual(search.structuredContent, { items: [{ id: "search" }] });
  assert.deepEqual(hot.structuredContent, { items: [{ id: "hot" }] });
  assert.deepEqual(story.structuredContent, { event: { id: "event-1" } });
  assert.deepEqual(digest.structuredContent, { period: "daily" });
  assert.deepEqual(calls.map(([name]) => name), ["getSelectedFeed", "searchItems", "getHotTopics", "getEventTimeline", "getDigest"]);
  assert.deepEqual(calls[0][1], { take: 20 });
  assert.deepEqual(calls[1][1], { query: "Claude", mode: "selected", days: 7, take: 20 });
  assert.deepEqual(calls[2][1], { take: 10 });
  assert.deepEqual(calls[3][1], { eventId: "event-1" });
  assert.deepEqual(calls[4][1], { period: "daily" });

  const invalid = await client.callTool({ name: "search_items", arguments: { query: "   " } });
  assert.equal(invalid.isError, true);
  const invalidTake = await client.callTool({ name: "get_selected_feed", arguments: { take: 31 } });
  const invalidDays = await client.callTool({ name: "search_items", arguments: { query: "Claude", days: 31 } });
  const invalidEventId = await client.callTool({ name: "get_event_timeline", arguments: { eventId: "x".repeat(161) } });
  const invalidDate = await client.callTool({ name: "get_digest", arguments: { date: "2026/09/28" } });
  assert.equal(invalidTake.isError, true);
  assert.equal(invalidDays.isError, true);
  assert.equal(invalidEventId.isError, true);
  assert.equal(invalidDate.isError, true);
  assert.equal(calls.length, 5, "invalid input must not reach a provider");
});

test("MCP tool failures are stable and never expose internal error messages", async (t) => {
  const client = await connectMcpClient(t, {
    getSelectedFeed: async () => { throw new Error("database password sentinel"); },
    searchItems: async () => ({ items: [] }),
    getHotTopics: async () => ({ items: [] }),
    getEventTimeline: async () => null,
    getDigest: async () => ({ period: "daily" }),
  });

  const missing = await client.callTool({ name: "get_event_timeline", arguments: { eventId: "absent" } });
  const failed = await client.callTool({ name: "get_selected_feed", arguments: {} });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not found/);
  assert.equal(failed.isError, true);
  assert.equal(failed.content[0].text.includes("database password sentinel"), false);
});

test("MCP results larger than 64 KiB fail without returning partial structured content", async (t) => {
  const client = await connectMcpClient(t, {
    getSelectedFeed: async () => ({ text: "x".repeat(65_537) }),
    searchItems: async () => ({ items: [] }),
    getHotTopics: async () => ({ items: [] }),
    getEventTimeline: async () => null,
    getDigest: async () => ({ period: "daily" }),
  });

  const result = await client.callTool({ name: "get_selected_feed", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /response limit/);
  assert.equal(result.structuredContent, undefined);
});
