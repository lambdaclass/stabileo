#!/usr/bin/env bash
set -eu
if [ "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" = 1 ]; then
  exit 0
fi
case "${PLAYWRIGHT_BROWSERS_PATH:-}" in
  /nix/store/*)
    echo "Playwright browsers come from the Nix store ($PLAYWRIGHT_BROWSERS_PATH); not installing" >&2
    exit 0
    ;;
esac
exec npx playwright install "$@"
