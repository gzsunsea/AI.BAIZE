# Upstream contracts, license and deployment audit

Upstream snapshot: `309e32eb343a57d721525f04956887d3b9057fdf`, checkout `/tmp/aihot-reference-20261004`.

**Completion flag: COMPLETE for assigned text/source scope, with explicit lockfile exception.** All 307 UTF-8 text files are inventoried with SHA256: 306 completely inspected in model-visible bounded reads; package-lock.json is inventory-only under the parent instruction. Generated OpenAPI and all 57 migration bodies were fully read. Excluded scope: .git/, apps/web/, packages/backend/, apps/api/, apps/worker/ (other audit owners), and 16 binary assets. No implementation, installation, test execution or commit performed.

## Confirmed findings

- 【事实】`LICENSE` grants MIT code permissions subject to retaining copyright and permission notice. `NOTICE` explicitly excludes AIHOT name and logo from MIT; use AI.BAIZE's own brand. Publisher feed content remains its publishers' property; summary and original link are the default. Sources: `LICENSE`, `NOTICE`, `AGENTS.md`, `README.md`.
- 【事实】`assets/og-fonts/LICENSE` is a Chinese summary naming Adobe copyright 2014–2021, reserved font name Source, and SIL OFL 1.1, with links to full license. It does not include complete OFL text, and its build script reference `scripts/og/build-og-font.mjs` is absent from the inventory. 【观点】Preserve existing attribution and obtain complete matching license text before redistribution; no claim of legally sufficient compliance from this summary alone. Source: `assets/og-fonts/LICENSE`.
- 【事实】Root `package.json` requires Node >=24.11. Docker uses Node 24 trixie slim and PostgreSQL 17 Alpine. Non-Docker docs allow PostgreSQL 16 or 17. Native TypeScript uses erasable syntax, `.ts` exports, no backend build; React Router frontend has separate build. Sources: `package.json`, `tsconfig.base.json`, `Dockerfile`, `docker-compose.yml`, `docs/deploy.md`.
- 【事实】Compose separates setup (migrate/seed), API, worker and web; only backend receives secrets/data volume; web reads API over HTTP. Worker stop grace is 210 seconds to preserve paid-call receipt outcomes. Optional Caddy terminates HTTPS. Default database password fallback is aihot, while init-env generates random secrets and a restrictive 0600 file. Sources: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, `scripts/init-env.ts`.
- 【事实】Safety switches require exact lowercase true. `.env.example` enables collection/model calls, whereas FEISHU and IndexNow stay false. Development must explicitly disable paid collection/model calls. Paid integrations documented: OpenAI-compatible chat/embeddings, SocialData X, Dajiala WeChat, Jina; optional Feishu delivery/login/alerts, GitHub token, IndexNow, S3-compatible backups, outbound proxy. These are configuration interfaces, not evidence that any service has been configured or called. Source: `.env.example`, `docs/architecture.md`, `docs/deploy.md`.
- 【事实】Contracts distinguish private admin API (snake_case and branded ISO timestamps with BeforeJson mapping), private site API from publication layer, public taxonomy/HTTP/MCP identities. HTTP policy centralizes wildcard CORS for GET/HEAD/OPTIONS, API ownership, redirects and no-store; MCP has seven named capabilities from site prefix. Site interface version is 4.0.0. Sources: all seven `packages/contracts/src/*.ts`, `site/site.ts`.
- 【事实】Custom modules are plain declarations plus backend/web entrypoints registered in three empty site lists. No extension module ships in this checkout; only modules/tsconfig.json exists. Extra module package manifests need explicit Docker COPY lines. Migration runner scans all module migration folders regardless of which module is enabled. Sources: `packages/contracts/src/modules.ts`, `site/modules/*.ts`, `docs/architecture.md`, `scripts/migrate.ts`, inventory.
- 【事实】Migrations use complete filename identity, permitting different files with the same numeric prefix and rejecting identical basenames across engine/modules. Existing migrations immutable; >=0055 restricted to one allowlisted online statement; concurrent indexes validate existing object validity and normalized definitions; bounded lock and statement timeouts. Old migrations can contain destructive historical changes; stop old processes and back up before migration. Sources: `scripts/check-migrations.ts`, `scripts/migration-safety.ts`, `scripts/migrate.ts`, `docs/deploy.md`.
- 【事实】Framework 4.0 removed model leaderboards, Codex reset monitoring and topic chronicles; they are not available to copy from this repository as functioning modules. Historical migrations may still reference them. Sources: `README.md`, `docs/deploy.md`; all migration bodies inspected.
- 【事实】Site identity/copy/times/policies live in site; taxonomy, prompts, sources and thresholds in industry. Demo is exactly 18 RSS sources (10 T1, 8 T2), all editorial and no fulltext rights, with initial limit 8 each; no paid X/WeChat source in demo list. Seed is insert-if-absent, so edits to seed file do not overwrite existing database sources. Sources: `industry/sources.json`, `scripts/seed.ts`.
- 【事实】Selection thresholds T1=60, T1_5=65, T2=76 and understandFloor=50. Public classification has six categories; category IDs and MCP prefix become external identities and should remain stable after launch. X post body/media count as fulltext by default. Sources: `industry/selection.ts`, `industry/taxonomy.ts`, `packages/contracts/src/taxonomy.ts`, `site/site.ts`.
- 【事实】Privacy/terms are explicit templates with unfilled operator/contact/version/effective date fields. They need actual operator decisions before launch. Source: `site/pages/privacy.md`, `site/pages/terms.md`, `AGENTS.md`.
- 【事实】Tests require *_test or *_ci throwaway database and CREATEDB; global setup migrates a template, every test file receives a private database/data/tmp copy; paid-provider stubs are local. Setup explicitly disables Feishu content push and IndexNow, but does not explicitly set FEISHU_INTERNAL_ENABLED false (cannot claim universal outbound suppression from shared setup alone). Source: `tests/databases.ts`, `tests/setup.ts`.
- 【事实】CI specifies install, migration check, typecheck, web build/tests, backend tests, empty-database smoke/MCP checks and Docker smoke. Actions pinned full SHA; PostgreSQL backup client is explicitly 17. These are configured checks, not current passing test evidence. Source: `.github/workflows/check.yml`.

## Full-read ledger and SHA256 inventory

`full_read` means complete visible content inspected, not merely read by a hashing script. No pending entries remain; `inventory_only_lockfile` is the explicit dependency lockfile exception.

