#!/bin/sh
# Install the Stabileo desktop app (Linux x86_64 AppImage, or macOS) from its newest prerelease:
#
#   curl -fsSL https://raw.githubusercontent.com/lambdaclass/stabileo/desktop-update-feed/install.sh | sh
#
# Linux: the AppImage goes to ~/.local/bin/stabileo, with a menu entry and .ded files opening in
# it; the app updates itself. macOS: Stabileo.app goes to /Applications (or ~/Applications).
# Every download is checked against the release's SHA256SUMS before anything is installed.
#
#   STABILEO_VERSION=0.1.0-alpha.1 sh install.sh    a given version instead of the newest
#   sh install.sh --uninstall                         remove what this script installed
set -eu

REPO=lambdaclass/stabileo
FEED=https://raw.githubusercontent.com/$REPO/desktop-update-feed/latest.json
BIN_DIR=${XDG_BIN_HOME:-$HOME/.local/bin}
DATA_DIR=${XDG_DATA_HOME:-$HOME/.local/share}

say() { printf '%s\n' "$*"; }
die() { printf 'stabileo install: %s\n' "$*" >&2; exit 1; }

fetch() { # url dest
	curl -fsSL --proto '=https' --tlsv1.2 --retry 3 -o "$2" "$1" || die "could not download $1"
}

sha256() {
	if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
	else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

uninstall() {
	case $(uname -s) in
	Linux)
		rm -f "$BIN_DIR/stabileo" "$DATA_DIR/applications/stabileo.desktop" \
			"$DATA_DIR/mime/packages/stabileo.xml" "$DATA_DIR/icons/hicolor/128x128/apps/stabileo.png"
		refresh_desktop ;;
	Darwin)
		for app in /Applications/Stabileo.app "$HOME/Applications/Stabileo.app"; do
			if [ -d "$app" ]; then rm -rf "$app"; fi
		done ;;
	esac
	say "Stabileo removed. Your projects (.ded files) were not touched."
}

refresh_desktop() {
	if command -v update-mime-database >/dev/null 2>&1; then update-mime-database "$DATA_DIR/mime" >/dev/null 2>&1 || true; fi
	if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$DATA_DIR/applications" >/dev/null 2>&1 || true; fi
	return 0
}

if [ "${1:-}" = "--uninstall" ]; then
	uninstall
	exit 0
fi

command -v curl >/dev/null 2>&1 || die "curl is required"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

VERSION=${STABILEO_VERSION:-}
if [ -z "$VERSION" ]; then
	fetch "$FEED" "$TMP/latest.json"
	VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$TMP/latest.json" | head -n 1)
	[ -n "$VERSION" ] || die "could not read the newest version from $FEED"
fi
case $VERSION in *[!0-9A-Za-z.-]*) die "unexpected version '$VERSION'" ;; esac
BASE=https://github.com/$REPO/releases/download/desktop-v$VERSION

case $(uname -s)-$(uname -m) in
Linux-x86_64 | Linux-amd64) FILE=Stabileo_${VERSION}_amd64.AppImage ;;
Darwin-*) FILE=Stabileo_${VERSION}_universal.dmg ;;
*) die "no Stabileo build for $(uname -s) $(uname -m) yet (Linux x86_64 and macOS only)" ;;
esac

say "Downloading Stabileo $VERSION ($FILE)…"
fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"
fetch "$BASE/$FILE" "$TMP/$FILE"
want=$(awk -v f="$FILE" '$2 == f || $2 == "*" f { print $1; exit }' "$TMP/SHA256SUMS")
[ -n "$want" ] || die "$FILE is not listed in SHA256SUMS"
got=$(sha256 "$TMP/$FILE")
[ "$want" = "$got" ] || die "checksum mismatch for $FILE (expected $want, got $got); nothing installed"
say "Checksum OK."

install_linux() {
	mkdir -p "$BIN_DIR" "$DATA_DIR/applications" "$DATA_DIR/mime/packages" "$DATA_DIR/icons/hicolor/128x128/apps"
	install -m 755 "$TMP/$FILE" "$BIN_DIR/stabileo"
	# The icon from the same tag as the release; a missing icon does not stop the install.
	curl -fsSL --proto '=https' -o "$DATA_DIR/icons/hicolor/128x128/apps/stabileo.png" \
		"https://raw.githubusercontent.com/$REPO/desktop-v$VERSION/desktop/src-tauri/icons/128x128.png" 2>/dev/null || true
	cat >"$DATA_DIR/mime/packages/stabileo.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-stabileo-project">
    <comment>Stabileo project</comment>
    <glob pattern="*.ded"/>
  </mime-type>
</mime-info>
EOF
	cat >"$DATA_DIR/applications/stabileo.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Stabileo
Comment=Structural analysis of 2D and 3D frames and trusses
Exec="$BIN_DIR/stabileo" %f
Icon=stabileo
Terminal=false
Categories=Science;Engineering;
MimeType=application/x-stabileo-project;
EOF
	refresh_desktop
	if command -v xdg-mime >/dev/null 2>&1; then xdg-mime default stabileo.desktop application/x-stabileo-project 2>/dev/null || true; fi
	say "Installed $BIN_DIR/stabileo (Stabileo $VERSION). It updates itself."
	case ":$PATH:" in *":$BIN_DIR:"*) ;; *) say "Add $BIN_DIR to your PATH to run 'stabileo' from a terminal." ;; esac
	if ! ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
		say "AppImages need FUSE 2: if Stabileo does not start, install it (Debian/Ubuntu: sudo apt install libfuse2)."
	fi
}

install_macos() {
	dest=/Applications
	[ -w "$dest" ] || { dest=$HOME/Applications; mkdir -p "$dest"; }
	mnt=$TMP/mnt
	mkdir -p "$mnt"
	hdiutil attach -nobrowse -readonly -quiet -mountpoint "$mnt" "$TMP/$FILE" || die "could not open $FILE"
	rm -rf "$dest/Stabileo.app"
	cp -R "$mnt/Stabileo.app" "$dest/" || { hdiutil detach -quiet "$mnt"; die "could not copy Stabileo.app to $dest"; }
	hdiutil detach -quiet "$mnt" || true
	say "Installed $dest/Stabileo.app (Stabileo $VERSION). It updates itself."
}

case $FILE in
*.AppImage) install_linux ;;
*.dmg) install_macos ;;
esac
