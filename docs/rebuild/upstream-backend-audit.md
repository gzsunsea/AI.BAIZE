# AIHOT backend / API / worker audit — FULL READ COMPLETE

Upstream: `309e32eb343a57d721525f04956887d3b9057fdf` at `/tmp/aihot-reference-20261004`.

**Full-read coverage complete: 145/145 assigned files, 1,085,416 bytes.** Every inventory entry was displayed and inspected in full in bounded batches; truncated output was repaired before marking READ. SHA256 values were verified against the current files after the final batch. This is static source review, not runtime validation. No implementation or commit performed.

## Confirmed architecture (batch 1)

- API is Fastify 5; backend is PostgreSQL via postgres.js; worker queue uses pg-boss with schema `pgboss`. AI.BAIZE's retained Express collector therefore needs a contract adapter; copying these modules would replace the backend, outside approved scope. Sources: `apps/api/package.json`, `packages/backend/package.json`, `packages/backend/src/db.ts`, `packages/backend/src/jobs/queue.ts`.
- Both API and worker install `SERVER_MODULES` from `@aihot/site/modules/server`. Modules can add HTTP routes, queues, schedules, notices, topic parts, admin counts, models, retention, source kinds and hooks. Core-only behavior cannot prove production site behavior. Source: `packages/backend/src/modules.ts`, both `main.ts` files.
- Website JSON contracts use `/api/site/*` and public read functions; site handlers read no cookies. Public machine v1 is separate, with strict known/nonrepeated query parameters, CORS/policy headers, weak ETags, 304, Problem JSON, explicit 405/preflight handling and snapshot/change synchronization. Sources: `apps/api/src/routes/site.ts`, `v1.ts`, `http/respond.ts`.
- Website timeline groups selected articles by **fact**, not story. Facts retain first selected appearance; representative articles and additional source counts are hydrated with a withdrawal recheck. Cursor binds channel/category/tag and uses `tl2`. Return shape: `{filters,cards,nextCursor,dayCounts}`; route adds `hot`. Source: `publication/timeline.ts`, `routes/site.ts`.
- Website selected and machine selected differ: site uses every released selected report; v1/RSS/sync use the single selected **seat** per fact. Listed, selected, seated, evidence and composite predicates are centralized. Flattening existing collector items cannot preserve these semantics without explicit capability mapping. Sources: `publication/scope.ts`, `items.ts`.
- Public pool eligibility needs editorial participation + relevance pass + title + summary. `EXCLUDE_MP` tier cannot be selected. Item detail can exist outside pool; hot-signal materials have no page. Full-text site permission and full-RSS redistribution permission are separate source flags. Withdrawn/summary-only/public and SEO controls are separate dimensions. Source: `publication/rules.ts`.
- Sources have kinds `rss`, `web_list`, `json_list`, `x_search`, `mp_account`, `external`; participation `editorial`, `hot_signal`, `isolated`; tier and first_party are separate fields. Source configs reject unsupported keys rather than silently treating arbitrary adapters as valid. Sources: `sources/types.ts`, `sources/config-keys.ts`.
- External ingestion is bearer-token-only and separate from admin sessions. Token must be nonplaceholder >=16 characters, checked in constant time. Unknown sources become isolated T2 external sources, max 50 items/request; normalized URL dedup, backfill/baseline flags; paused sources reject. Response `{ok:true,created}` does not imply selected/public. Sources: `routes/ingest.ts`, `ingest/items.ts`.
- Worker collection schedules exist only with `COLLECT_ENABLED=true`. Dajiala reconciliation additionally needs provider configuration. **Model calls are independently disabled by default** through `MODEL_CALLS_ENABLED=false`; disabling collection does not disable translations/reports/core jobs. Schedules use Asia/Shanghai, singleton queues, job_runs audit; retired cron queues are deleted. Sources: `apps/worker/src/schedules.ts`, `main.ts`, `config.ts`, `jobs/queue.ts`.
- Admin identity supports password or Feishu OAuth allowlist. Opaque session token is stored hashed; session binding invalidates on password/secret/app/allowlist changes. HttpOnly SameSite=Lax cookies and optional Secure. Production refuses developer login bypass, missing critical secrets and private-network fetching. Route-level CSRF/rate-limit review remains pending. Sources: `admin/auth.ts`, `config.ts`, `apps/api/src/main.ts`.

## Website contract surface for adapter review

Source: complete `apps/api/src/routes/site.ts`.

| Path family | Behavior / mapping risk |
|---|---|
| meta, contact, stats, changelog | Required site-wide data; contact combines makerAvatar |
| timeline | channel/category/tag, cursor, limit 1–40; unfiltered first page adds hot strip |
| pool | page 1–50, q capped 200 chars, tab time/relevance; no timeline cursor |
| items/:id, items/:id/original | Separate original content view; opaque bounded item ID |
| stories/:publicId/followups | no-store; story unavailable 404 |
| groups/:factId/reports | fact reading group + filter scope; no-store |
| items/availability | browser stars reconciliation; up to 500 validated IDs in read function |
| topics, topics/:slug | index + paged topic detail |
| hot, stories/:publicId | merged story redirects 308 to canonical publicId |
| reports/:kind | daily/weekly/monthly archive |
| reports/:kind/latest-page | navigation + latest report in one answer |
| reports/:kind/navigation/:key | archive navigation |
| reports/daily/months/:month | daily archive month selector |
| reports/:kind/:key | dated report detail |
| /items/:id/markdown | attachment export, 404 when absent, noindex |
| feedback | registered separately; full review pending |

`FeedItemSummary` fields actually produced: id/title/summary/reason/source/publishedAt/timelineAt/category/tags/score/selected/channel/x. Full ItemSummary adds originalTitle/links.original/discoveredAt/story. Nulls are meaningful; `reason` is hidden for unselected items; internal `entity:` tags removed. X structured author/avatar/media/quote translation exists independently of prose title. Source: `publication/items.ts`.

## Material concerns / next reads

1. Preserve fact versus story versus article identity and publicId merges; do not invent fabricated reports or event evidence to fill missing existing-backend capabilities.
2. Preserve publishedAt, discoveredAt, timelineAt and fact anchorAt separately; list chronology is not simple upstream publication order.
3. Preserve copyright permissions, withdrawal, isolation, delayed release, selected seats and stale translation revisions across all exits.
4. Production `trustProxy:true` and ingest rate limit default 0 rely on deployment/proxy controls; this is a deployment boundary, not a proven exploit. Source: `app.ts`, `routes/ingest.ts`.
5. Paid/provider details, analysis thresholds, extraction, event grouping, reports composition, admin mutation/CSRF, media fetch SSRF and retention must be inspected before audit completion. Their behavior is **not yet confirmed**.

## Confirmed details (batch 2)

