const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {createSiteRouter} = require('./router');
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
