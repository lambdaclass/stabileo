#!/usr/bin/env bash
set -eu
if [ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" = 1 ]; then
  exit 0
fi
case "${PLAYWRIGHT_BROWSERS_PATH:-}" in
  '') dest=${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright ;;
  0) dest=$PWD/node_modules/playwright-core/.local-browsers ;;
  *) dest=$PLAYWRIGHT_BROWSERS_PATH ;;
esac
dest=$(realpath -m -- "$dest")
case "$dest" in
  /nix/store|/nix/store/*)
    echo "Playwright browsers would be written into the Nix store ($dest); not installing" >&2
    exit 0
    ;;
esac
exec npx playwright install "$@"
