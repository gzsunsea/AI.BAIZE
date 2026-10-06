# AI.BAIZE Read-only MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off, stateless, read-only MCP endpoint that exposes AI.BAIZE's existing public feed, search, hot topics, event timeline, and reports to MCP clients.

**Architecture:** Keep the application entry point in CommonJS and isolate MCP SDK integration in `server/lib/mcpServer.mjs`. The existing Express app will lazy-load an official SDK `createMcpHandler` wrapped with the official Node adapter; its per-request factory receives data-provider callbacks from `server/index.js`. Reuse existing public query/build/serialization functions, extracting shared public story/report projections only where needed; apply dedicated host/origin checks, request and response bounds, and an independent IP rate limiter.

**Tech Stack:** Node.js 22; Express 5; MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`); Zod v4; MCP TypeScript client v2 for protocol integration tests; Node built-in test runner.

## Global Constraints

- `MCP_ENABLED=false` by default; production activation and deployment are outside this plan.
- Only anonymous read-only tools may be exposed; no ask, admin, feedback, settings, source-health, or write operations.
- Public data must pass existing visibility checks and explicit public-field projections; runtime snapshots must never be spread directly into MCP output.
- Use the official MCP SDK and adapter; do not implement JSON-RPC or Streamable HTTP by hand.
- Do not introduce paid APIs or services.
- All tools must bound input ranges, item counts, request bodies, and serialized result sizes.
- MCP must have its own rate limiter based on Express `req.ip`; do not trust user-supplied forwarded-address prefixes.
- Do not modify production Nginx, environment variables, runtime data, or service state.
- Preserve all pre-existing dirty worktree changes; only edit the files listed by the task being executed.

---

## File and responsibility map

- Modify `package.json` and `package-lock.json`: add the official server/Node SDK packages and Zod v4; add the official MCP client package only as a development dependency for protocol tests.
- Create `server/lib/mcpServer.mjs`: MCP server factory, five tool schemas/handlers, result-size bound, official Node adapter, and SDK Host/Origin guards.
- Create `server/lib/mcpServer.test.js`: protocol-level tests against the official SDK client and the actual `createMcpHandler` instance.
- Modify `server/index.js`: public data-provider callbacks, narrow shared public story/report projections if required, MCP config/limiter/route, and module exports only where tests need them.
- Modify `server/index.test.js`: route behavior, endpoint parity, and disabled-by-default integration tests using the existing injectable `app.locals.readState` pattern.
- Modify `server/security.test.js`: request-size, Host/Origin, spoofed forwarded-header, and MCP rate-limit tests.
- Modify `.env.example`: document default-off flag, allowed hosts/origins, and limiter settings without enabling MCP.
- Modify `src/app/App.tsx`: add the MCP URL and setup guidance to the Agent 接入 page, clearly distinguishing the default-off local endpoint from an enabled deployment.
- Modify `README.md`: document tools, limits, configuration, local verification, and the fact that deployment is not performed by this plan.

The current worktree already has unrelated edits in several listed files (`server/index.js`, its tests, `.env.example`, `README.md`, and `src/app/App.tsx`). Before each implementation task, inspect that file's diff and preserve its current behavior and edits; do not reset, checkout, or broadly stage files.

## Task 1: Add SDK dependencies and prove the supported adapter boundary

**Files:** `package.json`, `package-lock.json`, `server/lib/mcpServer.test.js`

- [x] Install only the official v2 server and Node packages plus Zod v4:

```bash
npm install @modelcontextprotocol/server@^2 @modelcontextprotocol/node@^2 zod@^4
```

- [x] Install the official client only for tests:

```bash
npm install --save-dev @modelcontextprotocol/client@^2
```

- [x] Add an initial module-loading test using Node's built-in runner. It must import the `.mjs` boundary from this CommonJS project and fail until the exported factory exists:

```js
const assert = require("node:assert/strict");
const test = require("node:test");

