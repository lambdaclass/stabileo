#!/usr/bin/env bash
# prep-wt.sh <name> <branch> [start-ref]: worktree $WT/<name> on <branch> (the remote branch when it
# exists, else new from start-ref, default origin/main), node_modules cloned from $WT/base, WASM and
# research WASM built (WASM from the cache when the commit was built before).
set -euo pipefail
. "$(dirname "$0")/common.sh"
name=$1; br=$2; start=${3:-origin/main}; dir=$WT/$name
git -C "$REPO" fetch -q origin main
if [ ! -d "$dir" ]; then
  if git -C "$REPO" ls-remote --exit-code --heads origin "$br" >/dev/null; then
    git -C "$REPO" fetch -q origin "+refs/heads/$br:refs/remotes/origin/$br"
    git -C "$REPO" worktree add -q -B "$br" "$dir" "origin/$br"
  else
    git -C "$REPO" fetch -q origin "${start#origin/}" 2>/dev/null || true
    git -C "$REPO" worktree add -q -b "$br" "$dir" "$start"
  fi
  git -C "$dir" branch -q --set-upstream-to="origin/$br" 2>/dev/null || true
fi
cd "$dir"
if [ ! -d web/node_modules ]; then
  if cmp -s "$WT/base/web/package-lock.json" web/package-lock.json && [ -d "$WT/base/web/node_modules" ]; then
    cp -R --reflink=auto "$WT/base/web/node_modules" web/
  else
    nix develop -c bash -c 'cd web && npm ci --prefer-offline --no-audit --no-fund' >/dev/null
  fi
fi
nix develop -c bash -c 'scripts/wasm-cached.sh && make research.wasm NIX_RUN=' > "$LOGS/wasm-$name.log" 2>&1 \
  || { echo "prep-wt: WASM build failed, see $LOGS/wasm-$name.log" >&2; exit 1; }
echo "ready: $dir ($br)"