| Path | Bytes | SHA256 | Status |
|---|---:|---|---|
| `.claude/launch.json` | 349 | `8b45261342b4e7f0e76af5e45d9244721878813eef3557688aac43bb81443193` | full_read |
| `.dockerignore` | 124 | `8ccc18fcb4698fb5e099e0488e966162d9f250c3627d928c0084c24e861719d9` | full_read |
| `.env.example` | 8239 | `a300e179bcd75630568dd3d56834017b11242f1ee9ce2292c16fd1323dec0f85` | full_read |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 2011 | `d2229505ba7a1f080cbefff925a7529a6b50673bd0070757d22798a7fa6eb759` | full_read |
| `.github/ISSUE_TEMPLATE/config.yml` | 740 | `3b7c3592ec6eddb24c74c9b4a8bb54cef82a82ac4dbaa08b152f523ce9053898` | full_read |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | 1352 | `cdd062e7a5c4b5a7b41668db20b67bda7c27711ab152f2e84896d6a1691983fe` | full_read |
| `.github/pull_request_template.md` | 384 | `95714d7ac4e7843633cadf5f83bb9fb74b5fff43f8bc749424d3b4fdd3e326dd` | full_read |
| `.github/workflows/check.yml` | 5448 | `5e29bbd8f4c9942df267d5e3d8d32b17f327450c94ec6f2693e10715391406d3` | full_read |
| `.gitignore` | 255 | `e3e7a59453558cf3c64096b0acfcbaf17d41485b1122c66e5647c203f4ac7889` | full_read |
| `AGENTS.md` | 4526 | `2b15afda9e83826831b1d251e2ed0e5f781839e6f84e72dfe19a2375228f38cd` | full_read |
| `CLAUDE.md` | 11 | `336cc4fbf19beaada7ccf9986414fa91851a8d7a07dfb3ccbe800a69eed0ab49` | full_read |
| `CONTRIBUTING.md` | 4026 | `4b516ebfe744b3e909219198cebf2897ede66f72c3f4a30e7154ad6696dada6f` | full_read |
| `Dockerfile` | 1187 | `469357fa4af7fdc975c7f392101d8c4cbcd746a97fbdd987bce9dc7faa318dea` | full_read |
| `LICENSE` | 1078 | `b7f53d07ea4ae2eef26a4f8b28cb7d4df95586e2aa713df408f1ffde9f5a0fea` | full_read |
| `NOTICE` | 570 | `1d5df777ab21bafc48d1741f78f378514434f0fa71c17665f014e0519acbea20` | full_read |
| `README.md` | 13966 | `b98f1c4c3d0c24c7efe29b3c84ec22eca8301ca701538cc6e67d79bc30100f6f` | full_read |
| `SECURITY.md` | 1042 | `290fb4a4eda5bc05891eb3b24ba181be9249f2d130b0dd15de9784190c27b609` | full_read |
| `assets/README.md` | 402 | `3b5857d8b906b7152c0884e37a2019e621ab2cc771ca2eb6771d35453969bd15` | full_read |
| `assets/og-fonts/LICENSE` | 702 | `a7325951380d909135ad5226977bac872be1364c348abb27c7d4fa67c61aebd8` | full_read |
| `database/migrations/0001_core.sql` | 12349 | `ba4cf0e345f0eaab32fac9150aab87808b398e635a0103e37d5eee2ee7c3a75d` | full_read |
| `database/migrations/0002_events_reports.sql` | 5879 | `c0263f26018628788e569893d42179df91ef08cd0134a545b535b727807b2951` | full_read |
| `database/migrations/0003_monitor_leaderboard_notify.sql` | 7913 | `452070bf5615f78c47a363daf60e8508cdc1c03db7f10dea16c6772423f70209` | full_read |
| `database/migrations/0004_admin_ops.sql` | 3511 | `ad435396e832f83653519b24f973ed71a7bef89688e44f3bfb2bf7fdf64bfb74` | full_read |
| `database/migrations/0005_grouping_state.sql` | 498 | `05b83d2e4af4e412d66166bd51b06e60e1e5dc97a3219a460b2eceb756d147bd` | full_read |
| `database/migrations/0006_embeddings.sql` | 959 | `f8ff46c206b7c2d70b0ad620f959a5c24b0f80e68e97d324a8bddf525a4566a0` | full_read |
| `database/migrations/0007_leaderboard_prices.sql` | 755 | `166ce24631a9b0bd49eb620d5eb55650d6c584a618547ac72af9425dad3dcfbe` | full_read |
| `database/migrations/0008_monitor_display.sql` | 554 | `6c4a2aa29b6a3f3316b10880a770d2b9c7083df2836b79e10e4462f9df65e2b9` | full_read |
| `database/migrations/0009_selectbench.sql` | 815 | `2b3ab0cd31660f469e2a7084cd95475e0961dc2449ad6983eaa22b63d94f90c5` | full_read |
| `database/migrations/0010_service_prices.sql` | 601 | `70d5124065dd842102e52cf2e097ba9374a3b1fb99d1d365a445efba1957087b` | full_read |
| `database/migrations/0011_lb_alias_unique.sql` | 159 | `069783d7ed49101c8aaebed9cf07eae988bf42111ec14a07893c33e296ddf5f9` | full_read |
| `database/migrations/0013_translation_attempts.sql` | 554 | `58ce72ace64056c56aa353e4c8e82852a186e884e8f9c5e1448f343011abc8e7` | full_read |
| `database/migrations/0014_pool_search.sql` | 1050 | `45546c4abe1e2c7346c1c6ea608a37349687c8d8ddddfbac3ee6cfdb7953385c` | full_read |
| `database/migrations/0015_pool_freshness_idx.sql` | 181 | `91a897168dc017400c877b8db6a8f744f60079502843884f87979cae70ac1794` | full_read |
| `database/migrations/0016_publication_fact_release_idx.sql` | 336 | `0748c6ef30f8fc7b329524ee0e1e42873b15d27a51af3811a1e4356c671901f7` | full_read |
| `database/migrations/0017_sitemap_idx.sql` | 181 | `3868e8f38c061fd9990d875df601c5fabdf2b592a11506d8498288044d321c2e` | full_read |
| `database/migrations/0018_publication_sort_at.sql` | 1001 | `139ec00a433381e952c2c27e688aa3f9aced7eefba1445f4a1b4a6e1c66e8452` | full_read |
| `database/migrations/0019_seo_indexed.sql` | 308 | `a7a93ed796a9a6ba4d788f56aa5b027738b1e1b1466d8e305c4e0db1a39c8afd` | full_read |
| `database/migrations/0020_story_summary.sql` | 233 | `f747851107388e5be3d56b1aa029c0326071c06461ae9b51907f310eb6012979` | full_read |
| `database/migrations/0021_seo_auto_index.sql` | 487 | `28ea4c10fef5d8fdbe40d062e46d6b4f64b13e72193cdb9208d2226cc4e9f4e0` | full_read |
| `database/migrations/0022_receipt_attempts_budgets.sql` | 2810 | `deb8ed2a4770f995b04639456ed842f2f9992f01a2300d08a038f3943cfc8385` | full_read |
| `database/migrations/0023_processing_retry.sql` | 647 | `4563f5bc1da41e3e33f843705fbe38bcede8cea56ee9312dbe66e6c393b3fbd9` | full_read |
| `database/migrations/0024_grouping_overrides_digest_inputs.sql` | 685 | `8e9510af8f5059738d29a58f726549fd0d0ea962b9c983655bfe333d6b7a2a5f` | full_read |
| `database/migrations/0026_source_icon_checked.sql` | 204 | `4ed154a6ba499d8c062b66dae4a00c196cb5e9d5d86f6639a3e00841bbca8eeb` | full_read |
| `database/migrations/0027_feedback_forward_error.sql` | 206 | `eae7d9ae326433adb86d3fbb0830a3d33b06d6350ff8de2ceaf0cb43a56a79e5` | full_read |
| `database/migrations/0028_selectbench_mean_score.sql` | 231 | `3cd1fab13375a39a34413ddd17e0f0bc26d0f4fa1216ec6e3b19934268b08f4f` | full_read |
| `database/migrations/0029_source_config_content_public.sql` | 306 | `ba55d3cb46da31b83d799fa4474426745b098045dbb70c7c733ed8b6afa1453c` | full_read |
| `database/migrations/0030_collection_url_index.sql` | 330 | `29bdacc63c64916d86be0591308bdb9741034c6b79be5bd88b9af323e0ed0ea1` | full_read |
| `database/migrations/0031_selected_ready_index.sql` | 336 | `0fe7f6996930bcafbc4391ea5e3bd21df8c13a8dc310b5c4dd8c0422fc01b273` | full_read |
| `database/migrations/0032_regroup_pending.sql` | 450 | `aa7547725e449d6a842e8bfa4888e2a368d28456bb457c1f58252a2ee97e879f` | full_read |
| `database/migrations/0033_receipt_budget_index.sql` | 434 | `5374022dc798f0e53d65f1872193f8bc3012edae98e23bf950835a1d8248c567` | full_read |
| `database/migrations/0034_lz4_toast.sql` | 516 | `c8d50799c2f64a2ff20a642b1ee27069fb9a1ffe4ea6373380ea51536510bfee` | full_read |
| `database/migrations/0036_open_source_defaults.sql` | 522 | `5c119eab2d95997e9af067744ceb552f6078b611b2deb83396f7f8954a92e94b` | full_read |
| `database/migrations/0037_x_article.sql` | 261 | `ab21cc9e6d02f4276fea6f5d824809f3a7e6afa81c0fc6c000d5edafb7e1f163` | full_read |
| `database/migrations/0038_quote_translations.sql` | 536 | `32f9674ba2e80c6faa7e53836f6b6124f5dcdbec83539dcc3ebb21e5f36c6ebe` | full_read |
| `database/migrations/0039_oss_recovery.sql` | 159 | `e8c76634a6701a14d6ba53e3753d2b5b73ba321846be7ccd58c116d53f0bde6b` | full_read |
| `database/migrations/0040_oss_domain_recovery.sql` | 4440 | `fb48fadb21585f057034aff4ece226c31b6d56679ff68d7019b9f1312567d89f` | full_read |
| `database/migrations/0041_admin_session_binding.sql` | 328 | `3a14da3cdef0402023e7b51ab7d23cd01f9c40fd5f9ede02430d68acc7a10fa3` | full_read |
| `database/migrations/0042_delivery_siblings.sql` | 245 | `56c5ba236a03de630dcaddf89d97a861adf22b7a138a5eb08b8882b2f60cbf6a` | full_read |
| `database/migrations/0043_publication_seat.sql` | 395 | `d938e9da3d0f20a4334baeea07c238b814cff757694e69973c8596943c2a0963` | full_read |
| `database/migrations/0044_leaderboard_model_names.sql` | 1337 | `d3fd4b47a969951faecfac68341de4c8c6de4a98e6d50c722b79324b5661528f` | full_read |
| `database/migrations/0045_drop_topics.sql` | 156 | `d0e3032f59a4ed94ecd3b5b01eb055aecdfd50c34e547904ecb26166e46b358f` | full_read |
| `database/migrations/0046_grouping_reliability.sql` | 2508 | `5719ea696d7c7ab448623ed56720e3b1a59af2d0068ebf621af03e9d9dac9022` | full_read |
| `database/migrations/0047_selection_candidate.sql` | 337 | `c762ac140b4beac6212211f7094f47f9cb7709f8c9383f1a41fa9b97a98e432c` | full_read |
| `database/migrations/0048_leaderboard_calibrations.sql` | 438 | `6c1948f3146685d6e5b4c379616fb1d115324e8ea431300ff559eaf68059950e` | full_read |
| `database/migrations/0049_drop_leaderboard_usd_prices.sql` | 311 | `f93baa42020356b9eae8992b8ca061b0f226012591501bb8d0faaee3a69350d7` | full_read |
| `database/migrations/0050_drop_lb_rankings_unused_columns.sql` | 401 | `abf9bad287d3c0de652d888499a87733da389e3fc202599d1c63e1d0b9a5f75e` | full_read |
| `database/migrations/0051_drop_unused_state.sql` | 1295 | `a2335f91576fc4942ef7dbaebf5e48b795334f305bb037934744be2d187ec229` | full_read |
| `database/migrations/0052_drop_lb_prices_verified_on.sql` | 204 | `ffaa28844eb07b2d9950438804c264cfba7307c6ee38075aa4b4882c0310b8ed` | full_read |
| `database/migrations/0053_drop_leaderboard_monitor.sql` | 614 | `7acc2e44c8b969b575ddef584aa12e2a463ed596b6a5388706f833f5441a7286` | full_read |
| `database/migrations/0054_admin_password_sessions.sql` | 338 | `a116eca2e0caf712441ccff092af3e2df8a59f5b3b506971c3d918c399a9374c` | full_read |
| `database/migrations/0055_publication_selected_published_idx.sql` | 307 | `7a7f039773787b82634cfa432005dd468b7df3195d3d2ae74f0860286a8b50a0` | full_read |
| `database/migrations/0056_analyses_composite_id_idx.sql` | 209 | `9e8b75c605940bca668133d113a6373146884bab5fd56c80c74f2cc816d170ca` | full_read |
| `database/migrations/0056_publication_release_selection_stats.sql` | 314 | `a8d9a525ccfea0ffcb071a9f8529d35d2f65b606c3f91eb290ce2effc6ac5bd9` | full_read |
| `database/migrations/0056_publications_pool_category_timeline_idx.sql` | 328 | `a094f522cac2d007362c26d1ea740e14a6c0c70cc280c81b33f8df7a70e4fb68` | full_read |
| `database/migrations/0057_analyze_publication_release_selection.sql` | 151 | `2475853b85714860d2db6d3800157143c7606f2655a50ea3b1b890a4d49abbca` | full_read |
| `database/migrations/0057_publications_pool_channel_timeline_idx.sql` | 340 | `1df81f938789b0bb20d027fa7ae794c84d8f74ff1c7748252974d5292d5d5809` | full_read |
| `deploy/Caddyfile` | 218 | `82991ed2c631b6e85f3524bc08417f096c4700c6e31f22b190915f7d9d743326` | full_read |
| `docker-compose.yml` | 2802 | `9cdc984f851938d9616ee1d5dfc8e3680b0f475daa9b144d6e6dfe7b25417e13` | full_read |
| `docs/architecture.md` | 11080 | `02b62bfe48300625fb967bd969211e88ed27b537a3060d3e9899263302f0dcb3` | full_read |
| `docs/customize.md` | 17700 | `a659f9acb30ea25ab1d29d41860a51aada7d2f481a3eaf2a5303f63623184141` | full_read |
| `docs/deploy.md` | 28158 | `2dd824f1373d99b0ca95fbdfff8a9ebed93c62411eb775901432d59cb4e68b48` | full_read |
| `docs/examples/sources/news.html` | 512 | `c62aacc6fabeb2f3526b161493228196333d3651f2b89adcfa943b5b9e4ad598` | full_read |
| `docs/examples/sources/news.json` | 409 | `dbc6a00c1fcc17d9966f759c61b8f08ed3a4a36dbc6c05ac03c8b2da0417ecbe` | full_read |
| `docs/grouping.md` | 4957 | `5019e22fc54fa377e0ca3e808dbad0c3192ac3bd9f1cbc8854c70d51942dc800` | full_read |
| `docs/selection.md` | 11092 | `cfaad6f51fdf3cbd3c116821d1f436dbbc8eada60982cf00893d47c73924afe9` | full_read |
| `docs/sources.md` | 19163 | `f3f94dd3c9b5be61efe090f3a266170b241eb689f680e146aa9e9b52b4a6cdc7` | full_read |
| `docs/story-digest-evaluation.md` | 3792 | `88ea4b62f1e74c0c4ab6e4b880b6c5893dc4a4c343467b3b18a42aa71bda1535` | full_read |
| `industry/README.md` | 960 | `34058936ebf6339aef33e212868d218a0fbefa4d2275851a8a1486fe805922a5` | full_read |
| `industry/gold.example.jsonl` | 1180 | `173d4e87d50c12b1edcfda984d6358b1e8140c659941bc6c60920ae91feb07fb` | full_read |
| `industry/package.json` | 111 | `666dc35a33e97e9186a2b5830b52d6b7da373f2c88bcad9b528d08d0e7cf9d37` | full_read |
| `industry/prompts/content-understanding.md` | 6313 | `1258869a380794e925e024c4b9595a18fdfc49c551927fdd106b8040b820c8ef` | full_read |
| `industry/prompts/group-batch.md` | 2916 | `79a09702b385785fa7c06ce55acdf199abbd4e5fe5e95adecd144ad2a53b1ffb` | full_read |
| `industry/prompts/group-definitions.md` | 2349 | `135dfd2ab167a2643463d9c7e614a0ba3319871b6e27247e179836dba1169669` | full_read |
| `industry/prompts/group-method.md` | 652 | `0bde8c68b2bc8954931a35246c0975b0f38459f11ac2ca354a1d9491660674fa` | full_read |
| `industry/prompts/group-pair.md` | 490 | `a711a1b7c9e5c85b42ff54efe922e5f13f78221262d14339a50b7a793bb49053` | full_read |
| `industry/prompts/group-signal.md` | 701 | `e5f3746474e6d18bc292254109b9b3f9fbb42c51384843879f2a6899a67f79c5` | full_read |
| `industry/prompts/identity-context.md` | 244 | `6ac2adecce61231fa8ce50685eacf2871e386983dadb58977f522674f0b0ddc7` | full_read |
| `industry/prompts/prefilter.md` | 1601 | `bc27aaf562982f23e1b6fd93a45506073ea10f1552b68e3ea85a1697277ccce0` | full_read |
| `industry/prompts/report-period-no-sections.md` | 18 | `96cf08f4f3a6b5ad2f0a1b9ab5c42138adafa1f52e00e9810dcbfa350a1bb049` | full_read |
| `industry/prompts/report-period-sections.md` | 228 | `8ad73d08323f202e29a2a0e02c29476bb7bab1122aeae94899c3c984f32830c9` | full_read |
| `industry/prompts/report-period.md` | 775 | `085f5d6626eb3648282b38b3d86f5ea6f0101f0c12ff33ad4f8650eba9a480c8` | full_read |
| `industry/prompts/rules-answer-first-summary.md` | 1131 | `b8a517e60351e5adc453159e9d4e49a08d765c657a9b726044f04601d7f5a923` | full_read |
| `industry/prompts/rules-anti-hallucination.md` | 1176 | `37026fd742a233cb932166e173c19588fdbba086709d3ef4a8fd532f2be1cccf` | full_read |
| `industry/prompts/rules-domain.md` | 3930 | `d2ae6066259bac3144eb2bea32f0239e15dd23f7e19d1acf281727853277a864` | full_read |
| `industry/prompts/rules-self-contained-title.md` | 1814 | `4f1652d77ef64ee6756b6872a4b4405fcb46edc8356c4de3cb577e21208f4f6b` | full_read |
| `industry/prompts/safety.md` | 234 | `3963b20e601f9bdde876ea9a9f2e68b58d6e618e59109791773ff6e1d4e7badd` | full_read |
| `industry/prompts/selection-score.md` | 9705 | `11700da358cfa0a07b73deaf872ac7fcf43cf665e47e8a6b40e594fa82447ace` | full_read |
| `industry/prompts/story-digest.md` | 1825 | `de9ea4c2acee5eefd8c8dbc7fca8c1f95145592ab7df91bebfbfbb41a5108630` | full_read |
| `industry/prompts/structure.md` | 7269 | `28cd59a85ce48f6ea3f79933455533e8b612a7cfedf432d75b1508c9ca7c6789` | full_read |
| `industry/prompts/summarize-article-empty.md` | 84 | `776095e536b4c8d6305bef073b6c421d4da876b974a2395baf1befb2e7fdd71a` | full_read |
| `industry/prompts/summarize-article.md` | 1228 | `da153a6788fb88fe176642857720b629bb6345500c418b4d1222061442dad989` | full_read |
| `industry/prompts/summarize-long-post-quoted.md` | 108 | `4b9d46e6f676d9ac021f29a669144d178398ba8490a07ada2764a5c2b9f46fd0` | full_read |
| `industry/prompts/summarize-long-post.md` | 1099 | `4ff01e94427e6437991559364ccac22ad6889a87c8d2991d3e7dc696c8261826` | full_read |
| `industry/prompts/summarize-short-post-quoted.md` | 545 | `13932cd0485af8e8d249ce901d4eced7f61bb1844ba0abaf7976076879d8b992` | full_read |
| `industry/prompts/summarize-short-post.md` | 588 | `b0555ac7545d3053549665ddcf3fd9115b4d359a487f6f44cf089203bce859e2` | full_read |
| `industry/prompts/translate-body.md` | 863 | `36485f1e8373fc5d4e42d3178362eb628ac0427a64907c2f53908c31c582c090` | full_read |
| `industry/prompts/translate-post.md` | 268 | `ebb220eeabad45b548c05b0e94337701af010d0b011434d4ea6ac3e03ffec993` | full_read |
| `industry/prompts/understand.md` | 324 | `39bbbd78478b7b4f9fcd236a31acad74f51e423f4bd91ab5946a9e09430abe50` | full_read |
| `industry/relation-gold.example.jsonl` | 2161 | `adaf5cb715fd1c28fca470abb983759f23078d8078f81cf89d33dafce6190c12` | full_read |
| `industry/selection.ts` | 1296 | `ecbf1ab0106bfd951a20ddf0a579f9677a0caf792773e66a86c306af6b88775f` | full_read |
| `industry/sources.json` | 9069 | `c5d9ae9b5c61040f89ca0d1be01c41e5d311ce6724685f36be9f8a1d751ed558` | full_read |
| `industry/story-digest-eval.example.jsonl` | 1339 | `483d71a774b46deecd7ad3af0a57a18934da6b067d534a599e15d7270b79e5a1` | full_read |
| `industry/taxonomy.ts` | 13724 | `82a9bb97a40a355daf237739c6dc7f0b50808cd6a8b172f34548b7d52d32baa7` | full_read |
| `industry/topics.json` | 10584 | `784e03f44aca0c6795e3830c92448af877203068a17d3713931adbd3ba93db17` | full_read |
| `industry/tsconfig.json` | 64 | `487cd5319c8b830a4cf881e48aeb9ee9878d8fd93b414ac78033e1409db72f2b` | full_read |
| `modules/tsconfig.json` | 201 | `53f647958b0a0377f2b822cafd1c5cdcb0e1c814e826bfcd903df7d26c0078c9` | full_read |
| `package-lock.json` | 193002 | `1dbad4d4557f8ca20c707c62f5226dabd864dea6dc0336683aaea736683472c7` | inventory_only_lockfile |
| `package.json` | 1072 | `d82b5dfec3c3d085a766870640572f82ebbebd94aeaac7cd379789103d1df4cf` | full_read |
| `packages/contracts/package.json` | 192 | `b14f866fe6fdc20840081bf2c2799cea5106acf0bca547358895413b04b7ce8c` | full_read |
| `packages/contracts/src/admin.ts` | 13237 | `2b1dcd59a0941e123c5b170a2ee814937bd40c28cab0ef858430b58ed6617ef1` | full_read |
| `packages/contracts/src/http-policy.ts` | 6123 | `147afc48706604abb73c892c63911e3eed5893262b3ac149eed3a18632313029` | full_read |
| `packages/contracts/src/mcp.ts` | 847 | `1d8655d5b8d5d4e7c8ccf6e19740fe3e688567324d1cb159adc8604077385c2d` | full_read |
| `packages/contracts/src/modules.ts` | 1379 | `3235f0cb6af67d17de707cf5c49019b424f4bf36581dd397cc13be5652f65c3a` | full_read |
| `packages/contracts/src/site.ts` | 14570 | `7d9d5382d36491676af8f18530a5050825a843126feed7691549e9098b8df59d` | full_read |
| `packages/contracts/src/taxonomy.ts` | 2645 | `2520add226f2a4b4453bb369a231f3573047db4e901b6a9c74c1a1eba43e1a7f` | full_read |
| `packages/contracts/src/time.ts` | 3430 | `78e80d63ba64c504455fd559b706430d526e43c37f649f266af87f28150de605` | full_read |
| `packages/contracts/tsconfig.json` | 74 | `88020c5d0c639e9fca3c8cc0425dc6233bbb30b14c5a0cb5dcb7d7530d4b788f` | full_read |
| `scripts/check-migrations.ts` | 2251 | `019044e5b3fd1168993603d5cb63e155a302e1e744aa21ccb48df2b50e0f33a6` | full_read |
| `scripts/collect.ts` | 550 | `c456346623b72c7838d3a719d8442599c5adb5070b2fd336e02e4275f1da984c` | full_read |
| `scripts/eval-relations-core.ts` | 7991 | `8812650df4e1e9ff1ee786e8fceff704290d1e09450b71f8e3ed6a448ec87f47` | full_read |
| `scripts/eval-relations.ts` | 6452 | `a0046131d88f00ac363a965880b48c616e9ad8dfcb71fe5f9a2c8c7cfca37716` | full_read |
| `scripts/eval-selection.ts` | 10642 | `69e240ab65db4b7182f452df39d47610ffd31e34992d5b32bfa24f769d89ab11` | full_read |
| `scripts/eval-story-digests-core.ts` | 7909 | `959455a390841d28e7f18b7788c9b74f3419b6cc54937e2e9adf740a0eaef5bb` | full_read |
| `scripts/eval-story-digests.ts` | 9550 | `2e5b96d9e454de3d4189847a1b421865a5fc4a2dd1c370d940a8ad4a0bf0c7ee` | full_read |
| `scripts/eval-tools.ts` | 2572 | `14e7cb011dc8cf790e47a883e017773eaa90d5f5003d2c93a8d9712ae2c90430` | full_read |
| `scripts/init-env.ts` | 1381 | `439e7e2feb204abeab8f7cbc88fab8ddd2375538922dffc0f71228b5bf675b4f` | full_read |
| `scripts/mcp-check.ts` | 4829 | `ad55ef80e5abf30980d2bfb6e8d5070771595c56cfbbf39b724b6373d2ea64b2` | full_read |
| `scripts/migrate.ts` | 6486 | `bd2e14a3750b71def4096529cda1f4631ca2346440826679280720c2e39f4f33` | full_read |
| `scripts/migration-safety.ts` | 6590 | `e335af764061f75993f5bd3c9bcc0cedbc0a65aeecce9a6e5e9f0c608f624399` | full_read |
| `scripts/nameplates.ts` | 5088 | `3ada60e10d2fc039829de0f63a46137556242b7c079b3b153d5561476256ad2f` | full_read |
| `scripts/seed.ts` | 1936 | `066697faf357cdf026b9ee77e0c6f5b748577744fa1a52524682f6d33d39a921` | full_read |
| `scripts/smoke.ts` | 3004 | `88a68c7ec96b9d9abc0f5609818a8baeae3481afc031908f850ebd59ee6bb552` | full_read |
| `site/README.md` | 1271 | `ee02c364259e816a26e1cefbf5f40fec3267e771164165f6ac2f0572c4cf7804` | full_read |
| `site/brand/Logo.tsx` | 1399 | `dc7fa1d269fb0199322829c7e29164a875899d34a5de6143d20e92d407d51480` | full_read |
| `site/brand/logo.svg` | 254 | `835891d3ec29eb057e155786013edadcfcaf0d5b6dfbec42e7c0d56e795f15a6` | full_read |
| `site/brand/nameplates/archive.svg` | 4717 | `98ce5d90fdc589d26915bb04f7f5d9ed37518cdbc7e2b18089b7e847bc38d701` | full_read |
| `site/brand/nameplates/daily.svg` | 2524 | `4ecbe4631c146005f7b1212a309cb1e2d2a3b8931f9f5a74e2d2780fb63c656d` | full_read |
| `site/brand/nameplates/index.json` | 149 | `a02e5e4f70a84f6847de6f8b9b431d18a9e930618ba9e9934dd139fa3b861bd2` | full_read |
| `site/brand/nameplates/monthly.svg` | 3086 | `248a125f28b42673d05a2abbf1f593e1007397be9b5fd7887622ce61c0b518ca` | full_read |
| `site/brand/nameplates/weekly.svg` | 3253 | `cc42086e6a045ff9ca91f33a6af6bcae972f0e1cae045f55f570393909f26045` | full_read |
| `site/changelog.json` | 343 | `a8e5c3081ed52e7a06e5edc15187f4011316445a0c3e4ee4c095ae2d3f9619c6` | full_read |
| `site/models.ts` | 3384 | `ce8e3a6ddf068faa8e4e736c57f8ffb90a50f2fee39604170233f3caf3d23359` | full_read |
| `site/modules/index.ts` | 419 | `a93a28d88cee52386b5b057f29fce8fe7712ccc6e9ddfc08a5c7c3e129715142` | full_read |
| `site/modules/server.ts` | 235 | `5d9a665d60a2bdc721a72b813d1beee85e46e9fd45361520bd516c4a15e481c8` | full_read |
| `site/modules/web.ts` | 180 | `20f9d4ef2229c264472125405f9115e13f05a3d1dc8fbcc6da62544de5eca352` | full_read |
| `site/package.json` | 350 | `21f713754d8e6208666b9f02deda3ec5893223c495066b75888033ba2bc7fd18` | full_read |
| `site/pages/privacy.md` | 2054 | `f508c644bcec6de3d01b3fc0c5301e6af0db98359e301a2d928d8f8a23ae6c88` | full_read |
| `site/pages/terms.md` | 1403 | `3ddff16c40540fb144a74110798032679855db423201b96a5c90d1b5f2cb7592` | full_read |
| `site/public/manifest.webmanifest` | 352 | `b4a131f5a247ef75045c940b207f5d85394b3a823941cf350d67598f0b58a73f` | full_read |
| `site/public/openapi-v1.json` | 142238 | `e9b22c610e34108dc40c1281e5a4c1dac3606f3d9af7b418eab9891975ad39b3` | full_read |
| `site/public/robots.txt` | 153 | `05c4996621624a37090bb081201118a799e0627da10f2c18105cced9571cd65a` | full_read |
| `site/site.ts` | 18734 | `dcc6aa9efcb512539961d734b8e5722aeef477755120807dc74f1cb873849f83` | full_read |
| `site/tsconfig.json` | 64 | `487cd5319c8b830a4cf881e48aeb9ee9878d8fd93b414ac78033e1409db72f2b` | full_read |
| `tests/admin-corrections.test.ts` | 9908 | `f34d7fdb35d16246e0463bd6a5b85d4fe61e2a37e57985c40cba53c6a0ee5f59` | full_read |
| `tests/admin-ops.test.ts` | 4566 | `1a21d5de0d900c3af263247cecba09f0b38fc38b5ebce3556c55ac74323f050c` | full_read |
| `tests/admin-session-migration.test.ts` | 2073 | `ea96ac2384a5116d66681db5d5177c87cc9e1eae5c2dbdfd51b94b4a4bdaaa7e` | full_read |
| `tests/admin-session-revocation.test.ts` | 15741 | `562d68e5eafce8d8027dad32b70fd6573b0180cc1f74bf610cc09f77ce76a381` | full_read |
| `tests/agent-public.test.ts` | 2629 | `1ecce020154f95fd14b414eb681db3d7eab610bec5120834360639395e49058b` | full_read |
| `tests/alerts.test.ts` | 10255 | `ae8aefc7e540639dc58105dc9b7dfc1c52fc99a5bfc8e5d237762a7c9d85d798` | full_read |
| `tests/analysis-steps.ts` | 1574 | `f3f21d6cf153b634741ca032ebab9bfc6117c7a8bb27e6bdf624c0b7bd9efcec` | full_read |
| `tests/analyze-consistency.test.ts` | 6008 | `d1d12c1ce9bdc0180b03dc6a253ac14c867cde97b4c1c00f085c226fa31ca97f` | full_read |
| `tests/analyze-kill.test.ts` | 10937 | `f7f186dbf64a4ed6dac8a425bea3c388be2079b130efba2996cfe3ed46f620c1` | full_read |
| `tests/analyze-news-identity.test.ts` | 1724 | `11367415cbc179d192a84629f178edc48d9a068d130f8752156cfc8fa24ac8f2` | full_read |
| `tests/analyze-shutdown.test.ts` | 11152 | `bf4d78a521eef6bf44209bac633c3469897bf5e09d0a241819ba1acb5902db8b` | full_read |
| `tests/analyze.test.ts` | 17857 | `1ab6f6a8554c0557b12663d942a5797ce2ff28846e485578baa348832b1b2633` | full_read |
| `tests/api-error-logging.test.ts` | 6785 | `763b4cd6bd7b6ec0e7c8902f7952c9c7e2c3db4c605857d1f3aca7af7a39e5d1` | full_read |
| `tests/architecture.test.ts` | 12323 | `739ac5712059c591e6c385e582d0febc5e9a5f5bdd11d928659096946d427b21` | full_read |
| `tests/backend-read-load.test.ts` | 1256 | `607f17370b986a2d82d8fc9c1023f11711481a3c0109c79c7cb4ca0c705998c6` | full_read |
| `tests/backup-files.test.ts` | 12373 | `e1d7bdb9a40a9e9f375b19020bdd7e1c3f13b966794a087e82dc85e3103707b2` | full_read |
| `tests/backup.test.ts` | 3897 | `40c2165e02af3e3516df275952bd172fe90a0a5550cf4f4e99220b651af71158` | full_read |
| `tests/category-corrections.test.ts` | 6570 | `e2c5875c517f1fdc280a8e89a60ed84783e2b423c653906ab6803758f79806b2` | full_read |
| `tests/collection-body-preservation.test.ts` | 3354 | `3b4b4c5d03e08aef2ef24018df749035733175d899d8e2506d1d6a8bc8d75bd3` | full_read |
| `tests/collection-detail-recovery.test.ts` | 4664 | `ab209140cbd2f5d67e6e7b8a555b3b7eee32e7bd11c012e5025d38a084306600` | full_read |
| `tests/collection-identity.test.ts` | 5482 | `7a68016abba6c4dec4476c5fded132021e0d330369f2eebe168e8ae4eafeaed4` | full_read |
| `tests/collection-publication-window.test.ts` | 6352 | `674ee2347740b6263b054514486c607b99ae845188c9d28ec0cc97e6d363304c` | full_read |
| `tests/collection-tail.test.ts` | 17178 | `0d1fdf37994bbfb4eb1fb0442afdcd035e881f11fa58088d75e4b9493057c918` | full_read |
| `tests/collection-title-recovery.test.ts` | 4441 | `2186cf302954c5354ed2d44cbfbde7e86362a2696e6e0d46e1a5e64508a59553` | full_read |
| `tests/collection.test.ts` | 4138 | `c6cc32371dc640f2bdcf61b2081ffd6f7231090c5fde8508ad94848c761245c4` | full_read |
| `tests/content-freshness.test.ts` | 7996 | `4e2d473a5c0ebee9c72170ce805b3ece91e0181fc1ad1dd9276f82d97f0dc01a` | full_read |
| `tests/content-publication.test.ts` | 34555 | `d277015bcea1d12f2caafa3eb75af3217741c3d502a24b0f0e0fe2bbec7faf59` | full_read |
| `tests/dajiala.test.ts` | 5314 | `21a41526e24f80ec0878f7064def903abe348cac8e69b77471a6ce62cdaf9496` | full_read |
| `tests/databases.ts` | 3274 | `90fb0688ddc154ca7d20701de4e8f8c6d01a612a508e836c581447e7540fd4f5` | full_read |
| `tests/default-model.test.ts` | 3455 | `bfece6153d12f9a5a2037726dd6f919acfec3645afc8e8f12f509b3758b015a5` | full_read |
| `tests/deliveries.test.ts` | 12948 | `00d1452b02e869945e403875596f8eb61232809d6dc4cea8c38b765f0ea8fba7` | full_read |
| `tests/delivery-resolution.test.ts` | 2511 | `1dfbf9ab87b208784ac87dd5872c5728110abbcae57fee78ba78be29b70102a2` | full_read |
| `tests/discovery-cache.test.ts` | 2637 | `16c8c60f6e9ea543d100a0c4b98543f96d10c5f6780f700b35d439abd88dd66a` | full_read |
| `tests/discovery-scope.test.ts` | 1995 | `15980cf21bac23847bc31e837fecc182fce9643944d2b973b498cdef0f14d486` | full_read |
| `tests/egress-proxy.test.ts` | 3052 | `4e6aae7611f55ad0260383c82d8939912d842f660b8a1ccc9ef7a123954c8a27` | full_read |
| `tests/egress-routing.test.ts` | 3303 | `40a8d63aacac21828baf5589d41ea2fe6fef125f2941a761736793ad4750e2d7` | full_read |
| `tests/embedding-dimensions.test.ts` | 4693 | `379258909322ca59cb941af681a1cc253bafec5762b19e9a9f3ae8f83e8c5705` | full_read |
| `tests/embedding-response.test.ts` | 4679 | `c951e5a9e133fd0f2848165561a27b29f6bcc25668e396847ef0da8ef21f9125` | full_read |
| `tests/embedding-storage.test.ts` | 3387 | `79d0bb814f8d5e5d11b98c3656d59285047328315224b0871c56ad618d097139` | full_read |
| `tests/error-logging.test.ts` | 5124 | `c9a6e3919f94f346df00624f46f1324bf9bd4780e301255861f9b293a4ec346b` | full_read |
| `tests/events.test.ts` | 30592 | `b2d3509742ef83e2b7e613f171d62508c11c1c39a24a843e92a422713d15061d` | full_read |
| `tests/extraction-consistency.test.ts` | 6447 | `546896624790a4909da8d8094723e151579beb24612b2390a25ea78e0a4fe951` | full_read |
| `tests/feedback-upload.test.ts` | 5132 | `533bdc022e828b5a4ab71fe75f39af1c0923e795ef7ae60b30576614163e74f0` | full_read |
| `tests/feedback.test.ts` | 8002 | `c2ae8c2f81e6f21654392f9ff4380292311a3fdb6f258731ddae547f62adf229` | full_read |
| `tests/grouping-reliability.test.ts` | 11133 | `35bbe79739da8ee25c020976872d62888525a3440a7aa9b30fc11e0e54ec0ec4` | full_read |
| `tests/hot-avatar-payload.test.ts` | 6806 | `b7cd3e1afe95bbcedf169d1b58591c1af444a9099eb080e3a44fcf96a4aafae8` | full_read |
| `tests/hot-cover-scope.test.ts` | 3534 | `a9a58b7b4ee9d19523d43566017792451f979bc112b3d1ee01f5f825db94da48` | full_read |
| `tests/hot-face-query.test.ts` | 4885 | `5e468ce1fa917abf253e328754ff128fcaec6bce26bd78a423773e08bf026b29` | full_read |
| `tests/hot.test.ts` | 9335 | `104f78830f45a68feba2a07b0145b967b8ed8b258d94f767f9f70f90c4e02fda` | full_read |
| `tests/http-redirects.test.ts` | 10138 | `c6fca962a5c5e78454de13ad816797791f8a8206214dfeec6cf60c5746b66d9a` | full_read |
| `tests/ingest.test.ts` | 1715 | `554f60d91d925b8db5c29f3f7609a89d6543515978cb4f48258885e969592030` | full_read |
| `tests/invalid-dates.test.ts` | 9313 | `88d2978406a69d0927c92f765f97ea0d47d7c6093a59ec7120490f13b33de9e4` | full_read |
| `tests/jina-listing.test.ts` | 6714 | `4fad5c48ea7730b6bafe39d2d69b82e50ad6d84c1b82466405f208d5567b5d7a` | full_read |
| `tests/listings.test.ts` | 8153 | `e931b95ec535fe3015663e19ee377d1b47149b39051ca2b90b06bf897035b3a7` | full_read |
| `tests/markdown-body.test.ts` | 2651 | `f37ad1e4a36a7ea153aa010f71ce603a78bc2aff0382a39c4dc042085edcda0c` | full_read |
| `tests/markdown-title-choice.test.ts` | 1765 | `0f138cc80c490269e4efdd88dd3c902f8cef6ab558e49310c891a413bfaabac4` | full_read |
| `tests/materials.test.ts` | 14582 | `51f158dd067847d4024c45ef5a408455e3434a71001957414cd03737f9dd3f9f` | full_read |
| `tests/mcp-body-limit.test.ts` | 3707 | `ae4ff68c47513f45382b1839f3ea103474d1f1326af519acc31ecff7b7a4953d` | full_read |
| `tests/mcp-host.test.ts` | 13176 | `19f717bd0c9ff2b1679e122631624ce8d9f17c8d6be129f31d013fec70112c33` | full_read |
| `tests/mcp.test.ts` | 2873 | `e56608a4b36f1ee664907dcbdd3f3e962a7dc8346be4c9d76a251597b5aff9e8` | full_read |
| `tests/media-performance.test.ts` | 22333 | `765bb70beb3e3cfd965d2e931d3370f01b093aa135b9119c7bfe31266f4032b3` | full_read |
| `tests/migration-check.test.ts` | 2239 | `d1c7e8efe480cf1672588d9671806daac078c287a5b0a510101b8194c79daf7f` | full_read |
| `tests/migration-safety.test.ts` | 8726 | `657477373d06b073193001725cf952990df6734d9d29a33139e853bfa1ee7cf0` | full_read |
| `tests/migrations.test.ts` | 10230 | `1afbb172b3a54554d0108d97a76d16fbd833b4468b41ba87d72fe8b1f71a3b58` | full_read |
| `tests/news-value.test.ts` | 17189 | `007f0bc773888349a1acc674ef39bfedbe827cbc8f6dbfa1a924e3267e7ee7ef` | full_read |
| `tests/outbound-protocol.test.ts` | 6537 | `a609bbaba1d93e8090c651aeb30ba4fdcab5b8920bcd87e74b0601c4dc9e890d` | full_read |
| `tests/outlet-invariants.test.ts` | 4477 | `418396af938620e88cc8596b4c06552c8b68e9c0f4073bdadfdfed4c11a403ab` | full_read |
| `tests/pool-relevance.test.ts` | 4966 | `542b17f947885a251170fdf1f03e1a86f5fb8d20a5ab04f7b7f2026168760ffc` | full_read |
| `tests/private-routes.test.ts` | 4145 | `0d605284c8b183c6038c10887eed0355bdb74ba9c98d1a8dbe01ca25d846f913` | full_read |
| `tests/processing-recovery.test.ts` | 11550 | `757b04565629111efecc2023c42522683833e38aaa1f9d6162fe40725efef6ad` | full_read |
| `tests/provenance.test.ts` | 17290 | `8dfbfa830915e52f3fe293b9912bbe4de92f136e6e75c31545c7a8f3b3c41d77` | full_read |
| `tests/public-cache.test.ts` | 3545 | `2284f9f784e004afb88bc11bfa203ea6473aab7aacfb44a8ce8c193d2215ab34` | full_read |
| `tests/public-categories.test.ts` | 2963 | `7f55639f5cbfb44f92edabc756107a86e17286852dcf280690bf0f71a559da97` | full_read |
| `tests/public-methods.test.ts` | 1470 | `bc754944f5440d56583eefb64fdca8d929d3566b054ab2e25e8441f6bfd768c5` | full_read |
| `tests/publication-date-correction.test.ts` | 9243 | `836973335b1cb47160a7b491a02858c5064db67de1e51c1d83d98cb6102ff819` | full_read |
| `tests/publication-time.test.ts` | 2829 | `cde31e7971d1e9ac01c228e1437170737289518d7d962462a537c5095d15a987` | full_read |
| `tests/publication.test.ts` | 37741 | `a751258dfb5b701053623f6be0e81baeef6cbd8b52db8601984de6767b75ec44` | full_read |
| `tests/queue-recovery.test.ts` | 880 | `e11173cf5caa8fc6d64802e9532525839203c99759a3c9d3d4a09db91e3cd2a1` | full_read |
| `tests/reading-group-performance.test.ts` | 4627 | `06c84f6c3d6b1580e7898f71a142b6bbaf52c1e993b671d65e38e329fac0bad2` | full_read |
| `tests/reading.test.ts` | 6145 | `b428b481b667a6fa2b288e560b05d047dd3881bba26c5e397ab139b5147cdf74` | full_read |
| `tests/readpath-performance.test.ts` | 10712 | `dd1259ef6ad2a453d4ada1246786041dc9ff52fb1f673f59616d0226e15767dc` | full_read |
| `tests/recall-pool.test.ts` | 4309 | `5cee2ed06fd9bffb8c40a0495e6f13cc92846d8b3b7a0c582102520ec9113e1e` | full_read |
| `tests/receipt-shutdown.test.ts` | 2206 | `234c355b3c1035aef0952bb06ae940061fe34032d33e728b43f931c80a933fd2` | full_read |
| `tests/receipts.test.ts` | 14048 | `07f713bd5d5b4542d64f7510aaa4de23897291bd24e7603861a378c1dfde5a4b` | full_read |
| `tests/relation-eval-runtime.test.ts` | 4697 | `6095904412e106ea4e8d222ab7f70c93274b22604d9f95f90ba318d2be04f83a` | full_read |
| `tests/relation-eval.test.ts` | 4895 | `9c75a7f7ea31a4c80a0be66ccc32c9447a22575adb3e94a9243a7425f4ded0a7` | full_read |
| `tests/report-candidates.test.ts` | 10756 | `e32e34956fc6a0e9150ad4472bf550d20f8fbb1d3af35f159c30b35660fe17b2` | full_read |
| `tests/report-lead.test.ts` | 1539 | `fa7318d4fcf7b7ad8feace6a380d0b87840d8edf368173c38ba3f7cf46c99b66` | full_read |
| `tests/report-ordinals.test.ts` | 8046 | `8ace9f66af0a99aa924dac5b42edafc21783744a87bbe07880de3d366460c804` | full_read |
| `tests/report-outlets.test.ts` | 15129 | `78983b4d75090e2762a502e77c9e386aead939063fb347a45a4180c9aa5e5df3` | full_read |
| `tests/report-recovery.test.ts` | 5435 | `b95b9f9b103dca5d3479fdb00edd6b1509460bec629def6ae355ea45a8ead554` | full_read |
| `tests/reports.test.ts` | 4084 | `c4c27c8a2dc2455b1d5c3e0f47720c720fd12ef5e718043ca9c8ccfae010b3a9` | full_read |
| `tests/rss-conditional.test.ts` | 5500 | `f54443c6eef1f7426bf2974e52eed4b395ba0e2b426cc4a36d2393a29b89983c` | full_read |
| `tests/rss-links.test.ts` | 3950 | `70e30de2ec42f5c1cb1cd237cc4023f7e014e1ffee1ca6f41d697fd9f6942a4d` | full_read |
| `tests/rss-xhtml.test.ts` | 5536 | `97fe9e23fc1c0b8dcc0c34b257f16575f16092ca6f473c0031fadbb2fc2815dd` | full_read |
| `tests/schedule-retirement.test.ts` | 2124 | `85b5fcb0f59a271557c00520c32c24c618482fad3b27c92615737c649fa0b145` | full_read |
| `tests/seats.test.ts` | 10075 | `8a5f9c43de49f53bd6ddbf110bbbb9fe7fdbf84dfdb65d237dfa567301c64591` | full_read |
| `tests/selected-news-gate.test.ts` | 5241 | `0e5f6db515b3b44bbae376f39008efe7113ee8851a141c0dd72aff740037e0cc` | full_read |
| `tests/selection-eval-runtime.test.ts` | 9617 | `1f60010151f34f5ce68f4b6ac4d312163ab1c8838d71d9e256be66524bee1542` | full_read |
| `tests/setup.ts` | 5956 | `1b53ff80ab0c44e811a9955f55b4426d12dc5fb0032e07c0c0e92d031993cc20` | full_read |
| `tests/share-image-warm.test.ts` | 4860 | `5e2b4c422c4de966c175454b9b9626eaad80a3595e2c9b79c1afc21c72120028` | full_read |
| `tests/signals.test.ts` | 8385 | `de876204edd3cc2fe8ed7c79137f9254dc50910cdeac84a424a392c4c1ce79bd` | full_read |
| `tests/site-routes.test.ts` | 2731 | `16fa4e147055d9262351f74424ff39ef3495c3afd7ebc7c1eb8caf47231fae21` | full_read |
| `tests/source-config-dates.test.ts` | 1422 | `7ee8f726f2e05db1c568e92398ab38f6c0d8620c22d956ac1cb39531e954f141` | full_read |
| `tests/source-date-elements.test.ts` | 2065 | `cbd66e1055571b5910f7b007205a969d76578b9820efb51dcb654d74a3fcc616` | full_read |
| `tests/source-dates.test.ts` | 5432 | `4ecefe13203af447fc3f52d903d1ed280fbd5c0f82729183b6165dbfe2f413b5` | full_read |
| `tests/source-health.test.ts` | 5613 | `d18cb56feb7b417901d4ec22e6424a6c599dd061ed7b38b515cb183efbc586ed` | full_read |
| `tests/source-parser-audit.test.ts` | 4184 | `ddb783a76b8c8755d77e4eba9977f4debc6f1519a4b2ac4aeab8d3c0c91dfc71` | full_read |
| `tests/source-rules.test.ts` | 9187 | `4fae4c4c4f95a56c896f2064bcbdf59ea99b2e18f780b6aa2f33a860d26e43eb` | full_read |
| `tests/sources.test.ts` | 22638 | `e9792323ac2bad0948176e3ac043769f81c09384458a31858ed93c6d76096129` | full_read |
| `tests/story-digest-eval.test.ts` | 20621 | `d175a4a8027159c992c70034d8ad18c9231b729c4b310c168d87e4d160f7ed7a` | full_read |
| `tests/timeline-day-counts.test.ts` | 5418 | `ac7ab4998ffe0b454e7be5d20e9bb4fb94b23ba342cddb418fad526be90644bb` | full_read |
| `tests/timeline-group-scope.test.ts` | 3787 | `69748fd410e7c5f0d7bb8d157b1bc15ec7575108e2eec79cc52b75549ebc004c` | full_read |
| `tests/topic-cache-deadline.test.ts` | 2025 | `05aa5044858983d8be0ce6737dd63930a2be2a55d95a248c9f0d2d0e7907d158` | full_read |
| `tests/topic-membership.test.ts` | 3777 | `b7f307591123a8ba44c9c87d17d4d788d827b978566a1f547f94a8e29bbcc874` | full_read |
| `tests/topic-seo.test.ts` | 1731 | `5a518efc52c10a018802e7a1199da26c7ecb3c9fc88bb5990d51247512bd9a02` | full_read |
| `tests/topics-withdrawal.test.ts` | 4859 | `02a4c9070849649369f37b28f549e9239f1380de5e4ec0ff7c74a107b4db69d9` | full_read |
| `tests/topics.test.ts` | 9321 | `51243fa822987198230c75ec41ddce7a7e2e639bda8fd8094d79531cbf239789` | full_read |
| `tests/translate-shutdown.test.ts` | 5336 | `c9079c32a7e163e94adde6a3d80d9311b80cc1db355b2120923bf5d33e1af3dc` | full_read |
| `tests/translate.test.ts` | 9319 | `98357086c82e1300b62a61e770d187fc1668d08a1a52b87d6649492c7cacc520` | full_read |
| `tests/tsconfig.json` | 64 | `487cd5319c8b830a4cf881e48aeb9ee9878d8fd93b414ac78033e1409db72f2b` | full_read |
| `tests/url-identity.test.ts` | 2289 | `954fdb5e788be4320f153ceb35a2f23644144d72dfc9a10d7431cca63e9730c8` | full_read |
| `tests/url.test.ts` | 3038 | `5db3e380aa88b6bc320788cef6b9c341dfdf12478c946ac7f845ebf70b14151f` | full_read |
| `tests/video-extraction-routing.test.ts` | 1488 | `a1024321545ed8c6b95ac03df16a90725f2caf17088e0560dc926b5a0ed0a825` | full_read |
| `tests/video-source-body.test.ts` | 7220 | `fb8976595817de6d5b8d73a3c2efb5f058b3a103c93d647f4e20e9bb53c9a880` | full_read |
| `tests/watchdog.test.ts` | 3649 | `c1f9db217720bba619af04126c58624832956ed7756834bd425c007abc05eb05` | full_read |
| `tests/web-error-logging.test.ts` | 3557 | `08ffa93becb31da3ac1b84df65d0deb7bbf9f5682707151acbb84928ec723512` | full_read |
| `tests/web-render-recovery.test.ts` | 5517 | `e5a9dcf5657bfd76a0ee84aa1ce024ef25ef9f5bcbede642f0fda7e3fcab5165` | full_read |
| `tests/x-article.test.ts` | 6459 | `1fb21fe5f16f51860de35ed8ea56c0cc886f3f784e1bcefdf641338846f64030` | full_read |
| `tests/x-encoding-repair.test.ts` | 11182 | `3caa973e4b61a345fad1f7450fb5e1004a9ce1c4a148a2f0b2bf41ee46242871` | full_read |
| `tests/x-fulltext-license.test.ts` | 15902 | `2abcaecdc4aa407eb28f6012b1796ce812c16c67b3e416ad02128a8c90119f28` | full_read |
| `tests/x-shards.test.ts` | 16063 | `c596d0b9c6b34997f0c65befbbcc6e03ba284801a6e0b1d05fbba428cb8989ed` | full_read |
| `tests/x-text-entities.test.ts` | 2080 | `530a4e845c2e9a1882fb8d0554d45af9297e4619797485f738bcfe0031af9212` | full_read |
| `tsconfig.base.json` | 478 | `aac65703ed5d28b7a7f9f695228d2b42509fd015d43939b008448a4c2732d0c3` | full_read |

