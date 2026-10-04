import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const TOOL_RESULT_LIMIT = 65_536;

function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toToolResult(value) {
  const structuredContent = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : { items: value };
  const text = JSON.stringify(structuredContent);
  if (Buffer.byteLength(text, "utf8") > TOOL_RESULT_LIMIT) {
    return toolError("result exceeds MCP response limit");
  }
  return { content: [{ type: "text", text }], structuredContent };
}

async function invokeProvider(provider, input) {
  try {
    const value = await provider(input);
    return value == null
      ? toolError("not found")
      : toToolResult(value);
  } catch (error) {
    return toolError(error?.statusCode === 400 ? "invalid input" : "temporarily unavailable");
  }
}

function registerReadOnlyTools(server, providers) {
  server.registerTool("get_selected_feed", {
    description: "Read recent publicly selected AI.BAIZE items.",
    inputSchema: z.object({
      take: z.number().int().min(1).max(30).default(20),
      since: z.string().max(40).optional(),
    }),
  }, (input) => invokeProvider(providers.getSelectedFeed, input));

  server.registerTool("search_items", {
    description: "Search public AI.BAIZE items from the last 1 to 30 days.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(120),
      mode: z.enum(["selected", "all"]).default("selected"),
      days: z.number().int().min(1).max(30).default(7),
      take: z.number().int().min(1).max(30).default(20),
    }),
  }, (input) => invokeProvider(providers.searchItems, input));

  server.registerTool("get_hot_topics", {
    description: "Read ranked, publicly confirmed AI.BAIZE hot topics.",
    inputSchema: z.object({
      take: z.number().int().min(1).max(10).default(10),
    }),
  }, (input) => invokeProvider(providers.getHotTopics, input));

  server.registerTool("get_event_timeline", {
    description: "Read a public event summary and its source timeline.",
    inputSchema: z.object({
      eventId: z.string().trim().min(1).max(160),
    }),
  }, (input) => invokeProvider(providers.getEventTimeline, input));

  server.registerTool("get_digest", {
    description: "Read a public daily, weekly, or monthly AI.BAIZE report.",
    inputSchema: z.object({
      period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  }, (input) => invokeProvider(providers.getDigest, input));
}

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
