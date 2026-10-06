const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeItem, isQualityCandidate } = require('./scoring');

test('camera lens cannot qualify for AI coverage through automatically inferred model and multimodal tags',()=>{
 const item=normalizeItem({title:'适马 50-120mm F2.8 APS-C 相机镜头曝光：支持光学防抖，覆盖索尼 E、富士 X、佳能 RF 卡口',summary:'IT之家今日消息，适马变焦镜头将于10月8日发布，支持光学防抖，并对视频拍摄做了优化。',sourceName:'IT之家 AI',sourceKind:'rss',priorityTier:'cn_media',url:'https://www.ithome.com/lens',publishedAt:new Date().toISOString()});
 assert.ok(item.tags.length>0);assert.equal(isQualityCandidate(item),false);
});

test('manually assigned AI tags and source branding are not evidence for unrelated product news',()=>{
 for(const title of ['任天堂游戏停服，七年收入超过两亿美元','相机固件更新与视频镜头评测','企业发布 cloud storage 方案']){
  assert.equal(isQualityCandidate({title,summary:'新品发布，支持视频与图像展示。',tags:['模型发布','多模态','论文/研究'],sourceName:'IT之家 AI',sourceKind:'rss',priorityTier:'cn_media'}),false,title);
 }
});

test('actual local model engineering and translated AI papers retain their original source evidence',()=>{
 const item=normalizeItem({title:'12GB 显存显卡跑 125B Qwen3.8 模型：Strata 登场',summary:'开源推理工具在消费级显卡上运行大模型，通过 MoE 内存调度降低显存占用。',sourceName:'IT之家 AI',sourceKind:'rss',priorityTier:'cn_media',url:'https://www.ithome.com/model'});
 assert.equal(isQualityCandidate(item),true);
 assert.equal(isQualityCandidate({title:'BiasFlow: Geometric Monitoring',summary:'几何监测可减少虚假特征依赖。',tags:[],sourceName:'arXiv AI',sourceKind:'arxiv',priorityTier:'community_fallback',llmProvider:'ollama:reviewed',raw:{summary:'Deep neural network regularization improves machine learning robustness.'}}),true);
});

test('an invented AI display summary cannot promote a source headline without AI evidence',()=>{
 const raw={title:'适马相机镜头发布',summary:'支持光学防抖和高速对焦。'};
 assert.equal(isQualityCandidate({title:raw.title,summary:'这款 AI 模型支持多模态图像处理。',tags:['模型发布'],raw,sourceName:'IT之家 AI',priorityTier:'cn_media',llmProvider:'rules'}),false);
 const noBody={...raw,summary:undefined};
 assert.equal(isQualityCandidate({title:raw.title,summary:'这条动态可关注 AI 应用和产业影响。',raw:noBody,sourceName:'IT之家 AI',priorityTier:'cn_media'}),false);
});

test('explicit AI source evidence keeps code scanning, self-improvement research and hallucination reporting',()=>{
 for(const [title,summary] of [
  ['Code scanning AI Scan enablement status','Administrators can now see AI Scan for pull requests.'],
  ['Hinton发了首篇RSI论文','AI已经开始真正进入造下一代AI的流水线'],
  ['AI幻觉报告压垮维护团队','开源维护人员被 AI 生成的无效漏洞报告挤占时间。'],
 ]) assert.equal(isQualityCandidate({title,summary,raw:{title,summary},sourceName:'AI 媒体',priorityTier:'cn_media',tags:[]}),true,title);
});

test('all coverage keeps every qualifying report in time order; source caps belong to selected coverage',()=>{
 const {itemsResponse}=require('../index');
 const items=Array.from({length:35},(_,n)=>normalizeItem({title:`AI model research ${n}`,summary:'Research evaluates an AI model for neural network inference.',sourceName:'arXiv AI',sourceKind:'arxiv',priorityTier:'community_fallback',url:`https://arxiv.org/abs/2610.${n}`,publishedAt:new Date(Date.UTC(2026,9,6,0,n)).toISOString()}));
 const result=itemsResponse({mode:'all',pageSize:100},{items,clusters:[],settings:{rules:{}}});
 assert.equal(result.total,35);assert.equal(result.items.length,35);
 assert.deepEqual(result.items.map(i=>i.id),[...items].reverse().map(i=>i.id));
});
