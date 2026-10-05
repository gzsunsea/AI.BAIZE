# AI.BAIZE

AI.BAIZE is a self-hosted AI intelligence dashboard inspired by AIHOT. It collects AI news from free public sources, scores and deduplicates items, generates AI daily digests, and provides a lightweight admin panel for refresh, source, and content management.

## Features

- React Router SSR frontend in `apps/web/` with dark/light theme switching
- Express collection/API service plus an HTTP site adapter; the web process owns page rendering
- Scheduled collection from RSS, web pages, Hacker News, GitHub, arXiv, Dev.to, and X-related public signals
- Local/free LLM enhancement through Ollama for Chinese editorial summaries
- AI daily digest with model, product, education, culture, open-source, research, opinion, and industry sections
- Admin panel protected by `ADMIN_TOKEN`

## Local Development

```bash
npm install
cp .env.example .env
npm run refresh
npm run typecheck
npm run build
npm start:web
```

The API defaults to port `8080`; the SSR web process defaults to port `3000` and uses `API_BASE_URL`.

## Environment

```bash
ADMIN_TOKEN=change-me
PORT=8080
OLLAMA_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_VISION_MODEL=
MCP_ENABLED=false
MCP_ALLOWED_HOSTS=localhost,127.0.0.1
MCP_ALLOWED_ORIGINS=localhost,127.0.0.1
MCP_RATE_WINDOW_MS=60000
MCP_RATE_MAX=60
```

`OLLAMA_VISION_MODEL` is optional and disabled when empty. To interpret source images, install a vision-capable model in your local Ollama instance and set this to its model name; AI.BAIZE does not download models. Only preferred X, official first-party, and expert RSS items are eligible. At most one JPEG, PNG, or WebP image up to 2 MiB is sent to Ollama. If image retrieval or vision inference fails, the existing text-only model and rules fallback remain in effect.

The read-only MCP endpoint uses the official `@modelcontextprotocol/server` and `@modelcontextprotocol/node` v2 SDKs and is available at `/mcp` only when `MCP_ENABLED=true` is set explicitly; it is disabled by default and this change does not enable or deploy it. Configure `MCP_ALLOWED_HOSTS` with comma-separated hostnames (no scheme or port); a non-empty host list is required when enabled. `MCP_ALLOWED_ORIGINS` is a comma-separated hostname allowlist for browser clients; requests without an `Origin` header are allowed for native MCP clients. The default limiter is 60 requests per 60 seconds per trusted client IP, configurable with `MCP_RATE_MAX` and `MCP_RATE_WINDOW_MS`.

The endpoint exposes only five public read tools: `get_selected_feed`, `search_items`, `get_hot_topics`, `get_event_timeline`, and `get_digest` (daily/weekly/monthly). It has no ask, admin, feedback, configuration, source-health, or write tools. Item `take` is 1–30, hot-topic `take` is 1–10, search text is 1–120 characters over 1–30 days, selected-feed `since` cannot exceed a 30-day lookback, event IDs are 1–160 characters, and digest dates use `YYYY-MM-DD`. Request bodies and serialized tool results are each limited to 64 KiB. Run `npm test`, `npm run typecheck`, and `npm run build` for local verification. Production activation remains a separate security/deployment review; this implementation does not change production configuration or services. The Agent 接入 page documents the endpoint and its activation requirements.

`ADMIN_TOKEN` must be changed in production. Runtime data is stored in `data/db.json` and is intentionally ignored by git. The old root Vite page is removed; the active UI is the SSR workspace under `apps/web`.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the current Ubuntu + Nginx + systemd deployment notes.
