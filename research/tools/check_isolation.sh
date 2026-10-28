#!/usr/bin/env bash
# Fails if the engine, its WASM glue in the web app, or the root Cargo workspace reach into research/.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
status=0
hits=$(git grep --untracked -n -I -E '(\.\./)+research/|["'\''(]/?research/|path *= *"[^"]*research' -- engine web/src/lib/engine Cargo.toml || true)
if [ -n "$hits" ]; then
  echo "engine/ or web/src/lib/engine refers to research/:"
  echo "$hits"
  status=1
fi
if grep -nE '^\s*"?research' Cargo.toml >/dev/null; then
  echo "research/ must not be a member of the root Cargo workspace"
  status=1
fi
for manifest in $(git ls-files 'research/**/Cargo.toml'); do
  if ! grep -qE '^\[workspace\]' "$manifest"; then
    echo "$manifest must declare its own [workspace] so it stays out of the root workspace"
    status=1
  fi
done
[ $status -eq 0 ] && echo "research isolation: ok"
exit $status
