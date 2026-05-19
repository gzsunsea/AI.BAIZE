# AI.BAIZE

AI.BAIZE is a self-hosted AI intelligence dashboard inspired by AIHOT. It collects AI news from free public sources, scores and deduplicates items, generates AI daily digests, and provides a lightweight admin panel for refresh, source, and content management.

## Features

- React + Vite frontend with dark/light theme switching
- Express backend serving API, admin routes, RSS feed, and static frontend
- Scheduled collection from RSS, web pages, Hacker News, GitHub, arXiv, Dev.to, and X-related public signals
- Local/free LLM enhancement through Ollama for Chinese editorial summaries
- AI daily digest with model, product, education, culture, open-source, research, opinion, and industry sections
- Admin panel protected by `ADMIN_TOKEN`

## Local Development

```bash
npm install
cp .env.example .env
npm run refresh
npm run build
npm start
```

The app defaults to port `8080`.

## Environment

```bash
ADMIN_TOKEN=change-me
PORT=8080
OLLAMA_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=qwen2.5:0.5b
```

`ADMIN_TOKEN` must be changed in production. Runtime data is stored in `data/db.json` and is intentionally ignored by git.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the current Ubuntu + Nginx + systemd deployment notes.
