#!/usr/bin/env bash
set -euo pipefail

rel="${1:?usage: release-store-paths.sh <release-dir>}"
[ -d "$rel/bin" ] || { echo "not a release (no bin/): $rel" >&2; exit 1; }

store='/nix/store/[a-z0-9]{32}-[A-Za-z0-9._+-]+'

paths=$(
  {
    grep -rhoE "$store" "$rel/bin" "$rel/releases" 2>/dev/null || true
    find "$rel" -type f \( -name '*.so' -o -name '*.so.*' -o -perm -u+x \) -print0 |
      xargs -0 ldd 2>/dev/null | grep -oE "$store" || true
  } | sort -u
)

if [ -z "$paths" ]; then
  echo "No /nix/store references in $rel; was it built outside Nix?" >&2
  exit 1
fi
echo "$paths"
