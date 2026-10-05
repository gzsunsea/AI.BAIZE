#!/usr/bin/env node
// Default preview. Apply requires paused writers: --db /path/db.json --apply.
// Loads no store, configuration, refresh jobs or LLM; only fetches original HTML.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { articleTitleFromHtml } = require('../server/lib/scrapers');
const { titleFingerprint } = require('../server/lib/contentIdentity');
async function fetchPage(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'text/html' } });
  if (!response.ok) throw new Error('Article fetch failed');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) throw new Error('Article exceeds read limit');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}
async function repair({ dbPath, apply = false, fetchPage: readPage = fetchPage }) {
  if (!dbPath) throw new Error('Explicit --db required');
  const file = path.resolve(dbPath);
  const original = await fs.readFile(file, 'utf8');
  const state = JSON.parse(original);
  if (!Array.isArray(state.items)) throw new Error('Invalid inventory');
  const changes = [];
  for (const item of state.items) {
    if (item.sourceId !== 'openrouter-announcements') continue;
    if (!/^item-[a-z0-9]+$/i.test(item.id || '')) throw new Error('Invalid public ID');
    let url;
    try { url = new URL(item.url); } catch { throw new Error('Invalid article location'); }
    if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai' || url.port || url.username || url.password || !url.pathname.startsWith('/blog/')) throw new Error('Unexpected article location');
    const title = articleTitleFromHtml(await readPage(url.href));
    if (!title) throw new Error(`No unambiguous title evidence for ${item.id}`);
    // Exact publisher headline plus extra card text proves contamination; never slice or infer.
    if (title === item.title || !String(item.title).startsWith(title)) continue;
    item.title = title;
    if (item.raw && typeof item.raw === 'object') item.raw.title = title;
    if (Object.hasOwn(item, 'titleFingerprint')) item.titleFingerprint = titleFingerprint(title);
    changes.push({ id: item.id, title });
  }
  if (apply && changes.length) {
    if (await fs.readFile(file, 'utf8') !== original) throw new Error('Database changed');
    const suffix = crypto.randomUUID();
    await fs.writeFile(`${file}.backup-${suffix}`, original, { flag: 'wx', mode: 0o600 });
    const temporary = `${file}.repair-${suffix}`;
    try {
      await fs.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: (await fs.stat(file)).mode & 0o777 });
      if (await fs.readFile(file, 'utf8') !== original) throw new Error('Database changed');
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return changes;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--db');
  if (index < 0 || !args[index + 1] || args.some((arg, i) => arg !== '--apply' && arg !== '--db' && i !== index + 1)) {
    console.error('Usage: node scripts/repair-openrouter-titles.js --db /path/db.json [--apply]');
    process.exitCode = 1;
  } else repair({ dbPath: args[index + 1], apply: args.includes('--apply') }).then(changes => console.log(JSON.stringify(changes, null, 2))).catch(() => {
    console.error('Repair refused; check input and original title evidence.');
    process.exitCode = 1;
  });
}
module.exports = { repair, fetchPage };
