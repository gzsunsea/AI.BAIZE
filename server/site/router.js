const express=require('express');
const p=require('./projections');
const changelog=require('../../site/changelog.json');
const path=require('node:path');
const crypto=require('node:crypto');
function createSiteRouter(backend){
 const router=express.Router();
 const readState=()=>p.withItemIndex(backend.readState());
 let reportCache;
 const requestCaches=new WeakMap();
 function cachedReports(state){
  if(requestCaches.has(state))return requestCaches.get(state);
  // Reuse only identical data; withdrawals/edits invalidate on the next request, never a TTL delay.
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  if(!reportCache||reportCache.fingerprint!==fingerprint||Date.now()-reportCache.at>60_000)reportCache={fingerprint,at:Date.now(),indices:new Map(),reports:new Map(),groups:new Map()};
  requestCaches.set(state,reportCache);return reportCache;
 }
 function periodReport(state,kind,key){
  const cache=cachedReports(state),identity=`${kind}:${key}`;
  if(!cache.reports.has(identity)){
   let groups=cache.groups.get(kind);
   if(!groups){groups=new Map();const invalid=[];for(const item of state.items||[]){const at=p.dateOrNull(item.publishedAt);if(!at){if(item.publishedAt&& !Number.isFinite(Date.parse(item.publishedAt)))invalid.push(item);continue;}const period=p.reportKey(kind,p.dayKey(at));if(!groups.has(period))groups.set(period,[]);groups.get(period).push(item);}groups.invalid=invalid;cache.groups.set(kind,groups);}
   // Virtual daily digests inspect only their actual report period. Invalid legacy timestamps
   // remain in scope because the old digest comparisons also retained NaN values.
   const scoped={...state,items:[...(groups.get(key)||[]),...groups.invalid]};
   cache.reports.set(identity,backend.publicReport({period:kind,date:p.reportAnchor(kind,key)},scoped));
  }
  return cache.reports.get(identity);
 }
 router.get('/logo.svg',(_req,res)=>res.sendFile(path.resolve(__dirname,'../../site/brand/logo.svg')));
 router.get('/manifest.webmanifest',(_req,res)=>res.type('application/manifest+json').sendFile(path.resolve(__dirname,'../../site/public/manifest.webmanifest')));
 router.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/admin/\nSitemap: https://www.aibaize.cc/sitemap.xml\n'));
 router.get('/openapi-v1.json',(_req,res)=>res.redirect(308,'/openapi.json'));
 router.get('/llms.txt',(_req,res)=>res.type('text/plain').send('# AI.BAIZE\n\nAI 行业动态聚合摘要与原文索引。\n\n- 官网：https://www.aibaize.cc/\n- 精选：/api/public/items?mode=selected\n- 全部动态：/api/public/items?mode=all\n- 文章摘要：/api/public/items/:id\n- 热点：/api/public/hot\n- 事件：/api/public/stories/:id\n- 报告：/api/public/reports?period=daily\n- RSS：/feed.xml\n- 接口定义：/openapi.json\n\n缺失数据不是零；原文版权归来源方，本站默认提供摘要和来源链接。\n'));
 router.get('/api/v1/agent',(_req,res)=>res.json({name:'AI.BAIZE',readOnly:true,authentication:'none',items:'/api/public/items',item:'/api/public/items/:id',hot:'/api/public/hot',story:'/api/public/stories/:id',reports:'/api/public/reports',rss:'/feed.xml',openapi:'/openapi.json',mcpEnabled:process.env.MCP_ENABLED==='true',mcpPath:process.env.MCP_ENABLED==='true'?'/mcp':null}));
 const selected=state=>new Set(backend.publicItems({mode:'selected'},state).map(i=>i.id));
 const hydrate=(items,state)=>{const raw=new Map((state.items||[]).map(i=>[i.id,i]));return items.map(i=>raw.get(i.id)||i);};
 const publicRows=(state,mode='all')=>hydrate(backend.publicItems({mode},state),state);
 const publicItem=(state,id)=>backend.publicItemDetail?(backend.publicItemDetail(state,id)?(state.items||[]).find(i=>i.id===id):null):publicRows(state).find(i=>i.id===id);
 function listing(req,state,mode){
  const channel=['all','news','x','firstParty'].includes(req.query.channel)?req.query.channel:'all';
  const categories=['ai-models','ai-products','industry','paper','tip','opinion'];
  const category=channel==='firstParty'?null:(categories.includes(req.query.category)?req.query.category:null);
  const tag=typeof req.query.tag==='string'?req.query.tag.slice(0,100):null;
  const ids=selected(state);
  const q=String(req.query.q||'').trim().slice(0,300);
  const items=publicRows(state,mode).map(i=>p.projectItem(i,ids,state)).filter(Boolean).filter(i=>Number.isFinite(Date.parse(i.timelineAt))&&(channel==='all'||(channel==='firstParty'?p.firstParty((state.items||[]).find(a=>a.id===i.id)||{}):i.channel===channel))&&(!category||i.category===category)&&(!tag||i.tags.includes(tag))&&(!q||`${i.title} ${i.summary||''} ${i.reason||''} ${i.tags.join(' ')} ${i.source.name}`.toLowerCase().includes(q.toLowerCase())));
  const rank=i=>[[i.title,8],[i.summary,6],[i.reason,5],[i.source.name,3],[i.tags.join(' '),3]].reduce((sum,[value,weight])=>sum+(String(value||'').toLowerCase().includes(q.toLowerCase())?weight:0),0);
  items.sort((a,b)=>(q&&req.query.tab==='relevance'?rank(b)-rank(a):0)||Date.parse(b.timelineAt)-Date.parse(a.timelineAt)||a.id.localeCompare(b.id));
  return {items,filters:{channel,category,tag},q};
 }
 router.get('/api/health',(_req,res)=>{
  const settings=backend.readState().settings||{};
  res.set('Cache-Control','no-store').json({ok:true,release:process.env.RELEASE_ID||'aibaize-rebuild-local',collection:{enabled:process.env.COLLECT_ENABLED!=='false',cron:settings.cron||'*/30 * * * *',refreshedAt:settings.refreshedAt||null}});
 });
 router.get('/api/site/meta',(_req,res)=>res.json({changelogVersion:changelog.latestVersion}));
 router.get('/api/site/changelog',(_req,res)=>res.json(changelog));
 router.get('/api/site/contact',(_req,res)=>res.json({wechatQr:null,feishuQr:null,makerAvatar:null}));
 router.get('/api/site/timeline',(req,res)=>{
  const state=readState();const {items,filters}=listing(req,state,'selected');
  const binding=crypto.createHash('sha256').update(JSON.stringify(filters)).digest('hex');let anchor=null;
  if(req.query.cursor){try{if(String(req.query.cursor).length>1000)throw Error();anchor=JSON.parse(Buffer.from(String(req.query.cursor),'base64url').toString());if(anchor.binding!==binding||typeof anchor.id!=='string'||anchor.id.length>200||!Number.isFinite(Date.parse(anchor.at)))throw Error();}catch{return res.status(400).json({error:'无效分页游标'});}}
  const dayCounts={};for(const i of items){const day=p.dayKey(i.timelineAt);dayCounts[day]=(dayCounts[day]||0)+1;}
  const remaining=anchor?items.filter(i=>Date.parse(i.timelineAt)<Date.parse(anchor.at)||(Date.parse(i.timelineAt)===Date.parse(anchor.at)&&i.id.localeCompare(anchor.id)>0)):items;const batch=remaining.slice(0,30);const last=batch.at(-1);const hot=p.projectHot(backend.publicHotTopics(state)).entries.slice(0,6).map(e=>({rank:e.rank,title:e.story.title,heat:e.heat,trend:e.trend,storyPublicId:e.story.publicId,itemId:null,participants:e.participants,participantCount:e.participantCount}));
  res.json({filters,cards:batch.map(i=>({key:i.id,anchorAt:i.timelineAt,item:i,group:null})),nextCursor:remaining.length>30?Buffer.from(JSON.stringify({binding,id:last.id,at:last.timelineAt})).toString('base64url'):null,dayCounts,hot});
 });
 router.get('/api/site/pool',(req,res)=>{
  const {items,filters,q}=listing(req,readState(),'all');const page=Math.max(1,Math.min(10000,parseInt(req.query.page,10)||1));
  res.json({filters:{...filters,q:q||null,tab:req.query.tab==='relevance'?'relevance':'time'},items:items.slice((page-1)*40,page*40),page,pageCount:Math.max(1,Math.ceil(items.length/40)),total:items.length,todayCount:items.filter(i=>p.dayKey(i.timelineAt)===p.dayKey(Date.now())).length,freshness:new Date().toISOString()});
 });
 router.get('/api/site/items/availability',(req,res)=>{
  const state=readState();res.json(Object.fromEntries(String(req.query.ids||'').split(',').filter(Boolean).slice(0,200).map(id=>{const item=publicItem(state,id);return [id,item?{status:'summary-only',sourceName:item.sourceName}:{status:'unavailable'}];})));
 });
 router.get('/items/:id/markdown',(req,res)=>{
  const state=readState(),item=publicItem(state,req.params.id);const view=item&&p.projectDetail(item,selected(state),state);
  if(!view)return res.status(404).type('text/plain').send('内容不可用');
  const escape=s=>String(s||'').replace(/[\\`*_\[\]<>]/g,'\\$&');
  res.type('text/markdown').send(`# ${escape(view.title)}\n\n${escape(view.summary)}\n\n来源：${escape(view.source.name)}\n原文：${view.links.original}\n\n本站提供摘要与原文索引。\n`);
 });
 router.get(['/api/site/items/:id','/api/site/items/:id/original'],(req,res)=>{
  const state=readState();const item=publicItem(state,req.params.id);
  if(!item)return res.status(404).json({error:'内容不可用'});const detail=p.projectDetail(item,selected(state),state);if(!detail)return res.status(404).json({error:'内容日期不可用'});res.json(detail);
 });
 router.get('/api/site/hot',(_req,res)=>{const state=readState();res.json(p.projectHot(backend.publicHotTopics(state),state));});
 router.get('/api/site/stories/:id/followups',(req,res)=>{
  const state=readState();if(!backend.publicStoryDetail(state,req.params.id))return res.status(404).json({error:'事件不可用'});res.json({items:[],more:false});
 });
 router.get('/api/site/stories/:id',(req,res)=>{const state=readState();const story=backend.publicStoryDetail(state,req.params.id);if(!story)return res.status(404).json({error:'事件不可用'});res.json(p.projectStory(story,selected(state),state));});
 router.get('/api/site/topics',(_req,res)=>{const state=readState();res.json(p.projectTopics(publicRows(state),selected(state),state));});
 router.get('/api/site/topics/:slug',(req,res)=>{
  const state=readState();const all=publicRows(state);const ids=selected(state);const catalog=p.projectTopics(all,ids,state);const topic=catalog.topics.find(t=>t.slug===req.params.slug);if(!topic)return res.status(404).json({error:'专题不存在'});
  const matches=all.filter(i=>p.topicMatches(i).some(t=>t.slug===topic.slug));const items=matches.filter(i=>ids.has(i.id)).map(i=>p.projectItem(i,ids,state)).filter(Boolean).filter(i=>Number.isFinite(Date.parse(i.timelineAt))).sort((a,b)=>Date.parse(b.timelineAt)-Date.parse(a.timelineAt));const page=Math.max(1,parseInt(req.query.page,10)||1);
  res.json({topic:{...topic,groupName:catalog.groups.find(g=>g.key===topic.group)?.name||'',poolTotal:matches.length},modules:{},items:items.slice((page-1)*30,page*30),page,pageCount:Math.max(1,Math.ceil(items.length/30)),pageSize:30});
 });
 function reports(state,kind){
  const cache=cachedReports(state);if(cache.indices.has(kind))return cache.indices.get(kind);
  const stored=new Set((state.dailyDigests||[]).filter(d=>Number.isFinite(Date.parse(d.generatedAt))).map(d=>p.reportKey(kind,p.dayKey(d.generatedAt))));
  const keys=[...new Set([...stored,...publicRows(state).map(i=>p.dateOrNull(i.timelineAt)||p.dateOrNull(i.publishedAt)||p.dateOrNull(i.discoveredAt)||p.dateOrNull(i.createdAt)).filter(at=>Number.isFinite(Date.parse(at))).map(at=>p.reportKey(kind,p.dayKey(at)))])].sort().reverse();
  const rows=keys.map(key=>{const report=periodReport(state,kind,key);const projected=report&&p.projectReport(report,kind,key,[],state);return {key,title:projected?.title||null,count:projected?.metrics[kind==='daily'?'totalEvents':'totalStories']||0};}).filter(i=>i.count>0||stored.has(i.key));
  const index=rows.map((row,n)=>({...row,issueNumber:rows.length-n}));cache.indices.set(kind,index);return index;
 }
 router.get('/api/site/reports/:kind/latest-page',(req,res)=>{
  if(!['daily','weekly','monthly'].includes(req.params.kind))return res.status(404).json({error:'报告类型不存在'});
  const state=readState();const index=reports(state,req.params.kind);const key=index[0]?.key;
  res.json({index,report:key?p.projectReport(periodReport(state,req.params.kind,key),req.params.kind,key,index,state):null});
 });
 router.get(['/api/site/reports/:kind/navigation/:key','/api/site/reports/daily/months/:key'],(req,res)=>{const kind=req.params.kind||'daily';if(!['daily','weekly','monthly'].includes(kind))return res.status(404).json({error:'报告类型不存在'});let items=reports(readState(),kind);if(req.path.includes('/months/'))items=items.filter(i=>i.key.startsWith(req.params.key));res.json({items});});
 router.get('/api/site/reports/:kind/:key',(req,res)=>{
  const {kind,key}=req.params;if(!['daily','weekly','monthly'].includes(kind)||!p.reportAnchor(kind,key))return res.status(404).json({error:'报告不存在'});const state=readState();const index=reports(state,kind);if(!index.some(i=>i.key===key))return res.status(404).json({error:'报告不存在'});res.json(p.projectReport(periodReport(state,kind,key),kind,key,index,state));
 });
 router.get('/api/site/reports/:kind',(req,res)=>{const kind=req.params.kind;if(!['daily','weekly','monthly'].includes(kind))return res.status(404).json({error:'报告类型不存在'});res.json({kind,items:reports(readState(),kind)});});
 const xml=value=>String(value||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
 router.get('/sitemap.xml',(_req,res)=>{
  const state=readState();const urls=['/','/all','/hot','/daily','/weekly','/monthly','/topics','/about','/agent',...publicRows(state).map(i=>`/items/${encodeURIComponent(i.id)}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url=>`<url><loc>${xml('https://www.aibaize.cc'+url)}</loc></url>`).join('')}</urlset>`);
 });
 router.get(['/rss','/rss.xml','/atom.xml'],(req,res)=>res.redirect(308,`/feed.xml${req.originalUrl.includes('?')?'?'+req.originalUrl.split('?')[1]:''}`));
 router.get('/feed/:kind.xml',(req,res)=>{
  const kind=req.params.kind;if(!['daily','weekly','monthly'].includes(kind))return res.status(404).end();const state=readState(),index=reports(state,kind).slice(0,10);
  const rows=index.map(entry=>{const report=p.projectReport(periodReport(state,kind,entry.key),kind,entry.key,index,state);const contents=report.sections.map(section=>`<h2>${xml(section.label)}</h2><ul>${section.items.filter(i=>i.available).map(i=>`<li><a href="https://www.aibaize.cc/items/${encodeURIComponent(i.itemId)}">${xml(i.title)}</a></li>`).join('')}</ul>`).join('');return `<item><title>${xml(report.title)}</title><link>https://www.aibaize.cc/${kind}/${xml(entry.key)}</link><guid>https://www.aibaize.cc/${kind}/${xml(entry.key)}</guid><description>${xml(contents)}</description></item>`;});
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AI.BAIZE ${xml(kind)}</title><link>https://www.aibaize.cc/${kind}</link><description>本站采集记录汇总</description>${rows.join('')}</channel></rss>`);
 });
 router.get('/api/site/stats',(_req,res)=>{
  const state=readState();const items=publicRows(state);const ids=selected(state);const sources=(state.sources||[]).filter(s=>s.enabled!==false);const sourceKinds={};for(const s of sources)sourceKinds[s.kind]=(sourceKinds[s.kind]||0)+1;
  const recent=i=>Date.now()-Date.parse(p.projectItem(i,new Set(),state)?.timelineAt)<864e5;
  res.json({sources:sources.length,sourceKinds,items:items.length,selected:ids.size,dailies:reports(state,'daily').length,day:{collected:items.filter(recent).length,selected:items.filter(i=>ids.has(i.id)&&recent(i)).length},sampleSources:sources.map(s=>({name:s.name,kind:s.kind,heatOnly:false})),latest:items.filter(i=>ids.has(i.id)).slice(0,8).map(i=>({id:i.id,title:i.title,source:i.sourceName}))});
 });
 return router;
}
module.exports={createSiteRouter};
