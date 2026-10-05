import { Link } from "react-router";
import { SITE } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import type { AgentPanelProps } from "../../modules";
import { Block, Mono, PanelHead, Table } from "./parts";

const link = "text-accent hover:underline";
export const mcpToolCount = () => 0;
export function McpPanel() {
  return <PanelHead label="MCP" title="当前未提供 MCP 接入">请使用本站的 RSS 或公开 REST API。</PanelHead>;
}
const FEEDS = [
  { name: "精选摘要", path: "/feed.xml", desc: "当前精选资讯的标题、摘要和原文链接。" },
  { name: "AI 日报", path: "/feed/daily.xml", desc: "按本站采集记录汇总的日报目录，保留最近 10 期。" },
  { name: "AI 周报", path: "/feed/weekly.xml", desc: "按自然周汇总的报告目录，保留最近 10 期。" },
  { name: "AI 月报", path: "/feed/monthly.xml", desc: "按自然月汇总的报告目录，保留最近 10 期。" },
];
export function RssPanel({ base }: AgentPanelProps) {
  return <>
    <PanelHead label="RSS" title="复制地址，用阅读器订阅">本站提供 RSS 2.0 摘要与报告目录；全文请访问所附来源链接。</PanelHead>
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {FEEDS.map(feed => <div key={feed.path} className="card flex flex-col p-4">
        <span className="text-[15px] font-semibold text-ink">{feed.name}</span>
        <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{feed.desc}</p>
        <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
          <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{feed.path}</code>
          <CopyButton text={`${base}${feed.path}`} label="复制地址" className="shrink-0" />
        </div>
      </div>)}
    </div>
    <Block title="订阅说明">
      <p>内容随本站采集记录更新，报告按现有记录汇总，不承诺固定出刊时刻。请按需要设置阅读器刷新频率，避免频繁并发请求。</p>
      <p className="mt-3 text-[13px] text-ink-3">本站不提供全文订阅或完整精选增量同步。原文版权归来源方，见<Link viewTransition to="/terms" className={link}>使用规则</Link>。</p>
    </Block>
  </>;
}
export function ApiPanel({ base }: AgentPanelProps) {
  const request = `${base}/api/public/items?mode=selected&take=20`;
  return <>
    <PanelHead label="REST API" title="匿名 GET，读取公开数据">公开查询无需登录或 API Key。当前路径为 /api/public；字段以实际响应和<a href="/openapi.json" className={link}>本站接口定义</a>为准。</PanelHead>
    <CodeBlock className="mt-6" title="第一个请求" lang="bash" code={`curl --compressed '${request}'`} />
    <Block title="接口一览">
      <Table head={["路径", "用途"]} minWidth={560} rows={[
        [<Mono>/api/public/items</Mono>, "公开资讯列表；mode=selected 或 all，可按关键词 q、分类 category 和发布时间 since 筛选。"],
        [<Mono>{"/api/public/items/{id}"}</Mono>, "指定公开文章的摘要与来源信息。"],
        [<Mono>/api/public/hot</Mono>, "当前热点榜。"],
        [<Mono>{"/api/public/stories/{id}"}</Mono>, "指定事件的报道时间线。"],
        [<Mono>/api/public/reports?period=daily</Mono>, "按现有记录汇总的日报；period 也可选 weekly 或 monthly。"],
        [<Mono>/api/v1/agent</Mono>, "本站当前公开接口地址说明（JSON）。"],
      ]} />
    </Block>
    <Block title="翻页与搜索">
      <CodeBlock lang="bash" code={`# page 从 1 开始，take 每页最多 100 条\ncurl --compressed '${base}/api/public/items?mode=all&page=1&take=50'\n# 搜索标题、摘要、来源名和标签\ncurl --compressed '${base}/api/public/items?mode=all&q=OpenAI&take=20'\n# 按自然周或自然月汇总\ncurl --compressed '${base}/api/public/reports?period=weekly'\ncurl --compressed '${base}/api/public/reports?period=monthly'`} />
      <p>保存已取得的文章 ID，按需要请求后续页。当前列表使用页码，不提供固定快照或新增、修改、撤选的增量流水；内容变化时，同一页可能变化。</p>
    </Block>
    <Block title="出错了怎么办" id="agent-api-recovery">
      <p>404 表示内容不可用或路径不存在。收到 429 时降低请求频率并按返回提示等待；遇到网络错误或 5xx，请稍后重试。不要把缺失字段当作零值，也不要把摘要当作原文全文。</p>
      <p className="mt-4 text-[13px] text-ink-3">{SITE.name} 的公开资料来自外部来源，重要事实请核对原文；使用范围见<Link viewTransition to="/terms" className={link}>使用规则</Link>。</p>
    </Block>
  </>;
}
