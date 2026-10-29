# Deploying to one host per environment

Each environment is one Hetzner VM serving the app (landing + editor) and the admin site:

| Environment | App | Admin | GitHub environment | cloud-init |
|---|---|---|---|---|
| staging | `staging.stabileo.com` | `admin.staging.stabileo.com` | `staging` | `infra/cloud-init/staging.yaml` |
| production | `stabileo.com` (+ `www` redirect) | `admin.stabileo.com` | `production` | `infra/cloud-init/production.yaml` |

Production stays on GitHub Pages until the cut-over at the end of this page. The model is
scasaas's one-host deploy: the release is built inside Nix on the CI runner, shipped with its
signed Nix closure, and swapped into place over SSH.

| Workflow | Trigger |
|---|---|
| `deploy.yml` | every push to `main` deploys production; a manual run picks the environment (default staging) |
| `rollback.yml` | manual, picks the environment (typed `CONFIRM` for a migration rollback) |
| `production-health.yml` | after every successful deploy or rollback, and hourly: checks production and staging from outside |

Per environment, a newer build cancels an older one still building, and the deploy and
rollback jobs share one group, so neither starts while the other holds the host.

## What runs where

```
host (Debian 13, infra/cloud-init/<environment>.yaml)
+-- Caddy                 TLS, both static sites, /api/* -> backend     (infra/caddy/Caddyfile)
+-- PostgreSQL            stabileo_staging, owner stabileo
+-- Nix (multi-user)      the release's runtime closure, imported on every deploy
+-- stabileo-backend      system unit, User=app                        (infra/systemd/stabileo-backend.service)
+-- /srv/stabileo/        owned by app
    +-- live/             the current release: backend/, frontends/{app,admin}/, caddy/, .env
    +-- releases/         the previous three, for rollback
    +-- gcroots/          keeps the Nix paths those releases need from being collected
    +-- incoming/         artifacts in flight
    +-- snapshots/        builds kept under their commit, served at /@<commit>/ (see Snapshots)
        +-- <7 hex>/      one per commit, read-only, never overwritten
        +-- assets/        shared write-once hashed files
        +-- index.json    the list, served at /@/
```

The backend listens on `127.0.0.1:4100` only. Each site serves its static build and forwards
`/api/*` to it, so the browser calls the API same-origin: no CORS configuration. The admin's
Google sign-in starts and ends on the admin origin, which is why `API_URL` is the admin URL.

## Host prerequisites

`infra/cloud-init/<environment>.yaml` does all of it at first boot; `make cloud-init.render`
regenerates both files from `infra/caddy/` and `infra/systemd/`. Fill the three placeholders
(deploy public key, database password, Nix public key) and paste it as the server's cloud
config. Open 22, 80 and 443 in the Hetzner Cloud Firewall. Check with `cloud-init status --wait`
and `/var/log/cloud-init-output.log`.

What it leaves behind, for reference:

- user `app`, SSH key = the public half of `DEPLOY_SSH_KEY`, sudo only for the exact
  `systemctl`, `caddy validate` and `install` commands the playbooks run;
- multi-user Determinate Nix with `extra-trusted-public-keys` = the public half of `NIX_SIGNING_KEY` in `/etc/nix/nix.custom.conf`.
  `app` is an ordinary Nix user, never a `trusted-user`, so the daemon admits only signed paths;
- PostgreSQL role `stabileo` (`CREATEDB`, `pg_signal_backend` for a later restore flow) and the
  database `stabileo_staging`;
- Caddy with `/etc/caddy/Caddyfile`, `/etc/caddy/stabileo.env` (the domains, root and
  `ROBOTS_TAG`: `noindex, nofollow` on staging, `all` on production) and, on production,
  `/etc/caddy/sites.d/www-redirect.caddy`; from Caddy's own apt repository (Debian 13 ships
  2.6.2, too old for this Caddyfile);
- the `stabileo-backend` unit, enabled, started by the first deploy.

Generate the keys once:

```bash
ssh-keygen -t ed25519 -N '' -C stabileo-staging-deploy -f deploy_ed25519
nix key generate-secret --key-name stabileo-staging-1 > nix-signing.sec
nix key convert-secret-to-public < nix-signing.sec     # the cloud-init placeholder
```

## Settings

