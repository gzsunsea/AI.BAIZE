const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('repair defaults to preview, scopes OpenRouter, and backs up while preserving editorial state', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  const item = { id: 'item-public', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/launch', title: 'Actual model launch' + 'card '.repeat(100), raw: { title: 'Actual model launch' + 'card '.repeat(100) }, publishedAt: '2026-10-05', score: 96, hidden: true, pinned: true };
  const original = JSON.stringify({ items: [item, { ...item, id: 'item-other', sourceId: 'other' }], dailyDigests: [{ title: 'retain' }] });
  await fs.writeFile(dbPath, original);
  const fetchPage = async () => '<h1>Actual model launch</h1><meta property="og:title" content="Fallback">';
  assert.deepEqual(await repair({ dbPath, fetchPage }), [{ id: item.id, title: 'Actual model launch' }]);
  assert.equal(await fs.readFile(dbPath, 'utf8'), original);
  await repair({ dbPath, fetchPage, apply: true });
  const after = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  for (const key of ['id', 'url', 'publishedAt', 'score', 'hidden', 'pinned']) assert.equal(after.items[0][key], item[key]);
  assert.equal(after.items[0].raw.title, 'Actual model launch');
  assert.equal(after.items[1].title, item.title);
  assert.equal(await fs.readFile(path.join(dir, (await fs.readdir(dir)).find(name => name.includes('.backup-'))), 'utf8'), original);
});

test('repair refuses missing title evidence without writes', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  const original = JSON.stringify({ items: [{ id: 'item-evidence', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/test', title: 'x'.repeat(500) }] });
  await fs.writeFile(dbPath, original);
  await assert.rejects(repair({ dbPath, apply: true, fetchPage: async () => '<p>No title</p>' }), /title evidence/);
  assert.equal(await fs.readFile(dbPath, 'utf8'), original);
});


test('repair refuses non-OpenRouter locations before fetching', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  await fs.writeFile(dbPath, JSON.stringify({ items: [{ id: 'item-invalid', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai.evil.test/blog/test', title: 'x'.repeat(500) }] }));
  await assert.rejects(repair({ dbPath, fetchPage: async () => assert.fail('must not fetch') }), /Unexpected article location/);
});

test('repair network transport rejects redirects and has a bounded read', async t => {
  const { fetchPage } = require('../../scripts/repair-openrouter-titles');
  t.mock.method(global, 'fetch', async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return new Response('<h1>Original</h1>');
  });
  assert.equal(await fetchPage('https://openrouter.ai/blog/test'), '<h1>Original</h1>');
});

test('repair proves shorter card pollution from an original title prefix, keeping editorial alternatives', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  await fs.writeFile(dbPath, JSON.stringify({ items: [
    { id: 'item-short', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/short', title: 'Actual titleA card description and date' },
    { id: 'item-edited', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/edited', title: 'An independent Chinese editorial headline' },
  ] }));
  assert.deepEqual(await repair({ dbPath, fetchPage: async () => '<h1>Actual title</h1>' }), [{ id: 'item-short', title: 'Actual title' }]);
});
