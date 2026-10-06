// Real SSR route with controlled API data: candidates must survive an empty event ranking.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let origin: string, web: ChildProcess, logs = '';
let candidates: object[] = [{ id: 'candidate-one', title: 'OpenAI 模型接口更新', summary: '接口更新包含新的工具调用方式。', source: { name: 'OpenAI News' }, publishedAt: '2026-10-06T01:00:00Z', timelineAt: '2026-10-06T01:00:00Z', score: 90 }];
const api = createServer((req,res) => {
  res.setHeader('Content-Type','application/json');
  if (req.url === '/api/site/meta') return res.end(JSON.stringify({changelogVersion:'test'}));
  if (req.url === '/api/site/hot') return res.end(JSON.stringify({computedAt:'2026-10-06T02:00:00Z',windowHours:72,availability:candidates.length?'candidate':'empty',entries:[],candidates}));
  res.statusCode = 404; res.end('{}');
});
before(async()=>{
  api.listen(0,'127.0.0.1'); await once(api,'listening');
  web = spawn(process.execPath,[fileURLToPath(new URL('../server.ts',import.meta.url))],{env:{...process.env,WEB_PORT:'0',API_BASE_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`},stdio:['ignore','pipe','pipe']});
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(logs)),15000);
    web.stderr!.on('data',chunk=>{logs+=String(chunk)});
    web.on('exit',()=>{clearTimeout(timeout);reject(new Error(logs))});
    web.stdout!.on('data',chunk=>{logs+=String(chunk);const match=logs.match(/"msg":"web started","port":(\d+)/);if(match){origin=`http://127.0.0.1:${match[1]}`;clearTimeout(timeout);resolve()}});
  });
});
after(async()=>{if(web&&web.exitCode===null){web.kill('SIGTERM');await once(web,'exit')}api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()))});
test('empty multi-source ranking still shows explicitly single-source candidates with article links and score label',async()=>{
  const response=await fetch(`${origin}/hot`);assert.equal(response.status,200,logs);const html=await response.text();
  assert.match(html,/热点候选/);assert.match(html,/单一来源/);assert.match(html,/精选分/);
  assert.match(html,/href="\/items\/candidate-one"/);
  assert.match(html,/尚未形成多来源热点/);assert.doesNotMatch(html,/暂时没有热点/);
  assert.doesNotMatch(html,/\/story\/candidate-one/);
});
test('genuinely empty ranking retains the honest empty state',async()=>{
  candidates=[];const html=await(await fetch(`${origin}/hot`)).text();
  assert.match(html,/暂时没有热点/);assert.doesNotMatch(html,/aria-label="热点候选"/);
});
