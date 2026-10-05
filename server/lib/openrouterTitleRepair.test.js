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

test('diagnosis reports every public ID and selective repair excludes unconfirmed records', async t => {
  const { repair, diagnose } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  const original = JSON.stringify({ items: [
    { id: 'item-good', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/good', title: 'Confirmed card text' },
    { id: 'item-failed', sourceId: 'openrouter-announcements', url: 'https://openrouter.ai/blog/failed', title: 'Unconfirmed' },
  ] });
  await fs.writeFile(dbPath, original);
  const fetchPage = async url => { if (url.endsWith('/failed')) { const error = new Error('secret URL must not appear'); error.code = 'HTTP_404'; throw error; } return '<h1>Confirmed</h1>'; };
  assert.deepEqual(await diagnose({ dbPath, fetchPage }), [{ id: 'item-good', status: 'repairable', title: 'Confirmed' }, { id: 'item-failed', status: 'HTTP_404' }]);
  await assert.rejects(repair({ dbPath, apply: true, fetchPage }), error => error.id === 'item-failed' && error.code === 'HTTP_404');
  assert.equal(await fs.readFile(dbPath, 'utf8'), original);
  assert.deepEqual(await repair({ dbPath, ids: ['item-good'], fetchPage }), [{ id: 'item-good', title: 'Confirmed' }]);
  await assert.rejects(repair({ dbPath, ids: ['item-unknown'], fetchPage }), /Unknown/);
});

test('repair substitutes only exact polluted titles in stored copy without regenerating partial summaries', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'title-copy-repair-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json');
  const oldTitle = 'Actual launchCard text $&';
  const item = { id:'item-copy', sourceId:'openrouter-announcements', url:'https://openrouter.ai/blog/copy', title:oldTitle,
    reason:`推荐《${oldTitle}》，核验原文。${oldTitle}`, recommendation:`阅读 ${oldTitle}`, summary:'Actual launchCard tex',
    aiSelectedReason:`依据 ${oldTitle}`, editorialJudgment:'独立编辑判断',
    editorialBrief:{fact:`原文显示：${oldTitle}`,impact:'保留影响判断',scenario:`比较 ${oldTitle}`},
    raw:{title:oldTitle,reason:`原始 ${oldTitle}`,recommendation:`参考 ${oldTitle}`,summary:'摘要保持',url:`https://example.test/${oldTitle}`},
    tags:[oldTitle], hidden:true };
  const untouched = {...item,id:'item-other',sourceId:'other'};
  await fs.writeFile(dbPath,JSON.stringify({items:[item,untouched],dailyDigests:[{headline:oldTitle}]}));
  await repair({dbPath,apply:true,fetchPage:async()=>'<h1>Actual launch</h1>'});
  const state=JSON.parse(await fs.readFile(dbPath,'utf8')); const result=state.items[0];
  assert.equal(result.reason,'推荐《Actual launch》，核验原文。Actual launch');
  assert.equal(result.recommendation,'阅读 Actual launch');
  assert.equal(result.aiSelectedReason,'依据 Actual launch');
  assert.deepEqual(result.editorialBrief,{fact:'原文显示：Actual launch',impact:'保留影响判断',scenario:'比较 Actual launch'});
  assert.equal(result.raw.reason,'原始 Actual launch'); assert.equal(result.raw.recommendation,'参考 Actual launch');
  for(const key of ['summary','editorialJudgment','tags','hidden']) assert.deepEqual(result[key],item[key]);
  assert.equal(result.raw.url,item.raw.url); assert.equal(result.raw.summary,item.raw.summary);
  assert.deepEqual(state.items[1],untouched); assert.equal(state.dailyDigests[0].headline,oldTitle);
});

test('repair refuses OG-only or ambiguous H1 evidence before changing stored copy', async t => {
  const { repair } = require('../../scripts/repair-openrouter-titles');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'title-h1-repair-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const dbPath=path.join(dir,'db.json');
  const original=JSON.stringify({items:[{id:'item-h1',sourceId:'openrouter-announcements',url:'https://openrouter.ai/blog/h1',title:'Actual launchCard',reason:'Actual launchCard'}]});
  await fs.writeFile(dbPath,original);
  for(const html of ['<meta property="og:title" content="Actual launch">','<h1>Actual launch</h1><h1>Other</h1>']) {
    await assert.rejects(repair({dbPath,apply:true,fetchPage:async()=>html}),error=>error.code==='NO_TITLE_EVIDENCE');
    assert.equal(await fs.readFile(dbPath,'utf8'),original);
  }
});
