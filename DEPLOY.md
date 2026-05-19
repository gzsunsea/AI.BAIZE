# 部署到火山引擎云服务器

这是一个 Vite + React + Express 全栈站点。Express 负责前端静态资源、API、后台管理和定时抓取，Nginx 负责把 80 端口反向代理到 Node 服务的 8080 端口。

目标服务器：

- 公网 IP：`101.96.213.103`
- 系统：Ubuntu 24.04 64 bit
- 已放行端口：`80`、`443`、`8080`

## 本地运行

```bash
npm install
npm run refresh
npm run build
npm start
```

默认后台令牌由 `ADMIN_TOKEN` 环境变量控制。本机未设置时为 `aihot-admin`。

## 当前服务器部署

- 应用目录：`/opt/aihot`
- systemd 服务：`aihot.service`
- 服务端口：`8080`
- Nginx 配置：`/etc/nginx/conf.d/aihot.conf`
- 后台入口：`http://101.96.213.103` 左侧进入“后台”

## 常用命令

查看服务：

```bash
systemctl status aihot --no-pager -l
```

查看日志：

```bash
journalctl -u aihot -f
```

重启服务：

```bash
systemctl restart aihot
```

手动抓取：

```bash
cd /opt/aihot
npm run refresh
```

## 数据抓取

免费数据源包括：

- AIHOT 公开页面
- Hacker News Algolia API
- GitHub Search API
- arXiv Atom API
- Dev.to API
- MIT Technology Review AI RSS

服务启动后会立即抓取一次，并按 `data/db.json` 中的 cron 配置每 30 分钟自动更新。
