#!/usr/bin/env bash
set -eu
if [ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" = 1 ]; then
  exit 0
fi
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  dest=$(realpath -m -- "$PLAYWRIGHT_BROWSERS_PATH")
  case "$dest" in
    /nix/store|/nix/store/*)
      echo "Playwright browsers come from the Nix store ($dest); not installing" >&2
      exit 0
      ;;
  esac
fi
exec npx playwright install "$@"