test("MCP server module loads through dynamic import from CommonJS", async () => {
  const module = await import("./mcpServer.mjs");
  assert.equal(typeof module.createReadOnlyMcpHandler, "function");
});
```

- [x] Run `node --test server/lib/mcpServer.test.js`; expected initial failure is `ERR_MODULE_NOT_FOUND` for `./mcpServer.mjs`, not an SDK import or module-format error.
- [x] Record the resolved SDK versions in the lockfile and verify each is v2: `npm ls @modelcontextprotocol/server @modelcontextprotocol/node @modelcontextprotocol/client zod`.

**Review gate:** If the documented SDK packages do not import under Node 22 or cannot be adapted to this existing Express 5 app with `toNodeHandler`, stop here and revise the design. Do not replace the SDK transport with custom protocol code.

## Task 2: Define tool schemas and verify MCP protocol behavior in-process

**Files:** Create `server/lib/mcpServer.mjs`; modify `server/lib/mcpServer.test.js`.

**Interface produced:**

```js
export function createReadOnlyMcpHandler({ createProviders, allowedHosts, allowedOrigins })
// returns { handle(req, res, parsedBody), fetch(request, options), close(), validateRequest(req, res) }
```

`createProviders()` returns these five async-or-sync methods: `getSelectedFeed({ take, since })`, `searchItems({ query, mode, days, take })`, `getHotTopics({ take })`, `getEventTimeline({ eventId })`, and `getDigest({ period, date })`. The factory is called once per MCP request so each request gets a fresh `McpServer` and a current provider snapshot.

- [x] Extend the test to instantiate the official handler and official SDK client in-process. The SDK's documented `handler.fetch` transport must be used; assert `tools/list` returns exactly the five names in the design.
- [x] Register input schemas using Zod v4 with these hard bounds: `take` 1–30; `query` 1–120 characters; `mode` in `selected|all`; `days` 1–30; date in `YYYY-MM-DD`; `eventId` 1–160 characters. Omitted values resolve to selected mode, 20 feed items, 10 hot topics, and a 7-day search.
- [x] In `server/lib/mcpServer.mjs`, import the official modules through the Node ESM boundary:

```js
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
```

- [x] Implement the five tools through one error-safe dispatcher; never include raw exception messages in client-visible output:

```js
const TOOL_RESULT_LIMIT = 65_536;

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toToolResult(value) {
  const structuredContent = value && typeof value === "object" && !Array.isArray(value) ? value : { items: value };
  const text = JSON.stringify(structuredContent);
  if (Buffer.byteLength(text, "utf8") > TOOL_RESULT_LIMIT) return toolError("result exceeds MCP response limit");
  return { content: [{ type: "text", text }], structuredContent };
}

async function invokeProvider(provider, input) {
  try {
    const value = await provider(input);
    return value == null ? toolError("not found") : toToolResult(value);
  } catch (error) {
    return toolError(error?.statusCode === 400 ? "invalid input" : "temporarily unavailable");
  }
}

