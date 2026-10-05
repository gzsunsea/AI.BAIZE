# 2026-10-05 对标跟进：恢复生产采集

## 本轮结论

【事实】生产已使用独立 React Router SSR 前端，活动目录为 `/opt/aibaize-releases/rebuild-20261005`，服务为 `aibaize-api` / `aibaize-web`。本轮没有重复部署旧工作区的新前端草稿，也没有替换生产数据库。原重建与切换证据见 [实施计划](../superpowers/plans/2026-10-04-aihot-rebuild.md)。

【事实】检查时正式 API 仍使用候选阶段的 `COLLECT_ENABLED=false`，旧 `aihot.service` 已停用；定时器、root crontab 和进程检查未发现其他应用采集入口。公开刷新时间停在 `2026-10-05T08:30:57.823Z`（北京时间 16:30）。这是部署交接中遗漏的采集开关，不应归因于用户修改服务器配置。

## 执行前对抗性审查

- **错误基线风险**：旧工作区未反映已上线重建，重复覆盖会损失既有成果。改用 `/Volumes/DATA/codex/aibaize-rebuild` 的 `rebuild/aihot-20261004` 分支；旧工作区草稿保留但不纳入发布。
- **重复写入风险**：先确认旧服务 inactive，未发现其他采集进程，再仅启用正式 API 的采集；候选继续禁用。
- **数据覆盖风险**：生产数据库与原路由、服务配置备份到 `/opt/aibaize-rollbacks/collection-recovery-20261005`，目录权限 0700；仅上传健康路由和 systemd drop-in，不同步本地数据。
- **虚假成功风险**：`ok:true` 不证明采集工作；采集启用、刷新时间推进、实际 run/source health 分开验收。
- **虚假对齐风险**：不添加未经核实的趋势、讨论人数、排名或全文；不能把框架一致等同于内容质量一致。

## 本轮改动

1. `/api/health` 新增 `collection.enabled`、`collection.cron`、`collection.refreshedAt`，响应禁止缓存。`enabled` 表示环境配置，不是本轮采集成功率，也不证明未来定时执行已发生。
2. 添加正式 API 专用 systemd drop-in：`COLLECT_ENABLED=true`，发布标识 `20261005-collection-recovery`。仅重启 API，SSR 前端与旧服务状态不变。
3. 更新部署文档：候选/正式采集边界、HTTPS 后台入口、回滚与刷新验收要求。

## 新鲜验证证据

- 新增健康接口回归用例先失败（原接口没有 collection），修复后通过。
- 后端 **303/303**、前端 **33/33** 通过；typecheck、SSR build、`git diff --check` 通过。
- 正式域名 80 项 smoke 通过，含页面、详情、报告、静态资源、未知资源与后台未授权边界。该 smoke 不覆盖所有浏览器交互。
- 浏览器重新打开正式精选页，确认导航、分类、日期分组、摘要、推荐理由与收藏入口可见；本轮不重复宣称此前完整响应式验收已重新执行。
- 生产健康接口返回发布标识 `20261005-collection-recovery`、采集启用、cron `*/30 * * * *`。
- 首轮刷新推进到 **`2026-10-05T13:16:12.732Z`（北京时间 21:16）**；本轮 run 抓取 **247** 条、保留库存 **2000** 条，healthy sources **31**。
- run `ok:false`：Anthropic News / Research 抓取失败，Claude Code Releases 超时。这些失败已记录，不能写成“全部信源恢复”。首轮完成不证明之后半小时定时任务均已成功。
- 原始本机验收文件：`/tmp/aibaize-collection-recovery-tests.log`、`/tmp/aibaize-collection-recovery-web.log`、`/tmp/aibaize-collection-recovery-typecheck.log`、`/tmp/aibaize-collection-recovery-build.log`、`/tmp/aibaize-collection-recovery-production-smoke.json`；临时文件不是永久审计档案，本节记录可复核结果。

## 对标差异与下一轮顺序

2026-10-05 实际查看 [AIHOT 首页](https://aihot.news/) 与 [AI.BAIZE 首页](https://www.aibaize.cc/)。对标站展示中文事实摘要、具体推荐理由、日期分组与多信源报道，同时另有模型榜 / Tibo 监控导航。来源网页仅用于观察产品呈现，不把其中新闻数字当成已独立核实的事实。

【事实】本站样本仍有英文标题、截断标题、重复“事实摘要”与泛化影响/场景文案；部分推荐理由夹带长篇原始卡片文本。已有源权重不是中文内容质量达标的证据。恢复采集本身不能解决这些问题。

【观点】后续应按以下优先级继续，而不是先增加装饰模块：

1. **编辑链路**：以原始正文为唯一事实输入，排除再次输入已生成摘要；明确原文摘录 / 中文摘要 / 未验证判断的边界，修复长卡片污染。先固定案例和失败测试，再改代码；保留人工及可信来源的推荐理由。
2. **结果质量**：检查实际精选的中文可读性、第一方/X/专家来源占比、同事件去重与来源多样性；同时复核免费源失败和刷新持续性。不能仅凭 fetched 数判断质量。
3. **模块差异**：模型榜 / Tibo 监控需要独立的数据来源、更新机制和许可证据。本轮没有接入；【无法确认】能否在免费与现有运行条件下提供同等数据，不能先放假榜单。

每一步执行前继续做对抗性审查，验收证据不足则不写“完全对齐”。

## 回滚边界

优先回滚本轮代码/配置，不回滚最新运行数据：从私有备份恢复 `server/site/router.js`；将 `10-collection.conf` 移到回滚目录而非永久删除；daemon-reload 后重启正式 API。数据库备份仅用于确认实际损坏后的受控恢复，不能因为代码回滚就覆盖新增内容与反馈。旧 `aihot.service` 不与正式采集同时启动。