## Additional industry-prompt findings

- 【事实】Scoring uses seven content types, five weighted integer axes (sig/nov/cred/reson/act), and emits only attentionScore; it intentionally excludes tier/source fame from model input and delegates selection to thresholds/grouping. Prompt explicitly caps noise, marketing, narrow SDK support, weak teaser evidence, routine releases and context-free papers. Sources: `industry/prompts/selection-score.md`, `industry/selection.ts`.
- 【事实】Grouping distinguishes SAME_OCCURRENCE/SAME_STORY/UNRELATED/ROUNDUP; story continuity cannot be inferred from only matching company/product. Independent platform availability is a followup rather than same occurrence; composite roundups cannot bridge distinct events. Incremental reader value is a separate decision from relation identity. Sources: `industry/prompts/group-*.md`.
- 【事实】Structure requires source-supported occurrence, original-language contiguous evidence/condition quotes and no fabricated date; composite material has fact=null. Summary/title/translation include anti-hallucination rules, answer-first copy and name preservation. Material is untrusted data in most prompts. Translation prompts themselves do not include the common safety partial, so backend envelope safety must be checked before asserting uniform coverage. Sources: `industry/prompts/structure.md`, `rules-*.md`, `translate-body.md`, `translate-post.md`.
- 【事实】Industry examples use invented Acme/CloudBox data explicitly as evaluation fixtures. They are formats, not performance evidence or production gold sets. Prompt evaluation documentation uses fixed seeds, holdouts, repeated-call receipt reuse, and manual review for story digests (no automatic model-judges-model score). Sources: `industry/*.example.jsonl`, `docs/grouping.md`, `docs/story-digest-evaluation.md`.