function registerReadOnlyTools(server, providers) {
  server.registerTool("get_selected_feed", {
    description: "Read recent publicly selected AI.BAIZE items.",
    inputSchema: z.object({ take: z.number().int().min(1).max(30).default(20), since: z.string().max(40).optional() }),
  }, (input) => invokeProvider(providers.getSelectedFeed, input));
  server.registerTool("search_items", {
    description: "Search public AI.BAIZE items from the last 1 to 30 days.",
    inputSchema: z.object({ query: z.string().trim().min(1).max(120), mode: z.enum(["selected", "all"]).default("selected"), days: z.number().int().min(1).max(30).default(7), take: z.number().int().min(1).max(30).default(20) }),
  }, (input) => invokeProvider(providers.searchItems, input));
  server.registerTool("get_hot_topics", {
    description: "Read ranked, publicly confirmed AI.BAIZE hot topics.",
    inputSchema: z.object({ take: z.number().int().min(1).max(10).default(10) }),
  }, (input) => invokeProvider(providers.getHotTopics, input));
  server.registerTool("get_event_timeline", {
    description: "Read a public event summary and its source timeline.",
    inputSchema: z.object({ eventId: z.string().trim().min(1).max(160) }),
  }, (input) => invokeProvider(providers.getEventTimeline, input));
  server.registerTool("get_digest", {
    description: "Read a public daily, weekly, or monthly AI.BAIZE report.",
    inputSchema: z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily"), date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional() }),
  }, (input) => invokeProvider(providers.getDigest, input));
}
```

- [x] Implement the public handler factory with fresh server/provider instances per request and the official Node adapter/guards:

```js
export function createReadOnlyMcpHandler({ createProviders, allowedHosts, allowedOrigins }) {
  const hostAllowed = hostHeaderValidation(allowedHosts);
  const originAllowed = originValidation(allowedOrigins);
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "AI.BAIZE", version: "1.0.0" });
    registerReadOnlyTools(server, createProviders());
    return server;
  });
  return {
    handle: toNodeHandler(handler),
    fetch: handler.fetch,
    close: handler.close,
    validateRequest(req, res) {
      return hostAllowed(req, res) && originAllowed(req, res);
    },
  };
}
```

- [x] Use this result envelope for object results so clients receive both readable text and structured data:

```js
function toToolResult(value) {
  const structuredContent = value && !Array.isArray(value) ? value : { items: value };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}
