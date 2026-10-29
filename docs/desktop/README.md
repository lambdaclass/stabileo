# Stabileo desktop (Windows, macOS, Linux)

Status: phase 0 is done (PR #663): unsigned alpha prereleases on Windows, macOS and Linux, installed
with one command and updating themselves. Phases 1 to 3 continue on `desktop-next`. This document
is the plan; the roadmap below is the order of work. It was reviewed against the code by Codex and Kimi (2026-10-27); their corrections are folded
in.

## Install

Prereleases only, for testers: `desktop-v*` releases on GitHub, marked prerelease and never the
repository's latest release. The app is not signed yet (see "Code signing last"), and it updates
itself: it checks at startup and from Help ▸ Check for Updates, and installs only when you accept,
never during a calculation.

- **macOS** (11 or newer, Apple silicon or Intel):
  `brew install --cask lambdaclass/tap/stabileo`. macOS blocks an unsigned app on first open:
  right-click Stabileo in Applications and choose Open once, or run
  `xattr -dr com.apple.quarantine /Applications/Stabileo.app`.
- **Windows** (10 or 11, x64), in PowerShell:
  `irm https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.ps1 | iex`.
  It installs for the current user, without administrator rights.
- **Linux** (x86_64), and macOS without Homebrew:
  `curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh`.
  On Linux it puts the AppImage at `~/.local/bin/stabileo` with a menu entry and `.ded` files
  opening in it (AppImages need FUSE 2: `sudo apt install libfuse2` on Debian/Ubuntu).
  `sh install.sh --uninstall` removes it. The `.deb` on the release page installs too, but does
  not update itself; the app links to the new version instead.

The scripts download from the newest `desktop-v*` prerelease and check every file against its
`SHA256SUMS` before installing anything (`STABILEO_VERSION=0.1.0-alpha.1` picks a version). Their
addresses are on the `desktop-update-feed` branch, which the release workflow refreshes, so they
do not change when this branch merges; each prerelease also carries both scripts. Step by step,
with the warnings and troubleshooting: [INSTALL.md](INSTALL.md) (Spanish:
[INSTALL.es.md](INSTALL.es.md)).

### How releases are made
`.github/workflows/desktop.yml` runs on every pull request, in the merge queue and on pushes to
`main`; a `changes` job builds only when something the app is made from changed (`desktop/`,
`web/`, the engine, the toolchain, the workflow), and `Desktop OK` is the one check to require. A
build makes unsigned installers on GitHub's Linux, macOS and Windows runners (never self-hosted)
and launches each app once: it must solve the startup self-check in the bundled engine. An install
test then runs the one-command installers against the current run’s staged artifacts on all
three systems, checks their SHA256SUMS, and launches the installed apps. Linux also installs
and launches the .deb with its default Tauri WebKitGTK/GTK runtime dependencies. Publication
waits for all installation tests.

A manual run from `main` or a reviewed `desktop-v*` tag with a `version` publishes the prerelease `desktop-v<version>`:
installers, the install scripts, `SHA256SUMS`, the updater signatures (`.sig`), `latest.json` and
the Homebrew cask as an artifact, with the install guide (`desktop/release/release-body.md`) as
its description. `latest.json` itself is not signed: it lists, for each system, the download and
the signature of that download, and the app installs only a download whose signature verifies
with the public key it was built with. After publishing the tested release, the job opens a pull request with the install scripts and `latest.json`
against `desktop-update-feed`, the fixed addresses the docs and the in-app updater use. A
maintainer reviews and merges that PR before the feed changes. The
cask goes to `lambdaclass/homebrew-tap` (`Casks/stabileo.rb`) by pull request.

The updater's private key and its password are secrets of the `desktop-release` environment
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), which only the release job
uses: it needs a reviewer's approval and deploys only from `main` or a `desktop-v*` tag whose commit is on `main`. Builds,
pull requests included, never see the key; they make the updater artifacts with a key made for the
run, and the release job signs those same files and checks the signatures against the public key
in `desktop/src-tauri/tauri.conf.json`. Losing the private key means installed copies can no longer
update themselves.

### Required repository settings (maintainer)

Configure these before enabling releases; workflow YAML cannot create these protections:

