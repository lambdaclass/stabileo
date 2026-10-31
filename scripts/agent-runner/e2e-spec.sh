#!/usr/bin/env bash
# e2e-spec.sh <worktree> <spec...>: VITE_E2E build + the given Playwright specs (all projects that match), line reporter.
. "$(dirname "$0")/common.sh"
dir=$1; shift; name=$(basename "$dir"); out=$LOGS/e2e-$name.log
cd "$dir/web" || exit 1
nix develop ..#e2e -c bash -c "npx playwright test $* --reporter=line" > "$out" 2>&1
echo "$name e2e exit=$? $(grep -E '[0-9]+ (passed|failed|flaky)' "$out" | tr '\n' ' ')"
