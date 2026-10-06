# Rebuild progress

2026-10-04: user confirmed target and approved independent frontend rebuild + existing data adapter.
Preservation: local snapshot e0d9943; branch rebuild/aihot-20261004; worktree /Volumes/DATA/codex/aibaize-rebuild.
Production backups: /opt/aibaize-rollbacks/20261004/{code.tar.gz,db.json,aihot.service,nginx-all.tar.gz}. Actual nginx site /etc/nginx/sites-available/aihot.
Reference source: /tmp/aihot-reference-20261004 at 309e32eb343a57d721525f04956887d3b9057fdf.
Baseline: 291/291 tests passed after building the original frontend.
Independent upstream frontend imported and branded; initial production build passed. Public projections and HTTP adapter added; 6 adapter tests passed. Adapter now mounted; collector can be disabled explicitly for candidate validation.
Incomplete: full source audit, admin/auth/feedback/static adapters, browser responsive and visual checks, candidate deployment, production switch and legacy removal.

2026-10-05: Full source audit completed: web135 + backend145 + remaining306 full text reads; lockfile inventoried. MIT/brand exclusion checked; complete font OFL retained.
Independent frontend production build and typecheck pass. Current backend/adapters322 tests and web33 tests pass. Browser confirmed new admin login, desktop homepage, mobile390x844 homepage and first-party filter; real share PNG returned200.
Production traffic still original8080. Candidate preparation starts in isolated release with separately verified Node24 Linux runtime; old UI remains until candidate/live validation.

2026-10-05 15:59 CST checkpoint (not complete):
- User reaffirmed AI.BAIZE/repo scope. Current origin/main4ab9534 is ancestor of rebuild branch; remote main unchanged by this task.
- New commits a67f60b summary-only facts, d56343f web-list title evidence+repair23 focused tests,2c12d82 truthful RSS/API/hot72h copy,61bd3b1+1ad9b33 HTTP smoke.
- Candidate now2c12d82 (API4301/web4300, Node24); old aihot8080 stillactive and domain nginx unchanged. Latest Linux build+typecheck passed, web33/33; backend328/329 with one share PNG missing-date nondeterminism failure. Must resolve before switch.
- CUA real interactions: selected item and original link, local bookmark persisted +starred page; daily/weekly/monthly tabs, archive40 historicalday entries, dark theme. Fixed public GET snapshot supports upstream3003 vs rebuilt3004; mobile375 screenshots exactly aligned except brand, desktop1440 captured. All7widths37539064076896010241440 DOM scrollWidth equalwidth. Rapid screenshot capture lag caused375/960 image sizing mismatch;375 recaptured correctly, need stable final screenshots later.
- Candidate HTTP smoke found /monthly SSR503 under load; isolated postrestart monthly20011.457s (too slow). Agent audit_web investigating reports index/projection performance and share nondeterminism; not a passed overall smoke.
- OpenRouter29 stored titles include appendedcardtext. Preview repair failed closed locally and remote (zero output); no production data modified. Specific per-ID remote diagnosis now running session7027, /opt/aibaize-releases/title-diagnosis.jsonl. Selective evidenced repair needed; preserve IDs/dates/visibility/pin/score and backup atomic write.
- Primary SSH tunnel3002 session7617. Fixed visual environments created by agent: upstream57025,fixture85350,candidate71864. Do not restart based on timeout; verify handles first.
- Remaining: correct performance/share failures/title data; fixed-dataset responsive/visual review all keyroutes; refreshed candidate full smoke; switchproductionthenliveverify; ONLYTHEN legacyUIremove+redeploy; changelog actualtime; pushPR/tag attach; final audits/report/rollback.
