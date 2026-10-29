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

`https://stabileo.com/@<first 7 of a commit>/…` serves the whole site exactly as built at that
commit, forever; the plain address is always the latest. This is what research citations link
to (research/DESIGN.md §5). `/@/` lists the snapshots as JSON, newest first.

**Which commits.** Every push to `main` that changes `research/`, `engine/`, `web/`,
`scripts/`, root Cargo manifests, Nix inputs, Rust toolchain, `.nvmrc`, `.npmrc`, `.cargo/`,
`Makefile` or the deploy workflow. The whole web tree is an input: snapshots serve the whole
site, including shared UI, public assets and prerendered pages. The build chain is
`Makefile` → `scripts/wasm-cached.sh` and the research WASM `build.sh` (including asset identity,
publishing and viewer scripts) → `build-snapshot.sh` → Vite and its plugins → `prerender.ts`
and `root-handoff.ts`. The filter test checks all tracked files in these input trees so new
helpers are covered automatically. A manual Deploy run builds one when **snapshot** is ticked.

**Build.** `web/scripts/build-snapshot.sh` (`make web.build.snapshot`): the same inputs as
`make web.build`, with Vite's base `/@<commit>/`, into `web/dist-snapshot/`. In that build only,
the application's `location` reads see the address without the prefix and a small script in the
page puts the prefix back on what it writes (history, links, images, fetches of its own files;
never `/api/`) and shows the version banner (`web/scripts/snapshot.ts`). Share and embed URLs
use the actual address, keeping the commit prefix. Snapshot Web Storage persists in a namespace keyed by the full commit, separate from live
workspace, autosave, preferences and token keys. IndexedDB is disabled, so autosave uses
the persistent localStorage fallback and reports storage failures and quota limits as usual.
Reloading the same snapshot restores its saved workspace; download a project file for a portable copy.
`--mode desktop` is refused as a snapshot. `SNAPSHOT.json` in it records the commit, its date and
the research pages it holds. CI's required **CI OK** includes **Snapshot Site**, which builds one
for every web change and runs `web/snapshot-e2e/` against it under `vite preview`; the same suite runs against a host with
`SNAPSHOT_E2E_URL=https://staging.stabileo.com SNAPSHOT_PREFIX=/@<7 hex>/`.

**Ship and install.** The snapshot rides in the release tarball (`snapshot/`), so it travels with
the same artifact, SSH session and host lock as the release; the signed Nix closure is unchanged
(the snapshot is static files only). `deploy-app.yml`:

1. before anything changes, refuses the release if its snapshot is of another commit, if the
   prefix already holds a different commit, or if the disk would keep less than
   `snapshot_min_free_mb` (2 GB) free;
2. after the health check, moves it to `/srv/stabileo/snapshots/<7 hex>/` unless that exists
   (an existing snapshot is never overwritten), hard-links the files identical to the newest
   snapshot's, makes it read-only, and rewrites `index.json`;
3. the workflow then checks from outside that `/@/` lists the commit and `/@<7 hex>/` answers with
   the immutable cache header.

Rollback does not touch snapshots. Caddy (`infra/caddy/Caddyfile`) serves `/@<7 hex>/…` from that
directory with `Cache-Control: public, max-age=31536000, immutable` and `X-Robots-Tag: noindex`
(each page's canonical names the latest site); page addresses fall back to the snapshot's own
`index.html`; a missing file or snapshot is a plain, uncached 404. Only seven lowercase hex
digits are accepted; malformed snapshot addresses return 404. Each commit directory is the
file server's root, so traversal cannot read another snapshot or files outside it.

**Disk.** Measured on the build of 2026-10-28: a snapshot is 40 MB (11.3 MB engine WASM,
11.3 MB application chunk, 2.1 MB web-ifc, 1.8 MB screenshots, 1.4 MB social cards, 0.7 MB
research WASM, prerendered pages); 12 MB gzipped in the release tarball. With the hard links, a
snapshot whose engine did not change adds about 15 MB, one whose engine changed about 26 MB.
At one research or engine commit a day that is roughly 5 to 10 GB a year.

**Retention.** Every snapshot is kept. Pruning, if the disk ever needs it, is manual, by the
host's owner, from a dry-run plan:

```bash
curl -s https://stabileo.com/@/ > index.json
python3 -I research/tools/snapshots.py protected          # never to be deleted
python3 -I research/tools/snapshots.py plan --index index.json --older-than-days 365
```

The plan never offers a snapshot that any released experiment version names, in any commit of
`main` (`research/<field>/<id>/versions.json`), the newest snapshot holding each research page,
the 20 newest, or one younger than the cut-off. To remove one it offers, on the host:
`chmod -R u+w /srv/stabileo/snapshots/<7 hex> && rm -rf /srv/stabileo/snapshots/<7 hex>`, then
the next deploy rewrites `index.json`.

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
