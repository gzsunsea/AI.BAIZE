const test = require('node:test');
const assert = require('node:assert/strict');
let api = {};
try { api = require('./site/projections'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const now = new Date().toISOString();
const item = {id:'a',title:'OpenAI 发布模型',summary:'真实摘要',reason:'官方发布',url:'https://openai.com/index/a',publishedAt:now,sourceName:'OpenAI',sourceKind:'rss',priorityTier:'official_first_party',score:88,tags:['模型发布'],raw:{apiKey:'never-public'},hidden:false};
test('site item projection retains identity and real dates without leaking raw content',()=>{
 assert.equal(typeof api.projectItem,'function');
 const actual=api.projectItem(item,new Set(['a']));
 assert.equal(actual.id,'a');assert.equal(actual.title,item.title);assert.equal(actual.selected,true);assert.equal(actual.channel,'news');assert.equal(actual.category,'ai-models');assert.equal(actual.publishedAt,now);assert.equal(actual.source.name,'OpenAI');assert.equal(actual.raw,undefined);
});
test('missing publication time stays null instead of claiming collection time is publication',()=>{
 assert.equal(typeof api.projectItem,'function');
 const actual=api.projectItem({...item,publishedAt:null,discoveredAt:now},new Set());assert.equal(actual.publishedAt,null);assert.equal(actual.timelineAt,now);
});
test('text entities are decoded without making source text executable HTML',()=>{
 const actual=api.projectItem({...item,title:'OpenAI&#8217;s model',summary:'A &amp; B &lt;script&gt;'},new Set());
 assert.equal(actual.title,'OpenAI’s model');assert.equal(actual.summary,'A & B <script>');
});
test('unknown trend and absent heat history are not fabricated',()=>{
 assert.equal(typeof api.projectHot,'function');
 const r=api.projectHot({generatedAt:now,windowHours:72,items:[{id:'s',rank:1,title:item.title,heat:55,sources:['OpenAI','Media'],sourceCount:2,summary:item.summary,relatedItems:[item]}]});
 assert.equal(r.entries[0].trend,'unknown');assert.equal(r.entries[0].trendPct,null);assert.deepEqual(r.entries[0].spark,[]);
});
test('HTML cannot become an authorized full article without explicit source permission',()=>{
 assert.equal(typeof api.projectDetail,'function');
 const actual=api.projectDetail({...item,content:'<script>bad()</script><p>正文</p>'},new Set(),{});assert.equal(actual.readingMode,'summary-only');assert.equal(actual.body,null);assert.deepEqual(actual.outline,[]);
});
test('report keys honor ISO week boundaries and round-trip anchor dates',()=>{
 assert.equal(typeof api.reportKey,'function');assert.equal(api.reportKey('weekly','2026-01-01'),'2026-W01');assert.equal(api.reportKey('monthly','2026-10-04'),'2026-10');assert.equal(api.reportAnchor('weekly','2026-W01'),'2025-12-29');assert.equal(api.reportAnchor('daily','2026-02-30'),null);
});

test('serialized items recover real dates and original titles from stored metadata',()=>{
 const {serializePublicItem}=require('./lib/editorial');
 const stored={...item,publishedAt:null,discoveredAt:'2026-10-04T12:00:00Z',originalTitle:'Original title'};
 const actual=api.projectItem(serializePublicItem(stored),new Set(),{items:[stored]});
 assert.equal(actual.timelineAt,'2026-10-04T12:00:00.000Z');assert.equal(actual.discoveredAt,actual.timelineAt);assert.equal(actual.originalTitle,'Original title');assert.equal(actual.publishedAt,null);
 assert.equal(api.projectItem({...item,publishedAt:null,updatedAt:now}),null);
});
test('withdrawn report citations contain no former content and do not count',()=>{
 const removed={...item,hidden:true,title:'Private title',summary:'Private summary'};
 const report={headline:'Private title',editorialSummary:'Private summary',coverStory:removed,sections:[{title:'栏目',items:[removed,item]}],range:{end:'2026-10-05'}};
 const actual=api.projectReport(report,'weekly','2026-W41',[{key:'2026-W41'}],{items:[removed]});
 const citation=actual.sections[0].items[0];assert.equal(citation.title,'内容已撤回');assert.equal(citation.summary,null);assert.equal(citation.sourceUrl,'');assert.equal(citation.sourceName,'');assert.equal(citation.firstParty,false);assert.equal(citation.publishedAt,null);assert.equal(actual.overview,null);assert.equal(actual.metrics.totalStories,0);assert.equal(JSON.stringify(actual).includes('Private'),false);
});
test('report metrics use frontend keys and generation time records projection rather than article dates',()=>{
 const date='2020-01-01T00:00:00.000Z',generated='2026-10-04T10:00:00.000Z';
 const report={headline:'Report',generatedAt:generated,sections:[{title:'栏目',items:[{...item,publishedAt:date}]}],range:{end:'2026-10-05'}};
 const actual=api.projectReport(report,'daily','2026-10-04',[],{items:[item]});
 assert.equal(actual.generatedAt,generated);assert.equal(actual.generationKind,'recorded');assert.equal(actual.metrics.totalEvents,1);assert.equal(actual.metrics.modelsReleased,1);assert.equal(actual.metrics.events,undefined);
 const before=Date.now();const derived=api.projectReport({...report,generatedAt:undefined},'daily','2026-10-04',[],{items:[item]});assert.equal(derived.generationKind,'derived');assert.ok(Date.parse(derived.generatedAt)>=before);assert.notEqual(derived.generatedAt,date);
});
test('story projection hydrates official source metadata, lifecycle and observed source arrivals',()=>{
 const {serializePublicItem}=require('./lib/editorial');
 const older={...item,id:'older',publishedAt:new Date(Date.now()-30*36e5).toISOString()};
 const repeat={...item,id:'repeat',publishedAt:new Date(Date.now()-2*36e5).toISOString()};
 const newer={...item,id:'newer',sourceName:'New source',priorityTier:'cn_media',publishedAt:new Date(Date.now()-36e5).toISOString()};
 const story={event:{id:'s',title:'Story',sourceCount:2,lifecycle:{state:'confirmed',lastUpdatedAt:newer.publishedAt}},timeline:[older,repeat,newer].map(serializePublicItem)};
 const actual=api.projectStory(story,new Set(),{items:[older,repeat,newer]});assert.equal(actual.officialReports.length,2);assert.equal(actual.whyHot.newParticipants6h,1);assert.equal(actual.whyHot.observationComplete,false);assert.equal(actual.timeline[0].id,'newer');
 const stale=api.projectStory({...story,event:{...story.event,lifecycle:{state:'stale',lastUpdatedAt:'2020-01-01T00:00:00Z'}}},new Set(),{items:[older,repeat,newer]});assert.equal(stale.status,'settled');
 const unknown=api.projectStory({event:{id:'s'},timeline:[{...item,publishedAt:null}]},new Set());assert.equal(unknown.whyHot.newParticipants6h,null);assert.equal(unknown.timeline.length,0);
});

test('withdrawal replaces the lead with live evidence and uses its current original URL',()=>{
 const gone={...item,id:'gone',hidden:true,title:'Do not expose',summary:'Secret'};
 const live={...item,id:'live',url:'https://openai.com/corrected'};
 const report={headline:'Do not expose',coverStory:gone,sections:[{title:'栏目',items:[gone,{...live,url:'https://old.example/a'}]}]};
 const actual=api.projectReport(report,'daily','2026-10-04',[],{items:[gone,live]});
 assert.equal(actual.leadItemId,'live');assert.equal(actual.metrics.totalEvents,1);assert.equal(actual.metrics.sourcesCount,1);assert.equal(actual.sections[0].items[1].sourceUrl,live.url);assert.equal(JSON.stringify(actual).includes('Secret'),false);
});
test('topic projection omits timestamp-unknown candidates and hydrates known discovery dates',()=>{
 const undated={...item,id:'undated',publishedAt:null},discovered={...item,id:'discovered',publishedAt:null,discoveredAt:now};
 const {serializePublicItem}=require('./lib/editorial');
 const result=api.projectTopics([undated,serializePublicItem(discovered)],new Set(['undated','discovered']),{items:[undated,discovered]});
 assert.equal(result.topics.find(t=>t.slug==='openai').total,1);
});