- **Paid dependency boundaries:** Dajiala WeChat history/detail, SocialData X search/tweet/article lookup, Jina reader, configurable OpenAI-compatible chat completions, configurable embeddings or DashScope. Credentials are grouped; UI/adapter reads must not trigger these providers. Prices in comments/code are upstream assumptions, **not independently verified current prices**. Sources: all six `providers/*.ts` (fully read).
- Providers use persisted receipts: stable logical input/model/prompt/config key; advisory lock serializes per-service minute/hour/day attempt budgets; raw response saved before business commit; received/completed answer reused. Pending becomes unknown after ten minutes. Unknown is not blindly retried; file comments refer to one automatic release after 30 min in recover module (recovery implementation still pending). Missing budget row means **unlimited**; zero in any window stops that service. Source: `providers/receipts.ts`.
- `MODEL_CALLS_ENABLED` guards chat and embeddings; collector provider keys govern collector calls separately. Chat default requires LLM_BASE_URL/API_KEY/MODEL; presets come from site models. Unusable model JSON/schema is recorded failed and may cost a fresh retry. Embeddings are stored per article/model/text hash and validated against dimensions. Sources: `providers/llm.ts`, `embeddings.ts`.
- Pool returns `{filters,items,page,pageCount,total,todayCount,freshness}`, page size 40 and 50-page cap. Numeric time-order pagination differs from timeline cursor pagination. Search capacity is process-local max four concurrent, eight queued, three-second queue timeout, 503 Retry-After 5. Time search matches direct text or whole company alias; relevance search can include permitted body, title and entity weighting. Source: `publication/pool.ts`.
- Detail returns summary plus readingMode/author/body/outline/relatedStories/topics/indexable/markdownAvailable/group/hasTranslation/bodyLanguage and optional sameEvent. Summary-only strips selected score/category/story/reason/tags/X/body. Partial translation is page-visible; export accepts complete translation only. Original and Chinese are separate reads. Source: `publication/detail.ts`.
- Representatives prioritize T1, verified owning organization, owning person, then other; within priority full text, score, earlier timelineAt, stable ID. T1 labeling and event ownership are explicitly separate inputs. Source: `publication/representative.ts`.
- Story followups are up to eight **selected facts**, grouped by fact and first appearance; groups return up to 100 public listed evidence articles in same filter scope. Sources: `publication/followups.ts`, `groups.ts`.
- Absolute links use configured SITE_URL rather than inbound Host; modules can override machine story origin. Source: `publication/links.ts`.

## Confirmed details (batch 3: 55 additional full reads)

- Core jobs: grouping serial concurrency 1 (prevent competing reports creating duplicate facts), delayed digest 60s, digest concurrency 3; sources fetch 8, X shard 2, MP 2; selected push retries up to six; media preparation 1; source republishing 1 with durable progress and immediate hot rerank when reduced. Sources: `jobs/events.ts`, `notify.ts`, `publication.ts`, `sources.ts`.
- **Recovery implementation now verified:** ten-minute stale paid placeholders become unknown; unknown older than 30 minutes automatically released exactly once with audit recording billed=null; repeated unknown awaits admin bill check and note. Released jobs/content are requeued; missing grouping jobs swept. Source: `operations/recover.ts`.
- Selection model capabilities separate prefilter, two independent scoring passes, understand, summarize, structure, group, groupReview, digest, report, translate; model precedence admin→environment→site default with one-minute cache. **Daily reports use rules, not model** per capability definition; weekly/monthly use model. Detailed scoring/report implementations still pending. Prompts originate in industry Markdown, includes cycle-checked, missing values rejected, version derived from prompt content hashes. Sources: `editorial/models.ts`, `prompts.ts`.
- Source provenance repair requires exactly one verified T1 owning URL scope; discovery-channel attribution is not publisher identity. Explicit origin/path scope does not broaden through dedup normalization; implicit web-list scope requires observed article discovery. Repairs audit attribution, preserve material revision and republish; editorial transition may restart processing/grouping. Source: `content/provenance.ts`.
- Tag normalization uses industry vocabulary/synonyms, known tags only, max six, category first. Entity identity matches exact normalized aliases and rejects ambiguity. Source: `editorial/vocabulary.ts`.
- Source date parsing uses configured UTC offset (default +08:00) for ambiguous wall-clock dates, validates real calendar dates; CST deliberately not treated as US zone. Listing admission applies URL prefixes, rewrite, noise/category exclusions and publication boundary with future tolerance. Health measures discoveries/output/date quality and repeated revisions, separately editorial vs heat signals; HTTP success alone insufficient. Sources: `sources/dates.ts`, `filters.ts`, `health.ts`.
- Story merges keep old public ID alias; facts/signals move; automatic grouping may not change editor-confirmed manual story identities. Digest text is only exposed while saved listed evidence remains public and input fingerprint unchanged; latest is current listed evidence. Sources: `events/merge.ts`, `publication/story-evidence.ts`, `story-text.ts`.
- **Image requests are an external-action exception to ordinary JSON reads:** signed HMAC URL verification precedes fetch/304, expired signatures reject. Modes/expiry are signed, shortened 64-bit signatures accepted alongside older full HMAC. Media HTTP can enqueue asynchronous animation preparation. Upstream image byte budgets are per process, per minute and Beijing day; no configured budget means Infinity; cached images unaffected. Sources: `media/imgproxy.ts`, `upstream.ts`, `apps/api/src/routes/media.ts`.
- Share posters are real 1080×1440 PNG artifacts with article QR, title/summary/source/date/optional score; hashed template/content cache. Item OG loads only public metadata and summary-only rules. All poster/site branding comes from site configuration. Sources: `media/poster.ts`, `publication/og.ts`.
- Selected Feishu content push gate: public selected, not silent, reliable publication date, T1/T1_5 only, not backfill, timeline age ≤12h. Per-fact/article target dedupe plus ten-minute same-title lease and uncertain sibling suppression. Push targets record enabled_at so old content is not backfilled. Delivery implementation pending. Sources: `notify/selected-content.ts`, `selected.ts`, `admin/settings.ts`.
- RSS routes: selected/full/all and daily/weekly/monthly plus category/full-category; unknown query ignored; ETag; no CORS response headers; notices/module exit hooks. RSS payload/license implementation pending. Source: `apps/api/src/routes/feeds.ts`.
- Feedback endpoint multipart 12MB including max one screenshot; sender IP comes from x-real-ip or request ip, so reverse proxy trust matters. Admin optimistic version updates, source bans and erase operation remove text/email/page/local screenshot while retaining handling record. Feishu-forwarded image deletion behavior remains unconfirmed. Sources: `routes/feedback.ts`, `admin/feedback.ts`.
- Admin model overview distinguishes actual cost from estimates and cached-token pricing; model changes audit with reason and do not rejudge history. SelectBench imports gold-set comparison runs/cases, exposes disagreements/FP/FN; runtime does not itself prove human labels correct. Sources: `admin/models.ts`, `selectbench.ts`.
- Run view combines queues, failed jobs, ingest, grouping candidates, receipt/delivery doubt and three-minute heartbeat freshness. API watchdog waits 30 min before worker-down notice, recovery once, durable state plus advisory lock. Source: `admin/runs.ts`, `operations/watch.ts`, `heartbeat.ts`, `grouping.ts`.
- Retention: job history 30d, failures 90d; derived img/OG cache 30d; forwarded feedback screenshot intermediates 8d, but screenshots stay when no internal forwarding. Modules perform their own retention first. Source: `operations/retention.ts`.
- IndexNow disabled by default; optional key and switch; derives indexable item/story/topic/report URLs, submission watermark persisted (including disabled runs); failed HTTP does not move watermark. Source: `operations/indexnow.ts`.
- Site stats count DB public-read totals, day samples and latest; local cache 10 min fresh/60 min stale. Changelog reads site JSON cached for process lifetime. Contact QR settings can override pack assets; maker avatar can derive from configured source. Sources: `site/stats.ts`, `meta.ts`, `contact.ts`.
- Cursor opaque encoding is prefix+base64url JSON with query-binding hash, **not a signature**. JSON/data parsing and caller field validation remain essential. Source: `lib/cursor.ts`.

