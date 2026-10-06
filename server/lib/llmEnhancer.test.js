const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { normalizeItem } = require("./scoring");
const { prepareVisionImages, sourceText } = require("./llmEnhancer");

test('source text never reuses generated copy when raw evidence exists',()=>{
 const input={title:'AI model update',summary:'事实摘要：反复生成的错误内容。影响判断：虚构影响。',llmProvider:'rules',raw:{title:'AI model update',summary:'The original release includes an API migration date.'}};
 assert.doesNotMatch(sourceText(input),/反复生成|影响判断/);
 assert.equal(sourceText(input).match(/AI model update/g).length,1);
});
test('rules fallback retains original excerpt without inventing impact or scenario',async(t)=>{
 const previous=process.env.OLLAMA_DISABLED;t.after(()=>{if(previous===undefined)delete process.env.OLLAMA_DISABLED;else process.env.OLLAMA_DISABLED=previous});process.env.OLLAMA_DISABLED='1';
 const {enhanceItem}=loadEnhancerFresh();
 const result=await enhanceItem({title:'AI launch',summary:'事实摘要：旧稿污染',llmProvider:'rules',raw:{summary:'The API now supports web search.'}});
 assert.match(result.summary,/原文摘录.*The API now supports web search/);
 assert.doesNotMatch(result.summary,/旧稿污染|影响判断|场景价值|可能改变/);
 assert.equal(result.editorialBrief,null);
});
test('non-Chinese model output cannot masquerade as a translated summary',async(t)=>{
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'The API now supports web search.',reason:'原文给出了新接口的使用方式。'})})}));
 const result=await loadEnhancerFresh().enhanceItem({title:'AI launch',raw:{summary:'The API now supports web search.'}});
 assert.equal(result.provider,'rules');assert.match(result.summary,/原文摘录/);
});
test('invalid model reasons cannot discard a valid Chinese fact',async(t)=>{
 let reason='适合某类读者对照原文中的某项资料，判断某个具体问题。';t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'官方说明了模型工具调用格式的转换方式。',reason})})}));const enhancer=loadEnhancerFresh(),input={title:'AI tools',raw:{summary:'The API normalizes tool-calling schemas across providers.'}};
 const first=await enhancer.enhanceItem(input);assert.match(first.provider,/^ollama:/);assert.equal(first.summary,'官方说明了模型工具调用格式的转换方式。');assert.doesNotMatch(first.reason,/某类读者|某项资料|某个具体问题/);
 reason='该摘要提供了有关模型工具调用格式的详细信息。';const second=await enhancer.enhanceItem(input);assert.match(second.provider,/^ollama:/);assert.doesNotMatch(second.reason,/该摘要提供了/);
 reason='具体阅读价值';assert.notEqual((await enhancer.enhanceItem(input)).reason,reason);
});

test('a missing model reason cannot discard a valid Chinese fact',async(t)=>{
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'官方说明了模型工具调用格式的转换方式。'})})}));
 const result=await loadEnhancerFresh().enhanceItem({title:'AI tools',sourceName:'Official',raw:{summary:'The API normalizes tool-calling schemas across providers.'}});
 assert.match(result.provider,/^ollama:/);assert.equal(result.summary,'官方说明了模型工具调用格式的转换方式。');assert.match(result.reason,/原文/);
});

test('text summarization focuses on the original rather than editorial instructions and image captions',async(t)=>{
 let request;t.mock.method(global,'fetch',async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({response:JSON.stringify({fact:'原文比较了工作流编排、模型路由与供应商路由。'})})}});
 await loadEnhancerFresh().enhanceItem({title:'Routing layers',raw:{summary:'Compare orchestration, model routing, and provider routing.'},media:[{type:'image',alt:'Diagram caption that must not dominate the text summary.'}]});
 assert.match(request.prompt,/Compare orchestration/);assert.doesNotMatch(request.prompt,/Diagram caption|某类读者|具体阅读价值|Routing layers/);assert.deepEqual(request.format.required,['fact']);
 assert.equal(request.options.num_thread,1);assert.equal(request.options.num_ctx,2048);
 assert.equal(request.think,false);
});

