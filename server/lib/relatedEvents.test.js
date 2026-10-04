const assert = require("node:assert/strict");
const test = require("node:test");

const { compareRelatedEvents } = require("./relatedEvents");

const pairs = [
  {
    name: "Claude Code graceful-stop reports match across languages",
    left: "Claude Code will gracefully stop when the five-hour limit is reached",
    right: "Claude Code 启用新机制：任务中途触发5小时上限后改为寻找合适收尾点",
    expected: "graceful_stop",
  },
  {
    name: "Project Suncatcher orbital prototype reports match across languages",
    left: "Google Project Suncatcher plans orbital prototype satellite to test TPUs",
    right: "谷歌 Project Suncatcher 计划发射首颗轨道原型卫星，测试 TPU 太空性能",
    expected: "orbital_prototype",
  },
  {
    name: "Anthropic appellate ruling reports match",
    left: "US appeals court rules on Anthropic supply-chain risk designation",
    right: "美国上诉法院裁定 Anthropic 供应链风险认定案",
    expected: "court_ruling",
  },
  {
    name: "LongCat 2.5 release reports match across languages",
    left: "Meituan releases LongCat 2.5 for long-horizon multimodal tasks",
    right: "LongCat 2.5 正式发布，支持长时序多模态任务",
    expected: "model_release",
  },
  {
    name: "versioned model availability reports match across outlets",
    left: "Gemini 3.7 Flash is now available in GitHub Copilot",
    right: "Gemini 3.7 Flash 已上线 GitHub Copilot",
    expected: "product_availability",
  },
  {
    name: "same model launch and benchmark reports do not match",
    left: "Claude Opus 5.5 officially launches",
    right: "Claude Opus 5.5 tops the Arena leaderboard",
    expected: null,
  },
  {
    name: "different unversioned model modalities from the same company do not match",
    left: "OpenAI releases a new audio model codenamed Cedar",
    right: "OpenAI releases a new image model codenamed Glass",
    expected: null,
  },
  {
    name: "same unversioned model codename reports match across languages",
    left: "OpenAI releases a new audio model codenamed Cedar",
    right: "OpenAI 发布 Cedar 音频模型",
    expected: "model_release",
  },
  {
    name: "same model pricing and research reports do not match",
    left: "DeepSeek V4.1 Flash pricing promotion arrives on OpenCode",
    right: "DeepSeek V4.1 Flash technical report studies model architecture",
    expected: null,
  },
  {
    name: "different research subjects from the same publisher do not match",
    left: "OpenAI publishes a technical report on model training efficiency",
    right: "OpenAI publishes a technical report on AI safety evaluations",
    expected: null,
  },
  {
    name: "research reports about the same versioned model remain candidates",
    left: "OpenAI publishes a technical report on GPT-6 Sol context extension",
    right: "OpenAI technical report studies the GPT-6 Sol context window",
    expected: "research_report",
  },
  {
    name: "Copilot platform consolidation and memory feature reports do not match",
    left: "Microsoft merges consumer and workplace Copilot into a super app",
    right: "GitHub Copilot adds persistent memory for coding agents",
    expected: null,
  },
  {
    name: "a Claude Code version release is not the graceful-stop event",
    left: "Claude Code Releases v2.1.283: fixes terminal redraw behavior",
    right: "Claude Code will gracefully stop when the five-hour limit is reached",
    expected: null,
  },
  {
    name: "different models on the same platform do not match",
    left: "Gemini 3.7 Flash is now available in GitHub Copilot",
    right: "Grok 4.6 is now available in GitHub Copilot",
    expected: null,
  },
  {
    name: "same model availability on different platforms does not match",
    left: "Gemini 3.7 Flash is now available in GitHub Copilot",
    right: "Gemini 3.7 Flash is now available on OpenRouter",
    expected: null,
  },
  {
    name: "same model trial offer on different platforms does not match",
    left: "LongCat-2.5-Preview free two-week trial on OpenCode",
    right: "LongCat-2.5-Preview free two-week trial on Cursor",
    expected: null,
  },
  {
    name: "shared company and court vocabulary without the same case is insufficient",
    left: "Anthropic files a new complaint in district court",
    right: "US appeals court rules on Anthropic supply-chain risk designation",
    expected: null,
  },
  {
    name: "a different Anthropic court case does not match the supply-chain ruling",
    left: "US appeals court rules on Anthropic copyright case",
    right: "US appeals court rules on Anthropic supply-chain risk designation",
    expected: null,
  },
  // Observed in AIHOT public story reports fetched on 2026-09-26.
  // AIHOT's own grouping is not used as the label; pairs are judged by the specific claim.
  {
    name: "live sample: LongCat 2.5 launch reports match",
    left: "LongCat-2.5-Preview现已上线，含1.6T参数、约48B活跃参数、1M token上下文窗口，原生多模态",
    right: "美团旗下 LongCat API 开放平台于9月25日上线 LongCat-2.5-Preview 大模型，主打长程任务与多模态能力，并同步开放 API 与网页端体验入口",
    expected: "product_availability",
  },
  {
    name: "live sample: OpenCode LongCat free-trial reports match",
    left: "LongCat-2.5-Preview 现可在 @opencode 免费试用两周",
    right: "LongCat-2.5-Preview在OpenCode平台免费开放两周",
    expected: "free_trial",
  },
  {
    name: "live sample: duplicate OpenCode LongCat two-week free offer reports match",
    left: "LongCat-2.5-Preview 在 OpenCode 免费两周",
    right: "LongCat-2.5-Preview 在 OpenCode 免费两周",
    expected: "free_trial",
  },
  {
    name: "live sample: LongCat trial and price notice are different changes",
    left: "LongCat-2.5-Preview 现可在 @opencode 免费试用两周",
    right: "LongCat-2.5-Preview 刚发布，定价与之前一样",
    expected: null,
  },
  {
    name: "live sample: DeepSeek permanent-credit offer reports match",
    left: "OpenCode宣布DeepSeek V4.1 Flash在OpenCode Go中60美元额度永久有效",
    right: "Operation Cheepseek Phase 2：DeepSeek v4.1 Flash 的 $60 使用额度现为永久",
    expected: "pricing_offer",
  },
  {
    name: "live sample: DeepSeek launch and permanent-credit offer are different changes",
    left: "DeepSeek 发布 DeepSeek-V4.1-Flash：以 CSA2 与 FP4 KV 缓存压缩推进长上下文智能体部署效率",
    right: "OpenCode宣布DeepSeek V4.1 Flash在OpenCode Go中60美元额度永久有效",
    expected: null,
  },
  {
    name: "live sample: DeepSeek launch and Engram-gates analysis are different stories",
    left: "DeepSeek 发布 DeepSeek-V4.1-Flash：以 CSA2 与 FP4 KV 缓存压缩推进长上下文智能体部署效率",
    right: "作者探测 V4.1 Flash 的 Engram gates，发现其文本模式超出姓名和事实",
    expected: null,
  },
  {
    name: "live sample: Google satellite announcement and Suncatcher mission report match",
    left: "Google 计划于10月1日发射搭载 TPUs 的 AI 卫星，测试其在太空环境中的表现",
    right: "谷歌 Project Suncatcher 计划在 SpaceX Transporter-18 任务发射首颗轨道原型卫星，测试 TPU 太空性能",
    expected: "orbital_prototype",
  },
  {
    name: "live sample: two Suncatcher prototype reports match",
    left: "Project Suncatcher 计划发射原型卫星在轨测试 @Google TPUs 并探索太空太阳能 AI 计算",
    right: "Google计划10月1日发射Project Suncatcher首颗实验卫星MVP，测试在轨AI数据中心",
    expected: "orbital_prototype",
  },
  {
    name: "live sample: Anthropic 2-to-1 appellate ruling reports match",
    left: "美国上诉法院以2:1裁定维持五角大楼将Anthropic列入国家安全供应链风险名单，Claude在五角大楼内仍被禁用",
    right: "美国联邦上诉法院以2-1维持五角大楼禁止Anthropic参与军事合同并认定其为国家安全供应链风险的决定",
    expected: "court_ruling",
  },
  {
    name: "live sample: temporary military-contract ruling report is the same case",
    left: "美国上诉法院以2:1裁定维持五角大楼将Anthropic列入国家安全供应链风险名单，Claude在五角大楼内仍被禁用",
    right: "美国哥伦比亚特区巡回上诉法院允许五角大楼暂时继续以国家安全风险为由阻止Anthropic参与军事合同",
    expected: "court_ruling",
  },
  {
    name: "live sample: Anthropic appellate ruling and Opus model release are separate events",
    left: "美国上诉法院以2:1裁定维持五角大楼将Anthropic列入国家安全供应链风险名单",
    right: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    expected: null,
  },
  {
    name: "live sample: Opus 5.5 launch headlines match",
    left: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    right: "Anthropic推出Opus 5.5",
    expected: "model_release",
  },
  {
    name: "live sample: Opus launch and Code Arena ranking are different events",
    left: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    right: "Claude Opus 5.5 (Max) 以1818分登顶 Code Arena: WebDev，并在多个领域进入前列",
    expected: null,
  },
  {
    name: "live sample: Code Arena ranking and Text Arena writing analysis are distinct benchmarks",
    left: "Claude Opus 5.5 (Max) 在 Code Arena: WebDev 排名第一，价格比次优模型 GPT-6 Astra (Max) 低 60%",
    right: "作者分析 Claude Opus 5.5 对比 Opus 5 在 Text Arena 高推理输出中的写作变化",
    expected: null,
  },
  {
    name: "live sample: two Opus 5.5 Code Arena WebDev ranking reports match",
    left: "Claude Opus 5.5 (Max) 在 Code Arena: WebDev 排名第一，价格比次优模型 GPT-6 Astra (Max) 低 60%",
    right: "Claude Opus 5.5 (Max) 以1818分登顶 Code Arena: WebDev，并在多个领域进入前列",
    expected: "benchmark_result",
  },
  {
    name: "adversarial synthetic: Code Arena WebDev and Vision subleaderboards are distinct",
    left: "Claude Opus 5.5 ranks first in Code Arena: WebDev",
    right: "Claude Opus 5.5 ranks first in Code Arena: Vision",
    expected: null,
  },
  {
    name: "live sample: GPT-6 Astra furniture-assembly benchmark reports match across outlets",
    left: "OpenAI GPT-6 Astra 在家具组装基准 FAB 上准确率达 80%，Claude Fable 5.1 为 70%",
    right: "OpenAI GPT-6 Astra 在 IKEA 家具组装错误识别上达到 80% 准确率",
    expected: "benchmark_result",
  },
  {
    name: "live sample: ChatGPT Voice tool-update reports match across outlets",
    left: "ChatGPT Voice 升级：可调用邮件、日历、Slack 插件并由 GPT-6 Astra、Sol、Luna 驱动",
    right: "OpenAI 更新 ChatGPT Voice：支持邮件、日历、Slack 插件并由 GPT-6 Astra、Sol、Luna 驱动",
    expected: "feature_update",
  },
  {
    name: "adversarial synthetic: distinct ChatGPT Voice capabilities do not match as one update",
    left: "OpenAI upgrades ChatGPT Voice with email, calendar, and Slack tools",
    right: "OpenAI updates ChatGPT Voice with real-time translation",
    expected: null,
  },
  {
    name: "adversarial synthetic: GPT-6 Astra furniture benchmark and Arena ranking are distinct",
    left: "OpenAI GPT-6 Astra 在家具组装基准 FAB 上准确率达 80%",
    right: "GPT-6 Astra 在 Code Arena: WebDev 榜单排名第四",
    expected: null,
  },
  {
    name: "live sample: same Artificial Analysis GPT-6 cost-and-index evaluation reports match",
    left: "Artificial Analysis 评测：GPT-6 Sol 和 Luna 以约一半成本保持与 GPT-5.6 系列相近的 Intelligence Index 得分",
    right: "Artificial Analysis 评测 GPT-6 Sol 和 Luna：价格减半但各项表现有升有降",
    expected: "benchmark_result",
  },
  {
    name: "adversarial live sample: GPT-6 Intelligence Index evaluation and Pareto-frontier analysis are distinct",
    left: "Artificial Analysis 评测：GPT-6 Sol 和 Luna 以约一半成本保持与 GPT-5.6 系列相近的 Intelligence Index 得分",
    right: "MiMo-V2.6-Pro、Claude Opus 5.5、GPT-6 Luna/Sol 发布改变智能指数与成本 Pareto 前沿",
    expected: null,
  },
  {
    name: "live sample: GPT-6 model launch and prompt-cache system release are distinct events",
    left: "OpenAI 发布 GPT-6 Sol 和 GPT-6 Luna，API 价格较 GPT-5.6 降 50%",
    right: "OpenAI 为 GPT-6 推出改进的提示词缓存系统与诊断工具",
    expected: null,
  },
  {
    name: "live sample: OpenRouter availability and Arena test rollout are distinct events",
    left: "OpenAI GPT-6 Sol 和 GPT-6 Luna 上线 OpenRouter",
    right: "Arena 上线 GPT-6 Sol 与 GPT-6 Luna 测试，评分即将公布",
    expected: null,
  },
  {
    name: "live sample: Opus 5.5 launch and migration guide publication are distinct events",
    left: "Anthropic 发布 Claude Opus 5.5：默认 1M token 上下文，面向长时间运行的智能体编码",
    right: "Anthropic 发布 Opus 5.5 迁移指南：Agent 半路停工的四类原因与三招续跑方案",
    expected: null,
  },
  {
    name: "adversarial synthetic: ChatGPT Voice tool update and Android availability are distinct",
    left: "ChatGPT Voice 升级：可调用邮件、日历、Slack 插件并由 GPT-6 Astra、Sol、Luna 驱动",
    right: "ChatGPT Voice 现已在 Android 上线，由 GPT-6 Astra、Sol、Luna 驱动",
    expected: null,
  },
  {
    name: "live sample: Opus launch and Replit integration are different events",
    left: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    right: "Replit Agent 新增 Claude Opus 5.5 模型，用户可试用并融入工作流",
    expected: null,
  },
  {
    name: "live sample: Opus launch and system-card safety report are different events",
    left: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    right: "Claude Opus 5.5 系统卡片披露：增加推理努力使模型更易服从隐藏在用户粘贴文本中的恶意指令",
    expected: null,
  },
  {
    name: "live sample: Opus launch and writing-style measurement are different events",
    left: "Anthropic 发布 Claude Opus 5.5，称多数工作能力达 Claude Fable 5.1 水平、典型任务成本较 Opus 5 低 40%",
    right: "Claude Opus 5.5 写作风格指标变化：em dash 下降95%、分号下降73%，回答变长6%、平均句长下降17%",
    expected: null,
  },
  // Observed in AIHOT's public reports on 2026-09-26; labels use claim + named target, not story membership.
  {
    name: "live sample: Microsoft Copilot redesign reports match across outlets",
    left: "宣布 Copilot 迄今最大更新，将 Autopilot、Code、Home 和 Office 整合在一起，并可在 Teams 中调用 Copilot",
    right: "微软正式推出重新设计的Copilot超级应用，把AI聊天、编码和Autopilot智能体整合到单一界面中",
    expected: "product_consolidation",
  },
  {
    name: "live sample: GPT-6 Sol/Luna launch and pricing reports match across outlets",
    left: "OpenAI 发布 GPT-6 Sol 和 GPT-6 Luna，API 价格比 GPT-5.6 促销价低 50%",
    right: "GPT-6 Sol 与 Luna 发布，API 价格比 GPT-5.6 低 50%",
    expected: "model_release",
  },
  {
    name: "adversarial synthetic: same GPT-6 models with pricing overlap but distinct availability event do not match",
    left: "OpenAI 发布 GPT-6 Sol 和 GPT-6 Luna，API 价格比 GPT-5.6 促销价低 50%",
    right: "GPT-6 Sol 和 GPT-6 Luna 现已接入 OpenRouter，按 API 价格计费",
    expected: null,
  },
  {
    name: "live sample: Artificial Analysis Grok 4.7 index reports match across outlets",
    left: "Artificial Analysis 评测 Grok 4.7：智能指数 46 分进入前四，编码智能体升至第 4",
    right: "Artificial Analysis 评测 Grok 4.7：智能指数得分 46，编码智能体指数升至 56",
    expected: "benchmark_result",
  },
  {
    name: "live sample: Grok 4.7 Intelligence Index and WebDev Arena ranking are distinct",
    left: "Artificial Analysis 评测 Grok 4.7：智能指数得分 46，编码智能体指数升至 56",
    right: "Grok 4.7 在 Code Arena: WebDev 排名第四",
    expected: null,
  },
  {
    name: "live sample: MiMo V2.6 Pro launch reports match across outlets",
    left: "小米发布 MiMo-V2.6 Pro 与 Flash 开源全模态模型，Pro 在多数 Agent 基准上对标 Claude Opus 5 和 GPT-5.6 Sol",
    right: "小米发布 MiMo-V2.6 Pro 与 Flash 全模态开源模型",
    expected: "model_release",
  },
  {
    name: "live sample: MiMo V2.6 Pro release and Code Arena ranking are distinct events",
    left: "小米发布 MiMo-V2.6 Pro 与 Flash 全模态开源模型",
    right: "小米 MiMo-V2.6-Pro 登上 Code Arena: WebDev 榜约第10名，开源权重中约第3",
    expected: null,
  },
  {
    name: "live sample: Qwen Image 2.1 release reports match across outlets",
    left: "通义千问发布 Qwen-Image-2.1：7B 单检查点同时支持图像生成与编辑",
    right: "Qwen 开源 Qwen-Image-2.1：7B 统一生成与编辑并原生支持透明图像",
    expected: "model_release",
  },
  {
    name: "adversarial synthetic: Qwen Image 2.1 and Qwen 3.7 Flash are different models",
    left: "Qwen-Image-2.1 正式发布，支持图像生成与编辑",
    right: "Qwen 3.7 Flash 正式发布，支持快速文本推理",
    expected: null,
  },
  {
    name: "live sample: Claude Marketplace launch reports match across outlets",
    left: "Claude Marketplace 上线，可发现工具、智能体与服务伙伴",
    right: "Anthropic 上线 Claude Marketplace：一站式提供插件、智能体与服务伙伴",
    expected: "product_availability",
  },
  {
    name: "English Claude Marketplace launches are product availability, not model releases",
    left: "Anthropic launches Claude Marketplace: a catalog for tools, agents, and service partners",
    right: "Claude Marketplace launches as a catalog for plugins, agents, and service partners",
    expected: "product_availability",
  },
  {
    name: "English and Chinese Claude Marketplace launch reports match",
    left: "Anthropic launches Claude Marketplace: a catalog for tools, agents, and service partners",
    right: "Claude Marketplace 上线，可发现工具、智能体与服务伙伴",
    expected: "product_availability",
  },
  {
    name: "adversarial synthetic: Claude Marketplace launch and Claude Code graceful stop are distinct",
    left: "Claude Marketplace 上线，可发现工具、智能体与服务伙伴",
    right: "Claude Code will gracefully stop when the five-hour limit is reached",
    expected: null,
  },
  {
    name: "live sample: OpenAI 53-image exposure reports match across outlets",
    left: "OpenAI 承认 AI 智能体将 53 张用户图片发布到公开图床",
    right: "OpenAI 智能体在未知情情况下将 53 张用户图片发布到公开图床",
    expected: "user_image_exposure",
  },
  {
    name: "live sample: OpenAI agent-database activity reports match across outlets",
    left: "OpenAI 智能体集群数月来入侵在线数据库搜寻冷门数据，Transluce 与澳政府相继披露",
    right: "Thomas Wolf 转评 Transluce 披露：发布 3 万余条日志，称涉及 OpenAI 攻击澳大利亚政府及更早的智能体活动",
    expected: "agent_data_reconnaissance",
  },
  {
    name: "adversarial live sample: OpenAI image exposure and database reconnaissance are distinct incidents",
    left: "OpenAI 承认 AI 智能体将 53 张用户图片发布到公开图床",
    right: "OpenAI 智能体集群数月来入侵在线数据库搜寻冷门数据，Transluce 与澳政府相继披露",
    expected: null,
  },
];

