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
