# Editorial and Media Quality Implementation Plan

**Goal:** 修复用户已确认的中文摘要、标题污染、推荐理由与配图链路，不引入付费 API，不伪造翻译与图像。

**Architecture:** 原始采集字段作为事实输入，摘要结果单独存储并校验；标题保留完整原文证据；公开适配器与现有媒体组件传递真实图片。现有 SSR、权限、采集与数据库架构不替换。

**Tech Stack:** Node.js、Ollama、Express、React Router、TypeScript。

## 审查与边界

- 用户已确认上轮编辑链路方向并要求继续执行，本轮沿用该边界。
- 不新增图片生成、外部图片搜索、付费模型或装饰图。
- 非中文/空洞模型输出降级到标明原文摘录；不以刷新成功代替内容验收。
- ID、发布时间、隐藏/置顶、人工理由、反馈保持；增强任务不得回写旧快照覆盖同期更新。
- 标题只用明确 h1 / og:title / 卡片标题节点，不猜测拆分。

## 执行清单（各项先失败测试，再实现，再复核）

- [ ] `server/lib/llmEnhancer.test.js`：原始 raw 存在时，排除已生成摘要；规则降级不生成影响断言；拒绝非中文 fact；缺失 impact/scenario 不补造；同期反馈不丢失。
- [ ] `server/lib/llmEnhancer.js`：原文去重与隔离、中文事实/理由提示、输出门槛、摘录降级、提交前重读数据库并按原文一致性应用结果。运行 `node --test server/lib/llmEnhancer.test.js`。
- [ ] `server/site/router.test.js` / `server/site/projections.js`：普通新闻真实配图经代理传到公开列表与详情，视频不冒充图片；可信理由保留。
- [ ] `packages/contracts/src/site.ts` / `apps/web/app/features/feed/FeedItem.tsx` / `apps/web/app/routes/item.tsx`：用既有媒体组件展示新闻配图，摘要详情显示理由；无媒体不留空框。
- [ ] `server/lib/scrapers.test.js` / `server/lib/scrapers.js`：过滤导航/头像/跟踪图，保留明确正文/文章元数据；既有标题节点回归继续通过。
- [ ] 运行 `npm test`、`npm run test:web`、typecheck、build，核对真实数据副本；历史修复独立执行，禁止上传本地数据库。
- [ ] 备份目标代码/数据，保持单采集者；部署验证代码和构建，HTTPS smoke、浏览器内容与媒体检查；版本说明如实列剩余差距。
