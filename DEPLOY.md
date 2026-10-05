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
- 后台入口：`http://101.96.213.103` 左侧进入“后台”

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

当前生产候选以 `COLLECT_ENABLED=false` 运行，避免切换期间重复写入。旧 `aihot.service` 仅作为回滚资产保留并保持停用；需要采集时应在维护窗口单独启用并监控其写入。

## 数据抓取

免费数据源包括：

- AIHOT 公开页面
- Hacker News Algolia API
- GitHub Search API
- arXiv Atom API
- Dev.to API
- MIT Technology Review AI RSS

服务启动后会立即抓取一次，并按 `data/db.json` 中的 cron 配置每 30 分钟自动更新。
