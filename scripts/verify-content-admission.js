#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
async function main(){
 const base=new URL(process.argv[2]||'https://www.aibaize.cc/');let checks=0;
 const get=async path=>{const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path);checks++;return response.json()};
 const all=await get('/api/site/pool');
 assert.ok(all.items.length);assert.equal(all.items.some(i=>i.id==='item-1ff58ti'),false);checks+=2;
 assert.ok(all.items.every((item,n)=>!n||Date.parse(all.items[n-1].timelineAt)>=Date.parse(item.timelineAt)));checks++;
 const lens=await get('/api/site/pool?q='+encodeURIComponent('适马 50-120mm'));
 assert.equal(lens.total,0);checks++;
 const strata=await get('/api/site/pool?q=Strata');assert.ok(strata.items.length>0);checks++;
 const paper=await get('/api/site/pool?q=BiasFlow');assert.ok(paper.items.length>0);checks++;
 const selected=await get('/api/public/items?mode=selected&pageSize=100');
 const sourceCounts=rows=>Object.entries(rows.reduce((m,i)=>{const name=i.sourceName||i.source?.name;m[name]=(m[name]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]);
 const selectedSources=sourceCounts(selected.items);const itCount=selectedSources.find(([name])=>name==='IT之家 AI')?.[1]||0;
 assert.ok(itCount<=5);assert.ok(selectedSources.length>1);checks+=2;
 const result={checkedAt:new Date().toISOString(),base:base.href,passed:true,checks,all:{total:all.total,firstPageCount:all.items.length,sourceCounts:sourceCounts(all.items),chronological:true},selected:{total:selected.total??selected.pagination?.total??selected.items.length,sourceCounts:selectedSources,ithomeCount:itCount,ithomeLimit:5},removedLensId:'item-1ff58ti',lensSearchResults:lens.total,preservedStrataIds:strata.items.map(i=>i.id),preservedBiasFlowIds:paper.items.map(i=>i.id)};
 if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