test('a rejected fact records the failure cause and attempted model',async(t)=>{
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'The API normalizes tool schemas.',reason:'适合开发者核对工具调用格式。'})})}));
 const result=await loadEnhancerFresh().enhanceItem({title:'AI tools',raw:{summary:'The API normalizes tool schemas.'}});
 assert.equal(result.provider,'rules');assert.equal(result.failureCode,'non_chinese_fact');assert.ok(result.attemptedModel);
});

test('numeric validation compares quantities rather than matching digit substrings',async(t)=>{
 let fact='超过230万批次的中位周转时间为7分钟。';
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact})})}));
 const enhancer=loadEnhancerFresh(),input={title:'Batch API',raw:{summary:'Median turnaround across 230k+ beta batches was 7 minutes.'}};
 const rejected=await enhancer.enhanceItem(input);assert.equal(rejected.provider,'rules');assert.equal(rejected.failureCode,'unsupported_numeric_claim');
 fact='超过23万批次的中位周转时间为7分钟。';assert.match((await enhancer.enhanceItem(input)).provider,/^ollama:/);
 fact='超过230,000批次的中位周转时间为7分钟。';assert.match((await enhancer.enhanceItem(input)).provider,/^ollama:/);
 fact='超过23批次的中位周转时间为7分钟。';assert.equal((await enhancer.enhanceItem(input)).provider,'rules');
});

test('translation preserves protected source numbers and rejects invented placeholders or magnitude units',async(t)=>{
 let fact='超过__NUM_0__批次的中位周转时间为__NUM_1__分钟。',request;
 t.mock.method(global,'fetch',async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({response:JSON.stringify({fact})})}});
 const enhancer=loadEnhancerFresh(),input={title:'Batch API',raw:{summary:'Median turnaround across 230k+ beta batches was 7 minutes.'}};
 const result=await enhancer.enhanceItem(input);assert.match(result.provider,/^ollama:/);assert.equal(result.summary,'超过230k+批次的中位周转时间为7分钟。');
 assert.match(request.prompt,/across __NUM_0__ beta batches was __NUM_1__ minutes/);
 fact='超过__NUM_9__批次的中位周转时间为7分钟。';assert.equal((await enhancer.enhanceItem(input)).provider,'rules');
 fact='超过__NUM_0__万批次的中位周转时间为7分钟。';assert.equal((await enhancer.enhanceItem(input)).provider,'rules');
});

test('a translation cannot reverse a cannot-merge condition with a double negative',async(t)=>{
 let fact='设置评估检查，以防止使智能体变差的改动无法合并。',request;
 t.mock.method(global,'fetch',async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({response:JSON.stringify({fact})})}});
 const input={title:'CI eval gate',raw:{summary:'Make the eval a required GitHub status check so a prompt change that makes your agent worse cannot merge.'}},enhancer=loadEnhancerFresh();
 const failed=await enhancer.enhanceItem(input);assert.equal(failed.provider,'rules');assert.equal(failed.failureCode,'changed_negation');assert.equal(request.think,true);
 fact='将评估设为GitHub必需状态检查，使导致智能体表现下降的提示词改动不能合并。';assert.match((await enhancer.enhanceItem(input)).provider,/^ollama:/);
});

test('Chinese source summaries remain available when the model is unavailable',async(t)=>{
 const original=process.env.OLLAMA_DISABLED;t.after(()=>{if(original===undefined)delete process.env.OLLAMA_DISABLED;else process.env.OLLAMA_DISABLED=original});process.env.OLLAMA_DISABLED='1';
 const summary='OpenRouter 发布异步批量请求接口，并列出支持的模型、请求格式和结果获取方式。';
 const result=await loadEnhancerFresh().enhanceItem({title:'Batch API',summary:'原文摘录（自动中文摘要暂不可用）：旧稿',llmProvider:'rules',raw:{summary}});
 assert.equal(result.summary,summary);assert.equal(result.provider,'source');assert.equal(result.failureCode,undefined);
});