for (const pair of pairs) {
  test(pair.name, () => {
    const result = compareRelatedEvents({ title: pair.left }, { title: pair.right });
    assert.equal(result?.eventType || null, pair.expected);
  });
}

test("same original article URL is a related candidate even when titles differ", () => {
  const result = compareRelatedEvents(
    { title: "作者分享用 logprobs 读取 LLM 选项概率的单函数封装", links: { original: "http://allanrbo.blogspot.com/2026/09/a-jev-like-wrapper-for-llms-including.html" } },
    { title: "用读取 token 概率实现 Jev 风格的单函数 LLM 封装器", links: { original: "http://allanrbo.blogspot.com/2026/09/a-jev-like-wrapper-for-llms-including.html" } },
  );
  assert.equal(result?.eventType || null, "same_original_url");
});

test("different original URLs do not match solely on a similar title", () => {
  const result = compareRelatedEvents(
    { title: "LLM probabilities with a Jev-style wrapper", links: { original: "https://example.com/article-a" } },
    { title: "LLM probabilities with a Jev-style wrapper", links: { original: "https://example.com/article-b" } },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: a Drawgent launch mentioning Claude Code is not a Claude Code model release", () => {
  const result = compareRelatedEvents(
    { title: "Drawgent 发布：把 Claude Code、Codex 或 opencode 接入实时 Excalidraw 画布的编码智能体工具" },
    { title: "Claude Code 推出新机制：任务中途触发 5 小时上限将优雅收尾" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: a Claude Code integration tool is not Claude Code cloud-session availability", () => {
  const cloudRelease = compareRelatedEvents(
    {
      title: "Anthropic Claude Code 云会话正式上线，Pro/Max 用户可领 100~250 美元额度",
      summary: "Claude Code 云会话结束预览、正式上线，关闭电脑后任务可在云端继续运行。",
    },
    {
      title: "Claude Code cloud sessions are now available for Pro and Max users",
      summary: "Cloud sessions are now generally available and continue running after your computer is closed.",
    },
  );
  const drawgent = compareRelatedEvents(
    {
      title: "Anthropic Claude Code 云会话正式上线，Pro/Max 用户可领 100~250 美元额度",
      summary: "Claude Code 云会话结束预览、正式上线，关闭电脑后任务可在云端继续运行。",
    },
    {
      title: "Drawgent 发布：把 Claude Code、Codex 或 opencode 接入实时 Excalidraw 画布的编码智能体工具",
      summary: "Drawgent 将用户自装的 Claude Code、Codex 或 opencode 接入 Excalidraw 白板，支持智能体实时编辑画布。",
    },
  );
  assert.equal(cloudRelease?.eventType || null, "product_availability");
  assert.equal(drawgent?.eventType || null, null);
});

test("adversarial live sample: generic product availability does not merge unrelated OpenAI or ChatGPT updates", () => {
  const voicePluginOutlet = "OpenAI 宣布 ChatGPT Voice 支持插件并可用于 ChatGPT Work";
  const sandboxPause = compareRelatedEvents(
    { title: voicePluginOutlet },
    { title: "OpenAI 暂停最强模型训练，此前沙盒模型因漏洞接入互联网" },
  );
  const modemPlugin = compareRelatedEvents(
    { title: voicePluginOutlet },
    { title: "Modem 推出官方插件，可将 Modem 接入 ChatGPT" },
  );
  const sameVoicePlugin = compareRelatedEvents(
    { title: voicePluginOutlet },
    { title: "ChatGPT Voice plugins are now rolling out in ChatGPT Work" },
  );
  assert.equal(sandboxPause?.eventType || null, null);
  assert.equal(modemPlugin?.eventType || null, null);
  assert.equal(sameVoicePlugin?.eventType || null, "product_availability");
});

test("adversarial live sample: a named Anthropic product launch does not match another product's launch", () => {
  const marketplace = { title: "Anthropic 上线 Claude Marketplace：一站式提供插件、智能体与服务伙伴" };
  const cloudSessions = { title: "Anthropic Claude Code 云会话正式上线，Pro/Max 用户可领 100~250 美元额度" };
  const creditReset = { title: "Anthropic 为 Claude 上线限时免费额度重置功能，每位用户仅可用一次" };
  const marketplaceReports = compareRelatedEvents(
    marketplace,
    { title: "Claude Marketplace 上线，可发现工具、智能体与服务伙伴" },
  );
  assert.equal(marketplaceReports?.eventType || null, "product_availability");
  assert.equal(compareRelatedEvents(marketplace, cloudSessions)?.eventType || null, null);
  assert.equal(compareRelatedEvents(marketplace, creditReset)?.eventType || null, null);
});

test("adversarial live sample: mentioning ChatGPT in an integration launch is not a GPT model release", () => {
  const result = compareRelatedEvents(
    { title: "OpenAI 在 ChatGPT 移动端推出语音触发的智能体功能" },
    { title: "Modem 推出官方插件，可将 Modem 接入 ChatGPT" },
  );
  assert.equal(result?.eventType || null, null);
});

test("versioned Claude model release remains a candidate when one headline mentions Claude Code", () => {
  const result = compareRelatedEvents(
    { title: "Anthropic 发布 Claude Opus 5.5，并接入 Claude Code" },
    { title: "Anthropic launches Claude Opus 5.5" },
  );
  assert.equal(result?.eventType || null, "model_release");
});

test("adversarial live sample: an Opus-powered video agent launch is not a Claude Opus model release", () => {
  const result = compareRelatedEvents(
    { title: "Claude Opus 5.5 与 GPT-6 Sol、Luna 同日发布，主打性价比与降本" },
    {
      title: "Opus 5.5 制作讲解视频的开源 agent 方案 shipvideo 发布",
      summary: "作者发布 shipvideo，用 anthropic/claude-opus-5.5 通过 OpenComputer serverless agent 将 URL 或提示词渲染成 MP4 讲解视频。",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: a Tripo Opus prompt library is not the Opus model release", () => {
  const result = compareRelatedEvents(
    { title: "Anthropic 发布 Claude Opus 5.5：默认 1M token 上下文，面向长时间运行的智能体编码" },
    {
      title: "Tripo 推出 Claude Opus 5.5 3D 提示词库",
      summary: "Tripo 整理 400 多条 Claude Opus 5.5 提示词，用于 AI 原生 3D 创作。",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: a multi-story AI daily brief is not an individual model release", () => {
  const result = compareRelatedEvents(
    { title: "Anthropic 发布 Claude Opus 5.5：默认 1M token 上下文，面向长时间运行的智能体编码" },
    {
      title: "9月23日AI日报：GPT-6与Claude Opus 5.5发布",
      summary: "OpenAI 在 ChatGPT Work 和 Codex 中推出 GPT-6 Sol 和 Luna；另含多条 AI 新闻。",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Ming-Image-0.1-Design release reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "蚂蚁百灵 Ming-Image-0.1-Design 上线" },
    { title: "蚂蚁百灵开源 Ming-Image-0.1-Design 系列模型，UI 设计专项评测位列开源第一" },
  );
  assert.equal(result?.eventType || null, "ming_image_0_1_design_release");
});

test("adversarial live sample: a different Ming-Image release is not Ming-Image-0.1-Design", () => {
  const result = compareRelatedEvents(
    { title: "蚂蚁百灵 Ming-Image-0.1-Design 上线" },
    { title: "蚂蚁百灵开源 Ming-Image-0.2-Design 系列模型" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Nemotron 3 Diarization model-release reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Nvidia 发布开源语音分离模型 Nemotron 3 Diarization，实时区分最多八位说话人" },
    { title: "NVIDIA 发布开源说话人分离模型 Nemotron 3 Diarization，支持实时追踪 8 个说话人" },
  );
  assert.equal(result?.eventType || null, "model_release");
});

test("adversarial live sample: Baseten hosting availability is not the Nemotron model release", () => {
  const result = compareRelatedEvents(
    { title: "Nvidia 发布开源语音分离模型 Nemotron 3 Diarization，实时区分最多八位说话人" },
    { title: "NVIDIA Nemotron 3 Diarization 上线 Baseten，单个 checkpoint 支持四档延迟配置" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: a GPT-6-level forecast is not a report about the GPT-6 models", () => {
  const result = compareRelatedEvents(
    { title: "MiMo-V2.6-Pro、Claude Opus 5.5、GPT-6 Luna/Sol 发布改变智能指数与成本 Pareto 前沿" },
    { title: "马斯克：SpaceX 2-3 月内推出 Fable/GPT-6 级模型" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: generic price language cannot join distinct Opus 5.5 benchmarks", () => {
  const result = compareRelatedEvents(
    { title: "Artificial Analysis：Claude Opus 5.5 登顶 Coding Agent Index，但单任务成本升至 $13.04" },
    { title: "Claude Opus 5.5（Max）登顶 Arena Code Arena：WebDev，价格比第二名低 60%" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: different models arriving on OpenRouter do not match", () => {
  const result = compareRelatedEvents(
    { title: "Kev 4B 开源模型上线 OpenRouter" },
    { title: "Perceptron Mk1.5 上线 OpenRouter" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: Qwen-Image leaderboard results are distinct from derived model launches", () => {
  const ranking = { title: "Qwen-Image-2.1 登顶 Arena 图像编辑与文生图开源榜第一" };
  assert.equal(compareRelatedEvents(
    ranking,
    { title: "Qwen-Image-2.1-viggle-turbo v0.2 发布" },
  )?.eventType || null, null);
  assert.equal(compareRelatedEvents(
    ranking,
    { title: "Pruna 发布 Qwen-Image-2.1 少步数 LoRA 适配器，图像生成提速至 6.3 倍" },
  )?.eventType || null, null);
});

test("live holdout: OpenRouter Jev Router launch reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "OpenRouter 推出 Jev 缓存感知模型路由器" },
    { title: "OpenRouter 推出 Jev Router，为每次 LLM 调用自动选择模型和推理力度" },
  );
  assert.equal(result?.eventType || null, "openrouter_jev_router_release");
});

test("adversarial live sample: the OpenRouter embedding-model guide is not a Jev Router launch", () => {
  const result = compareRelatedEvents(
    { title: "OpenRouter 发布 2026 年最佳嵌入模型选型指南，覆盖 37 个目录条目" },
    { title: "OpenRouter 推出 Jev 缓存感知模型路由器" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Rabbit OS3 launch reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Rabbit 发布 OS3 智能体操作系统，无需 R1 硬件即可运行" },
    { title: "rabbit 发布 OS3 智能体操作系统，支持多设备编排" },
  );
  assert.equal(result?.eventType || null, "rabbit_os3_release");
});

test("adversarial live sample: a different Rabbit OS release does not match OS3", () => {
  const result = compareRelatedEvents(
    { title: "Rabbit 发布 OS3 智能体操作系统，无需 R1 硬件即可运行" },
    { title: "Rabbit 发布 OS2 智能体操作系统，新增本地设备管理" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Meta's OpenClaw-inspiration acknowledgment reports match across outlets", () => {
  const result = compareRelatedEvents(
    { title: "Meta admits Muse's likeness to OpenClaw isn't a coincidence" },
    { title: "Meta 承认 Muse 深受 OpenClaw 启发但为从零构建" },
  );
  assert.equal(result?.eventType || null, "meta_muse_openclaw_inspiration_ack");
});

test("adversarial live sample: resemblance coverage is distinct from Meta's later OpenClaw acknowledgment", () => {
  const result = compareRelatedEvents(
    { title: "Meta 承认 Muse 深受 OpenClaw 启发但为从零构建" },
    { title: "The Verge 分析 Meta 的 Muse 与 Instinct 为何都像 OpenClaw" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: SemiAnalysis China Datacenter Model reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "SemiAnalysis 发布中国数据中心模型，测算中国存量容量超过 24GW" },
    { title: "SemiAnalysis 发布中国数据中心模型，解读中国 AI 基础设施热潮" },
  );
  assert.equal(result?.eventType || null, "semianalysis_china_datacenter_model");
});

test("adversarial live sample: separate SemiAnalysis ClusterMAX research is not the China Datacenter Model", () => {
  const result = compareRelatedEvents(
    { title: "SemiAnalysis 发布中国数据中心模型，测算中国存量容量超过 24GW" },
    { title: "SemiAnalysis 发布 ClusterMAX 3.0：集群配置如何影响实际性能" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Claude Tag personal-connectors announcement reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Claude Tag now supports personal connectors in channels" },
    { title: "Claude Tag 支持在 Slack 频道中使用个人连接器" },
  );
  assert.equal(result?.eventType || null, "claude_tag_personal_connectors");
});

test("adversarial live sample: shared Claude Tag brand without personal connectors is insufficient", () => {
  const result = compareRelatedEvents(
    { title: "Claude Tag now supports personal connectors in channels" },
    { title: "Claude Tag now supports shared channel connectors installed by admins" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Midjourney V8.1/V8.2 tile-update reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Midjourney 更新编辑模型与缩略图预览，V8.1/8.2 平铺无缝化" },
    { title: "Midjourney 发布 v8.1/v8.2 的 --tile 更新并预览实时模型" },
  );
  assert.equal(result?.eventType || null, "midjourney_v8_tile_update");
});

test("live holdout: Epoch AI Furniture Assembly Benchmark reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Epoch AI 发布家具组装基准 FAB", summary: "最高分在 10 个月内从 28% 升到 80%。" },
    { title: "Epoch AI 发布家具组装基准 FAB，最高分 10 个月从 28% 升至 80%" },
  );
  assert.equal(result?.eventType || null, "benchmark_result");
});

test("adversarial live sample: Epoch AI reports about different benchmarks do not match", () => {
  const result = compareRelatedEvents(
    { title: "Epoch AI 发布家具组装基准 FAB" },
    { title: "Epoch AI 发布代码审查智能体新基准 CodeReviewBench" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: MentalHealthBench launch reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "OpenAI 联合 80 多位心理健康专家发布开放基准 MentalHealthBench" },
    { title: "OpenAI 发布 MentalHealthBench：1215 段对话评估 AI 心理健康应对能力" },
  );
  assert.equal(result?.eventType || null, "benchmark_result");
});

test("adversarial live sample: MentalHealthBench launch is not an unrelated OpenAI benchmark result", () => {
  const result = compareRelatedEvents(
    { title: "OpenAI 联合 80 多位心理健康专家发布开放基准 MentalHealthBench" },
    { title: "OpenAI 发布 CodeReviewBench：评估代码审查模型的缺陷发现能力" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Stanford and Together AI SAT paper reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Stanford 与 Together AI 论文提出 Self-Organizing Agent Teams，3 模型协作团队准确率达 66.7%" },
    { title: "Stanford 与 Together AI 论文提出 SAT：智能体团队自学协作策略，五项基准平均达 66.7%" },
  );
  assert.equal(result?.eventType || null, "stanford_together_sat_paper");
});

test("adversarial live sample: another Stanford and Together AI paper is distinct from SAT", () => {
  const result = compareRelatedEvents(
    { title: "Stanford 与 Together AI 论文提出 Self-Organizing Agent Teams（SAT）" },
    { title: "Stanford 与 Together AI 发布多智能体辩论和投票方法研究" },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial live sample: the same Midjourney versions with live previews are a different update", () => {
  const result = compareRelatedEvents(
    { title: "Midjourney 更新编辑模型与缩略图预览，V8.1/8.2 平铺无缝化" },
    { title: "Midjourney V8.1/8.2 Live previews show prompt style thumbnails" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Perplexity Portable Computer AMD support reports match when one title omits the hardware family", () => {
  const result = compareRelatedEvents(
    {
      title: "Perplexity 推出 Windows 便携电脑",
      summary: "Portable Computer 现已在 AMD Ryzen AI Max 系列处理器上推出，可在本地运行 AI 智能体。",
    },
    {
      title: "Perplexity Computer 支持 AMD 本地 AI",
      summary: "Portable Computer for Windows 现已在 AMD Ryzen AI Max 系列处理器上线，可本地运行 AI 智能体。",
    },
  );
  assert.equal(result?.eventType || null, "perplexity_portable_computer_amd_support");
});

test("adversarial live sample: a different Perplexity Portable Computer hardware rollout does not match AMD support", () => {
  const result = compareRelatedEvents(
    {
      title: "Perplexity 推出 Windows 便携电脑",
      summary: "Portable Computer 现已在 AMD Ryzen AI Max 系列处理器上推出，可在本地运行 AI 智能体。",
    },
    {
      title: "Perplexity Portable Computer adds Linux RTX support",
      summary: "Portable Computer is now available for Linux PCs with supported NVIDIA RTX GPUs.",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: Odyssey Agora-2 launch reports match across sources", () => {
  const result = compareRelatedEvents(
    { title: "Odyssey 发布多智能体世界模型 Agora-2，支持最多 20 个人类与智能体实时共享模拟环境" },
    { title: "Odyssey 发布 Agora-2 多智能体世界模型" },
  );
  assert.equal(result?.eventType || null, "odyssey_agora_2_release");
});

test("adversarial live sample: Odyssey-3 launch does not match the Agora-2 release", () => {
  const result = compareRelatedEvents(
    { title: "Odyssey 发布多智能体世界模型 Agora-2，支持最多 20 个人类与智能体实时共享模拟环境" },
    { title: "Odyssey launches Odyssey-3, a single-agent world model" },
  );
  assert.equal(result?.eventType || null, null);
});

test("live holdout: September 20 DNS sandbox escape training-pause reports match across outlets", () => {
  const result = compareRelatedEvents(
    {
      title: "OpenAI 因多起模型失控事件暂停最强模型训练",
      summary: "9 月 20 日一款沙盒测试中的模型利用漏洞获得互联网访问权限，OpenAI 暂停旗下能力最强模型训练。",
    },
    {
      title: "OpenAI 暂停其最强模型的训练，此前沙盒中的模型利用漏洞接入互联网",
      summary: "OpenAI 在沙盒测试中的模型于 9 月 20 日利用漏洞接入互联网后，决定暂停其最强模型训练。",
    },
  );
  assert.equal(result?.eventType || null, "sandbox_escape_training_pause");
});

test("adversarial holdout: July Hugging Face sandbox breach is distinct from September DNS escape", () => {
  const result = compareRelatedEvents(
    {
      title: "OpenAI 因多起模型失控事件暂停最强模型训练",
      summary: "9 月 20 日一款沙盒测试中的模型利用漏洞获得互联网访问权限，OpenAI 暂停旗下能力最强模型训练。",
    },
    {
      title: "OpenAI AI 智能体突破沙箱并入侵 Hugging Face",
      summary: "7 月 20 日数千个 AI 智能体突破沙盒并攻击 Hugging Face，OpenAI 随后暂停强化学习训练两周。",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("live sample: Chinese and English reports of OpenAI exposing 53 user images match", () => {
  const chineseReport = {
    title: "OpenAI 通报其 AI 智能体干扰多个美国政府机构网站并致用户图片外泄",
    summary: "OpenAI 称 53 张用户提供的图片被发布到公开图床，作为未列出的链接。",
  };
  const englishReports = [
    {
      title: "Unsecured OpenAI agents posted 53 user images on the internet without the lab's knowledge",
      summary: "The 53 user-provided images were uploaded to image hosts as unlisted links.",
    },
    {
      title: "OpenAI says agents leaked 53 images from ChatGPT users",
      summary: "The user images were posted to image hosts as unlisted URLs.",
    },
  ];
  for (const englishReport of englishReports) {
    const result = compareRelatedEvents(chineseReport, englishReport);
    assert.equal(result?.eventType || null, "user_image_exposure");
    assert.match(result?.reason || "", /尚未确认属于同一事件/);
  }
});

test("live holdout: AIHOT's current '53 incidents' summary matches the user-image disclosure, not an image count", () => {
  const result = compareRelatedEvents(
    {
      title: "OpenAI 通报其 AI 智能体干扰多个美国政府机构网站并致用户图片外泄",
      summary: "另有至少 53 起事件中智能体将 ChatGPT 用户图片转移到外部，OpenAI 正按月回溯审查智能体训练活动。",
    },
    {
      title: "OpenAI says agents leaked 53 images from ChatGPT users",
      summary: "The user images were posted to image hosts as unlisted URLs.",
    },
  );
  assert.equal(result?.eventType || null, "user_image_exposure");
});

test("adversarial live sample: OpenAI's separate Australian health-data incident is not the 53-image exposure", () => {
  const result = compareRelatedEvents(
    {
      title: "OpenAI 通报其 AI 智能体干扰多个美国政府机构网站并致用户图片外泄",
      summary: "OpenAI 称 53 张用户提供的图片被发布到公开图床，作为未列出的链接。",
    },
    {
      title: "OpenAI says agents spent a week trying to access Australian health data",
      summary: "Australian officials said there was no evidence sensitive Medicare data was accessed; the incident was not formally linked to the US website activity.",
    },
  );
  assert.equal(result?.eventType || null, null);
});

test("adversarial synthetic: publishing 53 AI-generated images is not user-image exposure", () => {
  const result = compareRelatedEvents(
    {
      title: "OpenAI publishes 53 AI-generated images on the internet",
      summary: "The model's generated images were uploaded to a public image host.",
    },
    {
      title: "OpenAI publishes 53 AI-generated images on the internet",
      summary: "The generated images are now online.",
    },
  );
  assert.equal(result?.eventType || null, null);
});
