const test=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');
const {app,itemsResponse}=require('./index');const {enrichItem,mpMetrics}=require('./lib/editorial');
const row=extra=>({id:'item-public',title:'OpenAI model API launch',summary:'Public summary',url:'https://openai.com/news/model',sourceName:'OpenAI',sourceKind:'rss',sourceId:'openai-news',priorityTier:'official_first_party',publishedAt:new Date().toISOString(),score:95,tags:['模型发布'],raw:{secret:'private-fixture'},hidden:false,pinned:true,...extra});
const state=()=>({items:[row(),row({id:'item-hidden',hidden:true})],clusters:[],sources:[],mpArticles:[],dailyDigests:[],settings:{rules:{selectedThreshold:72}}});
test('legacy item list serializes public fields and omits hidden and internal material',()=>{
 const items=itemsResponse({mode:'all'},state()).items;assert.deepEqual(items.map(i=>i.id),['item-public']);for(const key of ['raw','hidden','pinned','sourceId','priorityTier'])assert.equal(Object.hasOwn(items[0],key),false,key);
});
test('unknown popularity is null, zero is observed zero, and proven metrics are never weighted',()=>{
 assert.equal(enrichItem(row()).mpMetrics,null);
 assert.equal(mpMetrics(row({mpMetrics:{reads:999999,likes:8888}})),null,'legacy estimates are not observed evidence');
 assert.deepEqual(mpMetrics(row({reads:0,likes:10,shares:null,metricsSource:'publisher'})),{estimated:false,reads:0,likes:10,shares:null,abnormal:null});
});
test('anonymous legacy and public reads share safe visibility and null popularity',async t=>{
 const previous=app.locals.readState;app.locals.readState=()=>state();const server=app.listen(0,'127.0.0.1');t.after(()=>{app.locals.readState=previous;server.close();});await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ['/api/items?mode=all','/api/public/items?mode=all']){const res=await fetch(base+route);assert.equal(res.status,200);const body=await res.json();assert.deepEqual(body.items.map(i=>i.id),['item-public']);assert.equal(body.items[0].mpMetrics,null);assert.equal(JSON.stringify(body).includes('private-fixture'),false);}
});

test('daily snapshots cannot replay withdrawn or private item fields through legacy/public archives',async t=>{
 const fixture=state();const good=fixture.items[0],hidden=fixture.items[1];fixture.dailyDigests=[{id:'daily-test',generatedAt:new Date().toISOString(),headline:'Fixture headline',summary:'Fixture summary',privateSentinel:'private-fixture',items:[good,hidden],sections:[{key:'model',title:'Models',items:[good,hidden]}]}];
 const previous=app.locals.readState;app.locals.readState=()=>fixture;const server=app.listen(0,'127.0.0.1');t.after(()=>{app.locals.readState=previous;server.close();});await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ['/api/daily','/api/public/daily','/api/public/dailies']){const body=await(await fetch(base+route)).json();const text=JSON.stringify(body);assert.equal(text.includes('private-fixture'),false,route);assert.equal(text.includes('item-hidden'),false,route);assert.ok(text.includes('item-public'),route);}
});

test('public MP pool preserves explicit observed counts without weighting or leaking source internals',async t=>{
 const fixture=state();fixture.items=[row({sourceName:'IT之家',priorityTier:'cn_media',metricsSource:'publisher',reads:1200,likes:0,shares:null})];
 const previous=app.locals.readState;app.locals.readState=()=>fixture;const server=app.listen(0,'127.0.0.1');t.after(()=>{app.locals.readState=previous;server.close();});await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 const body=await(await fetch(base+'/api/mp')).json();assert.equal(body.items.length,1);assert.deepEqual(body.items[0].mpMetrics,{estimated:false,reads:1200,likes:0,shares:null,abnormal:null});assert.equal(JSON.stringify(body).includes('private-fixture'),false);assert.equal(Object.hasOwn(body.items[0],'mpMeta'),false);
});

test('public stats and source directory do not return runtime internals or withdrawn IDs',async t=>{
 const fixture=state();fixture.runs=[{secret:'private-fixture'}];fixture.clusters=[{id:'cluster-test',items:['item-public','item-hidden'],privateSentinel:'private-fixture'}];fixture.sources=[{id:'source-public',name:'OpenAI',kind:'rss',enabled:true,config:{token:'private-fixture'},health:{ok:false,error:'private-fixture'}}];
 const previous=app.locals.readState;app.locals.readState=()=>fixture;const server=app.listen(0,'127.0.0.1');t.after(()=>{app.locals.readState=previous;server.close();});await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 for(const route of ['/api/stats','/api/sources']){const body=await(await fetch(base+route)).json();if(route==='/api/stats')assert.equal(body.total,1);else assert.deepEqual(body.map(s=>s.id),['source-public']);const text=JSON.stringify(body);assert.equal(text.includes('private-fixture'),false,route);assert.equal(text.includes('item-hidden'),false,route);}
});
