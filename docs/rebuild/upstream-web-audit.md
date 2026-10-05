# Upstream web audit

Upstream commit: `309e32eb343a57d721525f04956887d3b9057fdf`.
Source root: `/tmp/aihot-reference-20261004/apps/web`.

**Status: COMPLETE — 135/135 files read in full.** Every file in the web scope was inspected end-to-end in bounded, non-truncated output; the per-file ledger includes byte size and SHA-256. Earlier truncated reads were not certified until completed separately. No implementation or commits performed. Tests were inspected, not executed.

## Verified findings

### Routes and architecture

React 19.3, React Router 8.4 SSR, Tailwind 4.3.3, Vite 8.3.1 are the versions declared by `package.json`. Router discovery is initial. Production web serves SSR and static assets and proxies API-owned paths; web loaders do not access a database (`server.ts`, `lib/api.server.ts`, `react-router.config.ts`). API origin defaults to loopback port 3001; web defaults to loopback 3000. Runtime uses site/contracts/industry packages plus module-provided routes and UI; `apps/web` alone is not a standalone application.

`app/routes.ts` registers: `/`, `/all`, search-busy aliases, `/items/:id` and `/original`, `/hot`, `/story/:publicId`, daily/weekly/monthly latest and keyed reports, daily archive, topics/list and paged topic details, about/terms/privacy/changelog/feedback/more/starred/agent, and authenticated admin pages. Site modules append public/admin routes. No `/latest`, `/news`, or `/sources` public route is declared here; module routes remain outside this audit scope.

### Layout and theme

Desktop sidebar is 180px at ≥961px; mobile shell applies ≤960px with 48px top bar, safe-area gutters, ≤640px content width, and persistent bottom tabs. Desktop main adds 28px horizontal padding; wide/list and reading widths are viewport-height-sensitive. Navigation covers 精选/全部/热点/日报/主题/收藏 plus Agent/About/Changelog/Feedback. Mobile 全部 belongs to 精选 tab; 我的 aggregates secondary destinations. Shared content retains originating tab/history labels; article pages replace tabs with reader toolbar (`root.tsx`, shell files).

The complete CSS source confirms warm light paper `#faf9f6`, dark `#13191c`, teal `#176b75` light accent / cyan `#12ccd8` dark accent, semantic colors and 5/8/10/12/14/16px radius scale; the completed per-file ledger below supersedes earlier partial reading notes. Theme control offers dark/system/light, applies before hydration via boot script, and uses document view-transition crossfade when supported. Reduced-motion handling exists in the inspected theme/navigation/reading code.

### Interactions

Timeline: date folding, desktop time rail/cards vs mobile compact rows, three total auto batches then manual load, dedup by card key, abort on filter changes/unmount, stale response rejection, invalid cursor reset, error retry, read-state dimming, per-history list/anchor restoration. Group reports expand inline on desktop and in bottom sheet on mobile; reopening revalidates cached reports (`Timeline.tsx`, `FeedItem.tsx`, `ReadingGroup.tsx`).

Item: mobile preview-first loading; source and date attribution distinguishes publication from collection; selected/score/reason; translated/original body toggle; summary-only rights restriction; outline; related events; bookmark; native share/clipboard; lazy poster; Markdown download or WeChat clipboard. Poster and Markdown service endpoints are additional integration dependencies (`routes/item.tsx`).

Hot/story: ranked lead/runner/list arrangement, sparkline/participants/heat, methodology disclosure; story digest fallback through summary/excerpt, official vs selected filters, shared chronological order, section navigation, history restoration, settled-event heat omission, explicit incomplete observation label (`routes/hot.tsx`, `routes/story.tsx`). Heat is stated as discussion activity, not content quality.

### HTTP and caching

GET/HEAD public success responses can share cache; admin/actions/errors/Set-Cookie responses are private no-store. Browser public TTL capped at 300 seconds and never exceeds upstream absolute deadline. Immutable build assets get one year. Public .data `_routes` is removed to prevent response variation; .data text/x-script is served as text/plain. SSR API timeout 15 seconds, cancellation propagates, errors map 404/400/503 and merged story 308. Do not copy cache policy blindly before withdrawal/deadline semantics match AI.BAIZE (`server.ts`, `api.server.ts`).

## Public API contracts verified from callers

