#!/usr/bin/env bash
set -euo pipefail
base=${1:?usage: route-size-from-base.sh BASE_CHECKOUT CANDIDATE_CHECKOUT [--pr-allowances]}
candidate=${2:?usage: route-size-from-base.sh BASE_CHECKOUT CANDIDATE_CHECKOUT [--pr-allowances]}
dest=$candidate/web/.route-base
test -f "$base/web/scripts/check-research-route-size.mjs"
rm -rf "$dest"
mkdir -p "$dest"
cp -R "$base/web/scripts/." "$dest/"
if [ "${3:-}" = --pr-allowances ]; then
  cp "$candidate/web/scripts/research-route-allowances.json" "$dest/"
fi
echo "$dest"
