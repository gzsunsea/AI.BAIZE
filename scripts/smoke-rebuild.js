#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
async function main(){
 const base=new URL(process.argv[2]||'http://127.0.0.1:3002');const results=[];
 const check=async(path,status=200,type)=>{const started=Date.now();const r=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000)}).catch(error=>{throw new Error(`${path}: ${error.message}`)});assert.equal(r.status,status,path);if(type)assert.ok((r.headers.get('content-type')||'').includes(type),path);const body=await r.text();results.push({path,status:r.status,milliseconds:Date.now()-started});return body;};
 for(const path of ['/','/all','/hot','/daily','/weekly','/monthly','/daily/archive','/topics','/starred','/more','/agent','/about','/privacy','/terms','/changelog','/feedback','/admin/login']){const html=await check(path,200,'text/html');assert.ok(html.includes('AI.BAIZE'),path);}
 await check('/this-page-does-not-exist',404);await check('/api/admin/site-state',401,'json');
 const health=JSON.parse(await check('/api/health',200,'json'));assert.equal(health.ok,true);
 const timeline=JSON.parse(await check('/api/site/timeline',200,'json'));assert.ok(timeline.cards.length);
 const item=timeline.cards.find(c=>c.item)?.item;assert.ok(item?.id);await check('/items/'+item.id,200,'text/html');await check('/items/'+item.id+'/markdown',200,'text/markdown');await check('/og/posters/'+item.id+'.png',200,'image/png');
 for(const path of ['/api/site/pool?q=OpenAI&tab=relevance','/api/site/hot','/api/site/topics','/api/site/reports/daily/latest-page','/api/site/reports/weekly/latest-page','/api/site/reports/monthly/latest-page'])await check(path,200,'json');
 await check('/api/site/items/not-existing',404,'json');await check('/api/site/timeline?cursor=broken',400,'json');
 for(const path of ['/logo.svg','/robots.txt','/manifest.webmanifest','/sitemap.xml','/llms.txt','/openapi.json','/feed.xml','/feed/daily.xml','/feed/weekly.xml','/feed/monthly.xml'])await check(path);
 const home=await check('/');const assets=[...new Set([...home.matchAll(/(?:src|href)="(\/assets\/[^"<>]+)"/g)].map(m=>m[1]))];assert.ok(assets.length);for(const asset of assets)await check(asset);
 const report={checkedAt:new Date().toISOString(),base:base.href,release:health.release,checks:results.length,assets:assets.length,passed:true,results};if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({release:health.release,checks:results.length,assets:assets.length,passed:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