test('mixed AIHOT excerpts reuse the supplied Chinese translation when the model is unavailable',async(t)=>{
 const previous=process.env.OLLAMA_DISABLED;t.after(()=>{if(previous===undefined)delete process.env.OLLAMA_DISABLED;else process.env.OLLAMA_DISABLED=previous});process.env.OLLAMA_DISABLED='1';
 const english='The official announcement describes the model update and gives developers the product link. '.repeat(4);
 const chinese='官方说明了此次模型更新的主要变化，开发者可通过原文提供的产品入口核对适用场景。';
 const result=await loadEnhancerFresh().enhanceItem({title:'AI update',sourceKind:'aihot',llmProvider:'rules',raw:{summary:english+'译'+chinese+'使用入口：https://example.com/model'+english}});
 assert.equal(result.provider,'source');assert.equal(result.summary,chinese);
});

test('a new configured model retries rules results without the old cooldown',async(t)=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'aibaize-model-retry-'));
 t.after(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true})});process.chdir(dir);fs.mkdirSync('data');
 const file=path.join(dir,'data/db.json');fs.writeFileSync(file,JSON.stringify({items:[{id:'retry',title:'AI tools',preferred:true,llmProvider:'rules',llmAttemptedModel:'old-model',llmEnhancedAt:new Date().toISOString(),raw:{summary:'The API normalizes tool schemas.'}}],sources:[],settings:{}}));
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'官方说明了模型工具调用格式的转换方式。',reason:'适合开发者核对工具调用格式。'})})}));
 const result=await loadEnhancerFresh().enhanceRecentItems();assert.equal(result.enhanced,1);assert.equal(result.failed,0);assert.match(JSON.parse(fs.readFileSync(file)).items[0].llmProvider,/^ollama:/);
});