## Confirmed details (batch 4)

- Admin mutation guard now verified: session + x-csrf-token for methods other than GET/HEAD, no-store. Password attempt caps per-process 10/client and 50 total per 15 min. All core admin routes use guard; mutations cover source create/edit/preview/fetch, content visibility/SEO/override/rerun with Idempotency-Key, event detach/merge, feedback, receipts/deliveries, budgets/models/bench. Source: `routes/admin-auth.ts`, `routes/admin.ts`.
- Outbound SSRF controls check every redirect, resolve all addresses, connect-time guarded lookup, proxy DoH resolution + checked IP-pinned CONNECT; reject private/loopback/linklocal/documentation/multicast, IPv4-in-IPv6 and Teredo. One deadline covers DNS+redirect+body, max response size. Protected/custom-header/body requests stay same-origin on redirects. `ALLOW_PRIVATE_NETWORK_FETCH` bypass is development-only by production startup checks. Sources: `lib/url.ts`, `http-fetch.ts`, `egress-proxy.ts`.
- All collection/import/ingest material passes `upsertMaterial`: stable identity, row locks, discoveries, revision hash, attribution repair. Other sources discovering same identity do not replace publisher material. Content revisions reset analysis/grouping/value check and withdraw stale projection. Historical repeated rendering hashes do not re-trigger paid analysis. Missing publication time, explicit backfill, >48h-old discovery count backfill; >1h future date becomes untrusted; historical material founds no event/heat. Source: `content/materials.ts`.
- Body extraction Readability minimum 200 chars, guarded direct page then paid Jina fallback; video/player/social pages excluded. Unconfirmed bodies explicitly recorded. X long article retrieved by post ID through paid SocialData and appended once. Body changes new revision. Source: `content/extract.ts`.
- Sanitized whitelist HTML shared web/export/RSS, scripts/forms/iframes/embedded active content removed; image originals signed at read time. Pure text is escaped with limited safe inline markup. Source: `content/sanitize.ts`.
- Analysis exact rule: wide prefilter BLOCK only (missing evidence BLOCK→UNKNOWN); structure parallel with score; two scores selected iff sum≥2×industry tier threshold, display floor(mean); tiers missing threshold not scored. Content-understand writes selected/near-selected, cheaper summarize rest; Chinese short posts verbatim. Usable Chinese title+summary required for relevance/pass/public eligibility. Scope composite yields no extracted fact; conditions/evidence quotes must occur in original and model-visible input. Sources: `editorial/analyze.ts`, `input.ts`.
- Writing identity guard forbids introducing lexicon companies absent allowed input/publisher/owner context; unsupported title falls back original Chinese or empty; unsupported summary drops. No paid repair call. Source: `editorial/writing.ts`.
- Full translation only selected/public/full-license, worker-only; pages never call translation. Leaf blocks shield code/media/links; lost/repeated placeholders retry once then keep original; partial stored explicitly; 60k char cap. Revision-aware writes preserve source translations; pending attempts limited three per revision; short X and Chinese skip; quote translations shared by tweet ID. Source: `editorial/translate.ts`.
- Story digest model input uses max latest40 reports, current evidence hashes; corrected/dropped sources rewrite without old digest. Post-model transaction rechecks story version AND current evidence hash before publication, marks receipts complete even losing race. Source: `events/digest.ts`.

## Further confirmed contracts and operations (batch 6)

- Collection separates the first import (default 30 items over 12 months, explicitly backfill) from subsequent new identities, with a 48-hour cursor overlap. Source validators depend on source configuration and unfinished detail work. Deduplication happens before paid detail extraction; source cursors advance only on success. Hard failures increase backoff and mark failing after five, while budget waits do not count as health failures. X sharding retains member coverage and backlog. Sources: `packages/backend/src/sources/collect.ts`, `packages/backend/src/sources/x.ts`.
- Worker priorities distinguish live, signal and historical work. Analysis runs with six concurrency slots and extraction with four; transient retries use bounded backoff, budget/busy states do not consume failure attempts, extraction failure falls back to unconfirmed text, and unknown paid receipts require release before resumption. Noneditorial articles bypass selection analysis; isolated and backfill inputs do not become live heat. Source: `packages/backend/src/jobs/content.ts`.
- RSS supports RSS/Atom/RDF and binds ETag validation to the source configuration and response destination. Web adapters cover HTML, Jina Markdown, Docusaurus, Intercom and MiMo; unsupported parsing fails explicitly. JSON extraction reads configured paths without evaluating embedded scripts. MP intake caps first import to seven days, eight new articles per check, with bounded body retry. Source icons use cached proxied images. Sources: `packages/backend/src/sources/{rss,web-list,json-list,mp,icons}.ts`.
- Agent Markdown endpoints preserve strict queries, merge resolution and requested report identity; a missing dated edition is not replaced by another edition. OG and poster routes use public visibility checks. Static routes derive site metadata, categories and module content; uploaded hashed QR assets have immutable year-long caching. OG images use local Noto Sans SC fonts through Satori and Sharp, with atomic content caching. Sources: `apps/api/src/routes/{agent,og,static}.ts`, `packages/backend/src/media/og.ts`.
- Hot ranking reads revalidate stored representatives against currently listed story evidence, so withdrawn/regrouped entries disappear before refresh. Participant names are deduplicated and ordered by editorial role, tier, face availability and original position. Home strip requires at least three entries and returns at most five. Source: `packages/backend/src/publication/hot.ts`.
- Sitemap has a five-minute shared deadline, including disk fallback after restart; it cannot serve an expired saved copy. It limits to 45,000 URLs, includes indexable topics, up to 500 stories with their own listed evidence, and module additions. Source: `packages/backend/src/publication/sitemap.ts`.
- v1 list cursors bind mode/window/order/category/query and reject a cursor that has fallen outside the rolling window. Selected machine items use seated representatives, while all uses listed reports. Snapshot/change cursors carry an epoch and projection; tokens are opaque but unsigned, validated against current ledger watermark. Snapshots omit members withdrawn during paging; change sequences convert no-longer-listed historical upserts to removes to avoid redistribution. Rebuilt ledgers require a fresh snapshot. Source: `packages/backend/src/publication/v1.ts`.
- Manual classification correction preserves frozen entries and clears affected period prose. Feedback forwarding retries pending local submissions for a bounded seven-day period; local erase does not prove remote Feishu deletion. Sources: `packages/backend/src/reports/correct.ts`, `packages/backend/src/operations/feedback.ts`.

