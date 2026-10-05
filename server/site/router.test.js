const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {createSiteRouter} = require('./router');
test('news images retain their source association in public cards and summary details',async()=>{
 const item={id:'photo',title:'AI model update',summary:'官方发布了新的模型接口。',reason:'原文提供了接口兼容范围和迁移步骤。',publishedAt:new Date().toISOString(),url:'https://example.com/blog/model',sourceName:'Official',media:[{url:'https://example.com/model.png',type:'image',alt:'模型架构图',sourceUrl:'https://example.com/blog/model',origin:'article'},{url:'https://example.com/movie.mp4',type:'video'},{url:'https://example.com/unknown-related.png',type:'image'}]};
 const state={items:[item]};const app=express();app.use(createSiteRouter({readState:()=>state,publicItems:()=>state.items,publicHotTopics:()=>({items:[]})}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;const cards=await(await fetch(base+'/api/site/timeline')).json();assert.equal(cards.cards[0].item.media.length,1);assert.match(cards.cards[0].item.media[0].url,/^\/api\/media\?url=/);assert.equal(cards.cards[0].item.media[0].alt,'模型架构图');const detail=await(await fetch(base+'/api/site/items/photo')).json();assert.deepEqual(detail.media,cards.cards[0].item.media);assert.equal(detail.reason,item.reason);assert.equal(detail.body,null);}finally{await new Promise(r=>server.close(r));}
});
test('health distinguishes disabled collection from a healthy page service', async()=>{
 const previous=process.env.COLLECT_ENABLED;
 const state={settings:{cron:'*/30 * * * *',refreshedAt:'2026-10-05T08:30:57.823Z'}};
 const app=express();app.use(createSiteRouter({readState:()=>state}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try {
  const url=`http://127.0.0.1:${server.address().port}/api/health`;
  process.env.COLLECT_ENABLED='false';
  const disabled=await(await fetch(url)).json();
  assert.equal(disabled.ok,true);
  assert.deepEqual(disabled.collection,{enabled:false,cron:'*/30 * * * *',refreshedAt:state.settings.refreshedAt});
  process.env.COLLECT_ENABLED='true';
  const enabled=await(await fetch(url)).json();assert.equal(enabled.collection.enabled,true);
  delete process.env.COLLECT_ENABLED;
  assert.equal((await(await fetch(url)).json()).collection.enabled,true);
 }finally{if(previous===undefined)delete process.env.COLLECT_ENABLED;else process.env.COLLECT_ENABLED=previous;await new Promise(r=>server.close(r));}
});
test('site timeline exposes safe projections, validates cursors and keeps pagination stable', async()=>{
 const now = new Date().toISOString();
 const state={items:[{id:'a',title:'OpenAI 模型发布',summary:'摘要',url:'https://openai.com/a',publishedAt:now,score:90,sourceName:'OpenAI',raw:{secret:'private'}}],sources:[],daily:[]};
 const app=express();app.use(createSiteRouter({readState:()=>state,publicItems:()=>state.items,publicHotTopics:()=>({items:[]}),publicStoryDetail:()=>null,publicReport:()=>null}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try {const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/api/site/timeline');assert.equal(response.status,200);const data=await response.json();assert.equal(data.cards[0].item.id,'a');assert.equal(data.cards[0].item.raw,undefined);assert.equal(data.nextCursor,null);
 assert.equal((await fetch(base+'/api/site/timeline?cursor=bad')).status,400);
 assert.equal((await fetch(base+'/api/site/items/missing')).status,404);
 const empty=await (await fetch(base+'/api/site/reports/daily/latest-page')).json();assert.equal(empty.report,null);
 }finally{await new Promise(r=>server.close(r));}
});
test('timeline cursor survives inserted and removed heads and rejects unrelated filters',async()=>{
 const stamp=n=>new Date(Date.UTC(2026,8,1,0,n)).toISOString();
 const state={items:Array.from({length:65},(_,n)=>({id:`id-${String(n).padStart(2,'0')}`,title:'OpenAI',url:`https://openai.com/${n}`,publishedAt:stamp(100-n),sourceName:'OpenAI',score:90})),sources:[]};
 const app=express();app.use(createSiteRouter({readState:()=>state,publicItems:()=>state.items,publicHotTopics:()=>({items:[]}),publicStoryDetail:()=>null,publicReport:()=>null}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{const first=await(await fetch(base+'/api/site/timeline')).json();state.items.unshift({...state.items[0],id:'new-head',publishedAt:stamp(110)});state.items=state.items.filter(i=>i.id!=='id-00');const second=await(await fetch(base+`/api/site/timeline?cursor=${first.nextCursor}`)).json();assert.equal(second.cards[0].item.id,'id-30');assert.equal(second.cards.length,30);assert.equal((await fetch(base+`/api/site/timeline?category=paper&cursor=${first.nextCursor}`)).status,400);}finally{await new Promise(r=>server.close(r))}
});
test('report construction is scoped to period and reused until public state changes',async()=>{
 const rows=[{id:'oct',title:'Oct',url:'https://example.com/oct',publishedAt:'2026-10-01T08:00:00Z'},{id:'sep',title:'Sep',url:'https://example.com/sep',publishedAt:'2026-09-01T08:00:00Z'}];
 const state={items:rows,dailyDigests:[]};let calls=0;let observed=[];
 const app=express();app.use(createSiteRouter({readState:()=>structuredClone(state),publicItems:(_q,s)=>s.items.filter(i=>!i.hidden),publicReport:(q,s)=>{calls++;observed.push(s.items.map(i=>i.id));return {headline:'Report',range:{end:q.date},sections:[{title:'News',items:s.items}]};},publicHotTopics:()=>({items:[]})}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{const first=await(await fetch(base+'/api/site/reports/monthly/latest-page')).json();assert.equal(first.report.metrics.totalStories,1);assert.deepEqual(observed,[['oct'],['sep']]);assert.equal(calls,2);await fetch(base+'/api/site/reports/monthly/latest-page');assert.equal(calls,2);rows[0].hidden=true;const removed=await(await fetch(base+'/api/site/reports/monthly/latest-page')).json();assert.equal(removed.index[0].key,'2026-09');assert.equal(removed.report.highlights[0].itemId,'sep');assert.ok(calls>2);}finally{await new Promise(r=>server.close(r));}
});
