# AI.BAIZE Agent Notes

## Project Background

AI.BAIZE is a self-hosted AI intelligence dashboard for high-signal AI news, daily digests, education/culture coverage, and Chinese hot-article monitoring. The project is inspired by AIHOT, but it should not behave like a raw RSS dump. Its editorial model is:

- Prioritize high-value X/KOL leads, official first-party announcements, and expert RSS/blog sources.
- Use community sources such as Hacker News, GitHub, Dev.to, and arXiv as supplemental discovery, not as the main selected feed.
- Deduplicate the same event across sources and prefer first-party or high-quality social versions when possible.
- Present Chinese editorial summaries with fact, impact, scenario value, and recommendation reason.

The current optimization focus is source quality. Earlier versions overexposed Hacker News, Dev.to, and broad GitHub content. The latest implementation adds source tiers and scoring/filtering so preferred sources carry stronger weight and generic community content must pass stricter AI relevance checks.

## Architecture

- Frontend: React + Vite in `src/`, built to `dist/`.
- Backend: Express in `server/index.js`, serving API, admin routes, RSS, skill metadata, and static frontend.
- Refresh job: `server/jobs/refresh.js`.
- Source definitions: `server/lib/sources.js`.
- Scrapers: `server/lib/scrapers.js`.
- Scoring and normalization: `server/lib/scoring.js`.
- Editorial enrichment and API decoration: `server/lib/editorial.js`.
- Local/free LLM summarization fallback: `server/lib/llmEnhancer.js`.
- Runtime JSON database: `data/db.json`.

The app is intentionally lightweight and free-source friendly. Do not introduce paid APIs unless explicitly requested.

## Source Strategy

Source priority tiers:

- `preferred_x`: highest priority for early signals and expert opinions.
- `official_first_party`: high trust, used for model/product/company updates.
- `expert_rss`: high-quality analysis and practitioner commentary.
- `cn_media`: Chinese industry media, filtered for AI relevance and obvious non-AI tech noise.
- `community_fallback`: HN/GitHub/Dev.to/arXiv style supplemental sources, lowered by default.
- `reference`: AIHOT public exposure used only as source discovery/comparison, not as a long-term dependency.

Important quality rules:

- Preferred sources should appear heavily in selected feeds and daily digests.
- HN/GitHub/Dev.to generic content must match strong AI keywords or education/culture signals.
- Chinese media should reject obvious phone/car/consumer-electronics/policy noise unless AI relevance is explicit.
- X mirror failures must not block refresh; failed sources are tracked in health state.
- Selected feeds should avoid continuous community fallback blocks.

## Deployment

Production target is documented in `DEPLOY.md`:

- Server: `101.96.213.103`
- App directory: `/opt/aihot`
- Service: `aihot.service`
- Port: `8080`
- Nginx reverse proxy: `/etc/nginx/conf.d/aihot.conf`

Before deploying:

1. Run `npm run build`.
2. Prefer syncing code and built assets while preserving production runtime data unless the user explicitly asks to replace it.
3. Do not overwrite production `data/db.json` casually.
4. Restart `aihot`.
5. Verify `/api/stats`, `/api/public/items?mode=selected`, `/api/public/daily`, the homepage, and admin source filters.

## Operational Notes

- Admin token is controlled by `ADMIN_TOKEN`; local default is `aihot-admin`, production should use environment configuration.
- `data/db.json` is runtime state and may contain source health, item inventory, daily digests, feedback, and manual MP articles.
- Refresh can be slow because free public RSS/web/X mirrors are unreliable.
- Some source failures are expected and acceptable if the selected feed still meets quality distribution targets.

