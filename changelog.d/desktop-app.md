### Added
#### A desktop app for Windows, macOS and Linux, as an alpha (2026-10-29)

Stabileo now also runs as a desktop app (Tauri), with the same WASM engine as stabileo.com and
projects as `.ded` files on disk: native Open, Save and Save As, recent files, `.ded` files opening
in it, menus in Spanish, English and Portuguese. It installs with one command
(`brew install --cask lambdaclass/tap/stabileo` on macOS, a PowerShell line on Windows, a `curl`
line on Linux) and updates itself after asking, never during a calculation and never over unsaved
work. Unsigned alpha prereleases (`desktop-v*`), for testers; see docs/desktop/INSTALL.md. The
stabileo.com build is unchanged.