test('enhancement reports successful summaries separately from fallback failures',async(t)=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'aibaize-enhance-counts-'));
 t.after(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true})});process.chdir(dir);fs.mkdirSync('data');
 fs.writeFileSync(path.join(dir,'data/db.json'),JSON.stringify({items:[{id:'good',title:'Good AI tools',preferred:true,raw:{summary:'Good AI tools normalize tool schemas.'}},{id:'bad',title:'Bad AI tools',preferred:true,raw:{summary:'Bad AI tools normalize tool schemas.'}}],sources:[],settings:{}}));
 t.mock.method(global,'fetch',async(_url,options)=>({ok:true,json:async()=>({response:JSON.stringify({fact:JSON.parse(options.body).prompt.includes('Bad AI tools')?'English output without translation':'官方说明了模型工具调用格式的转换方式。',reason:'适合开发者核对工具调用格式。'})})}));
 const result=await loadEnhancerFresh().enhanceRecentItems();assert.equal(result.enhanced,1);assert.equal(result.failed,1);assert.equal(result.applied,2);assert.equal(result.failures.non_chinese_fact,1);
});
test('accepted Chinese copy does not fabricate omitted impact fields or unsupported numbers',async(t)=>{
 let answer={fact:'官方发布模型接口，并说明了新的网络检索接入方式。',reason:'适合开发者核对原文列出的网络检索调用方式。'};
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify(answer)})}));
 const input={title:'AI API update',raw:{summary:'The AI API adds web search integration.'}};
 const enhancer=loadEnhancerFresh();const good=await enhancer.enhanceItem(input);assert.equal(good.summary,answer.fact);assert.equal(good.editorialBrief.impact,null);assert.doesNotMatch(good.summary,/影响判断|场景价值/);
 answer={...answer,fact:'官方发布模型接口，并声称速度提升了99倍。'};assert.equal((await enhancer.enhanceItem(input)).provider,'rules');
});
test('enhancement preserves concurrent feedback and refuses changed original evidence',async(t)=>{
 const originalCwd=process.cwd();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aibaize-concurrent-enhance-'));t.after(()=>{process.chdir(originalCwd);fs.rmSync(dir,{recursive:true,force:true})});process.chdir(dir);fs.mkdirSync('data');
 const item={id:'a',title:'AI API update',raw:{summary:'The AI API adds web search integration.'},priorityTier:'official_first_party',sourceName:'Official',url:'https://example.com/ai',publishedAt:new Date().toISOString()};const file=path.join(dir,'data/db.json');fs.writeFileSync(file,JSON.stringify({items:[item],sources:[],feedback:[],settings:{}}));
 t.mock.method(global,'fetch',async()=>{const latest=JSON.parse(fs.readFileSync(file));latest.feedback.push({id:'new-feedback'});latest.items[0].raw.summary='The original source withdrew the API release.';fs.writeFileSync(file,JSON.stringify(latest));return {ok:true,json:async()=>({response:JSON.stringify({fact:'官方发布模型接口，并说明网络检索的调用方式。',reason:'适合开发者对照原文的网络检索调用说明。'})})}});
 await loadEnhancerFresh().enhanceRecentItems({force:true});const latest=JSON.parse(fs.readFileSync(file));assert.equal(latest.feedback[0].id,'new-feedback');assert.equal(latest.items[0].llmEnhancedAt,undefined);assert.equal(latest.items[0].raw.summary,'The original source withdrew the API release.');
});
test('controlled repair only enhances explicitly selected IDs',async(t)=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'aibaize-targeted-enhance-'));t.after(()=>{process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true})});process.chdir(dir);fs.mkdirSync('data');
 const item={title:'AI API update',raw:{summary:'The AI API adds web search integration.'},preferred:true,url:'https://example.com/ai',publishedAt:new Date().toISOString()};const file=path.join(dir,'data/db.json');fs.writeFileSync(file,JSON.stringify({items:[{...item,id:'a'},{...item,id:'b'}],sources:[],settings:{}}));
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({response:JSON.stringify({fact:'官方发布模型接口，并说明网络检索的调用方式。',reason:'适合开发者对照原文的网络检索调用说明。'})})}));
 assert.equal((await loadEnhancerFresh().enhanceRecentItems({force:true,ids:['b']})).enhanced,1);const latest=JSON.parse(fs.readFileSync(file));assert.equal(latest.items[0].llmEnhancedAt,undefined);assert.ok(latest.items[1].llmEnhancedAt);
});

test("vision preparation requests one bounded image only for trusted sources", async (t) => {
  const originalVisionModel = process.env.OLLAMA_VISION_MODEL;
  t.after(() => {
    if (originalVisionModel === undefined) delete process.env.OLLAMA_VISION_MODEL;
    else process.env.OLLAMA_VISION_MODEL = originalVisionModel;
  });
  process.env.OLLAMA_VISION_MODEL = "gemma4";
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const request = {};
  const result = await prepareVisionImages({
    priorityTier: "official_first_party",
    media: [
      { url: "https://example.com/chart.png", type: "image", alt: "Latency chart", },
      { url: "https://example.com/second.png", type: "image" },
    ],
  }, async (url, options) => {
    request.url = url.toString();
    request.options = options;
    return { status: 200, headers: { "content-type": "image/png; charset=binary" }, body: image };
  });

  assert.deepEqual(result, [image.toString("base64")]);
  assert.equal(request.url, "https://example.com/chart.png");
  assert.equal(request.options.maxBytes, 2 * 1024 * 1024);
});

