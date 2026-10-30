# PR #777: release-only snapshots with shared immutable assets

Normal deployment no longer builds, packages or installs snapshots. The deploy workflow and
app playbook match origin/main. Caddy still ships with normal releases. Existing review fixes
are preserved; no engine changes, commits, pushes or git metadata writes.

## New flow

1. Compare parsed papers.yaml experiment versions on main pushes. Also accept research-v* tags
   or a manual full commit. Verify target ancestry on main.
2. Build on ubuntu-latest using the production environment (manual staging supported), with the
   unique per-run/per-attempt snapshot concurrency group and host-side publication flock. Build /@<7 hex>/ and inventory asset SHA-256 hashes.
3. Ship through the existing SSH action and snapshot-only Ansible playbook. Check disk before
   upload/extraction and installation, retaining the 2 GiB reserve.
4. Write shared assets via verified, fsynced temporary files and atomic rename under lock; compare existing filenames byte-for-byte and refuse
   mismatches. Publish only non-assets in a read-only snapshot directory. Never overwrite a
   snapshot; refuse prefix collisions. Atomically rebuild the index.
5. Verify index, manifest, research headers and all shared asset hashes through public Caddy.
6. Cite the latest indexed snapshot matching the experiment version, or the current build
   without a permanent link. Frozen pages continue to cite themselves.

## Files changed by the redesign

- .github/workflows/{deploy,research-snapshot,research,ci}.yml
- infra/ansible/{deploy-app,deploy-snapshot,vars}.yml
- infra/ansible/scripts/{snapshot_store,test_snapshot_store}.py
- infra/caddy/{Caddyfile,test_snapshots.py}; infra/cloud-init/{production,staging}.yaml
- research/{CLAUDE.md,papers.yaml,papers.json}
- research/tools/{snapshot_trigger,test_snapshot_trigger}.py
- web/scripts/{build-snapshot.sh,snapshot-manifest.py,__tests__/snapshot.test.ts}
- web/src/components/research/shell/{CiteThis.svelte,permalink.ts,__tests__/permalink.test.ts,__tests__/citation.test.ts}
- web/e2e/research-cite.spec.ts
- docs/{DEPLOY.md,PR-777-summary.md}

## Disk, time and limits

The existing local artifact is 38 MiB: 33 MiB assets, 4.8 MiB non-assets. Added disk usage is
new asset bytes plus per-snapshot non-assets; base-prefixed JS can change hashes each release.
Twelve 40 MB releases/year cost at most about 480 MB/year before sharing, versus 14.6 GB/year
for daily full snapshots. These are baseline estimates, not a fresh build benchmark.
Normal deploy adds zero snapshot work. Estimate 5–20 minutes for a separate warm snapshot
build, longer cold; measure on staging. Its host lock queues snapshot publication. Deploy/rollback and newer snapshots cannot supersede
a pending snapshot because every run/attempt has a separate concurrency group.

The full-site build remains; Research-as-its-own-page is the planned size reduction. Research
WASM/replay retain their public-file loader, including worker-relative modules, and remain
per-snapshot rather than entering Vite's hashed asset graph in this change.

Pruning is manual: review/remove a snapshot directory, explicitly rebuild the index, then
run snapshot_store.py prune (dry run); only --apply removes unreferenced assets. Every remaining
manifest protects its inventory. Missing inventories, including legacy builds, fail closed.
Installer and GC share a local file lock. There is no automatic GC or hard-link deduplication.

## Validation

Python store tests cover identical reuse, mismatch refusal, disk reserve, prefix collisions,
manifest mismatch, dry run, references across snapshots and missing-inventory refusal.
Parsed version trigger tests, catalog offline validation and workflow/playbook YAML parsing pass.
Caddy validate through Nix and actual HTTP boundary tests pass, including legacy assets.
Targeted Vitest covers snapshot runtime/metadata, permalink/citation and replay frames.
Typecheck reports no new TypeScript errors; guarded Svelte paths and research isolation pass.
Matching-version citation, blog iframe/WASM and separate-origin blank-frame browser regressions
are present. A fresh Vite snapshot bundle builds; prerendering and browser E2E cannot run here
because the macOS sandbox denies Chromium MachPortRendezvous startup. Hosted/staging browser
checks remain required. Python suites (including a process killed mid-asset-write), Caddy HTTP
boundaries, YAML syntax and targeted Vitest pass. The typecheck baseline is unchanged.

## Klaus: staging checks

1. Deploy the Caddyfile through normal staging deployment first. Check landing, app, admin,
   API health and rollback. Confirm the snapshot workflow has production-scoped secrets and
   the separate per-run concurrency group and host-side snapshot publication lock.
2. Manually snapshot a main commit to staging; reject a non-main target. Verify title-only edits
   skip, version changes run and research-v* tags run.
3. Confirm per-commit directories contain no assets directory. Repeat installation and compare
   file hashes. Exercise collision and low-space refusal against a disposable store.
4. Check replay, recompute, worker/WASM loading, locales, version banner, snapshot-local autosave,
   current-version citations and missing-version fallback. Run snapshot E2E against staging.
5. Check shared and legacy assets, immutable/noindex headers, missing paths and traversal 404s.
6. On a disposable copy, check GC dry run, referenced-asset retention and explicit orphan removal.
   Measure build time, compressed size, incremental disk growth and peak installation disk use.

## Current review fixes and maintainer actions

Snapshots now live at `https://snapshots.stabileo.com/@<short>/…` and
`https://snapshots.staging.stabileo.com/@<short>/…`. Live `/@*` URLs redirect there with 308.
The dedicated Caddy site has no API or app fallback, noindex, immutable frozen files and a
strict script CSP (external same-origin scripts plus WASM). Only the index enables CORS from
the corresponding app. Origin separation protects live storage even from unpatched blank
iframes; per-commit storage namespacing is defence in depth. Blog iframes are rewritten before
insertion and on src changes; the latest-version banner returns to the live origin.

Before deploying, the maintainer must create:

| DNS name | Type | Value |
|---|---|---|
| `snapshots.stabileo.com` | A | production Hetzner VM IPv4 (production `DEPLOY_HOST`) |
| `snapshots.staging.stabileo.com` | A | staging Hetzner VM IPv4 (staging `DEPLOY_HOST`) |

Add AAAA only for working VM IPv6, or substitute CNAMEs to hostnames resolving to the respective
VMs. Staging may use `snapshots.staging.stabileo.com CNAME staging.stabileo.com`; production may
use `snapshots.stabileo.com CNAME stabileo.com` only after the VM cut-over, never while the latter
points to GitHub Pages. Keep 80/443 open for TLS. Unresolved snapshot DNS fails the workflow
explicitly before building. Deploy the new Caddy config through normal deployment before the
first snapshot; avoid rolling back to a Caddyfile that serves frozen code on the live origin.

The remaining review fixes cover catalog introduction, infrastructure CI filters, interrupted
asset writes, all historical pinned commits and each indexed experiment version during pruning,
metric/tolerance replay changes, and prefix-aware current-version comparison.
PR conflicts, dependency #769 and fresh hosted checks remain maintainer-owned.
