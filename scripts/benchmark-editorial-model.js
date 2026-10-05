#!/usr/bin/env node
// Read-only model qualification: never calls enhanceRecentItems or writes runtime state.
const fs = require('node:fs');
const { enhanceItem } = require('../server/lib/llmEnhancer');

async function main() {
  const [dbPath, ...ids] = process.argv.slice(2);
  if (!dbPath || !ids.length || !process.env.OLLAMA_MODEL) {
    throw new Error('Usage: OLLAMA_MODEL=candidate node scripts/benchmark-editorial-model.js /absolute/db.json item-id ...');
  }
  const before = fs.readFileSync(dbPath);
  const state = JSON.parse(before);
  const results = [];
  for (const id of ids) {
    const item = state.items.find(entry => entry.id === id);
    if (!item) throw new Error(`Unknown item: ${id}`);
    const started = performance.now();
    const result = await enhanceItem(item);
    let availableMiB = null;
    try {
      availableMiB = Math.round(Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]) / 1024);
    } catch {}
    results.push({ id, sourceUrl: item.url, original: item.raw?.summary || item.raw?.description || '',
      ...result, elapsedMs: Math.round(performance.now() - started), availableMiB,
      semanticReview: 'REQUIRED: human comparison against original; automatic gates are insufficient' });
  }
  if (!before.equals(fs.readFileSync(dbPath))) {
    console.error('Runtime database changed during test (possibly collector); benchmark does not write state.');
  }
  console.log(JSON.stringify({ model: process.env.OLLAMA_MODEL, testedAt: new Date().toISOString(), results }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