| Caller | Endpoint | Expected imported contract / critical consumed fields |
|---|---|---|
| Root | `/api/site/meta` | SiteMeta, changelogVersion; optional module document headers |
| Featured / paging | `/api/site/timeline` | TimelineResponse: cards(key,anchorAt,item,group), filters,nextCursor,dayCounts,hot?; filter/query serialization from seo.ts inspected in the completed ledger |
| All/search | `/api/site/pool` | PoolResponse: items,filters,total,page,pageCount,todayCount,freshness; page capped 50, q capped 200; relevance/time |
| Duplicate reports | `/api/site/groups/:factId/reports` | GroupReportsResponse.reports; filter-aware, originalUrl and source |
| Item | `/api/site/items/:id`, `/api/site/items/:id/original` | SiteItemDetail: source,body(zh/original/complete/zhKind),bodyLanguage,hasTranslation,outline,readingMode,indexable,links,group,relatedStories,story,x,topics,tags |
| Item export | `/items/:id/markdown` | text/download, availability indicated by markdownAvailable |
| Hot | `/api/site/hot` | HotResponse(windowHours,computedAt,entries); entry story.publicId,heat,spark,badges,trend,cover,participants/source metrics |
| Story | `/api/site/stories/:publicId` | StoryDetail: status,summary/digest/excerpt,latest,timeline,developments,heat,whyHot,officialReports,related,topics; mergedInto 308 |
| Latest report | `/api/site/reports/:kind/latest-page` | ReportLatestPage(index,report); kind daily/weekly/monthly |
| Report detail | `/api/site/reports/:kind/:key` and `/api/site/reports/:kind/navigation/:key` | ReportDetail; ReportNavigationResponse.items |
| Daily archive | `/api/site/reports/daily` | ReportIndexResponse.items, issueNumber/count/title/key |
| Topics | `/api/site/topics` | TopicsResponse(groups,topics) |
| Topic | `/api/site/topics/:slug?page=N` | TopicPage(topic,items,page,pageCount,pageSize,modules); topic metrics/latest/brand/indexable |

These are upstream TypeScript caller expectations, not evidence of compatibility with existing AI.BAIZE endpoints. Response validation is largely casting; an independent frontend must define an adapter or matching schema. Module payloads, HTML sanitization, SEO, poster service, feedback and agent contracts are covered by the completed ledger below and the companion backend/contracts audits.

## Open-source / live-site gaps and licensing

**无法确认:** no live-site comparison was performed in this delegated source-only inspection, so visual parity, live module set, production data, feature flags and live revision cannot be established. Source exposes reusable engine/site/module boundaries, but a live site may enable modules outside apps/web. Require observed live route/screenshots plus production behavior evidence before declaring parity.

**Verified asset boundary:** logo/Wordmark/RingMark come from `@aihot/site/brand/Logo.tsx`; BrandMark, site modules, report/changelog illustrations and CSS sources reference out-of-scope site/industry/modules files. Favicons/apple icon/manifest, OG images, article/source/X imagery and covers are API/static dependencies. Code availability does not establish rights to reuse the aiHot identity or third-party article/media/avatar/trademark assets. Repository license and per-asset provenance are **not yet confirmed in this scope**. Build AI.BAIZE-specific branding/assets, verify repository license and dependency notices before source reuse, preserve source attribution and summary-only restrictions.

## Additional verified findings (second full-read batch)

