### Changed
#### Trusted merge-queue checks use Stabileo runners and Nix browsers (2026-10-30)

With #854, the jobs eligible for Stabileo runners are Lint Repo, Lint Engine, both Engine Suite
shards, Engine Metamorphic, WASM, Research WASM, Results Snapshot, Web Build, E2E Site,
all ten Chromium E2E shards and quarantined Chromium E2E tests. They self-host when
`STABILEO_SELF_HOSTED` is enabled, only for the merge queue and pushes to main.
Pull requests still use GitHub runners. Self-hosted jobs explicitly clean checkout
workspaces and use the installed Nix toolchain without running the Nix installer
or GitHub-only disk cleanup and build-cache actions. The browser jobs use the Nix
shell's Playwright 1.60.0 browsers, libraries and fallback fonts; Web Build also gets pinned
Rust for its third-party notices checks.

All other jobs stay on GitHub. Engine Gates and Web Unit retain isolated timing
budgets, and Docker smoke needs Docker, which is not guaranteed on the host.
Determinism keeps Chromium, Firefox and WebKit on GitHub: Chromium and Firefox
passed the Nix Linux host preflight, but Nix WebKit did not start.

Pull requests that change the tooling check the merge queue's browser shell on a GitHub runner
before it reaches the trusted queue. Research WASM bypasses sccache because the host cache could
not start its toolchain. Re-check the browser-shell preflight after changing Nix or Playwright;
Chromium and Firefox are covered there, not WebKit. This changes where checks run, not solver
results or which projects need recalculation.
