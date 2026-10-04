# Optional Local Vision Enrichment Implementation Plan

> **For agentic workers:** Execute inline in the current task. Preserve unrelated working-tree changes and do not commit.

**Goal:** Allow configured local Ollama vision models to use one safely fetched article image when enriching trusted-source AI news, while preserving the current text-only/default behavior.

**Architecture:** Extract the existing DNS-pinned public-media fetcher into a shared library used by both the `/api/media` route and the LLM enricher. Add a disabled-by-default vision branch selected only by `OLLAMA_VISION_MODEL`; fetch at most one raster image up to 2 MiB, send its base64 bytes through the existing `/api/generate` request, and fall back to the existing text model when media or vision processing fails.

**Tech Stack:** Node.js built-ins, Express, Ollama REST API, `node:test`.

## Global Constraints

- No paid API, new dependency, model download, inference call, deployment, database write, or commit in this task.
- Do not change `/api/media` public behavior: retain DNS pinning, redirect validation, and its current 15 MiB default ceiling.
- Vision is opt-in only; an unset `OLLAMA_VISION_MODEL` must preserve the current flow.
- Only preferred X, official first-party, or expert RSS items may use image input.
- Accept only image/jpeg, image/png, and image/webp whose bytes match the declared format; exclude SVG, GIF, and unknown formats.
- Vision download ceiling is 2 MiB for one image; failures fall back to text-only summarization.

---

### Task 1: Extract safe public media fetching without changing its route contract

**Files:**
- Create: `server/lib/mediaFetch.js`
- Modify: `server/index.js`
- Test: `server/security.test.js`

**Interfaces:**
- `fetchPublicMedia(target, options = {})` returns `{ status, headers, body }`; options include `lookup`, `requestHop`, and `maxBytes`, defaulting to 15 MiB.
- `requestMediaHop(target, resolved, options = {})` applies the same `maxBytes` ceiling while streaming.
- Keep existing exports from `server/index.js` as re-exports for compatibility.

- [x] Add a test proving `fetchPublicMedia` forwards a smaller `maxBytes` ceiling to the request hop.
- [x] Add a local HTTP regression test proving an oversized response is rejected without an unhandled socket error.
- [x] Run `node --test --test-name-pattern="maxBytes" server/security.test.js`; expect failure because the option is not forwarded.
- [x] Move the current IP classification, DNS pinning, redirect, and HTTP(S) fetch helpers into `mediaFetch.js` without behavior changes; enforce configurable byte ceiling in the streaming hop.
- [x] Run the focused test and the existing media-fetch security tests in `server/security.test.js`; expect all to pass.

### Task 2: Build bounded, source-gated vision image preparation

**Files:**
- Modify: `server/lib/llmEnhancer.js`
- Test: `server/lib/llmEnhancer.test.js`

**Interfaces:**
- `prepareVisionImages(item, fetcher = fetchPublicMedia)` returns zero or one base64 image strings.
- It returns no images unless `OLLAMA_VISION_MODEL` is configured and the item is preferred or belongs to `preferred_x`, `official_first_party`, or `expert_rss`.
- It fetches only the first image asset, requires HTTP 2xx, an allowed Content-Type, at most 2 MiB, and matching JPEG/PNG/WebP magic bytes.

- [x] Add failing tests for opt-in/source-tier gating, MIME/magic validation, byte limit forwarding, and base64 output using an injected fake fetcher.
- [x] Run the focused tests; expect failure because `prepareVisionImages` does not exist.
- [x] Implement the bounded helper and reuse `mediaFetch.js`; do not fetch media when vision is disabled.
- [x] Run the focused tests; expect all to pass.

### Task 3: Send optional image input to Ollama and retain text fallback

**Files:**
- Modify: `server/lib/llmEnhancer.js`
- Test: `server/lib/llmEnhancer.test.js`

**Interfaces:**
- `callOllama(item, { model = OLLAMA_MODEL, images = [] } = {})` adds `images` only when non-empty.
- `enhanceItem(item)` uses `OLLAMA_VISION_MODEL` only when at least one validated image is available; failed vision calls retry once using the existing text model, then use the existing rules fallback.
- Provider values stay within the existing `ollama:*` prefix so successful results are not reprocessed continuously.

- [x] Add failing tests using a mocked global `fetch` to verify vision model/image payload and text-model fallback after a vision failure.
- [x] Run focused tests; expect failure because request payload currently has no optional vision branch.
- [x] Implement the optional payload and one-step fallback without changing the prompt, output schema, or default model.
- [x] Run the focused tests; expect all to pass.

### Task 4: Validate the whole repository behavior

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [x] Run `npm test` (271 tests passed).
- [x] Run `git diff --check` and inspect only the plan, media-fetch, index, LLM-enhancer, and configuration-documentation diffs; preserve all pre-existing unrelated changes.
- [x] Do not deploy, mutate `data/db.json`, install models, or commit.
