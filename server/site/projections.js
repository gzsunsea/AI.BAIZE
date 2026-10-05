const { itemCategory, enrichItem } = require('../lib/editorial');
const { isPublicItem } = require('../lib/scoring');
const topics = require('../../industry/topics.json');
const { decodeHTML } = require('entities');
const text=value=>value==null?null:decodeHTML(String(value));
const CATEGORY = { model:'ai-models', product:'ai-products', industry:'industry', research:'paper', opinion:'opinion', opensource:'ai-products', education:'industry', culture:'industry' };
function dateOrNull(value) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
function dayKey(value) { return dayFormatter.format(new Date(value)); }
const ITEM_INDEX=Symbol('projection item index');
function withItemIndex(state) { return {...state,[ITEM_INDEX]:new Map((state.items||[]).map(item=>[item.id,item]))}; }
function firstParty(item) { return item.priorityTier === 'official_first_party'; }
function media(item) {
 return (item.media || []).filter(m=>/^https?:\/\//.test(m.url||'') && (m.type||m.kind||'image').includes('image')).slice(0,4).map(m=>({kind:'image',url:`/api/media?url=${encodeURIComponent(m.thumbnail || m.url)}`,fullUrl:`/api/media?url=${encodeURIComponent(m.url)}`,width:null,height:null,alt:m.alt||null,poster:null}));
}
// Hydrate only metadata intentionally omitted by the legacy public serializer.
function hydrate(item, state = {}) {
 const stored=state[ITEM_INDEX] ? state[ITEM_INDEX].get(item.id) : (state.items||[]).find(row=>row.id===item.id);
 return stored ? {...item, publishedAt:stored.publishedAt, discoveredAt:stored.discoveredAt, createdAt:stored.createdAt, originalTitle:stored.originalTitle, priorityTier:stored.priorityTier} : item;
}
function projectItem(item, selected = new Set(), state = {}) {
 item=hydrate(item,state);
 const decorated = enrichItem(item);
 const isX = /https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status\//i.exec(item.url||'');
 const publishedAt = dateOrNull(item.publishedAt);
 const timelineAt = dateOrNull(item.timelineAt) || publishedAt || dateOrNull(item.discoveredAt) || dateOrNull(item.createdAt);
 if (!timelineAt) return null;
 let category = CATEGORY[item.category || itemCategory(item)] || 'industry';
 if (category === 'opinion' && /教程|实践|tutorial|how.to/i.test([item.title,...(item.tags||[])].join(' '))) category='tip';
 return {id:String(item.id),title:text(decorated.title) || '',originalTitle:text(item.originalTitle),summary:text(decorated.summary)||null,reason:text(decorated.reason)||null,source:{name:text(item.sourceName)||'来源未注明'},links:{original:item.url},publishedAt,discoveredAt:dateOrNull(item.discoveredAt || item.createdAt),timelineAt,category,tags:item.tags||[],score:Number.isFinite(Number(item.score))?Number(item.score):null,selected:selected.has(item.id),channel:isX?'x':'news',story:null,x:isX?{authorName:text(item.author||item.sourceName)||isX[1],handle:isX[1],avatarUrl:null,media:media(item),quoted:null}:null};
}
function projectDetail(item,selected,state) {
 const view=projectItem(item,selected,state);
 if (!view) return null;
 // The old data store has no audited source full-text grant. Publish summary and original link only.
 return {...view,readingMode:'summary-only',author:item.author||null,body:null,outline:[],relatedStories:[],topics:topicMatches(item).map(t=>({slug:t.slug,name:t.name})),indexable:true,markdownAvailable:true,group:null,hasTranslation:false,bodyLanguage:'zh'};
}
function projectHot(result) {
 return {computedAt:result.generatedAt||null,windowHours:result.windowHours||72,entries:(result.items||[]).map(t=>({rank:t.rank,story:{publicId:t.id,title:t.title},heat:t.heat,trend:'unknown',trendPct:null,badges:[],participantCount:t.sourceCount,sourceCount:t.sourceCount,sourceNames:t.sources||[],participants:(t.sources||[]).map(name=>({name,kind:'editorial'})),spark:[],summary:t.summary||null,latest:t.relatedItems?.[0]?.title||null,cover:null}))};
}
function projectStory(story,selected = new Set(),state = {}) {
 const e=story.event,now=Date.now();
 const rows=(story.timeline||[]).flatMap(raw=>{
  const item=hydrate(raw,state),view=projectItem(item,selected);
  return view ? [{id:item.id,title:text(item.title),summary:text(item.summary)||null,source:{name:text(item.sourceName)||'来源未注明',firstParty:firstParty(item)},publishedAt:view.timelineAt,selected:selected.has(item.id)}] : [];
 }).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const latestAt=rows[0]?.publishedAt||null;
 const lifecycleAt=dateOrNull(e.lifecycle?.lastUpdatedAt)||latestAt;
 const age=lifecycleAt?now-Date.parse(lifecycleAt):Infinity;
 const status=e.lifecycle?.state==='stale'||age>=72*36e5?'settled':age>=24*36e5?'watching':'active';
 const inWindow=(r,h)=>{const age=now-Date.parse(r.publishedAt);return age>=0&&age<=h*36e5;};
 const firstSource=new Map();
 for(const r of rows) if(r.source.name!=='来源未注明') firstSource.set(r.source.name,Math.min(firstSource.get(r.source.name)??Infinity,Date.parse(r.publishedAt)));
 const known=rows.length>0&&rows.length===(story.timeline||[]).length&&firstSource.size>0;
 return {publicId:e.id,title:e.title,status,reportCount:rows.length,sourceCount:e.sourceCount??firstSource.size,firstReportAt:rows.at(-1)?.publishedAt||null,latestAt,digest:null,digestUpdatedAt:null,summary:null,excerpt:story.summary?{text:story.summary,sourceName:e.representative?.sourceName||'报道来源'}:null,latest:rows[0]?.title||null,latestReport:rows[0]?{id:rows[0].id}:null,whyHot:{participants48h:new Set(rows.filter(r=>inWindow(r,48)).map(r=>r.source.name)).size,newParticipants6h:known?[...firstSource.values()].filter(t=>t<=now&&now-t<=6*36e5).length:null,recentReports24h:rows.filter(r=>inWindow(r,24)).length,observationComplete:false,rank:e.rank||null},developments:[],officialReports:rows.filter(r=>r.source.firstParty),timeline:rows,heat:[],related:[],topics:topicMatches(e.representative||{}).map(t=>({slug:t.slug,name:t.name}))};
}
function topicMatches(item) {
 const text=[item.title,item.summary,...(item.tags||[])].join(' ').toLowerCase();
 const aliases={openai:['openai','chatgpt','gpt-'],anthropic:['anthropic','claude'],google:['google','gemini','deepmind'],deepseek:['deepseek','深度求索'],qwen:['qwen','千问','通义'],kimi:['kimi','月之暗面'],minimax:['minimax'],zhipu:['智谱','glm'],xai:['xai','grok'],meta:['meta','llama'],microsoft:['microsoft','微软','copilot'],nvidia:['nvidia','英伟达'], 'hugging-face':['hugging face'],cursor:['cursor'],openrouter:['openrouter']};
 return topics.topics.filter(t=>t.group==='company'?(aliases[t.slug]||[t.slug]).some(a=>text.includes(a)):(t.tags||[]).some(tag=>(item.tags||[]).includes(tag)));
}
function projectTopics(items,selected,state = {}) {
 items=items.filter(i=>projectItem(i,selected,state));
 return {groups:topics.groups,topics:topics.topics.map(t=>{
 const members=items.filter(i=>selected.has(i.id)&&topicMatches(i).some(m=>m.slug===t.slug)).sort((a,b)=>Date.parse(projectItem(b,selected,state).timelineAt)-Date.parse(projectItem(a,selected,state).timelineAt));
 return {...t,brand:t.group==='company'?{src:null,monogram:t.name[0],raster:false}:null,total:members.length,recent:members.filter(i=>Date.now()-Date.parse(projectItem(i,selected,state).timelineAt)<30*864e5).length,indexable:members.length>0,latest:members[0]?{title:members[0].title,at:projectItem(members[0],selected,state).timelineAt}:null};
 })};
}
function reportKey(kind,date) {
 if(kind==='monthly')return date.slice(0,7);if(kind==='daily')return date;
 const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const year=d.getUTCFullYear();const start=new Date(Date.UTC(year,0,1));const week=Math.ceil((((d-start)/864e5)+1)/7);return `${year}-W${String(week).padStart(2,'0')}`;
}
function reportAnchor(kind,key) {
 if(kind==='daily'){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;const d=new Date(`${key}T12:00:00Z`);return Number.isFinite(+d)&&d.toISOString().slice(0,10)===key?key:null;}
 if(kind==='monthly'){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))return null;return key+'-01';}
 if(!/^\d{4}-W\d{2}$/.test(key))return null;const year=Number(key.slice(0,4)),week=Number(key.slice(6));if(week<1||week>53)return null;const d=new Date(Date.UTC(year,0,4,12));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(week-1)*7);const anchor=d.toISOString().slice(0,10);return reportKey(kind,anchor)===key?anchor:null;
}
function projectReport(report,kind,key,index,state = {}) {
 const available=new Map((state.items||[]).filter(isPublicItem).map(i=>[i.id,i]));
 const citation=i=>{
  const current=available.get(i.id);
  if(!current)return {itemId:i.id||null,title:'内容已撤回',summary:null,sourceName:'',sourceUrl:'',sourceIconUrl:null,firstParty:false,publishedAt:null,available:false};
  return {itemId:i.id,title:text(i.title),summary:text(i.summary)||null,sourceName:text(current.sourceName)||'来源未注明',sourceUrl:current.url,sourceIconUrl:null,firstParty:firstParty(current),publishedAt:dateOrNull(current.publishedAt),available:true};
 };
 const sections=(report.sections||[]).map(s=>({label:s.title,summary:null,items:s.items.map(citation)}));
 const items=sections.flatMap(s=>s.items),shown=items.filter(i=>i.available),reduced=shown.length!==items.length;
 const cover=report.coverStory?citation(report.coverStory):null;
 const lead=cover?.available?cover:shown[0]||null;
 const n=index.findIndex(i=>i.key===key);
 // Legacy buildReport has no edition generation metadata: this is the time the derived
 // projection was computed, explicitly distinguished from an original published edition.
 const recorded=dateOrNull(report.generatedAt);
 const generatedAt=recorded||new Date().toISOString();
 return {kind,key,issueNumber:index[n]?.issueNumber||1,title:reduced?`${key} 内容汇总`:report.headline,generatedAt,generationKind:recorded?'recorded':'derived',lead:lead?{title:lead.title,leadParagraph:lead.summary||''}:null,leadItemId:lead?.itemId||null,overview:kind==='daily'||reduced?null:report.editorialSummary||null,highlights:shown.slice(0,4),sections,flashes:[],cover:null,metrics:{[kind==='daily'?'totalEvents':'totalStories']:shown.length,sourcesCount:new Set(shown.map(i=>i.sourceName)).size,firstPartyEvents:shown.filter(i=>i.firstParty).length,modelsReleased:shown.filter(i=>i.firstParty&&(available.get(i.itemId)?.tags||[]).includes('模型发布')).length},readingMinutes:Math.max(1,Math.ceil(shown.length/5)),prev:index[n+1]?.key||null,next:n>0?index[n-1]?.key:null};
}
module.exports={withItemIndex,dateOrNull,dayKey,firstParty,projectItem,projectDetail,projectHot,projectStory,topicMatches,projectTopics,reportKey,reportAnchor,projectReport};