- Story consolidation compares root facts directly in both directions with two model capabilities; roundup roots and manually originated identities are excluded from paid comparison. Related-story links need two distinct firmly tied reports and exclude roundup roots. Manual detach/move decisions use the same article lock as grouping, survive retries and revisions, refresh publications and digests, and audit the reason. Empty previous stories can redirect to the new story. Explicit regroup clears automatic memberships while preserving manual ones. Sources: `packages/backend/src/events/consolidate.ts`, `packages/backend/src/events/corrections.ts`.

## Further external boundaries (batch 7)

- `llms.txt` lists only available report editions/indexable topics and installed module tools. Machine access is anonymous read-only, exposes summaries rather than an item-body endpoint, and distinguishes original and discovery dates. Source: `packages/backend/src/publication/llms.ts`.
- Backup requires external `pg_dump`, `pg_restore`, `tar`, and configured object storage using AWS Signature V4 (Tencent COS default). Dump archive listing is checked before shipping; file-pack failure still ships the database but reports a failed run. Local retention is three copies per kind; remote retention depends on bucket lifecycle, not this code. Source: `packages/backend/src/operations/backup.ts`.
- Image downloads use guarded egress, 20-second/15-MiB caps, a one-minute 32-MiB/32-original cache, negative caching except budget failures, deterministic modes and content-hashed disk files. Animated GIF conversion runs in background, caps 200 million decoded pixels and requires at least 15% saving; unsupported large animations pass through. Source: `packages/backend/src/media/images.ts`.
- Content delivery starts disabled, claims target/dedupe rows transactionally, rechecks selected eligibility before each mirror, skips pre-enable history, and treats timeout/lost acknowledgments as unknown. Unknown outcomes never retry automatically; explicit reasoned admin resolution uses timestamp conflict checks. Stale sending becomes unknown and stale pending becomes failed. Source: `packages/backend/src/notify/deliver.ts`.
- Feishu separates OAuth login app, internal message app and content-group custom webhooks. Screenshot upload stores a remote image key and removes local bytes; permanent rejection or 24-hour failure discards the image. A transport HTTP success does not suffice: webhook acknowledgment code is checked. Source: `packages/backend/src/notify/feishu.ts`.
- Event identity distinguishes same occurrence, direct development, unrelated and roundup. Every candidate must receive exactly one answer; missing answers are errors. Developments attach only to story root candidates, preventing chains through developments. Code comments report internal labeled-pair precision/recall; these figures were not independently validated. Source: `packages/backend/src/events/relate.ts`.

## Additional site and machine mappings (batch 8)

- Recall uses 14 days of discovery time, title/summary vectors with stored Float32 precision, optional lexical bigram fallback (separate 0.25 threshold), exact URL and referenced X boosts. Composite reports cannot define identities; up to three selected standalone/composite reports supply reading context only. Source: `packages/backend/src/events/recall.ts`.
- RSS exposes stable item-ID GUIDs, website links and source publication dates (omitted when unknown). Selected feeds seat one representative per fact, retain 50 items, and category feeds limit to seven days. Full feeds require independent syndication permission, complete article translations, and seven-day image signatures. Report feed retention is 30 daily and 12 weekly/monthly editions. Source: `packages/backend/src/publication/feeds.ts`.
- Topics load stable industry slugs at startup, match tag overlap plus company title identity when multiple companies are subjects, and page selected seated reports in groups of 20. Topic counts cache one minute but returned rows and module references are rechecked. Indexability requires 50 total or 20 plus recent activity; story topic links cap at six. Source: `packages/backend/src/publication/topics.ts`.
- Site story detail returns up to 100 timeline reports, 12 official reports, fact developments, 24/72-hour active/watching/settled status, heat completeness and related links. Machine story returns at most 50 reports, collapses watching into active, and omits heat values. UUID aliases and merge chains remain resolvable. Covers come only from currently listed full-text evidence. Source: `packages/backend/src/publication/stories.ts`.
- Source admin uses optimistic version checks and advisory identity locking. First-party is derived from T1, licence/tier/participation/name/publisher changes enqueue complete source republishing, and participation promotion does not purchase retrospective analysis. Preview does invoke external source fetchers, including potentially paid ones, despite not storing articles. Source: `packages/backend/src/admin/sources.ts`.
- Agent Markdown and MCP use the same public read functions and preserve fixed-edition identity. Search expands from selected to all only on no selected result. External content is fenced as untrusted data with explicit original-verification guidance. MCP is anonymous, stateless/read-only, caps body at 256 KiB, validates host and origin, rejects JSON-RPC batches, bounds tool inputs, caches successful answers 30 seconds, and conceals internal error details. Sources: `packages/backend/src/publication/agent.ts`, `apps/api/src/routes/mcp.ts`.

## Final selection, event and edition architecture (batch 9)

- Publication is one derived projection of stored material, latest judgment, overrides and graph memberships. Projection rebuilds buy no model calls. Score eligibility nominates a selection candidate; completed identity/value confirmation admits it. Explicit manual selected overrides can preserve admission; isolated sources force withdrawal. Release time is stamped after locking and remains separate from candidate-ready, source publication, discovery and timeline dates. Sources: `packages/backend/src/publication/publish.ts`, `packages/backend/src/events/group.ts`.
- Machine selected seats settle under ordered per-fact locks; replacing a representative emits removal of its old seat and upsert of its new one. Ledger sequence allocation uses an advisory transaction lock so sequence order follows commit order. Website sort anchors use earliest eligible public fact member. Pool body search includes only permitted full text (first 12,000 characters). Source: `packages/backend/src/publication/publish.ts`.
- Grouping is serial, recalls up to ten facts at cosine 0.6, reviews proposed occurrence merges below 0.85 with another capability, and checks material revision and manual decisions under row lock after model response. Composite material only mentions facts, historical material starts no event, and unsupported structure cannot enter selection. Discussion signals attach through reply/quote first; otherwise require embeddings, with 0.72 recall/0.92 automatic similarity, up to four candidates. Unmatched reactions can be reconsidered over six hours, or referenced originals over 48 hours. Source: `packages/backend/src/events/group.ts`.
- Heat counts independent actors once per 48-hour window using original source time and 24-hour half-life. Actor keys distinguish community authors, media groups, owners and source fallbacks. Ranking needs at least two participants and one editorial participant, caps ten, and chooses the most-reported fact before its representative. Trends compare a common observed cohort, with incomplete hours omitted and later repaired. Source: `packages/backend/src/events/hot.ts`.
- Daily publication requires at least one entry and uses rules only: seven-day memory, one event entry, up to 12 main/10 flashes, at most two main entries per source, official/independently covered fill-ins, and new fact requirements for follow-ups. Period attribution is later of arrival/release and excludes stale delayed material. Weekly/monthly choose 20/30 events from dailies; model writes only grounded and length-limited overview/section prose, with plain fallback on failure. Existing scheduled issues stay frozen; explicit regeneration archives revisions. Catch-up fills oldest missing issues, up to eight per run. Sources: `packages/backend/src/reports/edition.ts`, `packages/backend/src/reports/compose.ts`.
- Report DTOs preserve frozen title/summary citations, recheck availability, replace withdrawn leads, suppress affected period prose and remove machine/feed withdrawn citations. Website can retain marked withdrawn titles with no summary/link; absent imported-window IDs remain cited as published, which is a deliberate trust boundary. Archive keeps latest 400 entries; numbering covers the full series and changes after backfill/deletion. Source: `packages/backend/src/publication/reports.ts`.
- Admin supports diagnostic chain across discoveries/revisions/receipts/selection/ledger/grouping/deliveries. Corrections use version checks, reasons and audit. Encoding repair preserves semantic revision and public decisions; historical date repair requires both dates older than seven days and verifies all other decisions unchanged. Paid reruns use durable request IDs, not just expiring queue singletons. Source: `packages/backend/src/admin/content.ts`.
- Operations alerts evaluate observed collection/processing output, delayed grouping, overdue reports, refused providers, rolling budgets, failed/unknown deliveries, backups, media egress, source quality and module findings. Immediate alerts repeat hourly, owner-action alerts daily, and follow-ups use 09:00 digest. Their outward send remains separately gated. Source: `packages/backend/src/operations/alerts.ts`.

