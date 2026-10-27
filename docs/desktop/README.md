# Stabileo desktop (Windows, macOS, Linux)

Status: planning, branch `desktop`. This document is the plan; the roadmap below is the order of
work. It was reviewed against the code by Codex and Kimi (2026-10-27); their corrections are folded
in.

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

### Phase 0: first version, quickly (target: about a week)
Goal: an installable app on the three systems that opens, calculates, and saves `.ded` files.
1. `desktop/` Tauri 2 project (`src-tauri`), loading the production build of `web/` (`npm run
   build`) from disk; the window opens straight on the application (`/app/…`), not the landing.
2. The WASM engine and its worker load from the bundled files (asset protocol, module workers,
   `.wasm` MIME type); no network needed to calculate.
3. Open and save `.ded` through native dialogs (Tauri dialog + fs plugins, scoped to the files the
   user picks); autosave stays as on the web.
4. `.ded` file association and "open with" on the three systems.
5. Native menu: New, Open, Save, Save as, recent files, Quit.
6. CI: a `desktop` workflow builds unsigned installers (Windows .msi, macOS .dmg, Linux AppImage
   and .deb) on each push to the branch, as downloadable artifacts.
7. Smoke test on each system: open an example, solve 2D and 3D, show the 3D viewer, save, reopen;
   results identical to the web for the same file.

### Phase 1: usable by early testers
1. Fix what phase 0's smoke tests find on each webview (3D, workers, IFC import, large models,
   printing/PDF export).
2. Sign in once (backend accounts), cached session, offline grace; PRO entitlement checked offline.
3. Update check: tells the user a new version exists, with its release notes and any new safety
   advisories (no auto-install yet).
4. Desktop e2e in CI where the platform allows it (tauri-driver on Windows and Linux).
5. Crash and error reporting, opt-in.
6. One-command install from our own channels, updated by the release workflow:
   - macOS: Homebrew cask in our tap, `brew install --cask lambdaclass/tap/stabileo`.
     Until the app is notarized, macOS quarantines it on first open (right-click, Open once).
   - Windows: a Scoop bucket (`scoop install stabileo` after adding the bucket).
   - Linux: AppImage and .deb on the GitHub release.

### Phase 2: solid files and releases
1. `.ded` schema, golden documents, atomic saves with a backup, recovery after a crash, and a clear
   message when a file comes from a newer version.
2. Offline advisories link to fixed versions, not `main`.
3. Auto-update (Tauri updater, signed update feed), with staged rollout and rollback.
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