One set per GitHub environment (`staging`, `production`). Variables are plain, secrets are
masked. Values below are staging's; production uses `stabileo.com`, `admin.stabileo.com`,
database `stabileo` and `DEPLOY_ENV=prod`.

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_HOST` | variable | the VM's IP or `staging.stabileo.com` |
| `DEPLOY_USER` | variable | `app` |
| `DEPLOY_KNOWN_HOSTS` | variable | `ssh-keyscan -t ed25519 <host>`, fingerprint checked against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the host |
| `DEPLOY_SSH_KEY` | secret | the private key |
| `NIX_SIGNING_KEY` | secret | contents of `nix-signing.sec` |
| `SECRET_KEY_BASE`, `JWT_SECRET` | secret | `make release.secrets`, or `openssl rand -base64 64` |
| `DATABASE_URL` | secret | `ecto://stabileo:<password>@localhost/stabileo_staging` |
| `PHX_HOST` | variable | `staging.stabileo.com` |
| `API_URL` | variable | `https://admin.staging.stabileo.com` (the Google callback is built on it) |
| `ADMIN_FRONTEND_URL` | variable | `https://admin.staging.stabileo.com` |
| `TRUSTED_PROXIES` | variable | `127.0.0.1` (Caddy's `X-Forwarded-For` is believed) |
| `DEPLOY_ENV` | variable | `staging` or `prod` |
| `VITE_ACCOUNTS` | variable | `1` compiles the account UI in; login itself is switched on from the admin site's Settings |
| `GOOGLE_CLIENT_ID` | variable | OAuth client with redirect URI `https://admin.staging.stabileo.com/api/v1/admin/auth/google/callback` |
| `GOOGLE_CLIENT_SECRET` | secret | |
| `PORT`, `BIND_ADDRESS`, `POOL_SIZE`, `DATABASE_SSL`, `CORS_ALLOWED_ORIGINS`, `ADMIN_DOMAINS`, `*_TTL` | variable | optional; `backend/config/runtime.exs` is the reference |

Without the Google pair the admin site shows no sign-in button; add them and redeploy.

## What a deploy does

`deploy.yml`:

1. `make backend.release.build`, `make web.build`, `make admin.build`,
   the prerender gate from the Pages deploy, `caddy validate`;
2. packages `backend/`, `frontends/app`, `frontends/admin`, `caddy/Caddyfile`, the store paths
   the release references (`.github/scripts/release-store-paths.sh`) and their closure, signed
   with `NIX_SIGNING_KEY`;
3. uploads the tarball to `/srv/stabileo/incoming/` and runs `infra/ansible/deploy-app.yml`,
   which imports the closure, pins it against GC, writes `.env`, boots the new runtime config
   once (`eval ":ok"`) while the old release still serves, installs the Caddyfile, stops the
   backend, migrates, swaps `live/`, starts, and waits for `/api/v1/health`.

## Snapshots

`https://snapshots.stabileo.com/@<first 7 of a commit>/…` serves the frozen site.
Staging uses `https://snapshots.staging.stabileo.com`. The app's `/@*` addresses answer
308 redirects preserving path and query. Citations and permalinks point directly to the snapshot
origin; its `/@/` index permits read-only CORS from the corresponding live app origin.

**DNS configured (2026-10-29).** These records exist in the `stabileo.com` zone:

| Name | Record | Target |
|---|---|---|
| `snapshots.stabileo.com` | A | `2.31.85.230` (production) |
| `snapshots.staging.stabileo.com` | A | `77.42.87.228` (staging) |

Add AAAA records only if those VMs have working public IPv6. Alternatively use a CNAME for each
name to a DNS hostname that resolves to its corresponding VM (for example,
`snapshots.staging.stabileo.com CNAME staging.stabileo.com`). Do not point production snapshots
to GitHub Pages: `CNAME stabileo.com` is suitable only after the production app's VM cut-over.
The existing `https://snapshots.{$APP_DOMAIN}` Caddy site expands to these exact hostnames
using `infra/caddy/production.env` and `staging.env`. Caddy automatically obtains and renews
public TLS certificates; no separate certificate command or snapshot environment variable is needed.

**Remaining rollout steps.** Run the normal app deployment on each environment before the first
snapshot: `deploy-app.yml` validates, installs and reloads the bundled Caddyfile. Ensure the existing
server `/etc/caddy/stabileo.env` has `APP_DOMAIN=stabileo.com` in production and
`APP_DOMAIN=staging.stabileo.com` in staging, matching the GitHub environment's `PHX_HOST`.
Allow inbound ports 80/443 in the server/cloud firewall for Caddy's automatic TLS, and outbound
ACME access. No manual server change is needed if these existing settings are already in place.
Verify certificate issuance with `journalctl -u caddy` and an HTTPS request to each snapshot host
(a 404 before publication is expected). Then run the snapshot workflow for staging before production. The snapshot workflow checks DNS before building
and fails with an explicit A/AAAA-or-CNAME instruction if the snapshot hostname does not resolve.

The separate origin is the browser storage security boundary: even an unpatched `about:blank`
iframe cannot access the live app's localStorage or IndexedDB. The snapshot Caddy site serves
only `snapshots/`, with no API proxy or live app fallback. Its CSP denies external scripts,
connections, frames, forms and objects; scripts are external same-origin files, with WASM
compilation allowed. Inline styles remain allowed for the app's styling. All responses are
noindex; successful frozen files are immutable, while the index is no-cache and errors are uncached.
Storage namespacing remains defence in depth between versions, not a security boundary.

**Which commits.** `.github/workflows/research-snapshot.yml` runs on a push to main only
when parsed experiment `version` values in `research/papers.yaml` change, on a pushed
`research-v*` tag, or on **Make a snapshot** with a full commit input. Every target must be an
ancestor of main. Missing comparison history fails closed; a valid previous commit without
`papers.yaml` is treated as an empty catalog, so its introduction creates a snapshot. Keep `papers.yaml` versions aligned
with each experiment's `versions.json`; descriptive edits do not create snapshots.
Cite this chooses the latest indexed snapshot of the current experiment version. Without one,
it cites the current build without a permanent link. A frozen page continues to cite itself.

**Build.** `web/scripts/build-snapshot.sh` (`make web.build.snapshot`): the same inputs as
`make web.build`, with Vite's base `/@<commit>/`, into `web/dist-snapshot/`. In that build only,
the application's `location` reads see the address without the prefix and a small script in the
page puts the prefix back on what it writes (history, links, images, iframe sources, fetches of its own files;
never `/api/`) and shows the version banner (`web/scripts/snapshot.ts`). Share and embed URLs
use the actual address, keeping the commit prefix. Snapshot Web Storage persists in a namespace keyed by the full commit, separate from live
workspace, autosave, preferences and token keys. IndexedDB is disabled, so autosave uses
the persistent localStorage fallback and reports storage failures and quota limits as usual.
Reloading the same snapshot restores its saved workspace; download a project file for a portable copy.
`--mode desktop` is refused as a snapshot. `SNAPSHOT.json` in it records the commit, its date and
the research pages it holds. CI's required **CI OK** includes **Snapshot Site**, which builds one
for every web change and runs `web/snapshot-e2e/` against it under `vite preview`; the same suite runs against a host with
`SNAPSHOT_E2E_URL=https://snapshots.staging.stabileo.com SNAPSHOT_PREFIX=/@<7 hex>/`.

**Ship and install.** The separate hosted `ubuntu-latest` workflow uses the production
GitHub environment by default (manual staging is supported). Each run and attempt has a unique
`snapshot-<environment>-<run>-<attempt>` concurrency group: newer snapshot/deploy/rollback jobs
cannot replace a pending snapshot. The playbook's host-side `flock` serializes publication;
the store's own lock also serializes install/index/GC commands. Uploads have unique staging
directories. Snapshots write only their own store, so they can coexist with normal deploys and
rollbacks without changing those workflows. The normal deploy and `deploy-app.yml` match
origin/main. Caddy still ships and reloads with normal releases: deploy this config before the
first snapshot and do not roll Caddy back to a config that serves snapshots on the live origin.

1. Resolve the target and check main ancestry; compare parsed versions for a main push.
2. Build engine/research WASM and the prefixed site on the hosted runner; generate `SNAPSHOT.json`
   with every shared asset's filename and SHA-256.
3. Ship via the existing SSH setup and `deploy-snapshot.yml`. It only writes beneath `snapshots/`,
   including staging and Ansible temporary files. Reserve 2 GiB plus upload/extraction headroom.
4. Compare every existing shared asset byte-for-byte (SHA-256); refuse a name collision with
   different bytes. Write new assets to same-directory temporary names, verify SHA-256, fsync,
   then atomically rename under the store lock; never overwrite an existing asset. Keep only non-assets
   in the read-only commit directory and atomically publish it, then atomically rewrite `/@/`.
   Existing commits are retained; short-prefix collisions fail. A local file lock serializes
   installation and explicit garbage collection. Interrupted installs may leave unreferenced
   assets; rerun or use manual GC after inspection.
5. Verify index, manifest, research page headers and every shared asset hash through public Caddy.

Caddy maps `/@<7 lowercase hex>/assets/<safe filename>` to `snapshots/assets/<filename>`.
Legacy snapshot-local assets remain readable through the same route.
Names allow letters, digits, underscores, hyphens and single-dot-separated components, never
slashes or `..`. The snapshot must exist. Successful assets are immutable; missing files and
invalid paths return uncached 404. All `/@*` responses retain noindex. Other snapshot paths keep
the existing isolated directory root and SPA fallback. Rollback never touches snapshots.

**Size and time.** This still builds the full site. Research-as-its-own-page is a planned
follow-up that shrinks it. Research WASM/replay currently use runtime public URLs, including
worker-relative module/WASM loading; these remain non-assets inside each snapshot to preserve
that loader. Their existing build-id directories are not Vite hashed asset filenames. Moving
them into Vite's asset graph safely requires a loader change and is deferred.

The existing local build is 38 MiB, including 33 MiB under assets and 4.8 MiB outside assets.
It predates this redesign, so it is only a sizing baseline. The prior measured full build was about 40 MB (12 MB compressed). Shared storage costs the
union of hashed assets plus each snapshot's non-assets: incremental cost is `new asset bytes +
non-asset bytes`, bounded by the full build size, not a fixed deduplication percentage. Prefixes
embedded in JS can change chunk hashes between snapshots. At 12 releases/year the conservative
40 MB baseline is 480 MB/year before sharing, versus 14.6 GB/year at one full snapshot/day.
These are estimates, not measurements of this new build. The live deploy adds zero snapshot
build/upload/install time. Snapshot wall time is a separate WASM + Vite + prerender build plus
transfer and verification; budget 5–20 minutes on a warm hosted runner, longer cold, and measure
on staging. Its publication lock queues snapshot installers without delaying deploy/rollback.

**Manual prune.** Never automatic. Coordinate with Klaus, stop snapshot jobs, and retain every
published/cited version. `research/tools/snapshots.py plan` remains an advisory history-based
plan, not deletion authorization. Review the index's experimentVersions as well: keep the newest
snapshot of every released experiment version, including versions without a pinned commit.

On the host, after reviewing the exact seven-hex directory to remove:

```bash
chmod -R u+w /srv/stabileo/snapshots/<7 hex>
rm -rf /srv/stabileo/snapshots/<7 hex>
python3 snapshot_store.py index --root /srv/stabileo/snapshots
python3 snapshot_store.py prune --root /srv/stabileo/snapshots
# Review the dry-run list before explicitly deleting shared assets:
python3 snapshot_store.py prune --root /srv/stabileo/snapshots --apply
```

Use the reviewed `infra/ansible/scripts/snapshot_store.py` from this repository. GC scans every
remaining snapshot manifest, keeps all listed assets, and fails closed if any manifest lacks
an asset inventory (including legacy snapshots). Migrate/inspect legacy manifests before GC;
never invent an empty inventory. Removing a directory alone never deletes shared assets.

## First deploy, then the first admin

1. Host up, both DNS names pointing at it, settings filled: Actions -> **Deploy** -> Run
   workflow, pick the environment.
2. Allow the admins on the host (Google sign-in is limited to the allowlist plus the Workspace
   domains in `ADMIN_DOMAINS`):

```bash
ssh app@<host>
cd /srv/stabileo/live && set -a && . ./.env && set +a
RELEASE_DISTRIBUTION=none ./backend/bin/stabileo eval 'StabileoAuth.Release.allow_admin_email("you@lambdaclass.com")'
```

Logs: `journalctl -u stabileo-backend -f` (the `app` user is in `systemd-journal`) and
`journalctl -u caddy -f`.

## Health check

`production-health.yml` runs `scripts/production-health.mjs` against https://stabileo.com and
https://staging.stabileo.com after every successful deploy or rollback and every hour: the landing,
`/en/blog/` and `/api/v1/health` answer; in headless Chromium `/app/basic` mounts the application,
the engine's WASM is served as `application/wasm` and instantiates, and the deployed engine (the
module the page loaded, called through its public `solve_2d`; production carries no test hooks)
solves a cantilever to its closed-form tip deflection, rotation and support reactions. A failing
site opens one issue, `Production health check failing: <site>` (labels `ci-failure`,
`production`), refreshed while it stays red and closed when it passes again.

    node scripts/production-health.mjs https://stabileo.com          # locally (web/ installed)
    gh workflow run production-health.yml -f sites=https://stabileo.com/no-such-site   # negative case

## Rollback

Actions -> **Rollback** (pick the environment) swaps `live/` for the newest entry in `releases/` and restarts
the backend; one step back per run. Tick **rollback_db** and type `CONFIRM` only if the release
being rolled back ran a bad migration.

## Production cut-over

Production can be deployed before any DNS changes: the release runs and answers on the host,
and Caddy keeps retrying certificate issuance until the names resolve to it.

1. Create the production host with `infra/cloud-init/production.yaml`, fill the `production`
   environment (`DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`, the Google client with
   `https://admin.stabileo.com/api/v1/admin/auth/google/callback` registered), run **Deploy**
   for `production`, allow the admin emails.
2. Check the host directly: `curl -sk --resolve stabileo.com:443:<ip> https://stabileo.com/`
   answers the landing (self-signed until DNS moves), `/api/v1/health` passes.
3. In Cloudflare, point `stabileo.com` (A), `www` and `admin` at the host, DNS only. Caddy
   obtains the three certificates within a minute.

Done on 2026-10-26. The Pages workflow and `web/public/CNAME` are gone; the repository's Pages
custom domain is kept so pointing DNS back at GitHub Pages remains a rollback path.