1. **Settings → Environments → desktop-release:** add `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as environment secrets. Remove any copies from repository
   secrets and organization secrets accessible to this repository. Rotate the key if it was
   exposed to a PR build; coordinate the public-key transition for already installed clients.
   Set required reviewers to trusted release maintainers, enable **Prevent self-review**, and
   disable administrator bypass of environment protection. Set deployment branches/tags to
   **Selected branches and tags**, with exactly branch `main` and tag pattern `desktop-v*`.
   Review the workflow and the exact commit before approving each manual release job.
2. **Settings → Rules → Rulesets:** protect `main` with required pull requests, at least one
   approving review, dismissed stale approvals, approval of the latest push, no force pushes or
   deletions, and no bypass actors. Require the exact status check **Desktop OK** (GitHub Actions),
   including in the merge queue. Protect tags `desktop-v*` against updates/deletions and restrict
   creation to release maintainers. Before dispatching a release, pre-create `desktop-v<version>` at the exact reviewed
   commit being released on `main` (also for a run dispatched from `main`); the release job checks ancestry and a tag run must match the requested version.
3. Protect **desktop-update-feed** with required pull requests, at least one approving review,
   dismissed stale approvals, approval of the latest push, required signed commits, blocked force
   pushes and deletions, and **no bypass actors**, including GitHub Actions and administrators.
   Do not require `Desktop OK` on this data-only branch: its script changes are reviewed against
   the tested release source. The release workflow creates a `desktop-feed-*` branch and PR;
   it must not push directly to the feed or approve/merge its own PR. Review every script diff.
4. **Settings → Actions → General → Workflow permissions:** default to read-only repository
   contents; enable **Allow GitHub Actions to create and approve pull requests** so the release
   job can create the feed PR. The job requests `contents: write` and `pull-requests: write`
   explicitly; required independent review still prevents self-approval/merge.

Project saves write and flush a sibling temporary file, preserve the previous file as `.bak`,
then replace the destination. Save As uses the exact selected filename, including an extensionless
name, so its path remains within the native dialog's authorization. During updates the document
UI is inert and native file commands are blocked; all tabs are checked again after download,
and calculation entry points stay blocked through installation/relaunch.

Packages include `legal/LICENSE` (the AGPL text), `legal/RUST-NOTICES.txt`, and `legal/SOURCE.txt`
with the build's source-commit URL. To build locally, run `cargo metadata --locked --manifest-path
 desktop/src-tauri/Cargo.toml --format-version 1 > /tmp/desktop-metadata.json` inside the Nix shell,
then `python3 desktop/release/notices.py /tmp/desktop-metadata.json <source-commit>` from the root
before bundling. CI does this before every package build; cached upstream licence texts live in
`desktop/release/licenses/`. JavaScript notices remain bundled in `third-party-notices.txt`.

## Decisions

- **Tauri, on all three systems.** One shell; no Electron fallback. Its webviews differ (WebView2
  on Windows, WKWebView on macOS, WebKitGTK on Linux), so every phase is tested in the packaged
  app on each, not only in Playwright's browsers. Linux/WebKitGTK is the known risk for the 3D
  viewer: document minimum versions and GPU requirements, and work around what fails.
- **The same WASM engine as the web.** The desktop app runs the engine stabileo.com runs, in the
  same Web Worker, so its results are the ones already verified. A native engine is optional and
  late: only if benchmarks show a need, out of process, and only behind a gate that its finished
  results (not raw solver numbers) match WASM's.
- **One UI.** The Svelte app in `web/`, built once, loaded by the shell. Desktop-only behaviour
  (files, menus, updates) goes through a small platform layer, with the browser behaviour as the
  other implementation.
- **Sign in once, then out of the way.** Stabileo is free software; the account tells us who uses
  it and lets us email them when a safety advisory is published. It also carries entitlements:
  - PRO: a signed entitlement (plan, expiry) from the backend, cached and verified offline with a
    public key; works offline within the session's grace period. Client-side, so a self-built copy
    can bypass it; accepted.
  - AI: runs on our servers (`ai-backend/`), enforced there per account (plan, quotas, rate
    limits).
  - Never blocks a calculation: an expired session or our server being down asks again later.
    Losing PRO never locks anyone out of their own projects (open, read, export always work).
  - Projects stay local; the account says who uses Stabileo, not what they design. A short privacy
    policy covers Ley 25.326 and GDPR.
- **AI output is assistance, never a verified result**: labelled as such, and checked by the
  engine like anything the user types.
- **Code signing last.** Unsigned builds are fine for the first testers (one warning on first open
  on Windows and macOS). Signing and notarization come before a public release.

## What the reviews corrected

- Moving code to Rust does not make it verified: verification is tracked per code and limit state,
  and "not evaluated" / "refused" stay honest outcomes.
- The design side in TypeScript is large (about 300 files, 89k lines across design, detailing,
  loads, connections, foundations) and CIRSOC 201/301 already compute in Rust. Consolidating
  *numerical rules* in Rust is a multi-quarter program, starting with checks that exist only in
  TypeScript or disagree with Rust; workflow, reports, drawings and i18n stay in TypeScript. It is
  not a prerequisite for the desktop app.
- The engine boundary is more than `solve_3d`: TypeScript finishes the solver's output
  (`solve-finish.ts`, `solver-service.ts`). A future versioned interface offers whole operations
  (solve and finish, design over demands) with job ids, progress, cancellation and structured
  refusals. Not needed for the first desktop version, which reuses the web code as it is.
- `.ded` needs a schema, golden files, atomic saves with backups, crash recovery and a rule for
  newer files opened by older versions before it is a long-term contract.
- Advisories offline: the in-app registry links to GitHub `main`; it should point to fixed
  versions. An offline install cannot learn of advisories issued after its last update, so the
  update check matters.

## Roadmap

`[x]`: done on the `desktop` branch.

### Phase 0: first version, quickly (done)
Goal: an installable app on the three systems that opens, calculates, and saves `.ded` files.
1. [x] `desktop/` Tauri 2 project (`src-tauri`), loading the production build of `web/` (`npm run
   build`) from disk; the window opens straight on the application (`/app/…`), not the landing.
2. [x] The WASM engine and its worker load from the bundled files (asset protocol, module workers,
   `.wasm` MIME type); no network needed to calculate.
3. [x] Open and save `.ded` through native dialogs (Tauri dialog + fs plugins, scoped to the files the
   user picks); autosave stays as on the web.
4. [x] `.ded` file association and "open with" on the three systems.
5. [x] Native menu (in es/en/pt): New, Open, Save, Save as, recent files, Quit.
6. [x] CI: a `desktop` workflow builds unsigned installers (Windows NSIS .exe, macOS .dmg, Linux AppImage
   and .deb) for relevant pull requests, merge groups, pushes to main, and manual runs, as downloadable artifacts.
7. [x] Smoke test: on every build, CI launches the packaged app on all three systems and it must
   solve a cantilever in the bundled engine (main thread and worker) against the closed-form
   answer; every release is installed with the one-command installers on all three and launched
   the same way. By hand on macOS (2026-10-28): open a `.ded` from Finder (file association),
   title, recent files, Save, Quit, reopen, and the update from alpha.2 to alpha.3 from Help ▸
   Check for Updates. A manual pass on Windows and Linux desktops (3D viewer, IFC import, results
   against the web) moves to phase 1.

### Phase 1: usable by early testers
1. Manual smoke on Windows and Linux desktops, and fix what it finds on each webview (3D, workers,
   IFC import (it parses in a worker, as the page's CSP forbids web-ifc's eval), large models,
   printing/PDF export).
2. Sign in once (backend accounts), cached session, offline grace; PRO entitlement checked offline.
3. [x] (done in phase 0, with install on accept) Update check: tells the user a new version exists, with its release notes and any new safety
   advisories (no auto-install yet).
4. Desktop e2e in CI where the platform allows it (tauri-driver on Windows and Linux).
5. Crash and error reporting, opt-in.
6. [x] (done in phase 0; Windows uses `install.ps1` instead of Scoop) One-command install from our
   own channels, updated by the release workflow:
   - macOS: Homebrew cask in our tap, `brew install --cask lambdaclass/tap/stabileo`.
     Until the app is notarized, macOS quarantines it on first open (right-click, Open once).
   - Windows: a Scoop bucket (`scoop install stabileo` after adding the bucket).
   - Linux: AppImage and .deb on the GitHub release.

### Phase 2: solid files and releases
1. `.ded` schema, golden documents, atomic saves with a backup, recovery after a crash, and a clear
   message when a file comes from a newer version.
2. Offline advisories link to fixed versions, not `main`.
3. Auto-update (Tauri updater, signed artifacts listed by the update feed), with staged rollout and rollback.
4. AI features against `ai-backend/` with per-account enforcement.

### Phase 3: public release
1. Code signing: Apple Developer ID + notarization (macOS), Windows signing (Azure Trusted Signing
   or a certificate). Key custody and rotation documented.
2. Download page on stabileo.com, release notes per platform.
3. Official package channels, which expect signed apps: Homebrew's main cask repository
   (`brew install --cask stabileo`), winget (`winget install Stabileo`), and Flathub on Linux.

### Later (separate programs)
- Versioned engine interface (operations, jobs, progress, cancellation), exposed through the CLI
  (`engine/examples/reproduce.rs`) too.
- Inventory of which implementation owns each code check and limit state; consolidate numerical
  rules in Rust where they exist only in TypeScript or disagree.
- Native engine, out of process, only if benchmarks justify it and the equivalence gate on
  finished results passes.

## Prior art
PRs #272/#273 (stale): a Tauri prototype with a native solver. Worth reading for ideas, not for
merging.