test("vision preparation skips model-disabled or non-trusted items without fetching", async (t) => {
  const originalVisionModel = process.env.OLLAMA_VISION_MODEL;
  t.after(() => {
    if (originalVisionModel === undefined) delete process.env.OLLAMA_VISION_MODEL;
    else process.env.OLLAMA_VISION_MODEL = originalVisionModel;
  });
  let fetches = 0;
  const fetcher = async () => { fetches += 1; throw new Error("must not fetch"); };
  const item = { priorityTier: "community_fallback", media: [{ url: "https://example.com/chart.png", type: "image" }] };

  delete process.env.OLLAMA_VISION_MODEL;
  assert.deepEqual(await prepareVisionImages(item, fetcher), []);
  process.env.OLLAMA_VISION_MODEL = "gemma4";
  assert.deepEqual(await prepareVisionImages(item, fetcher), []);
  assert.equal(fetches, 0);
});

test("vision preparation rejects unsupported formats and mismatched image signatures", async (t) => {
  const originalVisionModel = process.env.OLLAMA_VISION_MODEL;
  t.after(() => {
    if (originalVisionModel === undefined) delete process.env.OLLAMA_VISION_MODEL;
    else process.env.OLLAMA_VISION_MODEL = originalVisionModel;
  });
  process.env.OLLAMA_VISION_MODEL = "gemma4";
  const item = { preferred: true, media: [{ url: "https://example.com/chart.png", type: "image" }] };

  const svg = await prepareVisionImages(item, async () => ({
    status: 200,
    headers: { "content-type": "image/svg+xml" },
    body: Buffer.from("<svg></svg>"),
  }));
  const mismatched = await prepareVisionImages(item, async () => ({
    status: 200,
    headers: { "content-type": "image/png" },
    body: Buffer.from("not a png"),
  }));

  assert.deepEqual(svg, []);
  assert.deepEqual(mismatched, []);
});

test("configured local vision model receives the base64 image with editorial text", async (t) => {
  const previous = {
    vision: process.env.OLLAMA_VISION_MODEL,
    text: process.env.OLLAMA_MODEL,
    disabled: process.env.OLLAMA_DISABLED,
    fetch: global.fetch,
  };
  t.after(() => {
    if (previous.vision === undefined) delete process.env.OLLAMA_VISION_MODEL;
    else process.env.OLLAMA_VISION_MODEL = previous.vision;
    if (previous.text === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previous.text;
    if (previous.disabled === undefined) delete process.env.OLLAMA_DISABLED;
    else process.env.OLLAMA_DISABLED = previous.disabled;
    global.fetch = previous.fetch;
  });
  process.env.OLLAMA_VISION_MODEL = "vision-test";
  process.env.OLLAMA_MODEL = "text-test";
  delete process.env.OLLAMA_DISABLED;
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ response: JSON.stringify({
      fact: "图中数据表显示推理延迟降低。",
      impact: "该变化可能降低产品响应时间。",
      scenario: "适合评估对延迟敏感的应用。",
      reason: "原文与图片共同提供了具体指标。",
    }) }) };
  };
  const enhancer = loadEnhancerFresh();
  const result = await enhancer.enhanceItem({
    title: "Model latency update",
    summary: "A new model was announced.",
    priorityTier: "official_first_party",
    media: [{ url: "https://example.com/chart.png", type: "image" }],
  }, { imageFetcher: async () => ({ status: 200, headers: { "content-type": "image/png" }, body: image }) });

  assert.equal(request.model, "vision-test");
  assert.deepEqual(request.images, [image.toString("base64")]);
  assert.match(request.prompt, /图片/);
  assert.equal(result.provider, "ollama:vision-test");
});

