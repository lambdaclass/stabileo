#!/usr/bin/env bash
set -euo pipefail
base=$(realpath "${1:?base checkout}")
candidate=$(realpath "${2:?candidate checkout}")
if [[ -f "$base/web/scripts/route-locale-bytes.mjs" ]]; then
  exit 0
fi
scratch=$(mktemp -d "$base/web/.locale-budget.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
for file in check-research-route-size.mjs research-route-budget.mjs route-locale-bytes.mjs; do
  cp "$candidate/web/scripts/$file" "$scratch/"
done
(cd "$base/web" && node "$scratch/check-research-route-size.mjs" --baseline "$scratch/main.json" --update)
(cd "$candidate/web" && node scripts/check-research-route-size.mjs --baseline "$scratch/main.json")
