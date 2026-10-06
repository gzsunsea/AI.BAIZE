const assert = require('node:assert/strict');
const test = require('node:test');
const enhancer = require('./llmEnhancer');
const store = require('./store');

async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

test('background enhancement continues after a batch without waiting for another collection', async (t) => {
 const previousAsync = process.env.LLM_ENHANCE_ASYNC, previousInterval = process.env.LLM_ENHANCE_INTERVAL_MS;
 const modulePath = require.resolve('../jobs/refresh');
 t.after(() => { delete require.cache[modulePath]; if (previousAsync === undefined) delete process.env.LLM_ENHANCE_ASYNC; else process.env.LLM_ENHANCE_ASYNC = previousAsync; if (previousInterval === undefined) delete process.env.LLM_ENHANCE_INTERVAL_MS; else process.env.LLM_ENHANCE_INTERVAL_MS = previousInterval; });
 process.env.LLM_ENHANCE_ASYNC = '1'; process.env.LLM_ENHANCE_INTERVAL_MS = '1000';
 t.mock.timers.enable({ apis: ['setTimeout'] });
 let calls = 0;
 t.mock.method(enhancer, 'enhanceRecentItems', async () => { calls++; return { enhanced: 2, failed: 0, applied: 2 }; });
 t.mock.method(store, 'recordRun', () => {});
 delete require.cache[modulePath]; const { scheduleEnhancement } = require('../jobs/refresh');
 assert.equal(scheduleEnhancement(2).scheduled, true); await settle(); assert.equal(calls, 1);
 t.mock.timers.tick(1000); await settle(); assert.equal(calls, 2);
 process.env.LLM_ENHANCE_ASYNC = '0'; t.mock.timers.tick(1000); await settle(); assert.equal(calls, 2);
});

test('collection cannot overlap or duplicate the pending background batch', async (t) => {
 const previous = process.env.LLM_ENHANCE_ASYNC, modulePath = require.resolve('../jobs/refresh');
 t.after(() => { delete require.cache[modulePath]; if (previous === undefined) delete process.env.LLM_ENHANCE_ASYNC; else process.env.LLM_ENHANCE_ASYNC = previous; });
 process.env.LLM_ENHANCE_ASYNC = '1'; t.mock.timers.enable({ apis: ['setTimeout'] });
 let finish, calls = 0;
 t.mock.method(enhancer, 'enhanceRecentItems', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
 t.mock.method(store, 'recordRun', () => {});
 delete require.cache[modulePath]; const { scheduleEnhancement } = require('../jobs/refresh');
 scheduleEnhancement(2); assert.equal(scheduleEnhancement(2).reason, 'enhancement_in_progress'); assert.equal(calls, 1);
 finish({ enhanced: 2, failed: 0, applied: 2 }); await settle();
 process.env.LLM_ENHANCE_ASYNC = '0';
});