test("vision failure retries with the existing text model without image bytes", async (t) => {
  const previous = {
    vision: process.env.OLLAMA_VISION_MODEL,
    text: process.env.OLLAMA_MODEL,
    disabled: process.env.OLLAMA_DISABLED,
    fetch: global.fetch,
  };
  t.after(() => {
    if (previous.vision === undefined) delete process.env.OLLAMA_VISION_MODEL;
    else process.env.OLLAMA_VISION_MODEL = previous.vision;
    if (previous.text === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previous.text;
    if (previous.disabled === undefined) delete process.env.OLLAMA_DISABLED;
    else process.env.OLLAMA_DISABLED = previous.disabled;
    global.fetch = previous.fetch;
  });
  process.env.OLLAMA_VISION_MODEL = "vision-test";
  process.env.OLLAMA_MODEL = "text-test";
  delete process.env.OLLAMA_DISABLED;
  const requests = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    if (request.model === "vision-test") throw new Error("vision model unavailable");
    return { ok: true, json: async () => ({ response: JSON.stringify({
      fact: "官方发布了新的模型。",
      impact: "这可能影响开发者的模型选择。",
      scenario: "可用于后续产品评估。",
      reason: "官方原文确认了此次发布。",
    }) }) };
  };
  const enhancer = loadEnhancerFresh();
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const result = await enhancer.enhanceItem({
    title: "Model launch",
    priorityTier: "official_first_party",
    media: [{ url: "https://example.com/chart.png", type: "image" }],
  }, { imageFetcher: async () => ({ status: 200, headers: { "content-type": "image/png" }, body: image }) });

  assert.deepEqual(requests.map((request) => request.model), ["vision-test", "text-test"]);
  assert.deepEqual(requests[0].images, [image.toString("base64")]);
  assert.equal(Object.hasOwn(requests[1], "images"), false);
  assert.equal(result.provider, "ollama:text-test");
});

test("source text includes a bounded set of image alt descriptions", () => {
  const text = sourceText({
    title: "Model launch",
    media: [
      { url: "https://example.com/chart.png", alt: "Chart: the new model reduces inference latency by 35%." },
      { url: "https://example.com/blank.png", alt: " " },
      { url: "https://example.com/long.png", alt: "A".repeat(400) },
      { url: "https://example.com/fourth.png", alt: "Fourth useful image caption." },
      { url: "https://example.com/fifth.png", alt: "Fifth caption must stay outside the prompt." },
    ],
  });

  assert.match(text, /reduces inference latency by 35%/);
  assert.match(text, /A{300}(?!A)/);
  assert.match(text, /Fourth useful image caption/);
  assert.doesNotMatch(text, /Fifth caption must stay outside the prompt/);
});

function loadEnhancerFresh() {
  delete require.cache[require.resolve("./store")];
  delete require.cache[require.resolve("./llmEnhancer")];
  return require("./llmEnhancer");
}

test("rules enhancement preserves authoritative reasons and replaces only automatic copy", async (t) => {
  const originalCwd = process.cwd();
  const originalDisabled = process.env.OLLAMA_DISABLED;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aibaize-enhancer-"));
  t.after(() => {
    process.chdir(originalCwd);
    if (originalDisabled === undefined) delete process.env.OLLAMA_DISABLED;
    else process.env.OLLAMA_DISABLED = originalDisabled;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  process.env.OLLAMA_DISABLED = "1";
  fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });

  const base = {
    url: "https://example.com/agent-migration",
    title: "OpenAI publishes an AI agent API migration timeline",
    summary: "The official release documents model compatibility, migration dates, evals, and deployment guidance for AI agent teams.",
    sourceName: "Verified Brief",
    sourceKind: "rss",
    priorityTier: "official_first_party",
    preferred: true,
    publishedAt: "2026-08-18T00:00:00.000Z",
  };
  const authoritative = [
    normalizeItem({ ...base, id: "selected", aiSelectedReason: "入选核验：官方原文给出了 API 迁移日期及兼容范围。" }),
    normalizeItem({ ...base, id: "judgment", editorialJudgment: "编辑判断：迁移窗口会直接影响现有智能体产品的升级排期。" }),
    normalizeItem({ ...base, id: "raw-reason", reason: "原始编辑理由：正文列明了模型兼容性和部署迁移步骤。" }),
    { ...normalizeItem({ ...base, id: "stored" }), raw: {}, reason: "已存编辑理由：团队已核验迁移截止日期，需保留此判断。" },
  ];
  const automatic = normalizeItem({ ...base, id: "automatic", url: "https://example.com/automatic-agent-update" });
  const automaticReason = automatic.reason;

  fs.writeFileSync(path.join(tempDir, "data", "db.json"), JSON.stringify({
    items: [...authoritative, automatic],
    sources: [],
    settings: { rules: {} },
  }, null, 2));

  const { enhanceRecentItems } = loadEnhancerFresh();
  const result = await enhanceRecentItems({ limit: 10, force: true });
  const stored = JSON.parse(fs.readFileSync(path.join(tempDir, "data", "db.json"), "utf8"));
  const byId = new Map(stored.items.map((item) => [item.id, item]));

  assert.equal(result.provider, "rules");
  for (const item of authoritative) assert.equal(byId.get(item.id).reason, item.reason);
  assert.notEqual(byId.get("automatic").reason, automaticReason);
  assert.equal(byId.get("automatic").llmProvider, "rules");
});

