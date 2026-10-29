@NOTES@

> **Alpha prerelease of the Stabileo desktop app, for testers.** It is not a release of stabileo.com and not signed yet, so Windows and macOS warn on first open (below). Same engine as stabileo.com. Step-by-step guide: [English](https://github.com/lambdaclass/stabileo/blob/main/docs/desktop/INSTALL.md) · [Español](https://github.com/lambdaclass/stabileo/blob/main/docs/desktop/INSTALL.es.md)

## Install with one command

| System | Command |
| --- | --- |
| macOS 15+ (Apple silicon or Intel) | `curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh \| sh` |
| Windows 10/11 x64 (PowerShell) | `irm https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.ps1 \| iex` |
| Linux x86_64 | `curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh \| sh` |

The scripts check the download against `SHA256SUMS` before installing anything.

## Or download a file from this page

| System | File |
| --- | --- |
| macOS | `Stabileo_@VERSION@_universal.dmg`: open it and drag Stabileo to Applications |
| Windows | `Stabileo_@VERSION@_x64-setup.exe`: run it (installs for your user, no administrator rights) |
| Linux | `Stabileo_@VERSION@_amd64.AppImage` (updates itself), or `Stabileo_@VERSION@_amd64.deb` (Debian/Ubuntu; does not update itself) |

The `.sig`, `.app.tar.gz` and `latest.json` files are for the in-app updater; you do not need them.

## The first time you open it (unsigned app)

- **macOS** (not signed with an Apple Developer ID yet; only once):
  - macOS 15 (Sequoia) and later: open Stabileo once (it is blocked), then System Settings ▸ Privacy & Security ▸ "Stabileo was blocked…" ▸ **Open Anyway**, and confirm.
  - Before authorizing it, verify the download against `SHA256SUMS` and run `codesign --verify --deep --strict /Applications/Stabileo.app`. A damaged-app warning can mean corruption or tampering: download a fresh copy and verify it; do not override a failed verification or persistent warning.
- **Windows:** if SmartScreen says "Windows protected your PC", click **More info ▸ Run anyway**.
- **Linux:** make the AppImage executable: `chmod +x Stabileo_@VERSION@_amd64.AppImage`, then run it. It needs FUSE 2 (`sudo apt install libfuse2` on Debian/Ubuntu).

## Check the download

In the folder where you downloaded the file and `SHA256SUMS`:

- macOS: `shasum -a 256 -c SHA256SUMS --ignore-missing`
- Linux: `sha256sum -c SHA256SUMS --ignore-missing`
- Windows (PowerShell): `(Get-FileHash .\Stabileo_@VERSION@_x64-setup.exe).Hash` and compare it with the line for that file in `SHA256SUMS`.

## Updates

Stabileo checks for a new version when it starts and from **Help ▸ Check for Updates**. It shows the release notes and installs only if you accept, never during a calculation. The `.deb` install does not update itself: it links to the new version instead.

## Uninstall

- macOS: `brew uninstall --cask stabileo` (add `--zap` to remove settings too), or drag Stabileo from Applications to the Trash.
- Windows: Settings ▸ Apps ▸ Stabileo ▸ Uninstall.
- Linux: `curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh -s -- --uninstall`, or `sudo apt remove stabileo` for the `.deb`.

Your projects (`.ded` files) are never touched by installing, updating or uninstalling.

Found a problem? **Help ▸ Report a Problem** in the app opens an issue with your version and system filled in.
