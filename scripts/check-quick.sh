#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

dry=0
[ "${1:-}" = --dry-run ] && dry=1

if [ -n "${BASE:-}" ]; then
  base=$BASE
elif git rev-parse --verify --quiet origin/main >/dev/null; then
  base=$(git merge-base origin/main HEAD)
else
  echo "check.quick: no origin/main to compare against (git fetch origin, or BASE=<rev>)" >&2
  exit 2
fi

changed=$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)
touched() { printf '%s\n' "$changed" | grep -Eq "$1"; }

targets=(check.changelog check-pins check.test-targets)
touched '^engine/' && targets+=(lint.engine)
touched '^backend/' && targets+=(lint.backend)
touched '^(\.github/|scripts/|tools/)' && targets+=(test.ci-scripts)
web=0
touched '^web/' && web=1 && targets+=(typecheck.web)

echo "check.quick: $(printf '%s\n' "$changed" | grep -c . || true) changed file(s) since $(git rev-parse --short "$base")"
echo "check.quick: make ${targets[*]}"
[ "$web" = 1 ] && echo "check.quick: make wasm first (a copy when the engine was built before)"
echo "check.quick: then scripts/test-changed.sh --base $base"
[ "$dry" = 1 ] && exit 0

status=0
if [ "$web" = 1 ]; then
  make wasm || status=1
fi
make -k -j"${CHECK_QUICK_JOBS:-4}" --output-sync=target "${targets[@]}" || status=1
scripts/test-changed.sh --base "$base" || status=1
[ "$status" = 0 ] && echo "check.quick: ok" || echo "check.quick: failed (see above)" >&2
exit "$status"