test('timeouts are classified by AbortError rather than its numeric DOMException code', async (t) => {
 t.mock.method(global, 'fetch', async () => { throw new DOMException('aborted', 'AbortError'); });
 const result = await loadEnhancerFresh().enhanceItem({ title: 'AI tools', raw: { summary: 'The API normalizes tool schemas.' } });
 assert.equal(result.failureCode, 'model_timeout');
});

test('latest all-feed articles get slots alongside preferred articles and older retries', async (t) => {
 const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibaize-fair-queue-'));
 t.after(() => { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); });
 process.chdir(dir); fs.mkdirSync('data');
 const base = { title: 'AI tools', raw: { summary: 'The API normalizes tool schemas.' } };
 const items = Array.from({ length: 10 }, (_, i) => ({ ...base, id: 'preferred-' + i, preferred: true, score: 99, publishedAt: '2026-10-05T00:00:00Z' }));
 items.push({ ...base, id: 'latest-all', score: 50, publishedAt: '2026-10-06T00:00:00Z' });
 items.push({ ...base, id: 'retry', llmProvider: 'rules', llmEnhancedAt: '2026-01-01T00:00:00Z', llmAttemptedModel: 'qwen3:1.7b' });
 const file = path.join(dir, 'data/db.json'); fs.writeFileSync(file, JSON.stringify({ items, sources: [], settings: {} }));
 t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ response: JSON.stringify({ fact: '官方说明了模型工具调用格式的转换方式。' }) }) }));
 await loadEnhancerFresh().enhanceRecentItems({ limit: 3 });
 const enhanced = JSON.parse(fs.readFileSync(file)).items.filter(item => item.llmProvider?.startsWith('ollama:'));
 assert.ok(enhanced.some(item => item.id === 'latest-all'));
 assert.ok(enhanced.some(item => item.id === 'retry'));
 assert.ok(enhanced.some(item => item.id.startsWith('preferred-')));
});

test('each completed summary is visible before the next model request finishes', async (t) => {
 const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibaize-live-summary-'));
 const previousConcurrency = process.env.LLM_ENHANCE_CONCURRENCY;
 t.after(() => { process.chdir(cwd); if (previousConcurrency === undefined) delete process.env.LLM_ENHANCE_CONCURRENCY; else process.env.LLM_ENHANCE_CONCURRENCY = previousConcurrency; fs.rmSync(dir, { recursive: true, force: true }); });
 process.env.LLM_ENHANCE_CONCURRENCY = '1'; process.chdir(dir); fs.mkdirSync('data');
 const base = { title: 'AI tools', raw: { summary: 'The API normalizes tool schemas.' } };
 const file = path.join(dir, 'data/db.json'); fs.writeFileSync(file, JSON.stringify({ items: [{ ...base, id: 'a' }, { ...base, id: 'b' }], sources: [], feedback: [], settings: {} }));
 let calls = 0;
 t.mock.method(global, 'fetch', async () => {
  if (++calls === 2) {
   const current = JSON.parse(fs.readFileSync(file));
   assert.ok(current.items[0].llmProvider?.startsWith('ollama:'));
   current.feedback.push({ id: 'during-next-request' }); fs.writeFileSync(file, JSON.stringify(current));
  }
  return { ok: true, json: async () => ({ response: JSON.stringify({ fact: '官方说明了模型工具调用格式的转换方式。' }) }) };
 });
 const result = await loadEnhancerFresh().enhanceRecentItems();
 assert.equal(calls, 2); assert.equal(result.enhanced, 2); assert.equal(JSON.parse(fs.readFileSync(file)).feedback[0].id, 'during-next-request');
});

