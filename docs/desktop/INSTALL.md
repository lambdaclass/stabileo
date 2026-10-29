# Installing the Stabileo desktop app

*[Leer en español](INSTALL.es.md)*

The desktop app is Stabileo on your own computer: the same calculation engine as
[stabileo.com](https://stabileo.com), your projects saved as `.ded` files wherever you choose, and
no internet connection needed to calculate.

It is an **alpha** for testers. Download pages: the
[desktop prereleases on GitHub](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true)
(the newest is at the top).

- [Before you start: what "unsigned" means](#before-you-start-what-unsigned-means)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Checking a download by hand](#checking-a-download-by-hand)
- [Updates](#updates)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)

## Before you start: what "unsigned" means

Windows and macOS expect apps to carry a digital signature from a certificate the publisher pays
for and registers with Microsoft or Apple. The alpha is not signed yet, so the first time you open
it the system warns that it does not know the publisher. The warning is about the missing
certificate, not about anything found in the app.

Instead of the signature, every release lists the SHA-256 fingerprint of each file in
`SHA256SUMS`. The install commands below check it for you before installing anything; you can also
[check it by hand](#checking-a-download-by-hand). Signing comes before the public release, and the
warnings go away then.

You need to get past the warning **once**, on first open. Updates do not ask again.

## Windows

Windows 10 or 11, 64-bit.

### With one command (recommended)

1. Open **PowerShell**: Start menu, type `PowerShell`, press Enter. No administrator rights needed.
2. Paste this line and press Enter:

   ```powershell
   irm https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.ps1 | iex
   ```

3. It downloads the newest version, checks its fingerprint, and installs it for your user. When it
   says `Stabileo ... is installed`, open **Stabileo** from the Start menu.

### Or by hand

1. On the [newest desktop prerelease](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
   under **Assets**, download `Stabileo_<version>_x64-setup.exe`.
2. Run it. If the browser warns that the file is not commonly downloaded, choose **Keep** (in Edge:
   **...** ▸ **Keep** ▸ **Show more** ▸ **Keep anyway**).
3. If a blue window says **"Windows protected your PC"** (SmartScreen), click **More info**, then
   **Run anyway**.
4. Follow the installer. It installs for your user only; no administrator rights needed.

## macOS

macOS 15 (Sequoia) or newer, on Apple silicon (M1 and later) or Intel.

### With one command (recommended)

Homebrew cask publication is pending; use this installer meanwhile.

In **Terminal** (Applications ▸ Utilities ▸ Terminal):

```sh
curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh
```

It downloads the newest version, checks its fingerprint, and copies Stabileo to Applications.
Files downloaded by a terminal command are not marked as coming from the internet, so macOS does
not show the first-open warning for this copy.

### Or by hand

1. On the [newest desktop prerelease](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
   under **Assets**, download `Stabileo_<version>_universal.dmg` (one file for Apple silicon and
   Intel).
2. Open it and drag **Stabileo** onto **Applications**.

### First open on macOS

Stabileo is not signed with an Apple Developer ID yet, so the first time you open it macOS says
*"Stabileo" Not Opened* (or *Apple could not verify "Stabileo" is free of malware...*) and offers
only **Done** or **Move to Trash**. Choose **Done**. These steps apply only to unidentified-developer
warnings. For a damaged-app warning, follow the troubleshooting guidance below instead. Before
authorizing the app, verify the download against `SHA256SUMS` and run
`codesign --verify --deep --strict /Applications/Stabileo.app`. If verification fails, download a
fresh copy and do not open it. The ad hoc signature checks bundle integrity, not publisher identity.
Then, once:

**macOS 15 (Sequoia) and later**

1. Open **System Settings** ▸ **Privacy & Security**.
2. Scroll down to *"Stabileo" was blocked to protect your Mac* and click **Open Anyway**.
3. Confirm with **Open Anyway** again and your password or Touch ID.

From then on it opens normally, updates included.

## Linux

64-bit (x86_64) distributions from about 2022 on: Ubuntu 22.04 or newer, Debian 12 or newer,
Fedora 36 or newer, or similar.

### With one command (recommended)

In a terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh
```

It downloads the newest AppImage, checks its fingerprint, puts it at `~/.local/bin/stabileo`, adds
Stabileo to your applications menu, and makes `.ded` files open in it. It updates itself.

### Or by hand

On the [newest desktop prerelease](https://github.com/lambdaclass/stabileo/releases?q=desktop-v&expanded=true),
under **Assets**, download one of:

- `Stabileo_<version>_amd64.AppImage`: runs on most distributions and updates itself. Make it
  executable and run it:

  ```sh
  chmod +x Stabileo_*_amd64.AppImage
  ./Stabileo_*_amd64.AppImage
  ```

  (or in your file manager: right-click ▸ Properties ▸ Permissions ▸ *Allow executing as program*).
  AppImages need FUSE 2; on Debian and Ubuntu: `sudo apt install libfuse2` (`libfuse2t64` on
  Ubuntu 24.04).
- `Stabileo_<version>_amd64.deb`: for Debian and Ubuntu, `sudo apt install ./Stabileo_*_amd64.deb`.
  It uses the system's WebKitGTK and **does not update itself**: the app tells you when there is a
  new version and links to it.

## Checking a download by hand

The install commands do this for you. If you downloaded a file by hand, download `SHA256SUMS` from
the same release into the same folder, and in a terminal in that folder:

- macOS: `shasum -a 256 -c SHA256SUMS --ignore-missing`
- Linux: `sha256sum -c SHA256SUMS --ignore-missing`

Each file you have should say `OK`. On Windows, in PowerShell:

```powershell
(Get-FileHash .\Stabileo_<version>_x64-setup.exe).Hash
```

and compare the result with the line for that file in `SHA256SUMS` (upper or lower case does not
matter). If they differ, do not install it: download it again, and if it still differs, report it.

## Updates

Stabileo checks for a new version each time it starts, and when you choose **Help ▸ Check for
Updates** (on macOS also **Stabileo ▸ Check for Updates**). If there is one, it shows what changed
and asks; it installs only if you accept, and never while a calculation is running. Updates are
signed, and the app refuses one whose signature does not match.

The Linux `.deb` does not update itself: install the new `.deb` from the release page.

## Troubleshooting

**The browser blocks or deletes the download.** Unsigned files are uncommon, so browsers are wary.
Choose **Keep** in the downloads list (Edge: **...** ▸ **Keep** ▸ **Show more** ▸ **Keep anyway**;
Chrome: **Keep**). Or use the one-command install, which does not go through the browser.

**macOS says the app is damaged and should be moved to the Trash.** This can indicate corruption
or tampering, not just quarantine. Do not remove quarantine or override this warning. Download a
fresh copy from the official release, verify its `SHA256SUMS`, and run
`codesign --verify --deep --strict /Applications/Stabileo.app` after copying it. If either check
fails or the warning persists, do not open it; report the problem. See
[Apple’s guidance](https://support.apple.com/en-sg/guide/mac-help/mh40619/mac).

**Windows: "Windows protected your PC".** Click **More info** ▸ **Run anyway**. If there is no
**Run anyway** button, your organization's IT policy blocks unsigned apps; ask them, or wait for
the signed release.

**Linux: the AppImage does not start.** Run it from a terminal to see the message. `dlopen():
error loading libfuse.so.2` means FUSE 2 is missing (see [Linux](#linux)); `libEGL.so.1: cannot
open shared object file` means the system's graphics libraries are missing (on Debian/Ubuntu:
`sudo apt install libegl1 libgl1`; desktops normally have them, minimal and server installs may not). As a fallback,
`./Stabileo_*.AppImage --appimage-extract-and-run` works without FUSE.

**Linux: blank window, or the 3D view is black or flickers.** Usually the graphics driver and
WebKitGTK (the web engine Linux apps use) not getting along, often with NVIDIA. Start it with one
of these and see which helps:

```sh
WEBKIT_DISABLE_DMABUF_RENDERER=1 stabileo
WEBKIT_DISABLE_COMPOSITING_MODE=1 stabileo
```

With the `.deb`, an old WebKitGTK is another cause: it needs `libwebkit2gtk-4.1` (Ubuntu 22.04,
Debian 12 or newer). The AppImage brings its own.

**Where the logs are.** Stabileo writes warnings and errors to `stabileo.log` (and the previous
one to `stabileo.old.log`):

- Windows: `%LOCALAPPDATA%\com.stabileo.desktop\logs` (paste it in the File Explorer address bar)
- macOS: `~/Library/Logs/com.stabileo.desktop` (Finder ▸ **Go** ▸ **Go to Folder...**)
- Linux: `~/.local/share/com.stabileo.desktop/logs`

**Reporting a problem.** In the app, **Help ▸ Report a Problem...** opens a new GitHub issue in your
browser with the app's version, engine and system already filled in. Say what you did, what you
expected and what happened; attach `stabileo.log` and, if you can, the `.ded` file. You need a
GitHub account to send it. **Help ▸ About Stabileo** (on macOS **Stabileo ▸ About Stabileo**) shows the
same details, with a button to copy them.

## Uninstalling

Uninstalling never touches your projects (`.ded` files).

- **Windows:** **Settings** ▸ **Apps** ▸ **Installed apps** ▸ **Stabileo** ▸ **Uninstall**.
- **macOS:** with Homebrew, `brew uninstall --cask stabileo` (add `--zap` to remove its settings and
  caches too). Otherwise drag **Stabileo** from Applications to the Trash.
- **Linux:** if you used the one-command install:

  ```sh
  curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh -s -- --uninstall
  ```

  For the `.deb`: `sudo apt remove stabileo`. For an AppImage you ran by hand, delete the file.