## Continuation notes

Machine ledger `/tmp/audit-rest-ledger.json` contains full text, digest and read_status for all scoped text. Next pending IDs: 79 customize; 84 selection; 85 sources; 139–144 evaluation scripts; 146 MCP check; 149 nameplates; 155–156/158–159 SVGs; 169 generated OpenAPI; remaining tests 173–305 except 179/187/201/272 already complete; 293 tests tsconfig. `package-lock.json` inventory-only by root instruction. Binary exclusions comprise 16 assets, enumerated by extension/UTF-8 detection; no binary was semantically audited.

## Migration findings after complete migration read

- 【事实】57 migration files span 0001–0057 with intentional missing numeric values and duplicate numeric prefixes (0056/0057); complete filenames are unique. `0001` requires pg_trgm. Embeddings use PostgreSQL real[] and bounded recent-window scan, not pgvector. `0034` sets database TOAST compression lz4, requiring server support and adequate ALTER DATABASE privilege. Sources: `database/migrations/0001_core.sql`, `0006_embeddings.sql`, `0034_lz4_toast.sql`.
- 【事实】Historical initial fulltext SQL default was true in 0001, then changed to false in 0036; current database defaults must be judged after all migrations. That change does not bulk reset existing source rights. Receipt budgets include per-provider defaults and separate logical receipts/actual attempts, introduced in 0022. Sources: `0001_core.sql`, `0036_open_source_defaults.sql`, `0022_receipt_attempts_budgets.sql`.
- 【事实】Historical changes include real data backfills, column rewrites, table drops and story invalidation repair. Fresh install temporarily creates and later drops monitor/leaderboard/topics state. Final 0055+ six files only add concurrent indexes/MCV stats and column ANALYZE. Exact dropped data is documented in 0045, 0049–0053 and deploy guide; never transplant schema by reading initial migration only. Sources: all database migration files, particularly `0040_oss_domain_recovery.sql`, `0051_drop_unused_state.sql`, `0053_drop_leaderboard_monitor.sql`.

