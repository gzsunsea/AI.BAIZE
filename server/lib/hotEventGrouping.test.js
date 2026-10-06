const test = require('node:test');
const assert = require('node:assert/strict');
const { eventClusters } = require('./dedupe');
const { buildHotTopics } = require('./experience');

const now = '2026-10-06T09:00:00Z';
function report(id, title, sourceName, summary = '', publishedAt = '2026-10-05T15:00:00Z') {
  return { id, title, summary, sourceName, sourceId: sourceName, url: `https://example.com/${id}`, publishedAt, score: 88, priorityTier: 'cn_media', tags: ['产品更新'], raw: { title, summary } };
}
const watermark = [
  report('official', 'Our approach to EU text provenance rules', 'OpenAI News', 'How OpenAI is approaching text watermarking under EU rules.'),
  report('media', 'OpenAI 将在欧盟为 ChatGPT 和 Codex 文本输出添加隐形水印', 'IT之家 AI'),
];

test('hot groups the same text watermark announcement across Chinese and English titles, even before refresh', () => {
  const result = buildHotTopics({ items: watermark, clusters: [] }, { now });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceCount, 2);
  assert.deepEqual(result.items[0].relatedItems.map(i => i.id).sort(), ['media', 'official']);
  assert.equal(result.candidates.some(i => ['media', 'official'].includes(i.id)), false);
});

test('collection groups a reset campaign with different headlines without deleting the reports', () => {
  const items = [
    report('a', 'OpenAI 宣布“28 天计划”：Codex、Work 日进一步或“重置”', 'IT之家 AI'),
    report('b', '限时28天！OpenAI承诺没新功能就重置，网友：只想要Opus', '量子位'),
  ];
  const result = eventClusters(items);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].items.sort(), ['a', 'b']);
  assert.equal(new Set(result[0].sources).size, 2);
  assert.deepEqual(items.map(i => i.id), ['a', 'b']);
});

test('event grouping excludes unrelated watermarks, different regions and reset campaigns', () => {
  const unrelated = [
    report('image', 'OpenAI 为欧盟图片添加水印', 'Other'),
    report('us', 'OpenAI 在美国推出文本水印', 'Other'),
    report('trial', 'OpenAI 推出 28 天免费试用', 'Other'),
    report('reset', 'OpenAI 将在 14 天内改进功能否则重置', 'Other'),
    report('roundup', 'OpenAI 宣布28天计划否则重置；TikTok 上线 AI 电商', 'Other'),
    report('version1', 'Claude Code Releases v2.1.290', 'Other'),
    report('version2', 'Claude Code Releases v2.1.291', 'Other'),
  ];
  const campaign = report('campaign', 'OpenAI 宣布28天计划：每天改进否则重置', 'IT之家 AI');
  const result = buildHotTopics({ items: [...watermark, campaign, ...unrelated], clusters: [] }, { now });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].relatedItems.map(i => i.id).sort(), ['media', 'official']);
});

test('event grouping requires reports within 72 hours and counts repeated publisher only once', () => {
  assert.equal(eventClusters([watermark[0], { ...watermark[1], publishedAt: '2026-10-01T15:00:00Z' }]).length, 0);
  const sameSource = watermark.map(i => ({ ...i, sourceName: 'OpenAI News', sourceId: 'OpenAI News' }));
  assert.equal(buildHotTopics({ items: sameSource, clusters: [] }, { now }).items.length, 0);
  assert.equal(buildHotTopics({ items: [watermark[0], { ...watermark[1], hidden: true }], clusters: [] }, { now }).items.length, 0);
});

test('a stale persisted announcement cannot supply a second source to a fresh report', () => {
  const items = [watermark[0], { ...watermark[1], publishedAt: '2026-10-03T08:59:00Z' }];
  const clusters = eventClusters(items);
  assert.equal(clusters.length, 1);
  assert.equal(buildHotTopics({ items, clusters }, { now }).items.length, 0);
});
