#!/usr/bin/env bash
set -euo pipefail
base=$(realpath "${1:?base checkout}")
candidate=$(realpath "${2:?candidate checkout}")
if grep -Fq 'version: 3, routes: measured' "$base/web/scripts/check-research-route-size.mjs"; then
  exit 0
fi
: "${METER_REV:?a reviewed meter revision is required}"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
git -C "$candidate" archive "$METER_REV" web/scripts web/package.json web/package-lock.json web/src | tar -x -C "$scratch"
"$candidate/.github/scripts/retry-infra.sh" npm ci --prefix "$scratch/web"
node --test "$scratch/web/scripts/research-route-meter.test.mjs"
for meter in "$scratch/web/scripts/check-research-route-size.mjs" "$candidate/web/scripts/check-research-route-size.mjs"; do
  (cd "$base/web" && node "$meter" --baseline "$scratch/main.json" --update)
  (cd "$candidate/web" && node "$meter" --baseline "$scratch/main.json")
done