## Adapter implications and material limitations

**Fact:** The approved retained Express backend can feed AIHOT contracts only through explicit mapping of identity, dates, eligibility, visibility, selection, licences, source identity, story/fact membership, reports, media and pagination. These concepts are independently represented upstream; a single selected flag or flat article list cannot stand in for all of them. Sources: publication and edition files above; site route contracts recorded earlier.

**Inference:** Capabilities unavailable in AI.BAIZE should return honest empty/unavailable states that satisfy the frontend contracts. Calling the upstream worker or importing its database/provider pipeline would introduce separate collection, PostgreSQL queues and paid-model dependencies beyond the approved frontend rebuild. Implementation mapping still requires inspection of the retained backend's actual DTOs.

**Limitations:** All conclusions above are source-backed static findings for the assigned trees at the supplied commit. No external providers were called, current prices verified, secrets inspected, deployment tested, restoration exercised or security exploitation attempted. Module hooks, industry prompts/contracts and frontend consumers outside this assigned inventory must be reconciled by their corresponding audits; code comments claiming measured quality are not independent proof. Findings are not a certification of runtime correctness or security.

## Per-file full-read ledger and SHA256

| File | Bytes | SHA256 | Full read |
|---|---:|---|---|
| `apps/api/package.json` | 455 | `eab5d7ff8fc8c3ef65c51308d48ab8df51810eed88badb77cf1f5ec40e48edce` | READ |
| `apps/api/src/app.ts` | 5937 | `b7a2917a0bbced0d116f2e3a2389189add1a5e58c34c2ead019b69a731757645` | READ |
| `apps/api/src/http/respond.ts` | 6330 | `d24e1d4bc22e5d35a698919828d171a1878a84b0c2e8b1ca0077f991f6a16a15` | READ |
| `apps/api/src/main.ts` | 1494 | `b7ee633f57e1ba0fd195739da46acece77e85ba5e2cbf109650d9ae46553fa58` | READ |
| `apps/api/src/routes/admin-auth.ts` | 8284 | `d475a8bf180c435a7c62fdbdb33fdb9829b656f7fb78a62f89cb2be437bef47d` | READ |
| `apps/api/src/routes/admin.ts` | 9601 | `f01e2d16e1be56162e6b5b38669783ec26a311be1a036b6667fb38abc74f036c` | READ |
| `apps/api/src/routes/agent.ts` | 7347 | `8e303b839abc29c11fbad8f1ea3f2012420ba8543771d42fb760ee735819f179` | READ |
| `apps/api/src/routes/feedback.ts` | 2481 | `59b8fd51cd2580ff87fb6ff2cfa5c42575f3e422af7f0cde62d756190e5018e4` | READ |
| `apps/api/src/routes/feeds.ts` | 3173 | `3ebec23146373cbc48732df88d5d95fadf71be7a481db7869033314a07426851` | READ |
| `apps/api/src/routes/ingest.ts` | 2558 | `c1302f26f04934f166041fcd7f9033ad35553741de0b4f7c9c68741d9f4b7e77` | READ |
| `apps/api/src/routes/mcp.ts` | 22400 | `dff266192efde7068776999a06ac181d5b7c408384f556d652bfb808946b2dfc` | READ |
| `apps/api/src/routes/media.ts` | 3498 | `bcd2d8ae241958713a22c62ce3a998cfb9f818e24af83095d66c9d275b174213` | READ |
| `apps/api/src/routes/og.ts` | 6009 | `e1b1c400543f901e73e7eba8802e56f914241160f9679dad7dd3c1d945657a69` | READ |
| `apps/api/src/routes/site.ts` | 13726 | `ef80f42fa0694b84471459e9028579e69de1cfbfd4a9b9542d1a7c815057f2f0` | READ |
| `apps/api/src/routes/static.ts` | 8791 | `809b36c8b94811810bede62abdd0397cd40d229a8502b7dc5b0bf11d15f0c633` | READ |
| `apps/api/src/routes/v1.ts` | 13909 | `d2d79136eec0d040c69333a4e38e45c0074cb8364a63aa7bca74473ba0165c40` | READ |
| `apps/api/tsconfig.json` | 74 | `88020c5d0c639e9fca3c8cc0425dc6233bbb30b14c5a0cb5dcb7d7530d4b788f` | READ |
| `apps/worker/package.json` | 324 | `cb26ac98750759a5c681390a68fabfedab8c945d61f21bd6f1a6cc437d9a8b87` | READ |
| `apps/worker/src/main.ts` | 1867 | `a336c574a0a618648e5a8dc3ddf547b374f82a2191c3ad354dd9d447fb39952a` | READ |
| `apps/worker/src/schedules.ts` | 5395 | `2f82bdd48b8eafc5f29727d5d5556f35f179726f107ab82fa5746d075fc707dc` | READ |
| `apps/worker/tsconfig.json` | 74 | `88020c5d0c639e9fca3c8cc0425dc6233bbb30b14c5a0cb5dcb7d7530d4b788f` | READ |
| `packages/backend/package.json` | 620 | `e8c3a685835dc69ce6b8f1fc733ffd37d8b59adda2de4b0bd9d158bfe7981c6a` | READ |
| `packages/backend/src/admin/auth.ts` | 13066 | `1f31fddb28261d48bc6db6f389de3821b57321883469042b4239ead421c23740` | READ |
| `packages/backend/src/admin/content.ts` | 22993 | `f5f76ad75ce8e822ceddde04ff57ebcf41a4e78a0e4890297bf5d2e10946ca7b` | READ |
| `packages/backend/src/admin/feedback.ts` | 5088 | `e9e13e4689278f2667404500e6df0b417a37934f298242e3bbcbac18a9c218dc` | READ |
| `packages/backend/src/admin/models.ts` | 6929 | `5bd5549eb07dbb9be5c4f396614b0f93d0358fd6b1c4c64a469d8c2f48d409d7` | READ |
| `packages/backend/src/admin/navigation.ts` | 874 | `db569f4b3636761ac03b1f34cb895c84ed81f9c063614219f1e30a21ed398324` | READ |
| `packages/backend/src/admin/runs.ts` | 5884 | `e4eed292f8603afabc516a49f2cc5861874f80fb8358011274f9ab613520553c` | READ |
| `packages/backend/src/admin/selectbench.ts` | 5212 | `643e473eac87342aa6ab83d15b37b9f1b34bb9ba0d2922cd81e588c89c8b9dda` | READ |
| `packages/backend/src/admin/settings.ts` | 5331 | `4673d7c2339f800a7101ac4a44df1ab307b4517014ad6e7aed869dd5cb7c4bf9` | READ |
| `packages/backend/src/admin/sources.ts` | 15093 | `1a5b8bb1e59a0380472ff201e5c5b3c25c1811f51ee3d809af612c40e7765c49` | READ |
| `packages/backend/src/audit.ts` | 2169 | `32f1f8a5514e30c7837a558d98b8c13e9a13df2100332a11a51c4470757ae10e` | READ |
| `packages/backend/src/config.ts` | 5468 | `f34a701f7ccc3e2486348d942a62761d640d19acc04ac9750e3769caf5584638` | READ |
| `packages/backend/src/content/extract.ts` | 8781 | `f9d93bdcdc2bd903d445f6abb8d4707f0289515aa27a2ba3633a1cdaf747116f` | READ |
| `packages/backend/src/content/markdown.ts` | 4371 | `7c440b3603b801f2242b52df311971ddfb95075e31bc03e580ebc9d5243ec10d` | READ |
| `packages/backend/src/content/materials.ts` | 15720 | `029b71bc215a49feee18bcaa590f733cfe62c3e15ae4e6f94d58bbd605501a40` | READ |
| `packages/backend/src/content/provenance.ts` | 5484 | `b408052ec43efedf094e0d0359948a02da5d5d65fcc1340e5b41f5100e0bb9ba` | READ |
| `packages/backend/src/content/sanitize.ts` | 11232 | `4774a6f093a32a1a45a0926d9c33c5efa2c89a5b929b17f8bed4ed21af52e93c` | READ |
| `packages/backend/src/content/x-encoding.ts` | 3905 | `ad6d2372861f86330befa2273bbf0d473cfeba924cde3c70e7274da26fb568b8` | READ |
| `packages/backend/src/db.ts` | 1800 | `b04d24652386038066cfb69ddb5c755e4b90aad6fa3051649a7dbf34525c8189` | READ |
| `packages/backend/src/editorial/analyze.ts` | 25442 | `69ec422d280624c569dc68b75d5d7850c00ee2f4fc4f72dae33ad616deb3bf4b` | READ |
| `packages/backend/src/editorial/input.ts` | 6564 | `1a34e628b9e044d7bf2e746acec4f58b466dd2de01f3e5331168722f72abdb36` | READ |
| `packages/backend/src/editorial/models.ts` | 5173 | `4b47e0ea240e2d58c9453535d24522a6bb10ae44cd0655112a81cc71190604f9` | READ |
| `packages/backend/src/editorial/prompts.ts` | 3237 | `819f89b9d183d8129fe058638d5b244661a475971fa92af5ff5faac0e3d34b0f` | READ |
| `packages/backend/src/editorial/translate.ts` | 19728 | `33467fca830b804e68cba5152435a0d96833b325d1663932e4464d06d1a2fad9` | READ |
| `packages/backend/src/editorial/vocabulary.ts` | 2421 | `ae0b6f229199f547fb70f2445b4861b51a10392a5019b4b68ff9f442fff1ce0e` | READ |
| `packages/backend/src/editorial/writing.ts` | 17860 | `0b65c1a43b06b98cb835590c12adaa748ee86c257b8c526a01961ced45fc2e2f` | READ |
| `packages/backend/src/events/consolidate.ts` | 9117 | `6a617e274c557f7f073c385380a6bc841262800d0c84557e36b5dea436d87fe8` | READ |
| `packages/backend/src/events/corrections.ts` | 9754 | `3f78b8c6237402a2ce0e1d6cfa5e36ab37d5bd1e9576b7e7862daab1fe16b49e` | READ |
| `packages/backend/src/events/digest.ts` | 6954 | `30b2e9ad380e6627fdef22b96a33c54e0257810633b0980ea3890bafe124e5dc` | READ |
| `packages/backend/src/events/group.ts` | 35600 | `f02d3cc7183597bab63747a135c822f7e23a6048162ea0da5563089b978fc5f8` | READ |
| `packages/backend/src/events/hot.ts` | 19831 | `9a7b964c10d1c85b1931e2e26a39745430fa19968cab7409f747ef26dfcd1313` | READ |
| `packages/backend/src/events/merge.ts` | 2913 | `c4dc55cb729e354cd47b3505d50d0770691417dc326168f326a559538b109b97` | READ |
| `packages/backend/src/events/recall.ts` | 14801 | `d4873b2d872055eed8bd3e413fd6cca60446ee4e653208cf2d1a9ac0b84f499c` | READ |
| `packages/backend/src/events/relate.ts` | 10317 | `4c5de699f4611364aa0ef9f3335d24ba55fb5f6ef2ed96f34de0e48c03aa8316` | READ |
| `packages/backend/src/ingest/items.ts` | 3640 | `1c6df035646afcae80e9cd5b45c61e18d20f55fc384f865606ac99ed31e5ae47` | READ |
| `packages/backend/src/jobs/content.ts` | 17246 | `91f6868444e3eb970e69590479b5552f944bd7e1efca326eccf6c651cf3dd787` | READ |
| `packages/backend/src/jobs/events.ts` | 2339 | `a69cc57aa1591757fd7ee9243874109081770bb3549f9a615f3b75fedd7b0e2e` | READ |
| `packages/backend/src/jobs/notify.ts` | 1218 | `9a5a50e91e6e95bf2d9a812d90c4fe403940134da94dcfdbca7794bbcf695619` | READ |
| `packages/backend/src/jobs/publication.ts` | 1691 | `fc62770fe3632fb876176eded0e58753cd38cd56705d05277d30678f51cb1d73` | READ |
| `packages/backend/src/jobs/queue.ts` | 7983 | `4f264de2c54577ccfe9a679461634d81dbb201f953b62b0fec50335aa08498ee` | READ |
| `packages/backend/src/jobs/sources.ts` | 1262 | `0fa12a6ae499d0adb4cd37c3d896bdbf7a24eadd62d453ea3ecec9552290428e` | READ |
| `packages/backend/src/lib/cache.ts` | 2140 | `85cb3d2d89fc642d9ff2822643d0bc43457c3896453f752b52a2351fc68aac62` | READ |
| `packages/backend/src/lib/cursor.ts` | 1004 | `3b59f5b3e094a2a0e5b1ef089b2c758e0fb1c250e5264fe4883bad6a20818b70` | READ |
| `packages/backend/src/lib/egress-proxy.ts` | 4852 | `f452e70fd2442d95d59e959d52ae346de5a01e8c3d25835de6543db8bda27c0c` | READ |
| `packages/backend/src/lib/http-fetch.ts` | 7627 | `225926a430325fc7d72071e8c7af798b4b2b2b192cb5611ba1542744b689e977` | READ |
| `packages/backend/src/lib/ids.ts` | 1090 | `e14fbf18a75cf5744761722d65f0b50a13e14cc6d17c693404c618b77be5d779` | READ |
| `packages/backend/src/lib/image-url.ts` | 1077 | `a958694377ecfcab802d44aa318c172e1ca28cc7a6509dbe5e28a8a18aeec01e` | READ |
| `packages/backend/src/lib/log-error.ts` | 1282 | `afdf2145810db4458659c2f38773d476003c4880090401ddc54782bc5f4136f6` | READ |
| `packages/backend/src/lib/shutdown.ts` | 152 | `2170a2a78073a61446d34b4d50523af3314e753883efa83a38d3e8aa46884df7` | READ |
| `packages/backend/src/lib/text.ts` | 1627 | `e8b74509416c57df5a55381a5f4927fbe436e936a008d05ab85ce2e3b9fbdcb2` | READ |
| `packages/backend/src/lib/url.ts` | 8941 | `0e0eb82affebb1d702fdc9cc46a51615cf366e1a0daac2348f14dfb239415a27` | READ |
| `packages/backend/src/lib/video-url.ts` | 786 | `a77040de5ed12cbc49d457043ca799ad5c950fde9b1bf2639429064426d107bb` | READ |
| `packages/backend/src/media/images.ts` | 12597 | `de9cb56084c8f54d8e992d3561fa6fc88e221a7a8c8bc1fb39b087d433f9b012` | READ |
| `packages/backend/src/media/imgproxy.ts` | 6046 | `93d00ec6a9c71be933a2c7691a26e79d8d96c1c83a9433638a876c06483cb9a8` | READ |
| `packages/backend/src/media/og.ts` | 8441 | `45b5e90bebc0f073b31b4d3fdfa1ca597ff12530018d5db2c79115dc35a8bfb6` | READ |
| `packages/backend/src/media/poster.ts` | 4389 | `19a56cc47498f4e2e360c7f97456cb4e9ddd84048e432230f3983e2f3ca67f2b` | READ |
| `packages/backend/src/media/prepare.ts` | 2645 | `e890b96a4e5fc856592ea822f42bd9236258189318b7abb107dddb09fd3e52b5` | READ |
| `packages/backend/src/media/renditions.ts` | 816 | `35270213432b7073748d5bc68cb36b6173d41a78eb7228e87a2518fcaf1cac4b` | READ |
| `packages/backend/src/media/upstream.ts` | 3208 | `043767d75ca91285ab22a945957dbba02adf55f183f03b567c1e991676b8c552` | READ |
| `packages/backend/src/modules.ts` | 12605 | `3232406cb5a688409d7934712310bf6985f6869cffa5b37beafd1ec39aa43aeb` | READ |
| `packages/backend/src/notify/deliver.ts` | 10745 | `29917ed1d21eae515b1b8810b99ddf791b92acdbde9f1f2cad603fb14ab32752` | READ |
| `packages/backend/src/notify/feishu.ts` | 11319 | `cb3a7892a2c0127215d91019d20279962762f1d4627c73fad3c2934bd993d024` | READ |
| `packages/backend/src/notify/selected-content.ts` | 3030 | `5f719ec8825bf647f2a97fad18524c00c213feff93613e6dcde9819424176ba4` | READ |
| `packages/backend/src/notify/selected.ts` | 2648 | `f4622ae30891f113eda579677027368378ef6d9a179cacf4afdbf20fe66d3751` | READ |
| `packages/backend/src/operations/alerts.ts` | 20060 | `2a7aeae88c57403365b437e8d115b06165044f2e3c5ff69ced30b2e5518a7195` | READ |
| `packages/backend/src/operations/backup.ts` | 8409 | `3869193113f668c936f09b57a6cd5d962cd8a99b1f5970ebd16cd9046908de65` | READ |
| `packages/backend/src/operations/feedback.ts` | 6933 | `5e48bba102001b46c7e087502c82ef74d3c1baf5786da6ff9a9c68ff72a75fba` | READ |
| `packages/backend/src/operations/grouping.ts` | 2514 | `24939b44a9b5d457fc89c7ea46bb09b50907f5377a17b7bb0e173fbdc86a0ea6` | READ |
| `packages/backend/src/operations/heartbeat.ts` | 1126 | `716daf50f433691d5a6646fb3d950867594f1cc1ebfb8dc2d4d1d2283713659b` | READ |
| `packages/backend/src/operations/indexnow.ts` | 3985 | `c6a57f7cda236b5a8b784fe994692855e2660aba0aa889bc9a74bfc951634b01` | READ |
| `packages/backend/src/operations/recover.ts` | 3475 | `2ee25f26ea570a5a959b5efb211a868d694f16ebb4b699fc8dced57b14024f14` | READ |
| `packages/backend/src/operations/reports.ts` | 4002 | `71b78a147493894cb4c626c90d6791cdfef08198ce2e9dbcd8ebb442c42c40e6` | READ |
| `packages/backend/src/operations/retention.ts` | 2721 | `d31af395ddf7dc3ebb253e7ad1b3b197b14e0198f4156892ef8593591b218551` | READ |
| `packages/backend/src/operations/watch.ts` | 2774 | `7354640b849567a41ad5bc0d05cba92edfd97071d443d3336acfa3377f0294e3` | READ |
| `packages/backend/src/providers/dajiala.ts` | 4987 | `d7f4f39b2ee21ea09cdbed44bc4ec501a58213b7ff98e1034144c39fb43050ad` | READ |
| `packages/backend/src/providers/embeddings.ts` | 6501 | `25790c38477273194675635a11066975fabb79e1beca48a182b9639ce0ef3860` | READ |
| `packages/backend/src/providers/jina.ts` | 3140 | `8139c490359fac3f841371de76e4ea84049f986fa106527f1ed0ff7194cdcd26` | READ |
| `packages/backend/src/providers/llm.ts` | 9244 | `54e6e8442b5f08764565afe306251fd06a46fe92d649495e95ea6f9d8e217265` | READ |
| `packages/backend/src/providers/receipts.ts` | 12691 | `9dcfaa5b55f1cd5da1db1b48e11b7e0869b0d65d4a03ef10340fe44242baf136` | READ |
| `packages/backend/src/providers/socialdata.ts` | 7376 | `8dc74747163d88e79e6b2b6ac9b69fbe42d72f186790cf862c042cfaf573121d` | READ |
| `packages/backend/src/publication/agent.ts` | 20014 | `3aed341131dd608a76f4e6e72461912403bbba1f357bae17975b36b3531dd744` | READ |
| `packages/backend/src/publication/availability.ts` | 1370 | `547397cbb44628e097b75dbd04d05a9d245ba313d530bf74620703c2f29dd632` | READ |
| `packages/backend/src/publication/coverage.ts` | 989 | `2dd61b1e8c725d3da569b6e9311c2d7087b12eaccb132cbb033d38111298cb1b` | READ |
| `packages/backend/src/publication/detail.ts` | 9657 | `b8026d32077b27a20076681f9b0030e6f598defc2517307b25f8d175e3a44042` | READ |
| `packages/backend/src/publication/feeds.ts` | 13410 | `48b96273fef6f9a1da21baafb2a639fe3c904d9cf4d9bf63c0837d800975bad3` | READ |
| `packages/backend/src/publication/followups.ts` | 2374 | `49bd2cb37e9e9ccbc34a79149fe57f47d07f0c146e7bb65ba9344c22af1397b5` | READ |
| `packages/backend/src/publication/groups.ts` | 1918 | `917821ab898b601c20b35525f99221cc5f540c6928ca0d05ea5c1104934bda13` | READ |
| `packages/backend/src/publication/hot.ts` | 6578 | `33a26e1c3a75f9178754c6ce6f524f347c0fcdcf952eb4d547c9d9b0bc6f0223` | READ |
| `packages/backend/src/publication/items.ts` | 10627 | `6bcda875c7c620655edcf6bd2330a04227f7e093496297f743298889ed100d39` | READ |
| `packages/backend/src/publication/links.ts` | 1217 | `cc08975d36835dc28cdf594de6929d32bd7304420264d5888745750573172174` | READ |
| `packages/backend/src/publication/llms.ts` | 11969 | `df72f6d6e03942282901b96ea139f382941381065797b00020499be54388e4cb` | READ |
| `packages/backend/src/publication/og.ts` | 2183 | `037effc398d2cb7071b6f9af36d9cb169159708a1bf88d30459bcc4dfa158b41` | READ |
| `packages/backend/src/publication/pool.ts` | 12046 | `95aeb80a758468e25e59e42605a013237a2a5c8b1d47658bd0a73c3dff6979a1` | READ |
| `packages/backend/src/publication/publish.ts` | 26714 | `46447d46e5f2c999b1b6f4608b713c00ec4101513ca39a64eeedda16d5486c65` | READ |
| `packages/backend/src/publication/reports.ts` | 35322 | `e70b5d19226596902ed9a009de587bf8405e2b08f94fcd4eaade2dd51c3291e8` | READ |
| `packages/backend/src/publication/representative.ts` | 1745 | `8d4128ff938323d57b165a27fc82a9d7b271af1b898699476dc83761e588ec33` | READ |
| `packages/backend/src/publication/rules.ts` | 3738 | `8e47c71eb8b90cf839927fb52eff9e8c184ed65d182f30945e8dae65b70731e2` | READ |
| `packages/backend/src/publication/scope.ts` | 3331 | `d913672331c06a57922a1f6cac2abf06b1827141174f3f82f2fa332b079e174b` | READ |
| `packages/backend/src/publication/sitemap.ts` | 6133 | `96842e2c0ec6bf073d647a0d8b910529c4280af33160f5f46daa83c31a61c9d0` | READ |
| `packages/backend/src/publication/stories.ts` | 16859 | `d71402134c85419251d1b97dbd0d0d3a8f14f9cc070cfb4c90200dda38d39f45` | READ |
| `packages/backend/src/publication/story-evidence.ts` | 2830 | `b7150047ad759bf0a89604baccd4d6b43e197311cb6349b404e5843698cd469b` | READ |
| `packages/backend/src/publication/story-text.ts` | 3505 | `a45bf9d36f8c86a98cd2a5d1d76412575dcbffdca7a115fbe768dba91f4dbaca` | READ |
| `packages/backend/src/publication/timeline.ts` | 7899 | `1dd275a5a20c49bf0983d77a3bc67600585b9a9a919386281344c88bc137cf07` | READ |
| `packages/backend/src/publication/topics.ts` | 16284 | `236121fa1c65bd92ec174cb6ca1c08dff05b671cbb27c10e2a28d5413b0a5637` | READ |
| `packages/backend/src/publication/v1.ts` | 11126 | `5df412a8f04f5b0ae248f5fb371a55e7e6a72318707e3907e56bc4f36bf34d45` | READ |
| `packages/backend/src/reports/compose.ts` | 17959 | `4d547a8289bfbed9d254f50857d94de2da5ce9fb73f8d3a6daea3a7606e16200` | READ |
| `packages/backend/src/reports/correct.ts` | 4258 | `88d336824c5c089da003efd36f364bc0206b2a14d202d80ef55a367e367f7be4` | READ |
| `packages/backend/src/reports/edition.ts` | 22795 | `7de9d4832e73fb4902b9cd3e820e4f6c2e543cc0c1c12398be75f8fc5416b9bc` | READ |
| `packages/backend/src/site/contact.ts` | 1924 | `f0135e35c7b4eaf9853344c67f19280877de27145e650e7611afa892bb42e543` | READ |
| `packages/backend/src/site/meta.ts` | 720 | `d71ef13f0b7d6bb7f1b8440cc55ab93dccc7876ca999dfbd59eaaecdcd37ffa9` | READ |
| `packages/backend/src/site/stats.ts` | 2950 | `74b22cd60391a904107dc1a6594b541336626de6d90c08a4b0d95c6d267a84ba` | READ |
| `packages/backend/src/sources/collect.ts` | 23901 | `99ddfe9ead2d324b71692f6ffaec7156fe35d45796294f56c4c6d642a134dc49` | READ |
| `packages/backend/src/sources/config-keys.ts` | 4337 | `6878173888c4fc8c54f7e96a0c265aa9870800a992e1dd5d0d97560056d570ca` | READ |
| `packages/backend/src/sources/dates.ts` | 3603 | `39227d6fbab7eeee98cfda3f826647d9949f39c70098cbf4dcf3c8dd379fb6a2` | READ |
| `packages/backend/src/sources/filters.ts` | 2466 | `dc2f5e41305caaa52b6e74a9a8f8fa6bf079aa44b23982177202f1b0ccd13ce0` | READ |
| `packages/backend/src/sources/health.ts` | 3921 | `ae9d9f5b77e3553a54578a53cebe68962e3ad162a8e8b0f2563a279ff82831e3` | READ |
| `packages/backend/src/sources/icons.ts` | 6246 | `6e39a375c267a40a50e65d1ddf3fbea9678a714cbf7546d08a3b158f31e4f1e5` | READ |
| `packages/backend/src/sources/json-list.ts` | 8674 | `b489450b5b1b4600cf5a463f57e0ac3a9e42e2d048e0c2b33e623c6e1c035f5b` | READ |
| `packages/backend/src/sources/mp.ts` | 8312 | `a22f8f654688a177362fee2e57572ba8f0034fc962980127eeb33e68741cad35` | READ |
| `packages/backend/src/sources/rss.ts` | 11784 | `82fd0289ac5e64dc473fff9bd23885b8fd989525db50ceb0559e3a15fa5f6716` | READ |
| `packages/backend/src/sources/types.ts` | 993 | `8c2be1865500db2f2514b4317a2cd3892a075e814a234c6b97ccb14420d4ee59` | READ |
| `packages/backend/src/sources/web-list.ts` | 20915 | `87055d5392b335ecf52b73a4202f8b4f403ec207d634a7f9300247e5ab423c08` | READ |
| `packages/backend/src/sources/x.ts` | 11903 | `c7c550612f595bedb9575f7a2dd5c14049be1b4947df267c17552f890ab4c055` | READ |
| `packages/backend/tsconfig.json` | 74 | `88020c5d0c639e9fca3c8cc0425dc6233bbb30b14c5a0cb5dcb7d7530d4b788f` | READ |