- `Filters.tsx`: current filter choices are mutually exclusive first-party or one category; choosing either clears the other. Legacy news/X channel links still filter but do not light a current option. Mobile featured/all switch preserves filter/tag but clears search/sort; desktop search uses GET `/all?q=...`.
- `StoryFollowups.tsx`: additional endpoint `/api/site/stories/:publicId/followups` → `StoryFollowupsResponse {items,more}`; lazy IntersectionObserver (500px margin), abort on teardown, removes current representative. Followup item consumes factId and representative(id,title,source.name,timelineAt).
- `PosterSheet.tsx`: share poster is server image `/og/posters/:id.png`, not client drawing. Native file share needs blob response and matching PNG; filename uses SITE.mcpPrefix. Image error becomes visible failure; download remains an anchor.
- `render-recovery.ts`: `/api/health` must return `{ok:true,release:string}` to recover an obsolete public document once per session. It never automatically reloads admin/error responses/dev or unchanged release.
- `ArticleBody.tsx`: HTML is inserted directly; caller comments promise sanitization by server, but web itself does not sanitize arbitrary item HTML. Preserve an explicit sanitizer contract in adapter/backend. Images become keyboard-accessible lightbox targets; syntax highlight is lazy and only for 40–12000 chars with sufficient confidence.
- `Sparkline.tsx`/`curve.ts`: null hourly heat observations break curves; fewer than three observed values hide chart; smoothing is monotone and zero-based. Do not fabricate heat values or draw missing observations as zero. Gradient wash exists in Sparkline and radial gradient exists in HotTopics despite broad CSS comment saying no gradients.
- `ui/modal.ts`: shared top-layer Escape/Tab focus trap, scroll lock across stacked overlays, return focus and inert exit; mobile sheets close by >110px drag or recent downward velocity >0.6px/ms. Tab bars have explicit classes for 4/5 tabs only.
- `admin/action.ts`/`admin.server.ts`: upstream admin depends on API session cookie, CSRF token, stable retry Idempotency-Key, auth redirect `/api/auth/login?return=...`, and revalidation. Reusing public pages does not require exposing upstream admin operations.
- `CopyPage.tsx`, legal routes: published legal text comes from site/pages/*.md outside this scope; source flags footer/meta and in-site link handling. AI.BAIZE must supply its own legal copy and operator fields.
- Full-read tests now include Markdown in-site/external domain matching and loader cancellation; tests were inspected, not run.

## Per-file full-read and SHA256 ledger

| File (relative to apps/web) | Bytes | SHA256 | Read status |
|---|---:|---|---|
| `app/app.css` | 21311 | `2a8f80832880ce347177f7b94456f6102c6828ab731c908f832dcba3ca0c4f52` | FULL |
| `app/components/BrandMark.tsx` | 1460 | `16128706255b87bd4ba33ec84506a975bb1a20c45c5cd8d911cfefa1a51c0be0` | FULL |
| `app/components/icons.tsx` | 7009 | `ea16aa511ac0e5b7c61b4867f58d05be4ab3472aedce7d64092730dd469c3e8f` | FULL |
| `app/components/shell/Chrome.tsx` | 2198 | `9449a73b395bd4208f9291feea2568a8038d08b92cdb41e4765cebbff3611c79` | FULL |
| `app/components/shell/PhoneBar.tsx` | 6188 | `0a78dde2603a9183eea91d1e75558a47a84fbde84ee5023fb3bf9dfb72b6b550` | FULL |
| `app/components/shell/PullToRefresh.tsx` | 4470 | `fe09c56b9ff7eb346619b215ddc66594a9ff3f5c05a3d6ed1c93cd1b02fb96a5` | FULL |
| `app/components/shell/Sidebar.tsx` | 3402 | `c00f17c1827ff087d1daf63bcdc52dae310f39a517e44d0fa56a0d7c65441a90` | FULL |
| `app/components/shell/TabBar.tsx` | 3672 | `c5a62c6b7ca74db74e8297607db3d707c595821eb5828cd0d17eb7f593517cb3` | FULL |
| `app/components/shell/ThemeSwitch.tsx` | 2634 | `deb7cd347ad3c6d2327d82235ffd01aea346c95a6e020e8c2e3b17e5db5aa453` | FULL |
| `app/components/shell/nav.ts` | 3611 | `f114cebbbf377cc8cd825dc10d987102da2a8e580bedc85f0d97a3d36122c903` | FULL |
| `app/components/shell/screens.ts` | 3765 | `8f48da897f7a51dc9e7b449a4d869c8c5ee38e27617c9b2b8ea7f92970088084` | FULL |
| `app/components/shell/transitions.ts` | 1244 | `f1ae9905ad9ea5c9fb31c5eb6fbbea9918db6a1cc24aff6a34632e991f5f8ce7` | FULL |
| `app/components/ui/Badge.tsx` | 1325 | `b3cdc8466cc6af416d14c66ed0b76786f0dcdc08b1240f5effdb412bdf2fd9b0` | FULL |
| `app/components/ui/Controls.tsx` | 2680 | `4d5f2c32b9b56f7b4b36cc52b186401f85f7953e2e7f7e0c9a391119e2a24b91` | FULL |
| `app/components/ui/IntentLink.tsx` | 1432 | `172a896879c93b5719600bf98d1074339275cdc7ccb13baaa53b305dee003cc4` | FULL |
| `app/components/ui/Kicker.tsx` | 485 | `92dc39286326aa0ac9360b91f4b519199d8a6c67d72c471a852a3bd799483033` | FULL |
| `app/components/ui/Lightbox.tsx` | 6577 | `07efd329428eed512038673fbbf1ad11018a8dfbb6f0b2a0f727c1c26be61cf5` | FULL |
| `app/components/ui/Menu.tsx` | 2559 | `6cefbfed7e926db39b3c617f58bcadb16a1c00c261dd2858f57a34a5cdf332fb` | FULL |
| `app/components/ui/OutlineSheet.tsx` | 3253 | `3ed7c6041b6ab5e776c0fe92b95c04cdfa6f06e1bd3406e9552f7c055aa2da37` | FULL |
| `app/components/ui/Page.tsx` | 3912 | `c33fbd22fd233be06122773b91941078bb34dfdd03ba9d61543acb7a018eb208` | FULL |
| `app/components/ui/Presence.tsx` | 2406 | `e794e69faac5a0c668e8d5b1b2b98d98aa5120accd6a1ece8e964462098e1761` | FULL |
| `app/components/ui/Score.tsx` | 1587 | `6a62224b4223dfa90878285c3fbba28e703872b23aa42d271fc39aed411210d2` | FULL |
| `app/components/ui/Sheet.tsx` | 6861 | `871a7e2b1a75dfdb1e70f54d2f8f28c599f9f4b439a7abac84a06768eb836356` | FULL |
| `app/components/ui/SourceAvatar.tsx` | 1326 | `9e85be6cd4b4de244e68a2cf712456b68831f5ef32e3a5a8350c455e54ed0c0a` | FULL |
| `app/components/ui/Tabs.tsx` | 4815 | `2f94ab96e9e69b95eaf48320e67dd430d25ef558e0a1b634951a9072264ee5e9` | FULL |
| `app/components/ui/modal.ts` | 2927 | `bd73cdebadf28ce5d52efafad882d8b16971ad050a8daeb2a11cdaabb902566c` | FULL |
| `app/entry.client.tsx` | 733 | `7cd2151358a48dbd770527ed43d410f8255df2b37da667eae1f4d25c26c7ddfa` | FULL |
| `app/entry.server.tsx` | 1963 | `46bc3f39f77337a0f1f42273238e796af5501a8748a6f567faf5b7cb1110f2e9` | FULL |
| `app/features/about/SignalRiver.tsx` | 20689 | `c8f1b317eecc96fec9c881ae5e36174c2d9b0b9133c0596f607adbf0c5808f9d` | FULL |
| `app/features/admin/action.ts` | 2769 | `f8c5168a2ce843ac9e21b6886e5a1f4166f02b9d2fe1d8efd1e5aa07555802a7` | FULL |
| `app/features/admin/format.ts` | 2072 | `c8eec5994b76de7b4f5211211f2123f022a26ec66f0dd62ee0447f509108d83e` | FULL |
| `app/features/admin/labels.ts` | 893 | `05c9ee49035d043c761285349a23dcff02455b2f0e8fbc0b5c1d5816945639dd` | FULL |
| `app/features/admin/toast.tsx` | 1867 | `03daaaab2227848cc09681152155e47879275cecbbd654f7a918a8096003592f` | FULL |
| `app/features/admin/ui.tsx` | 14987 | `8a62801fc9ecdac17c73c32f996d166d888b6d174c0107b38a7ea31a8989679b` | FULL |
| `app/features/agent/CodeBlock.tsx` | 1860 | `af7e51d316d98a55bc3c12ebe6e117ba6b009e86f96a841ca697a58f88654219` | FULL |
| `app/features/agent/module-parts.ts` | 589 | `8fc83b049ece86f5ae668bc4f1670b25ab12dfdc1bcec4586ac4c865b981734d` | FULL |
| `app/features/agent/panels.tsx` | 17845 | `3c417e42431ccaa2b79f7b4cc3504acacce5b92283b930ab88ee546c5c584f79` | FULL |
| `app/features/agent/parts.tsx` | 7195 | `822823aa0bdfbb9968856d03f1b697cffae8261fb14b276436e358c83b02303e` | FULL |
| `app/features/changelog/text.tsx` | 545 | `307e94ebbd920c3a6d8a6acbfcb9dc48284b6ff3a33e38ef7d64ca70f8d9f0c8` | FULL |
| `app/features/copy/CopyPage.tsx` | 3652 | `34ead05c287765174ce5936cbdde50101fe4d1bc55f276c16a3a3132c662bed9` | FULL |
| `app/features/feed/DayList.tsx` | 3708 | `9fe346ceb85696670270dd3218eaa7d7c5f16c99bdeefeedf5d7c932bdc54109` | FULL |
| `app/features/feed/FeedItem.tsx` | 5730 | `381e1800ba6039ed78a5dc5535e9fd32975d250a4da7751201f4697f2d2b4c65` | FULL |
| `app/features/feed/Filters.tsx` | 9948 | `9bf8d999208f0c9f75c57e1d7ea326f42db17696c1efdf0ae68ea1207f265992` | FULL |
| `app/features/feed/HotTopics.tsx` | 4508 | `e1ba24f80e551f67c4c9af64a27bcf1536d3ab6358aa9c198202e946c5e90ecb` | FULL |
| `app/features/feed/ReadingGroup.tsx` | 9880 | `f432ce46f681ad35ac60a83d206e49a9826236ba54b67b51b0a9618c89934ee2` | FULL |
| `app/features/feed/Timeline.tsx` | 15585 | `cdc473c8866d7f09cc2d26fe8ca9e763af4f9bcee372bf7adaf9decf63bb03f1` | FULL |
| `app/features/feed/parts.tsx` | 5050 | `d77e3b530f1947efad50be85d3818748745373f159d34841afaa247be04adecb` | FULL |
| `app/features/hot/Delta.tsx` | 1173 | `8dc14d87c1b50ec020bb1dca95a127d4e23feed1405d8ea86b26e78d1b7c76ae` | FULL |
| `app/features/hot/Faces.tsx` | 5068 | `dc5734217d198e4d7fc78f5361b45e322fee5c4f03f9f3991eeffc4ee23ac1f3` | FULL |
| `app/features/hot/Sparkline.tsx` | 2629 | `fcba623b2ce68da4d48fa478734239be8615f7251d8ba81f6101806e12c77fd5` | FULL |
| `app/features/hot/curve.ts` | 2143 | `826938c13186a07959adca19ea83a2408b3a87c07c6d543bf91a7ae1816a5e71` | FULL |
| `app/features/item/ArticleBody.tsx` | 5487 | `8956640154106cd00b4b693ffeb5dd2f297cb8b40d19edb5309b9fe04cbafb0b` | FULL |
| `app/features/item/MediaGallery.tsx` | 3027 | `80157eb6c63459c0e8d631084b286566c581efa2fa474573777415e7476d2332` | FULL |
| `app/features/item/PosterSheet.tsx` | 3293 | `a3b447cd166e5fa2623c9aa9d82d5e132591b666e234bc0e6a5173a9d984bbb8` | FULL |
| `app/features/item/QuotedPost.tsx` | 2440 | `5b5d9a3a948ff4ed1532845b268e8cb87cfeefbd13f17964400372363a9ad239` | FULL |
| `app/features/item/ReaderTools.tsx` | 5104 | `f2ec2e719d0cc4417f0be0cb9e519d8c6c05b5274dc81275e38eba5df9e92852` | FULL |
| `app/features/item/StoryFollowups.tsx` | 3449 | `218cb6775cee3f60db680dc7fb649e4fb7a9ca674de97ab9ec712ec6e99d88d3` | FULL |
| `app/features/item/highlight.ts` | 1843 | `76ebe17f97bc713faaf8b9bb92fdd408f81450f3cb728874cc25a0555d1a7cbb` | FULL |
| `app/features/item/preview.ts` | 757 | `4631b37f04da44cffa5ce8e5216c3a688031f98e9e3b96f860f4668569f85eae` | FULL |
| `app/features/report/Halftone.tsx` | 12840 | `21ba848d75f9174e1556bef1963e797ada35ac8de6f1532449930ae93159691a` | FULL |
| `app/features/report/IssueDots.tsx` | 6606 | `964bd0c9ccab2352a0505cedb1e64beff4adc557fc068a422e94273e45eea15a` | FULL |
| `app/features/report/Nameplate.tsx` | 1202 | `a1be28ee90eb640d9f0c6a14e35cce724d1b5eee633e75dc3f74704963bc1974` | FULL |
| `app/features/report/ReportLayout.tsx` | 2373 | `0997625d2e3c125d27f39ac2a7bae8226e1557345332f567a7e0e3b65801e353` | FULL |
| `app/features/report/ReportNav.tsx` | 6859 | `1f216d279fe95cd29064ba2e456fa968f43ca7d84aeb82764dc2ece1de6a139d` | FULL |
| `app/features/report/ReportPaper.tsx` | 27468 | `4240431fd5b476de4a73494aaedc47e3643322ded733186a7bf1da7ca00daae6` | FULL |
| `app/features/report/format.ts` | 11122 | `e8a659f763adbbcab82213d85030d5f6bc3c4e5590e7436e9080f11fbd6e1b4d` | FULL |
| `app/features/search/SearchOverlay.tsx` | 9673 | `e173235c40cc3e707e563b8bfcbd1921d2d000849b1408c43bc87966f51b2c65` | FULL |
| `app/features/story/HeatChart.tsx` | 12238 | `9c8eae429fd0e051f5aced5e2a08f80e5a3cb8dd708445cdf16983c3c1b03c56` | FULL |
| `app/lib/admin.server.ts` | 1116 | `cbc0a20e210e24c5c8f06c14d0826da3b98eea2235db410c726d95263108b6c9` | FULL |
| `app/lib/api-proxy.server.ts` | 2111 | `abba227eaa5a81a76748dff010d88dce1dc8af9e7397eb071fa4b30e244ecc4b` | FULL |
| `app/lib/api.server.ts` | 4217 | `2daca98681c08abebd34688db90f8dcdc7c14cee054d24067f99921acaee0065` | FULL |
| `app/lib/clipboard.ts` | 427 | `f7d7cf51f3ec30f5107a56c4193ab5965cc009ddbeeaf1f22f9901d1672b4368` | FULL |
| `app/lib/errors.server.ts` | 1263 | `5cc58b3949a03ffb21894169a97afac2191dd39295c5929cfb56efe5cb1e52d7` | FULL |
| `app/lib/format.ts` | 1277 | `fca885d3cd8f0843df08c417d922412c78abda2c51a363b72957b4f7a80b4fc6` | FULL |
| `app/lib/hydration.ts` | 811 | `06b9b52c1bad6732f776318935ebeb4c7dceab0887bbf138d150578747d7f8d9` | FULL |
| `app/lib/local-state.ts` | 17333 | `b84017e547fa187666519770372acdd6c74af885d004bab23ade0126a7166a5f` | FULL |
| `app/lib/markdown.ts` | 4927 | `8b9ace7d6692d80c4026705ff6cbb18fc3ea8962ed8952bdde2b66ea997e4454` | FULL |
| `app/lib/render-recovery.ts` | 1672 | `88bd93f99ea17cfb7130e1cf63c5a9637b5eb2f2c6b2a2ca9431975d65b5188a` | FULL |
| `app/lib/restore.ts` | 3944 | `df65da04eb4a5dfe6dffb912689a5bfc69286c59d8246846b9395b8d978e8e81` | FULL |
| `app/lib/route-types.ts` | 478 | `43096f779d57aaf260f87592a61e5e3a119b383be61d10f80daed48425976a41` | FULL |
| `app/lib/seo.ts` | 11582 | `7a21e2dd9d359cc3b1c594e1dcc767724191ead684a7353e929cb6185e265dd6` | FULL |
| `app/lib/session-cache.ts` | 2666 | `fe4f99fcaa476cd3dcc062d2835dcc61bfaa593ed4ac131b89b9ecaa0a3d5a32` | FULL |
| `app/lib/site-copy.ts` | 591 | `5433ce3e2c9edd2054bb70d146cec177275ce9e24f85cbbf6d8bc052ad35738a` | FULL |
| `app/modules.ts` | 8578 | `ec1f674e6b27d6391559d5144910c4a579803ce7798eb6a3744ca80b3683e605` | FULL |
| `app/root.tsx` | 7827 | `acda6b38816a7f7fafaa0c67152b2111f455e95388e8120808967d57d61cd635` | FULL |
| `app/routes/about.tsx` | 13045 | `0a83c960dc1f70966dcd77238f21e0955d4e72b3b533d2b1e900da3b41a810be` | FULL |
| `app/routes/admin/audit.tsx` | 2738 | `cdc12c9a9a0406ee0a9cc588ef9cf566de5f3d594f604622b4815faacd68483e` | FULL |
| `app/routes/admin/content-item.tsx` | 24635 | `e583295921dd81b64e5e82eefcab06f6517fba487bccf4c2f93be8995868e30b` | FULL |
| `app/routes/admin/content.tsx` | 3447 | `826662a4d5746fdf60cbbe653040b90ce0dfce03b1f26c504cd36010e582739b` | FULL |
| `app/routes/admin/feedback.tsx` | 7353 | `91083a9aee504ba65efe70cb02634e3c8ed49a1248d3cb2381cb7a5ed36e7738` | FULL |
| `app/routes/admin/index.tsx` | 416 | `7172e6509b3abe35b14da8417a85546b0b535b4b86debbd7bf245f983eba4290` | FULL |
| `app/routes/admin/layout.tsx` | 6344 | `54ddb9c8a160f4aa03d8cca3a2ded9244967327ecff6afee19d6fc2f0cda372b` | FULL |
| `app/routes/admin/models.tsx` | 9077 | `7642f92af30da9255860bd291c0a3d4c87815ac3962b3db0f61d5a651fc48da7` | FULL |
| `app/routes/admin/runs.tsx` | 17729 | `ee53a4da0943cb4464925240d762e1722abd63145490a1c5f54d533c4e2f8f96` | FULL |
| `app/routes/admin/selectbench-run.tsx` | 7670 | `b7a3d85764cae9d5b8119739b67c08f66434c4bdb75aa32f43a2fedd1d4db8c4` | FULL |
| `app/routes/admin/selectbench.tsx` | 5197 | `7f0df0e88ea460cddb85279b30bdca83495903f2acf52adbd177e6a97c650131` | FULL |
| `app/routes/admin/settings.tsx` | 7408 | `1723126489c79261743ac1631908ca0be83e090b60f90591fc81123bcf017e6a` | FULL |
| `app/routes/admin/source-new.tsx` | 8275 | `f021176e785ee89cb6aba15ba04524439cfb716deb600a15a206400ed5433eea` | FULL |
| `app/routes/admin/source.tsx` | 15641 | `1d971c053dc0a9684033448aa75d37247867a5cc517d723d29adfeba88bfe436` | FULL |
| `app/routes/admin/sources.tsx` | 5656 | `5082e098eb0ae24c1bef9dc2968b2e147fec6e7d1d206c02ef3167b2fcd846d6` | FULL |
| `app/routes/admin-login.tsx` | 3430 | `026ef5f4f16b991a57935bd6698e26d6bacf9533caa0ed61058794fff8decf39` | FULL |
| `app/routes/agent.tsx` | 11279 | `c0ce31736749fc998b6b790813168954f5dfe2a1dddb2ab46704880c40e24bda` | FULL |
| `app/routes/all.tsx` | 9715 | `d2dcd570992a8328842e818170d7daa0210afd76ae0014d948388219a076ac78` | FULL |
| `app/routes/changelog.tsx` | 8898 | `eb4b2d53f738be5d2c14b32dcfc6aa2391cf616bff93c03983ca49a7700aeba6` | FULL |
| `app/routes/daily-archive.tsx` | 3966 | `25dbb7714d3e807338e944a54f7310fb17d047d4475dccfaffa5aa8d24564f65` | FULL |
| `app/routes/feedback.tsx` | 14152 | `0659f8a8762166a3f30c7e0bea545f6a3354db61aa068294f1013b2e0885889e` | FULL |
| `app/routes/home.tsx` | 2766 | `0459fd4a0da4b4f55ae1d0963c1c8162b4020764966d481a609c84835472d78f` | FULL |
| `app/routes/hot.tsx` | 17250 | `0e6b08a2176e897da99c6372be94cfc7fa08581fcf3cb663c63b2aa7e5d1f594` | FULL |
| `app/routes/item-original.tsx` | 447 | `a1fae174179bacafa083baade5b12d48d0cacd6e963f2af539cdbe28a65eb4cf` | FULL |
| `app/routes/item.tsx` | 26572 | `be879490729c92f10cd1e32d385c6dd1093e90329db4756a32629c7097de4c45` | FULL |
| `app/routes/more.tsx` | 5217 | `af4ac2d9c09b18caba11dad1f39e05d7db5c1b240d527632fbd25b4041db7c76` | FULL |
| `app/routes/privacy.tsx` | 1058 | `bc66a10b8877bd13b533124af9ec1c428d6a2f39e9de66508c6cf89bbd9b1ea5` | FULL |
| `app/routes/report-detail.tsx` | 2608 | `345499f20f22e201f0e826eb25fd55a5d70f53a7fef4ece321c13c35fcf0e357` | FULL |
| `app/routes/report-latest.tsx` | 2210 | `3c57667055638c6df307fcf8cfcec09c1284338c031255867e7a265b95103fbc` | FULL |
| `app/routes/search-busy.tsx` | 407 | `b9181509e34f667adf05223a76e99efd3376e63662e5db4866e7d8239ba15069` | FULL |
| `app/routes/starred.tsx` | 9442 | `02bfe3f61d53a711d6ce6424d6f3cd4318ef75e27cd7a55feffb7dc6fe55a398` | FULL |
| `app/routes/story.tsx` | 23274 | `8f3522c67eba0982cdf015fcc4fc0ef9ecc58fb82b8c091d6b29b9ba0fb56647` | FULL |
| `app/routes/terms.tsx` | 1242 | `56e9dbf36733398c4fb5f2243d870be85da8b69d473a5dd6c38afd4455d23f62` | FULL |
| `app/routes/topic.tsx` | 7014 | `aff07851af7627cc44a9ec436d2e237a6adcbb804cbe6aa146d591ee0e3fcb59` | FULL |
| `app/routes/topics.tsx` | 5740 | `5088cbd80be512dda28fd9e35e336965f6726a97e7b4107c93be68e28461f8cd` | FULL |
| `app/routes.ts` | 3255 | `85f7f0b2ebca884060e6fea506b9282ee45a1498304d19bf0d9efc89bef92ea7` | FULL |
| `app/site-modules.ts` | 787 | `93ccc02b09249f4a6289239eaf973618c36548a9efcbeab9eb7670eb827fd949` | FULL |
| `package.json` | 812 | `198714b5e5d5eefceb79deebeca2974f107200eae70c58bc97a0bfa7b4559f98` | FULL |
| `react-router.config.ts` | 391 | `26c948d63b2511a97bb4ad6adc9e4b05023bf75620c80bcd041fc222152aac37` | FULL |
| `server.ts` | 8704 | `70c8c2e232cfb4bd27d66280dadbecc89004d2a37afaf83c36b666b3790eb872` | FULL |
| `tests/cache.test.ts` | 11209 | `b0e19bb8cdec7b7d9a62939a2d6a6c816722fa4ad351b32307ed6a604a5154ff` | FULL |
| `tests/local-state.test.ts` | 4790 | `df2f457ef4db8bf12c5b8e59f84eee08aa845f47d76da1f936b49ced7fa74f3d` | FULL |
| `tests/markdown.test.ts` | 1122 | `525c56a1d774cb1c29f8ce8373c1c145cb37a8cb4f9ebd640897dd146e12eb0f` | FULL |
| `tests/report-discovery.test.ts` | 3756 | `a209a6726b04a4c694e3ff88afecc30b64646b89e7f89b22b8ecd5dc477c7628` | FULL |
| `tests/report-ordinals.test.ts` | 6371 | `a16ce5e1e9277cc8a9a7a951fd5eb77555a7d5fe3c686c5d16fdd867779f0a15` | FULL |
| `tests/request-cancellation.test.ts` | 1139 | `f80687b7d2c2c7863b1c8a97b7087d5cc4f41662e847813cea1719ead887d3c0` | FULL |
| `tests/request-target.test.ts` | 3871 | `8233b4de8331c3ff0f52642b052a935ac5d5405547b2638065e5c984ffec1bfb` | FULL |
| `tests/session-cache.test.ts` | 2435 | `4a5c4e608794eab60a7ee0b3a9801bffab77bb11e544ebc3f126bc25ee1d6f33` | FULL |
| `tsconfig.json` | 802 | `dd7c058e9ad153ef1f59717b9c7e3b5eacd3dda1551aca9498dfe066b1f03de8` | FULL |
| `vite.config.ts` | 2883 | `0ce1fe7bd887832c407c4dbad77e3af8c06c401896a1afd6e0d99349df71b428` | FULL |

Full-read coverage: 135/135 files. Remaining: 0.

## Final full-read findings and adapter requirements

These are source facts at the pinned commit; file references are relative to `apps/web`. Runtime response types live in `@aihot/contracts` outside this scope, so the consumed fields below are adapter requirements observed in callers, not a replacement schema definition.

### Additional public endpoints

| Endpoint | Caller and required behavior |
|---|---|
| `GET /api/site/reports/daily/months/:YYYY-MM` | `features/report/ReportNav.tsx`: lazy month expansion, `ReportNavigationResponse.items`; navigation entries need key/title/issueNumber. |
| `GET /api/site/contact` | `routes/about.tsx`: optional QR/avatar contact values; independent request failure becomes null. Own contact assets required. |
| `GET /api/site/stats` | `routes/about.tsx`: sources/items/selected/dailies/sourceKinds, day.collected/day.selected, sampleSources/latest; absent response hides facts instead of manufacturing counts. |
| `GET /api/site/changelog` | `routes/changelog.tsx`: latestVersion and releases with date/time/title/kind/body/urgent, optional feature; kinds 更新/优化/公告/下线. Site feature renderer is outside scope. |
| `GET /api/site/items/availability?ids=…` | `routes/starred.tsx`: record keyed by stable item ID; values consume status and sourceName. Batches <=100; unavailable removes navigation but keeps saved title, summary-only adds notice. Failed lookup does not delete bookmarks. |
| `POST /api/site/feedback` | `routes/feedback.tsx`: multipart content/email/pageUrl and optional screenshot; success JSON id, error JSON detail. Text 2–2000 characters, PNG/JPEG/WebP original <=5 MiB on client; server byte validation is only a comment here and must be verified in API audit. |
| `GET /api/health` | `routes/agent.tsx`: any successful request marks service healthy within 3 seconds; render recovery separately requires ok/release. |

Report adapter must preserve actual series issueNumber, not derive it from capped navigation length. ReportDetail consumes kind/key/title/generatedAt/issueNumber/readingMinutes/metrics/lead/leadItemId/overview/sections/highlights/flashes/cover/prev/next. Citation fields include itemId/title/available/summary/sourceName/sourceUrl/sourceIcon variants/firstParty/publishedAt/otherSources/followUp/related. Withdrawn citations remain explicitly unavailable and lose source links; withdrawn lead is omitted. `ReportPaper.tsx` deduplicates by itemId or title. `tests/report-ordinals.test.ts` specifically checks 405 issues with a 400-entry navigation and older issues outside the index.

### Layout, state and representation

`app.css` supplies semantic light/dark tokens, system sans/mono fonts, breakpoints at 641/768/961/1280/1536px, responsive reading/list widths and globally reduced animations under reduced-motion. Prose grows from 17 to 18px at 80rem, line-height 1.8; tables scroll horizontally. Reports add a 280px archive column and paper up to1160px; report panels use container breakpoints. `Nameplate.tsx` imports site-owned nameplate SVG/JSON outside web: these assets must not silently become AI.BAIZE branding.

`SignalRiver.tsx` illustrates sources using seeded synthetic geometry; it is not measured processing telemetry. Canvas layers are decorative; reduced motion freezes the animation, offscreen/hidden pages pause. `HeatChart.tsx` requires genuine hourly observations, represents absent hours as null gaps, offers 24/72/168h where available, and hides charts with fewer than three observations. Preserve source-group participant counting rather than substitute article count for heat (`routes/admin/source.tsx` explains shared discussion-group IDs).

`SearchOverlay.tsx` loads company topics and top hot suggestions once per document, keeps ten recent queries, and submits to `/all`. `local-state.ts` caps bookmarks500/read5000/recent10/query200/import2M characters, validates stable item IDs, preserves damaged stored data on failed edits and merges other-tab writes. Import/export version1 remains browser-local. Feedback keeps text/email/pageUrl drafts with 400ms debounce, clears only after successful submission and does not persist screenshot bytes (`routes/feedback.tsx`). Rebrand storage keys deliberately to prevent accidental AIHot state collisions.

`lib/markdown.ts` is a controlled first-party static-copy renderer, not an untrusted Markdown sanitizer. Its link parsing is not a protocol allowlist. Backend-rendered article HTML requires a separate sanitization contract. `lib/seo.ts` canonicalizes accepted filters, takes configured origin, uses site organization identity, and derives report publication from generatedAt; do not invent personal authors or copy upstream organization/founder identity.

`modules.ts` exposes root hooks/document headers, routes/navigation/tools/admin/agent/topic/bookmark imports/feedback drafts/legal extensions. These module/site/contract dependencies need their own complete audits. Live-site parity is **unconfirmed** from web source alone; module-backed features, actual content availability, infrastructure and deployed version cannot be inferred from this commit.

### Admin coverage (audit only)

All admin files were read. Read endpoints cover content chain/search, sources/detail, feedback, models, runs, selectbench/detail, settings, audit, identity/navigation counts. Mutations cover versioned publication visibility/SEO/overrides and reprocessing, story detach/merge, source preview/create/fetch/versioned patch, model switch, evaluation import, receipt release/processing requeue/delivery resolution, feedback status/note/ban/erase, QR upload, notification toggles and service budgets. These require their own authenticated backend; public integration must not expose them as anonymous placeholders. Runs refresh every20s only while visible; paid unknown outcomes require manual verification before retry (`routes/admin/runs.tsx`). Login uses `/api/auth/options`, password form `/api/auth/password` and optional Feishu path; login is no-store/noindex (`routes/admin-login.tsx`).

### Verification evidence and limits

All nine test files were inspected. They cover Markdown, local-state corruption/concurrency, request cancellation, request-target slash semantics, cache/session storage, report ordinals and agent report discovery. Production SSR tests use synthetic API stubs; those stubs intentionally provide partial shapes and must not be treated as authoritative contracts. Cache tests verify no public cookie forwarding, HTML/navigation common freshness, no stale caching, errors/redirects/admin no-store, Markdown download preservation and proxy address trust. This audit does not claim tests pass or verify live deployment/license assets. Licensing terms and third-party content/icon/image permissions remain subject to repository and asset audits outside web; use original AI.BAIZE identity and independently cleared assets.
