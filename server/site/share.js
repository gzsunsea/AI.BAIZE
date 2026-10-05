const express = require('express');
const path = require('node:path');
// The renderer registers its bundled fonts explicitly; no host font installation is required.
process.env.FONTCONFIG_FILE ||= path.resolve(__dirname, '../../assets/og-fonts/fonts.conf');
const sharp = require('sharp');
const QRCode = require('qrcode');
const {reportAnchor, projectReport, dateOrNull} = require('./projections');

const ROOT = path.resolve(__dirname, '../..');
const FONT = path.join(ROOT, 'assets/og-fonts/noto-sans-sc-400.ttf');
const BOLD = path.join(ROOT, 'assets/og-fonts/noto-sans-sc-700.ttf');
const LOGO = path.join(ROOT, 'site/brand/logo.svg');
const ORIGIN = 'https://www.aibaize.cc';
const PAGES = {
 home: ['AI.BAIZE', '发现值得关注的 AI 新闻与一手信息'],
 all: ['全部资讯', 'AI.BAIZE · 持续更新的 AI 资讯'],
 hot: ['热点', 'AI.BAIZE · 关注正在发生的 AI 事件'],
 daily: ['日报', 'AI.BAIZE · 每日 AI 信息回顾'],
 weekly: ['周报', 'AI.BAIZE · 每周 AI 信息回顾'],
 monthly: ['月报', 'AI.BAIZE · 每月 AI 信息回顾'],
 topics: ['主题', 'AI.BAIZE · 按主题发现 AI 资讯'],
 about: ['关于 AI.BAIZE', '发现、阅读与分享 AI 信息'],
 agent: ['Agent 接入', 'AI.BAIZE · RSS 与 API'],
 changelog: ['更新日志', 'AI.BAIZE · 产品更新记录'],
 feedback: ['意见反馈', 'AI.BAIZE · 分享你的建议'],
 terms: ['使用条款', 'AI.BAIZE'],
 privacy: ['隐私说明', 'AI.BAIZE'],
};
function escapeText(value) {
 return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
const bounded = (value, max) => Array.from(String(value ?? '').replace(/\s+/g, ' ').trim()).slice(0,max).join('');
function displayDate(value) {
 const valid = dateOrNull(value);
 const timestamp = valid ? Date.parse(valid) : NaN;
 return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp)) : '';
}
async function textLayer(text, {left,top,width,height,size=32,bold=false,color='#182630'}) {
 const input = await sharp({text:{text:`<span foreground="${color}">${escapeText(text || ' ')}</span>`,font:`Noto Sans SC ${bold?'Bold ':''}${size}`,fontfile:bold?BOLD:FONT,width,height,rgba:true,wrap:'word-char',align:'left'}}).png().toBuffer();
 return {input,left,top};
}
async function render({title,summary,source,date,url,poster=false}) {
 const width=poster?900:1200,height=poster?1200:630;
 const layers=[{input:await sharp(LOGO).resize(72,72).png().toBuffer(),left:60,top:50}];
 layers.push(await textLayer('AI.BAIZE',{left:152,top:68,width:600,height:50,size:32,bold:true,color:'#176b75'}));
 layers.push(await textLayer(bounded(title,poster?120:85),{left:60,top:poster?185:155,width:width-120,height:poster?330:210,size:poster?52:48,bold:true}));
 layers.push(await textLayer(bounded(summary,poster?380:160),{left:60,top:poster?540:390,width:width-120,height:poster?330:125,size:poster?30:25,color:'#50616c'}));
 layers.push(await textLayer(bounded([source,date].filter(Boolean).join(' · '),100),{left:60,top:poster?930:545,width:poster?540:1050,height:72,size:poster?23:22,color:'#50616c'}));
 if (poster) {
  const qr=await QRCode.toBuffer(url,{width:180,margin:1,color:{dark:'#101a22',light:'#ffffff'}});
  layers.push({input:qr,left:650,top:950});
  layers.push(await textLayer('扫码查看详情',{left:60,top:1060,width:500,height:60,size:26,color:'#176b75'}));
 }
 return sharp({create:{width,height,channels:4,background:'#faf9f6'}}).composite(layers).png().toBuffer();
}
function createShareRouter({readState,publicItems,publicItemDetail,publicReport}) {
 if (![readState,publicItems,publicReport].every(fn=>typeof fn==='function')) throw new TypeError('Share router needs public data readers');
 const router=express.Router(); let active=0;
 const respond=(handler)=>async(req,res)=>{
  res.set('X-Content-Type-Options','nosniff');
  if(active>=4)return res.status(503).set('Cache-Control','no-store').json({detail:'分享图片生成繁忙，请稍后重试。'});
  active++;
  try {const png=await handler(req);if(!png)return res.status(404).set('Cache-Control','no-store').end();res.set('Cache-Control','public, max-age=300, must-revalidate').type('png').send(png);}
  catch{return res.status(503).set('Cache-Control','no-store').json({detail:'分享图片暂时无法生成。'});}
  finally{active--;}
 };
 const itemImage=poster=>respond(async(req)=>{
  const id=req.params.id;if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return null;
  const state=readState();let item;
  if(typeof publicItemDetail==='function'){
   const detail=publicItemDetail(state,id);if(!detail)return null;
   item=detail.item || (state.items||[]).find(i=>String(i.id)===id);
  }else item=publicItems({mode:'all'},state).find(i=>String(i.id)===id);
  if(!item)return null;
  return render({title:item.title,summary:item.summary,source:item.sourceName||item.source?.name,date:displayDate(item.publishedAt),url:`${ORIGIN}/items/${encodeURIComponent(id)}`,poster});
 });
 router.get('/og/posters/:id.png',itemImage(true));
 router.get('/og/items/:id.png',itemImage(false));
 router.get('/og/pages/:slug.png',respond(req=>{
  if(!Object.hasOwn(PAGES,req.params.slug))return null;const [title,summary]=PAGES[req.params.slug];return render({title,summary,source:'www.aibaize.cc'});
 }));
 router.get('/og/reports/:kind/:key.png',respond(req=>{
  const {kind,key}=req.params;if(!['daily','weekly','monthly'].includes(kind))return null;
  const date=reportAnchor(kind,key);if(!date)return null;
  const state=readState();const report=publicReport({period:kind,date},state);
  if(!report?.headline||!(report.sections||[]).some(section=>section.items?.length))return null;
  const safe=projectReport(report,kind,key,[{key,issueNumber:1}],state);
  const available=safe.sections.flatMap(section=>section.items).filter(citation=>citation.available);
  if(!available.length)return null;
  const lead=available.find(citation=>citation.itemId===safe.leadItemId)||safe.highlights[0]||available[0];
  // Stored digest copy may still name withdrawn material: compose solely from available citations.
  return render({title:lead.title,summary:[lead.summary,...available.filter(c=>c!==lead).slice(0,3).map(c=>c.title)].filter(Boolean).join(' · '),source:`AI.BAIZE · ${PAGES[kind][0]}`,date:key});
 }));
 for(const [url,size]of [['/icon.png',512],['/icon-192.png',192],['/apple-icon.png',180]])router.get(url,respond(()=>sharp(LOGO).resize(size,size).png().toBuffer()));
 return router;
}
module.exports={createShareRouter,escapeText};