```

- [x] Enforce the response cap using byte count, not JavaScript string length:

```js
const text = JSON.stringify(structuredContent);
if (Buffer.byteLength(text, "utf8") > 65_536) {
  return { content: [{ type: "text", text: "result exceeds MCP response limit" }], isError: true };
}
return { content: [{ type: "text", text }], structuredContent };
```

On overflow, return the MCP tool error shown above; do not return a partial or internally truncated object.
- [x] In the tests, call every tool through `client.callTool`; assert the exact provider arguments, default values, invalid-schema rejection, and stable not-found behavior for an absent event.
- [x] Use the official in-process client setup below in the test; close both client and transport in `t.after`:

```js
const { createReadOnlyMcpHandler } = await import("./mcpServer.mjs");
const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
const handler = createReadOnlyMcpHandler({
  createProviders: () => ({
    getSelectedFeed: async () => ({ items: [{ id: "public-1" }] }),
    searchItems: async () => ({ items: [] }),
    getHotTopics: async () => ({ items: [] }),
    getEventTimeline: async () => null,
    getDigest: async () => ({ period: "daily" }),
  }),
  allowedHosts: ["test.local"],
  allowedOrigins: ["test.local"],
});
const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
  fetch: (url, init) => handler.fetch(new Request(url, init)),
});
const client = new Client({ name: "aibaize-test", version: "1.0.0" });
t.after(async () => { await client.close(); await handler.close(); });
await client.connect(transport);
assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
  "get_digest", "get_event_timeline", "get_hot_topics", "get_selected_feed", "search_items",
]);
const result = await client.callTool({ name: "get_selected_feed", arguments: { take: 1 } });
assert.equal(result.structuredContent.items.length, 1);
```

- [x] Run `node --test server/lib/mcpServer.test.js`; expected result is all MCP module/protocol tests passing.

## Task 3: Build public-data providers from existing BAIZE logic

**Files:** Modify `server/index.js` and `server/index.test.js`.

**Interface produced:** `createMcpProviders()` closes over `readAppState()` and returns the five provider methods consumed by `createReadOnlyMcpHandler`. Every result is a JSON-safe public projection.

- [x] Add failing provider-level assertions to the existing test file using a state fixture that includes one public item, one hidden item, one grouped event, and a digest with an internal-only sentinel field. Assert hidden and sentinel fields are absent before wiring MCP.
- [x] Change `publicItems` to accept `state = readAppState()` while preserving the current callers. Feed retrieval calls it with `mode: "selected"`, an optional `since`, and slices to `take`; reject a `since` earlier than 30 days before the current time. Search derives an ISO `since` from `days`, calls `publicItems({ mode, q: query, since }, state)`, and slices to `take`.
- [x] Add `publicStoryDetail(state, id)` by extracting the response projection already used in `/api/public/stories/:id`; preserve the route's current response shape and 404 behavior. It must serialize the representative, latest updates, timeline, and related candidate items through `serializePublicItem`.
- [x] Add `publicReport(query, state = readAppState())` by extracting the `buildReport` + `serializePublicReport` behavior currently used by `/api/public/reports`; keep date validation and virtual-digest behavior identical. Have the REST route call this shared helper so MCP and REST cannot drift.
- [x] Construct provider results as follows:

```js
function createMcpProviders() {
  return {
    getSelectedFeed: ({ take, since }) => ({ items: publicItems({ mode: "selected", since }, readAppState()).slice(0, take) }),
    searchItems: ({ query, mode, days, take }) => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return { items: publicItems({ mode, q: query, since }, readAppState()).slice(0, take) };
    },
    getHotTopics: ({ take }) => {
      const topics = publicHotTopics(readAppState());
      return {
        generatedAt: topics.generatedAt,
        windowHours: topics.windowHours,
        availability: topics.availability,
        items: topics.items.slice(0, take).map(({ id, rank, title, summary, heat, status, ageHours, sourceCount, sources, publishedAt, latestAt, lifecycle, representative, relatedItems }) => ({
          id, rank, title, summary, heat, status, ageHours, sourceCount, sources, publishedAt, latestAt, lifecycle, representative, relatedItems,
        })),
      };
    },
    getEventTimeline: ({ eventId }) => projectMcpStory(publicStoryDetail(readAppState(), eventId)),
    getDigest: ({ period, date }) => projectMcpReport(publicReport({ period, date }, readAppState())),
  };
}
```

- [x] Keep `getHotTopics` limited to its explicit top-level allowlist (`generatedAt`, `windowHours`, `availability`, `items`). Each topic contains only `id`, `rank`, `title`, `summary`, `heat`, `status`, `ageHours`, `sourceCount`, `sources`, `publishedAt`, `latestAt`, `lifecycle`, `representative`, and `relatedItems`; both item fields are individually passed through `serializePublicItem`. Do not include `rules`, `coverage`, candidates, or arbitrary spread properties.
- [x] Define `projectMcpStory(story)` to return null for a missing story, otherwise only `summary`, `sources`, `event`, `latestUpdates`, `timeline`, and `relatedCandidates`. Project `event` to `{ id, rank, title, summary, heat, status, ageHours, sourceCount, sources, publishedAt, latestAt, lifecycle, representative }`; `buildStory` intentionally removes the event's `relatedItems`, which are already present in `timeline`. Project related candidates to `{ item, eventType, reason }` and call `serializePublicItem` on every item. Do not return event rules or arbitrary spread properties.
- [x] For `getDigest`, return only the explicit top-level fields `period`, `range`, `coverage`, `headline`, `editorialSummary`, `storyCount`, `estimatedReadingMinutes`, `themes`, `navigation`, `sections`, `trendLines`, and `watchItems`. `buildReport` does not produce `generatedAt`. Project sections to `{ key, title, items }`, themes to `{ key, label, count }`, trend lines to `{ key, label, count, eventCount, sourceCount, latestAt, evidenceLevel, sampleItems }`, and serialize every item using `serializePublicItem`. Never spread the stored daily snapshot or report sections.
- [x] Implement `projectMcpReport(report)` as a pick-only projection with that exact shape. Source `sections[].items`, `trendLines[].sampleItems`, and `watchItems` from `publicReport`, which has already passed each item through `serializePublicItem`; pick only the listed fields for every section, theme, and trend line. A missing/empty report remains a stable not-found or empty report result, not an exception dump.
- [x] Extend `module.exports` only for the testable helper(s) actually needed. Run `node --test server/index.test.js server/lib/mcpServer.test.js` and verify existing public REST assertions remain unchanged.

## Task 4: Mount MCP behind an independent fail-closed route and security checks

**Files:** Modify `server/index.js`, `server/index.test.js`, and `server/security.test.js`.

- [x] Add failing HTTP tests proving `/mcp` returns 404 when `MCP_ENABLED` is unset or any value other than the literal `"true"`; verify `GET /mcp`, REST, RSS, and the SPA fallback keep their expected behavior.
- [x] Add dedicated environment parsing: `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` are comma-separated hostnames without scheme/port; require a non-empty host list when enabled. A missing `Origin` is allowed for non-browser MCP clients; a malformed or non-allowlisted present `Origin` is rejected. Host mismatch is rejected. Use the official `hostHeaderValidation` and `originValidation` guards from `@modelcontextprotocol/node`.
- [x] Add `MCP_RATE_WINDOW_MS` default 60,000 and `MCP_RATE_MAX` default 60. Build the limiter with the existing `rateLimit()` helper and `clientKey(req)` so it keys on trusted Express `req.ip`; keep it separate from `publicWriteLimit`.
- [x] Add an MCP-specific `express.json({ limit: "64kb" })` parser before the existing general 1 MB JSON parser, mounted only on `/mcp`, so MCP request bodies have a real bound before the SDK adapter sees `req.body`. Add an error middleware after the route and before static frontend fallback; pass through errors whose `req.path !== "/mcp"`, map `entity.too.large` to `413 {"error":"request too large"}`, malformed JSON to `400 {"error":"invalid JSON"}`, and other MCP failures to `503 {"error":"MCP temporarily unavailable"}`. Never serialize `error.stack` or filesystem paths.
- [x] Add one route before static frontend fallback. Its exact control flow is:

```js
app.all("/mcp", (req, res, next) => {
  if (process.env.MCP_ENABLED !== "true") return res.status(404).json({ error: "not found" });
  return next();
}, mcpReadLimit, async (req, res) => {
  try {
    const runtime = await loadMcpRuntime();
    if (!runtime.validateRequest(req, res)) return;
    await runtime.handle(req, res, req.body);
  } catch (error) {
    console.error("[mcp] request failed", error?.name || "Error");
    if (!res.headersSent) res.status(503).json({ error: "MCP temporarily unavailable" });
  }
});
```

- [x] Implement `validateRequest(req, res)` with the official `hostHeaderValidation(allowedHosts)` and `originValidation(allowedOrigins)` guards, short-circuiting when either returns false because the guard has already sent its 403. Require a non-empty Host allowlist when enabled. Define `loadMcpRuntime()` with a cached `import("./lib/mcpServer.mjs")` promise that calls `createReadOnlyMcpHandler({ createProviders: createMcpProviders, allowedHosts, allowedOrigins })`; clear the cached promise on import failure so a transient startup failure can recover. Let the SDK own protocol negotiation, method validation, and response framing.
- [x] Test, via HTTP against `app.listen(0)`, disabled route, initialized/listable tools, one call per tool, host/origin missing/allowed/denied cases, malformed origin, 413 oversized request, 429 after configured requests, independent clients, and spoofed `X-Forwarded-For` prefixes not rotating a trusted client identity.
- [x] Assert the app still returns no MCP route details when disabled and no stack/path/error internals for rejected or failed requests. Parse-error tests must assert exact sanitized JSON bodies for malformed JSON and over-limit bodies.
- [x] Run `node --test server/index.test.js server/security.test.js server/lib/mcpServer.test.js`.

## Task 5: Document the endpoint without implying it is live by default

**Files:** Modify `.env.example`, `README.md`, and `src/app/App.tsx`.

- [x] Add the following configuration to `.env.example`; leave the feature off:

```dotenv
MCP_ENABLED=false
MCP_ALLOWED_HOSTS=localhost,127.0.0.1
MCP_ALLOWED_ORIGINS=localhost,127.0.0.1
MCP_RATE_WINDOW_MS=60000
MCP_RATE_MAX=60
```

- [x] Add an MCP card to AgentPage at `src/app/App.tsx` with the endpoint `${origin}/mcp`, state that the current endpoint is unavailable unless an operator enables it, and list only the five read-only tools. Do not add a UI toggle that changes server configuration.
- [x] Add README sections for SDK dependency, default-off setup, required Host/Origin allowlists, five tools and bounds, request/response limits, local test command, and the separate production review/deployment gate.
- [x] Verify changed React types/build and assert the Agent 接入 page does not claim the endpoint is active when `MCP_ENABLED` is false. Run `npm run typecheck` and `npm run build`.

## Task 6: Complete adversarial regression and local client verification

**Files:** Modify only failing/new tests among `server/lib/mcpServer.test.js`, `server/index.test.js`, and `server/security.test.js`.

- [x] Add a hidden-event fixture in which one cluster member is public and another is hidden; assert neither `get_hot_topics` nor `get_event_timeline` exposes hidden identifiers, raw fields, internal ranking fields, or the hidden source name.
- [x] Add daily and monthly report fixtures with `raw`, `mpMeta`, `priorityTier`, and a unique `privateSentinel`; assert the sentinel and all internal fields are absent from MCP structured and text content.
- [x] Compare MCP feed, search, hot topics, event and digest results against the corresponding public REST projections for the same fixture state; assert no difference in ordering, dates, representative event, or public-field allowlists.
- [x] Connect the official MCP SDK `Client` to the same in-process handler used by the server tests, list tools, call all five, then close both client and transport in `t.after` cleanup. Do not substitute a JSON-RPC mock for this check.
- [x] Run the complete verification set: `npm test`, `npm run typecheck`, and `npm run build`. Expected output: all tests pass, no TypeScript errors, and Vite reports a successful production build.
- [x] Inspect `git diff --check`, `git diff --name-only`, and `git status --short`; confirm no production files/data were touched and unrelated pre-existing edits remain intact.
- [ ] Commit only the completed task files in small commits after reviewing the staged path list; never use `git add -A` or commit pre-existing user changes. Deferred: target files contain unrelated pre-existing edits, and no safe task-only staging/commit was requested.

## Spec coverage self-review

- Default-off endpoint, independent limiter, bounded body/output: Tasks 2 and 4.
- Five public tools and public endpoint consistency: Tasks 2, 3, and 6.
- Reuse public serialization and prevent snapshot/internal field leaks: Tasks 3 and 6.
- Host/Origin and trusted-IP behavior: Task 4.
- Official protocol and real client validation: Tasks 1, 2, 4, and 6.
- Agent page and operator docs: Task 5.
- Build/test/typecheck and preserve production/runtime state: Task 6.
- Stop if the official SDK cannot be integrated safely: Task 1 review gate.

## References checked during planning

- MCP TypeScript SDK v2, stable line and 2026-07-28 protocol: https://ts.sdk.modelcontextprotocol.io/v2/
- Official Express integration and `toNodeHandler`: https://ts.sdk.modelcontextprotocol.io/v2/serving/express.html
- Official in-process client test using `handler.fetch`: https://ts.sdk.modelcontextprotocol.io/v2/testing.html
- Official Node Host and Origin guard API: https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/node/middleware/hostHeaderValidation.html and https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/node/middleware/originValidation.html
- Approved project design: `docs/superpowers/specs/2026-09-28-readonly-mcp-design.md`
