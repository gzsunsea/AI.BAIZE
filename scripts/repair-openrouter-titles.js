#!/usr/bin/env node
// Default preview. Apply requires paused writers: --db /path/db.json --apply.
// Loads no store, configuration, refresh jobs or LLM; only fetches original HTML.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const { titleFingerprint } = require('../server/lib/contentIdentity');
async function fetchPage(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'text/html' } });
  if (!response.ok) throw Object.assign(new Error('Article fetch failed'), { code: `HTTP_${response.status}` });
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
function publicFailure(id, code) {
  return Object.assign(new Error(`${code}: ${id} (title evidence / Unexpected article location refused)`), { id, code });
}
async function inventory(dbPath, ids) {
  if (!dbPath) throw new Error('Explicit --db required');
  const file = path.resolve(dbPath);
  const original = await fs.readFile(file, 'utf8');
  const state = JSON.parse(original);
  if (!Array.isArray(state.items)) throw new Error('Invalid inventory');
  const items = state.items.filter(item => item.sourceId === 'openrouter-announcements');
  if (ids && (!ids.length || ids.some(id => !items.some(item => item.id === id)))) throw new Error('Unknown selected public ID');
  return { file, original, state, items: ids ? items.filter(item => ids.includes(item.id)) : items };
}
async function inspect(item, readPage) {
  if (!/^item-[a-z0-9]+$/i.test(item.id || '')) throw new Error('Invalid public ID');
  let url;
  try { url = new URL(item.url); } catch { return { id: item.id, status: 'INVALID_LOCATION' }; }
  if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai' || url.port || url.username || url.password || !url.pathname.startsWith('/blog/')) return { id: item.id, status: 'UNEXPECTED_LOCATION' };
  let html;
  try { html = await readPage(url.href); } catch (error) {
    const code = /^HTTP_[1-5][0-9]{2}$/.test(error.code || '') ? error.code : 'FETCH_FAILED';
    return { id: item.id, status: code };
  }
  const $ = cheerio.load(html);
  const headings = $('h1').toArray().map(node => $(node).text().replace(/\s+/g, ' ').trim()).filter(Boolean);
  const title = headings.length === 1 ? headings[0] : '';
  if (!title) return { id: item.id, status: 'NO_TITLE_EVIDENCE' };
  if (title === item.title) return { id: item.id, status: 'unchanged', title };
  if (!String(item.title).startsWith(title)) return { id: item.id, status: 'UNPROVED_TITLE_DIFFERENCE', title };
  return { id: item.id, status: 'repairable', title };
}
async function diagnose({ dbPath, ids, fetchPage: readPage = fetchPage }) {
  const { items } = await inventory(dbPath, ids);
  const result = [];
  for (const item of items) result.push(await inspect(item, readPage));
  return result;
}
// Only publisher-proven complete title occurrences are substituted. Truncated
// excerpts and independent editorial copy remain untouched; no summaries are generated.
function repairStoredCopy(item, oldTitle, title) {
  const fields = ['summary', 'reason', 'recommendation', 'aiSelectedReason', 'editorialJudgment'];
  const replace = (object, keys) => {
    if (!object || typeof object !== 'object') return;
    for (const key of keys) {
      if (typeof object[key] === 'string' && object[key].includes(oldTitle)) {
        object[key] = object[key].split(oldTitle).join(title);
      }
    }
  };
  for (const object of [item, item.raw]) {
    replace(object, fields);
    replace(object?.editorialBrief, ['fact', 'impact', 'scenario', 'reason', 'recommendation']);
  }
}
async function repair({ dbPath, apply = false, ids, fetchPage: readPage = fetchPage }) {
  const { file, original, state, items } = await inventory(dbPath, ids);
  const changes = [];
  for (const item of items) {
    const result = await inspect(item, readPage);
    if (['unchanged', 'UNPROVED_TITLE_DIFFERENCE'].includes(result.status)) continue;
    if (result.status !== 'repairable') throw publicFailure(item.id, result.status);
    // Exact publisher headline plus extra card text proves contamination; never slice or infer.
    repairStoredCopy(item, item.title, result.title);
    item.title = result.title;
    if (item.raw && typeof item.raw === 'object') item.raw.title = result.title;
    if (Object.hasOwn(item, 'titleFingerprint')) item.titleFingerprint = titleFingerprint(result.title);
    changes.push({ id: item.id, title: result.title });
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
  const options = {};
  let invalid = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (args[i] === '--diagnose') options.diagnose = true;
    else if (args[i] === '--db' && args[i + 1]) options.dbPath = args[++i];
    else if (args[i] === '--ids' && args[i + 1]) options.ids = args[++i].split(',');
    else invalid = true;
  }
  if (invalid || !options.dbPath || (options.apply && options.diagnose)) {
    console.error('Usage: node scripts/repair-openrouter-titles.js --db /path/db.json [--ids item-a,item-b] [--apply | --diagnose]');
    process.exitCode = 1;
  } else (options.diagnose ? diagnose(options) : repair(options)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(JSON.stringify(error.id ? { id: error.id, status: error.code } : { status: 'REPAIR_REFUSED' }));
    process.exitCode = 1;
  });
}
module.exports = { repair, fetchPage, diagnose };