## Second-batch findings (all non-test text complete, lockfile exception)

- 【事实】Source preview can cause outbound/paid requests even with COLLECT_ENABLED=false; that switch governs automatic collection only. X search uses SocialData and merged multi-account requests; WeChat mp_account currently has no preview. Source config is allowlisted and unknown keys reject. Sources: `docs/sources.md`, `docs/customize.md`.
- 【事实】Generated OpenAPI 3.1 document fully read in six consecutive character chunks. It defines anonymous read-only JSON/Markdown endpoints, rolling 24h/7d browsing, selected snapshot/changes sync, dated reports, problem+json errors, ETags and retry headers. Item links retain field name `aihot` as a wire identifier even for own-brand sites. 【观点】Do not rename existing wire fields merely to remove branding without versioned contract changes. Source: `site/public/openapi-v1.json`.
- 【事实】Snapshot first-page watermark is retained through pagination; clients apply changes before saving cursor; 409 snapshot_required means rebootstrap. Dated reports remain mutable for withdrawal/corrections. Public hot JSON exposes rank/source coverage rather than internal heat. Source: `site/public/openapi-v1.json`.
- 【事实】Eval scripts reuse production prompts/schemas/model routing/receipt accounting, share identical requests including failures, and sanitize output filename splits. Relation gold has explicit validation; selection script parses JSONL with a TS assertion and has no comparable comprehensive row validation or seed integer check. Its comment says stratified sampling, but implementation is seeded random shuffle within split rather than quotas per stratum. Sources: `scripts/eval-selection.ts`, `scripts/eval-relations-core.ts`, `scripts/eval-relations.ts`, `scripts/eval-tools.ts`.
- 【事实】Story digest evaluation has strict schemas, read-only repeatable-read export snapshot and default max 18 calls, refuses identical rendered candidate prompt, writes comparisons rather than live edits. Nameplates are SVG font-derived paths with OFL attribution comments; regeneration downloads Fontsource package separately and does not install it as dependency. Sources: `scripts/eval-story-digests*.ts`, `scripts/nameplates.ts`, `site/brand/nameplates/*.svg`.

