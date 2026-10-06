#!/usr/bin/env node
// Acceptance check for the two known cross-headline events and the candidate read layer.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
async function main() {
  const base = new URL(process.argv[2] || 'https://www.aibaize.cc/');
  let checks = 0;
  const get = async path => { const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path);checks++;return response; };
  const publicHot=await(await get('/api/public/hot')).json();
  const siteHot=await(await get('/api/site/hot')).json();
  assert.ok(siteHot.entries.length>0);assert.equal(siteHot.availability,'confirmed');
  assert.equal(siteHot.entries.length,publicHot.items.length);
  assert.deepEqual(siteHot.candidates.map(i=>i.id),publicHot.candidates.map(i=>i.id));checks+=4;
  const expected=[['item-i7yom4','item-1nsdvvc'],['item-x8rglq','item-1d882p8']];
  for(const ids of expected){
    const topic=publicHot.items.find(t=>ids.every(id=>t.relatedItems.some(i=>i.id===id)));
    assert.ok(topic,`missing grouped reports ${ids}`);assert.equal(topic.sourceCount,2);checks+=2;
    const detail=await(await get(`/api/site/stories/${topic.id}`)).json();
    assert.ok(ids.every(id=>detail.timeline.some(i=>i.id===id)));checks++;
    const page=await(await get(`/story/${topic.id}`)).text();assert.ok(page.includes('AI.BAIZE'));checks++;
  }
  const html=await(await get('/hot')).text();
  assert.ok(html.includes('热点候选'));assert.ok(html.includes('单一来源'));assert.ok(html.includes('精选分'));assert.ok(!html.includes('暂时没有热点'));checks+=4;
  const confirmedIds=new Set(publicHot.items.flatMap(t=>t.relatedItems.map(i=>i.id)));
  for(const candidate of siteHot.candidates){
    assert.ok(!confirmedIds.has(candidate.id));assert.equal(candidate.heat,undefined);checks+=2;
    await get(`/items/${candidate.id}`);
  }
  const report={checkedAt:new Date().toISOString(),base:base.href,passed:true,checks,confirmed:siteHot.entries.length,candidates:siteHot.candidates.length,events:publicHot.items.map(t=>({id:t.id,title:t.title,sourceCount:t.sourceCount,sources:t.sources,reportIds:t.relatedItems.map(i=>i.id)})),candidateIds:siteHot.candidates.map(i=>i.id)};
  if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
