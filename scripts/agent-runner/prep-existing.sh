#!/usr/bin/env bash
# prep-existing.sh <worktree-dir>: node_modules from base + WASM/research WASM, for a worktree already checked out.
. "$(dirname "$0")/common.sh"
dir=$1; name=$(basename "$dir"); cd "$dir" || exit 1
[ -d web/node_modules ] || cp -R --reflink=auto "$WT/base/web/node_modules" web/
nix develop -c bash -c 'scripts/wasm-cached.sh && make research.wasm NIX_RUN=' > "$LOGS/wasm-$name.log" 2>&1
rc=$?; echo "$name prep exit=$rc"; exit "$rc"