Continuation after second batch: only tests remain pending (129 files). All docs, scripts, contracts, industry and site text are fully read. Generated OpenAPI complete; root lockfile inventory exception remains.

### Continuation: session and analysis lifecycle tests

Full reads: tests/admin-session-revocation.test.ts, alerts.test.ts, analyze-consistency.test.ts, analyze-kill.test.ts, analyze-news-identity.test.ts, analyze-shutdown.test.ts. Tests specify password/session-secret change revocation, independent Feishu/password authorities, original OAuth claim binding, fail-closed legacy sessions, CSRF and hash secrecy. Feishu app-secret-only rotation preserves authorized same-app sessions. Analysis fixtures distinguish SIGKILL unknown paid outcomes (10-minute stale marking, one automatic release after 30-minute unknown age) from durable received responses reused after restart; transactional commit failures roll back analysis and receipt completion. Graceful queue SIGTERM drains owned paid responses, blocks new steps, and retains retryable jobs; final writing already in flight can complete. Structure failure blocks later paid writing. Alert fixtures avoid hiding stale successful backup age with fresh failures and distinguish unknown paid work from harmless/retried work. These are inspected assertions, not executed passing results.

Continuation full-read tests: collection.test.ts asserts X backlog continuity across 450 synthetic posts without rebuying saved pages; default-model.test.ts asserts all five analysis requests can use one configured OpenAI-compatible model. delivery-resolution.test.ts asserts invalid/missing outcomes or notes cannot mutate, audit, or send. discovery-cache.test.ts preserves original 200/304 freshness deadlines and requires 503/no-store on expired rebuild failure; discovery-scope.test.ts excludes withdrawn topics using current scope despite warm topic directory. Inspected, not executed. Coverage now193full/113pending/1lockfile exception; incomplete.

