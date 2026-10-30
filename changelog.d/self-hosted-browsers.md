### Changed
#### Browser CI uses Nix on trusted self-hosted runs (2026-10-29)

Web Build, E2E Site, all ten Chromium E2E shards and quarantined Chromium E2E tests
can run on Stabileo's Arch Linux runners when `STABILEO_SELF_HOSTED` is enabled,
only for the merge queue and pushes to main. Pull requests keep the Ubuntu path.
The dedicated Nix shell pins Playwright 1.60.0 browsers and their libraries,
supplies fallback fonts without apt or sudo, and includes the pinned Rust toolchain
for Web Build's Cargo-based third-party notices checks. Chromium and Firefox passed
the Linux host preflight (`scripts/ci/check-playwright-nix.sh`), but Nix WebKit did
not start. Determinism stays on GitHub with Chromium, Firefox and WebKit.