test('old small-model title translations are upgraded instead of being skipped forever', async (t) => {
 const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibaize-upgrade-summary-'));
 t.after(() => { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); });
 process.chdir(dir); fs.mkdirSync('data');
 const file = path.join(dir, 'data/db.json'); fs.writeFileSync(file, JSON.stringify({ items: [{ id: 'old', title: 'AI tools', summary: '学习读取上下文标签', llmProvider: 'ollama:qwen2.5:0.5b', raw: { summary: 'The API normalizes tool schemas.' } }], sources: [], settings: {} }));
 t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ response: JSON.stringify({ fact: '官方说明了模型工具调用格式的转换方式。' }) }) }));
 assert.equal((await loadEnhancerFresh().enhanceRecentItems()).enhanced, 1);
});

test('long research abstracts send complete method sentences without cutting mid-sentence', async (t) => {
 let request;
 t.mock.method(global, 'fetch', async (_url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ response: JSON.stringify({ fact: '研究提出按需读取演示视频层级的方法。' }) }) }; });
 const background = 'Existing models have difficulty retaining the fine-grained visual details needed for execution. '.repeat(12);
 const method = 'We introduce Recursive Video In-Context Learning, a training-free method that exposes demonstration sub-events through read-only tools. Its levels grow finer from task keyframes to phases, moments and short clips.';
 await loadEnhancerFresh().enhanceItem({ title: 'Robot learning', sourceName: 'arXiv AI', sourceKind: 'arxiv', raw: { summary: background + method } });
 assert.match(request.prompt, /We introduce Recursive Video/); assert.match(request.prompt, /short clips\.$/);
 assert.doesNotMatch(request.prompt, /Existing models/);
});

test('research sentence selection preserves decimals and complete clauses', async (t) => {
 let request;
 t.mock.method(global, 'fetch', async (_url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ response: JSON.stringify({ fact: '研究提出新的方法，并报告原文中的对照结果。' }) }) }; });
 await loadEnhancerFresh().enhanceItem({ title: 'Robot learning', sourceKind: 'arxiv', raw: { summary: 'We introduce a robot learning method. Success grows from 92.6% to 96.5% under the tested protocol. The method needs one demonstration per task.' } });
 assert.match(request.prompt, /from __NUM_0__ to __NUM_1__/);
 assert.match(request.prompt, /one demonstration per task\.$/);
});

test('repeated failures back off instead of consuming every background batch', async (t) => {
 const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibaize-retry-backoff-'));
 t.after(() => { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); });
 process.chdir(dir); fs.mkdirSync('data');
 fs.writeFileSync('data/db.json', JSON.stringify({ items: [{ id: 'twice-failed', title: 'AI tools', preferred: true, llmProvider: 'rules', llmAttemptedModel: 'qwen3:1.7b', llmFailureCount: 2, llmEnhancedAt: new Date(Date.now() - 40 * 60000).toISOString(), raw: { summary: 'The API normalizes tool schemas.' } }], sources: [], settings: {} }));
 t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ response: JSON.stringify({ fact: '官方说明了模型工具调用格式的转换方式。' }) }) }));
 assert.equal((await loadEnhancerFresh().enhanceRecentItems()).applied, 0);
});