### Continued full reads: analysis, architecture, restore and collection

Tests184-196 (excluding already-read187) inspected in full. Analysis assertions cover original contiguous evidence only, composite/title-only facts suppressed, structure-controlled tags and known subjects, two-score mean selection, thin-feed extraction before models, receipt reuse, and sensitive-writing refusal translation fallback. Architecture checks use regex/text word matching (not complete static proofs) for layer imports, table-write ownership, single public scope, env-template parity and no cross-module imports. Backup tests use actual pg_dump/pg_restore/tar with stub object storage, restoring paired DB/local screenshots; external Feishu screenshot references cannot restore bytes. Caches excluded; missing roots allowed but unreadable roots fail; packing retries once and reports incomplete file archive even if DB shipped; local retention keeps three pairs. Category corrections update frozen report sections/metrics atomically with audit while preserving editorial lead/order/selection and avoiding paid digest. Collection assertions preserve confirmed bodies, recover detail metadata within per-run budget without starvation, canonicalize duplicate/tracking URLs, preserve explicitly enabled fragments, retain podcast guid identity without page extraction of audio, enforce fixed date windows consistently in preview/collect, store full regular listing tails (including65536 duplicate cards), and avoid validator advancement after partial storage failure. Long known headlines avoid needless paid detail reads; explicit authoritative rules can replace them. Tests inspected, not run. Coverage205full/101pending/1lockfile exception.

Full reads198-200,207-211: freshness assertions block undated/catalogue history from selected news, reports, heat and queued pushes even at score99; page publication metadata excludes modified times. Representative authority separates configured tier/ownership from first_party flags; mentions/composites cannot become fact origins/digest evidence. All story exits hide digests immediately when evidence/title/summary/source/time/conditions change or proof missing; reads do not regenerate. Concurrent digest results must reject changed evidence/manual merge; saved identical responses remain reusable. Dajiala transient body retries update revision, stored body avoids rebuy, cross-origin redirects reject key forwarding. Egress CONNECT pins checked public addresses preserving Host/IPv6 authority; direct-host matches exact and reevaluates each redirect, does not bypass private guard. Embedding response indices/dimensions/finite values validate atomically, invalid received results are failed not unknown; storage retains float32 signed-zero/subnormal bits. Dimensions changes separate receipts; dimension0 preserves provider size and unequal dimensions compare0. Inspected assertions, not execution. Coverage213full/93pending/1lockfile exception.

Full reads203/212/214: content deliveries reserve sibling claims concurrently; unknown acknowledgement suppresses grouped siblings and regrouped self-delivery, target activation excludes older arrivals, withdrawal after first in-flight target stops mirrors, disabled/missing config preserves retry state. Explicit acknowledgement required; invalid resolution note/outcome cannot send. Log tests redact PostgreSQL row/query values and OAuth body/parser excerpts while retaining error codes/frames/status. Extraction concurrency/stale network success-empty-failure must not overwrite newer revisions or add retry penalties; identical overlapping extraction creates one body revision. These assertions were inspected, not executed. Coverage216full/90pending/1lockfile.

Full reads227/228/230/232/234: reader Markdown preserves blocks while HTML whitelist removes script/event/javascript URLs; OpenAI-specific navigation/recommendation trimming must not apply to unrelated publishers. Repeated listing titles prefer useful headline over CTA. MCP limit is256KiB actual raw UTF8bytes including whitespace and chunked bodies, with JSONRPC413/no-store and approved Origin behavior. MCP shutdown drains live subscription; default tools.listChanged=false avoids idle agent listen streams. Migration checker fixtures reject edited/deleted deployed history and unsafe new module migrations even untracked or below cutoff. Inspected, not executed. Coverage221full/85pending/1lockfile.

Full reads215-224: multipart screenshot8MBlimit requires actual decode, type may derive from bytes; individual ownership protects identical uploads from another erasure. Feishu retry preserves uploaded key, drops permanently refused/day-old failed screenshot while sends text, removes stale local screenshots after week only when forwarding enabled; imported feedback never auto forwards. Identity incomplete/missing/duplicate decisions cannot silently become unrelated; late success/failure cannot settle changed revision, regroup/revision withdraws selected projection atomically; release wakes same failed queuejob. Hot fixtures require current membership/role/withdrawal and deduplicate owner channels; face payload only6editorial slots, initials consume slots, signal sources noimages, machine sourceNames retained. Current covers immediately drop withdrawn/revoked-fulltext images. Redirect fixtures block crossorigin sensitive headers/body/query, preserve sameorigin HTTP method semantics, recalculate guards, single deadline/byte limit, no credentials in limit errors. Paused external ingest409 without health/write changes. Invalid dates preserve unknown articles/remaining tail, finite untrustedfuture claim retained separately, no overwrite trusted date, unrelated storage failures still visible. Inspected assertions only. Coverage231full/75pending/1lockfile.

Full reads225/226/229: each Jina listing fetch/admin preview buys a distinct read; unknown request is not replayed, later fetch remains new paid request and received page survives storage error. Selectors use rendered HTML including dates. Material fixtures cover concurrent revisions and first-insert uniqueness, imported baseline only from original source, mirrors record discovery without revision, old rendering recurrence/garbling no repeated revisions, genuine edits newrevision/reset recovery while preserving evaluation attempt identity. Changelog updates use parentdate and explicit fragments; duplicate listing firstentry stable. Inspected assertions only. Coverage234full/72pending/1lockfile.

Full reads231/235/236: MCP wholeauthority parsing includesIPv6/ports and explicit spellings, denies malformed/repeated host, forwardedhost takes precedence; allowedhost does not grant Origin, preflight uses Origin policy. Online DDL one-statement allowlist rejects writes/rewrites/strong multi-locks, validates concurrent indexes and narrowly permitted statistics. Real PG fixtures assert bounded locktimeouts, atomic history/ledger, module prevalidation before anychange, validmatching index resume vs invalid/wrongdefinition reject, MCV improves correlated release planner estimates under explicit cachedSSDfixturecost. Inspected fixtures, not run/performance evidence. Coverage237full/69pending/1lockfile.

Full read213 events.test.ts in consecutive chunks0:16000/end: insufficient originals standalone withoutpaidcall, editor detach/manualidentity beats inflight decisions, regroup clears automaticmembership before redecision, merge races retry against survivor, composites only mentions cannotroot/bridge, explicit manualmembership preserved, roots earliest actual reportedfact notlowestID, two models rootagreement prerequisite automerge, aliases preserve old publicID, multiple ties formrelatedlinks withoutforcedmerge. Dateonlyframes Beijingmidnight invaliddatesunknown. Inspected assertions, not executed. Coverage238full/68pending/1lockfile.

