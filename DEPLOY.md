# 部署到火山引擎云服务器

这是一个 React Router SSR + Express 全栈站点。SSR web 服务负责页面，Express API 服务负责采集、公开接口和后台，Nginx 负责 HTTPS 反向代理。

目标服务器：

- 公网 IP：`101.96.213.103`
- 系统：Ubuntu 24.04 64 bit
- 已放行端口：`80`、`443`

## 本地运行

```bash
npm install
npm run typecheck
npm run build
npm start:web
```

默认后台令牌由 `ADMIN_TOKEN` 环境变量控制。本机未设置时为 `aihot-admin`。

## 当前服务器部署

- 应用目录：`/opt/aibaize-releases/rebuild-20261005`
- systemd 服务：`aibaize-api.service`（`4301`）、`aibaize-web.service`（`4300`）
- Nginx 配置：`/etc/nginx/sites-available/aihot`
- 后台入口：`https://www.aibaize.cc/admin/login`

## 常用命令

查看服务：

```bash
systemctl status aibaize-api aibaize-web --no-pager -l
```

查看日志：

```bash
journalctl -u aibaize-api -f
```

重启服务：

```bash
systemctl restart aibaize-api aibaize-web
```

验证候选必须以 `COLLECT_ENABLED=false` 运行，避免重复写入。正式生产 API 应使用 `deploy/aibaize-api.service.d/10-collection.conf` 恢复采集；将其安装到 `/etc/systemd/system/aibaize-api.service.d/` 后执行 `systemctl daemon-reload` 和 `systemctl restart aibaize-api`。旧 `aihot.service` 保持停用，禁止同时启用两个采集进程。

部署前备份活动服务配置、代码与生产数据库到仅 root 可读的回滚目录；不要将验证数据库同步回生产。部署后检查 `/api/health` 的 `collection.enabled` 和 `collection.refreshedAt`：前者只表示采集配置已启用，不代表本轮采集已经成功；必须等刷新时间推进并检查本轮 source health / runs 才能确认恢复。`ok:true` 仅表示 HTTP 服务可用。

## 数据抓取

免费数据源包括：

- 官方公告、专家 RSS、公开 X/KOL 镜像
- Hacker News Algolia API
- GitHub Search API
- arXiv Atom API
- Dev.to API
- MIT Technology Review AI RSS

生产采集启用时，服务启动后立即抓取一次，并按 `data/db.json` 中的 cron 配置更新；默认表达式为 `*/30 * * * *`。免费源可能失败，刷新完成不代表所有信源均可用。AIHOT 仅用于对标与信源发现，不作为长期内容依赖。
