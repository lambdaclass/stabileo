#!/usr/bin/env bash
# A new worktree, ready to test in seconds: `make worktree NAME=fix-x [BASE=main]`.
#
#   ../stabileo-<name> on a new branch <name> from origin/<base>;
#   web/node_modules cloned from any checkout of the repository whose lockfile matches (an APFS/reflink copy:
#   instant, no extra disk), otherwise `npm ci --prefer-offline`;
#   the WASM engine from scripts/wasm-cached.sh (a copy when the engine sources were built before).
#
# Cargo builds are shared through sccache (the nix devShell sets RUSTC_WRAPPER), so the new
# worktree does not recompile every dependency either.
set -euo pipefail

name=${1:?usage: scripts/worktree.sh <name> [base]}
base=${2:-main}
main=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
dir=$(dirname "$main")/stabileo-$name
start=$(date +%s)
here=$(cd "$(dirname "$0")" && pwd)

git -C "$main" fetch -q origin "$base"
git -C "$main" worktree add -q -b "$name" "$dir" "origin/$base"

# Any checkout of this repository (the main one or another worktree) whose lockfile matches.
src=
while IFS= read -r w; do
  [ "$w" = "$dir" ] && continue
  if [ -d "$w/web/node_modules" ] && cmp -s "$w/web/package-lock.json" "$dir/web/package-lock.json"; then src=$w; break; fi
done < <(git -C "$main" worktree list --porcelain | sed -n 's/^worktree //p')

if [ -n "$src" ]; then
  # -c: clonefile on macOS; --reflink=auto elsewhere (a plain copy where it is not supported).
  cp -cR "$src/web/node_modules" "$dir/web/" 2>/dev/null || cp -R --reflink=auto "$src/web/node_modules" "$dir/web/"
  echo "node_modules: cloned from $src"
else
  (cd "$dir/web" && npm ci --prefer-offline --no-audit --no-fund >/dev/null)
  echo "node_modules: npm ci"
fi

if command -v wasm-pack >/dev/null 2>&1; then
  (cd "$dir" && "$here/wasm-cached.sh")
else
  (cd "$dir" && nix develop --command "$here/wasm-cached.sh" 2>&1 | tail -1)
fi

echo "ready in $(( $(date +%s) - start )) s: $dir (branch $name)"