Full reads237-242/244-246/248/250-251: incremental value separates identity from selection; duplicate cannot revive a rejected never-selected fact, revision rechecks value while preserves identity. Selected composite supplies reading coverage without fact candidate. Recovery atomic receipt/queue/audit retains evaluation tag, avoids repeated release loop; history identity free lowpriority. HTTP1.1 transport fixtures preserve Host/SNI/cert for direct/proxy/secureproxy/DoH. Sitemap scope excludes unreadable/unreleased, permits manual readable archive. Search excludes internal source notes, requires AND terms crossfields, literalLIKE and unique company expansion. Malformed unrelated cookie preserves valid session, writes stillCSRF. Ingest skips malformed entries, dedupes valid and creates isolated source. Mutable cache maxage+stale<=360 seconds including304/images. Public category mapping parity and readonly405 beforeparse. Unknown publication time named collection, RSS omits pubDate. Queue initial connection failure recoverable. Facttimeline keeps earliestappearance, hydrates representatives only. Inspected assertions, not executed. Coverage250full/56pending/1lockfile.

Full reads252/254/255/257/258: folded card reports actual fact source set; companyalias search subjects and text but wholequery expansion only; safe barelinks/list HTML. Recall strict14day discovery window excludes boundary, mergedstories, mentions/latestcomposites; latestanalysis revisionthenID overrides stale projection, sharedreport preserves allfacts. Shutdown permits receipt reuse/inflight save but forbids new/retry beforebudget. Relationeval duplicate goldcases retained with shared uniqueinput receipt/token totals, failedattemptusage counted onretry; schema/multiclass/threshold fixtures cover errors and filenamesanitization. Inspected only. Coverage255full/51pending/1lockfile.

Full reads259-261: report boundaries use actual public release after lock wait, snapshot waits uncommitted pre-cutoff publication to avoid loss across issues; delayed/boundary releases next issue once. Lead image follows clearly matched editor lead, excludes withdrawn highlight. Issue ordinals count whole series beyond400navigation; revisions keep number, earlier insert/delete renumbers later issues; v1 fields unchanged. Inspected only. Coverage258full/48pending/1lockfile.

Full reads243/247/253/256: verified T1 publisher attribution separate discovery/schedule, preserves original material/judgement/time, promotes signals through pending newsidentity, ambiguous prefixes not silently chosen; explicit prefixes strictorigin/path, RSSdomain noimplicitownership. Historical publicationdate correction requires preview/version/hash/idempotentrequest and oldvalidISO, preserves paid/material/editorial state and independent discoverysort, audit/modulehook/ledger atomic. Readpath fixtures cap searchtotal2000 while ranking allcandidates, smallcardpayload detailretains licensedbody, syndication livepermission, reportprojection fallback/order/ETag304. Receipt concurrency lastbudgetslot serialized, independent minute/hour/day attemptwindows, malformed received vs unknown, reasoningoutputlimit diagnosable, shutdown/stale races preserve answers, oneauto lostrepeat. Tests inspected only. Coverage262full/44pending/1lockfile.

Full reads262-268: report exits share withdrawal/release/provenance/date decisions including lead paragraphs/overview/introduction, freeze unavailable sitecitation but omit machine/feed. Automatic publishedissue retries preserve; explicit correction revision, receiptpublication atomic reuse; emptygaps nonstarving but errorsvisible. RSS initialcap avoids earlyvalidators, config/manualpreview bypass validators, redirected newdocument rejectsoldvalidators, parsefailure preservescursor. Atom xmlbase inherits feed-entry-link/finalURL, XHTML mixedorder and sanitization, plain text staysliteral withoutdoubledecode/media. Retired or paused schedules remove executionqueues/jobs but retain runhistory and live/businessqueues. Inspected only. Coverage269full/37pending/1lockfile.

Continuation 269–271: seats tests enforce one selected representative per fact, official replacement remove/upsert, retained reading-group reports and separate later evaluation facts; malformed snapshot/page/cursor returns 409 and sync outage 503 retry-after 30/no-store. Selected-news gate excludes failed/pending identity regardless of elapsed time, completion creates one ledger upsert/job, explicit editor selection can override redundant explanation filtering. Selection eval runtime tests exercise production routing with mocked providers, shared scores with per-case thresholds, failed-attempt token accounting and confined output paths; these do not establish provider quality. Tests inspected, not executed.

Continuation 273–278: share-image warming renders locally without HTTP, shares PNG cache/ETag with API, correction invalidates and withdrawal blocks cached access; disk failure is best effort. Signals skip analysis and queue behind reports, historical backfill cannot found an event, unmatched posts can rematch when a report or quoted original joins. Site feedback and agent Markdown routes validate parameters, cache and CORS. Listing boundaries require exact valid UTC instants and unsupported channels reject them. Date extraction prioritizes valid visible/meta values; zone-less source dates use configured offset across host DST/time zones, ISO bare dates remain UTC. Tests inspected, not executed.

Continuation 279–281,284–285: source health separates editorial outages from signal activity, preserves intermittent failure history, excludes budget exhaustion from source failure, counts attributed discoveries and all silent sources beyond display limits. Parser tests reject incomplete/product/impossible dates, split Intercom daily sections with stable fragment identities and bodies. Unsupported source rules fail collection/admin validation; deny URL rules apply; detail title/byline/body survives later listings; Jina buys only needed unknown detail renders. Timeline counts include whole filtered days across Beijing midnight/leap/year boundaries and deterministic pagination; composites, mentions and stale membership remain standalone, hidden/future/unselected reports cannot move anchors, and filters choose local anchors. Tests inspected, not executed.

Continuation 286–290: topic directory counts expire after one minute and refresh failure cannot resurrect stale results; visible headlines and corrected memberships refresh before count cache expiry. Lists and pool counts share a membership predicate: subjects/tags required, multiple-company articles need bounded original/current title evidence; Metadata is not Meta. Empty known topics exist but are unindexable, unknown/out-of-range pages absent, directory has 38 topics in company/field/genre. SEO is CollectionPage and only emits actual ordered lists/public story links. Tests inspected, not executed.

Continuation 291–292,294–296: translation shutdown saves received paid answers without starting later fragments or consuming terminal attempts, restart reuses receipts. Current revision alone can display translations; lost links/images trigger retries/original paragraph fallback and incomplete flag; quoted X translation deduplicates by tweet. Tweet identity requires exact X/Twitter host and full numeric status path, not embedded URLs or lookalikes. Fetch guards reject reserved/internal IP encodings, transition IPv6 and DNS rebinding, with explicit debug override. Video targets skip body extraction regardless of full-text source preference. Tests inspected, not executed.

Continuation 297–301,305: video feed descriptions remain excerpts, actual content remains usable, known players cannot become extracted bodies or buy fallback. Watchdog deduplicates stale/recovery alerts and retries failed sends using fictional Feishu transport. SSR logs preserve error stacks/path while hiding query strings and expected misses/cancellations. Render recovery permits one exact-URL reload on confirmed changed release and safe session storage, excluding admin/route responses/unversioned or navigated pages. X Articles fetched by owning tweet ID precede judgment and produce one stable revision; missing body explicitly flagged. X text decodes only amp/lt/gt once, preserves literal code and expanded URLs. Tests inspected, not executed.

Continuation 302–303: encoding repair requires proved X representation, version/hash/request id, preserves paid receipts/manual decisions/membership/translations/long article bytes, updates current hash/revision/search projection transactionally and refuses stale/unproved inputs; audit failure rolls back everything. X license matrix treats post text/quotes/media/translation as full text when POLICY.xPostIsFullText: site and syndication permissions separate, revocation retains licensed summaries, visibility/noneditorial restrictions remain stricter. Some X refusal tests explicitly skip when site policy considers posts not full text. These fixtures verify program policy, not actual publisher permission. Tests inspected, not executed.

Continuation 304: X shards segregate participation modes, stable planning, at most 24 accounts/query under 470 chars before watermark; per-account attribution/run/watermark, half-hour editorial schedule and bounded quiet-account lookback. Partial later-page failure preserves backlog; first-page/storage failure advances no coverage. Paid received pages survive and receipt completion commits atomically with coverage; retry does not rebuy. Verified publisher self-thread policy applies in single/shared queries without changing custom query semantics. Tests inspected, not executed.

Continuation 233: concurrent media modes share original download and disk rendition caches; signatures authenticate mode/expiry before validators/fetch, including legacy/short forms, ETags describe actual bytes and failure cache is at most minute/signature lifetime. Animation preparation updates ETag without refetch, bounded decode metadata avoids oversized conversion; binary MIME requires image bytes. Responsive outputs retain ratios and omit tracking pixels/video-page fake images across sanitation/export/posters while keeping actual thumbnails/video links. Fixture concurrency tests do not establish production throughput. Tests inspected, not executed.

Continuation 282: listing fixtures cover Jina card/title links, query-addressed posts versus navigation, line-start restriction, MiMo runtime-chunk adapter fails closed after layout change, promotion removal without article text loss. RSS teaser versus whole body and explicit short-summary-is-body remain distinct; templates/SVG/annotation chrome removed while linked chart retained; case-insensitive noise exemptions. JSON zone-less/yyyymmdd and JSON-LD dates obey valid calendar/source offset. Site-shape fixtures reflect recorded snapshots, not live availability verification. Tests inspected, not executed.

Continuation 283: digest eval export matches live rendered system/input/model/sampling byte-for-byte in mocked scenarios, read-only/no-model export excludes mentions/withdrawn and fails absent/merged/empty IDs without partial snapshot. Candidate compares identical input, strict placeholders/includes, max-call preflight default18 and refuses identical prompt; per-call receipts/accounting include failed attempts and reuse saved successes; same-time evidence order preserved, corrected versus incremental framing retained. Stub outputs establish wiring/accounting, not factual summarization quality. Tests inspected, not executed.

Continuation 249 (consecutive chars 0:19000,19000:end): publication fixtures preserve table relationships/captions/alignment/merged cells/code/numeric units in Markdown, separate reading-language from bilingual export and site versus syndication permission. Withdrawal propagates across reports/hot/neighbors/share access and historical sync redacts old upserts even on limit1 while advancing cursor. Summary-only strips score/category/story/tags/body/verdict, unsummarized editorial page may exist noindex while signal page cannot. Unchanged publication preserves tuple/freshness; URL-only changes update revision/ledger. Share conditionals hydrate metadata only. Snapshot minimal/default projections and page tokens remain bound to fixed watermark; pre-snapshot corrections included, mid-page corrections arrive once through later changes. Tests inspected, not executed.

## Final coverage verification

Assigned scope complete: 306 full_read + 1 inventory_only_lockfile = 307 inventoried UTF-8 files; zero pending. Recomputed every inventory SHA256 and byte count against unchanged upstream commit 309e32eb343a57d721525f04956887d3b9057fdf; all matched. Binary assets (16) and four delegated source areas remain explicit exclusions. The durable per-file READ ledger is /tmp/audit-rest-ledger.json. Historical continuation entries describe inspection progress; no tests or external services were executed.
