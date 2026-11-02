#!/usr/bin/env bash
# prep-existing.sh <worktree-dir>: node_modules from base + WASM/research WASM, for a worktree already checked out.
. "$(dirname "$0")/common.sh"
dir=$1; name=$(basename "$dir"); cd "$dir" || exit 1
if cmp -s web/package-lock.json "$WT/base/web/package-lock.json"; then
  [ -d web/node_modules ] || cp -R --reflink=auto "$WT/base/web/node_modules" web/
  deps=true
else
  deps='cd web && npm ci --no-audit --no-fund && cd ..'
fi
nix develop -c bash -c "$deps && scripts/wasm-cached.sh && make research.wasm NIX_RUN=" > "$LOGS/wasm-$name.log" 2>&1
rc=$?; echo "$name prep exit=$rc"; exit "$rc"
