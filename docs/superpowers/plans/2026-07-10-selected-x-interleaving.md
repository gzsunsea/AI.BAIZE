# Selected X Interleaving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute reserved X signals throughout the selected feed so the first public page reflects the configured X share.

**Architecture:** Keep selection and quota enforcement in `selectCuratedItems`, then apply one deterministic ordering helper after rank sorting. The helper preserves pinned items and interleaves unpinned X signals among other selected items.

**Tech Stack:** Node.js, Express, `node:test`, CommonJS test imports.

## Global Constraints

- Keep `selectedXShare` semantics unchanged.
- Preserve pinned-item priority.
- Do not add dependencies or paid APIs.
- Do not change source eligibility, scoring, or per-source caps.

---

### Task 1: Interleave Selected X Signals

**Files:**
- Modify: `server/index.js:398`
- Test: `server/index.test.js:110`

**Interfaces:**
- Consumes: `isPreferredX(item)`, `selectedRank(item)`, and the selected item array.
- Produces: the existing `selectCuratedItems(items, rules)` array with deterministic interleaved ordering.

- [x] **Step 1: Extend the X quota regression test**

Add an assertion that the first eight selected items contain two `preferred_x` items:

```js
assert.equal(selected.slice(0, 8).filter((item) => item.priorityTier === "preferred_x").length, 2);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="curated feed reserves slots for preferred X signals" server/index.test.js`

Expected: FAIL because the existing final score sort places all lower-scored X items after the first eight results.

- [x] **Step 3: Add deterministic interleaving**

Inside `selectCuratedItems`, replace the direct final sort return with ranked pinned items plus an interleaved unpinned sequence:

```js
const ordered = selected.sort((a, b) => selectedRank(b) - selectedRank(a) || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
const pinned = ordered.filter((item) => item.pinned);
const xSignals = ordered.filter((item) => !item.pinned && isPreferredX(item));
const otherSignals = ordered.filter((item) => !item.pinned && !isPreferredX(item));
if (!xSignals.length || !otherSignals.length) return ordered;

const interval = Math.max(1, Math.floor((xSignals.length + otherSignals.length) / xSignals.length));
const interleaved = [];
while (xSignals.length || otherSignals.length) {
  for (let index = 1; index < interval && otherSignals.length; index += 1) interleaved.push(otherSignals.shift());
  if (xSignals.length) interleaved.push(xSignals.shift());
  else interleaved.push(...otherSignals.splice(0));
}
return [...pinned, ...interleaved];
```

- [x] **Step 4: Run focused and full verification**

Run: `node --test --test-name-pattern="curated feed reserves slots for preferred X signals" server/index.test.js`

Expected: PASS.

Run: `npm test && npm run build && npm audit --omit=dev`

Expected: all tests pass, Vite build exits 0, and audit reports 0 vulnerabilities.

- [x] **Step 5: Deploy and verify production ordering**

Build locally, back up `/opt/aihot/data/db.json`, sync while excluding `data/`, `.env*`, `.git/`, `node_modules/`, `backups/`, and `deploy-backups/`, install production dependencies, and restart `aihot`.

Verify: `https://www.aibaize.cc/api/public/items?mode=selected&take=30` returns HTTP 200 and contains X status URLs in the first 30 items.
