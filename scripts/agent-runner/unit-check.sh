#!/usr/bin/env bash
# unit-check.sh <worktree>: research + viewport unit tests, hardcoded-text, e2e policy, typecheck.
. "$(dirname "$0")/common.sh"
dir=$1; name=$(basename "$dir"); out=$LOGS/unit-$name.log
cd "$dir/web" || exit 1
nix develop -c bash -c '
  npx vitest run --project unit src/components/research src/components/viewport src/lib/i18n/__tests__/hardcoded-text.test.ts scripts/__tests__/e2e-policy.test.ts 2>&1 | tail -40; echo "VITEST=${PIPESTATUS[0]}"
  npm run typecheck 2>&1 | tail -15; echo "TYPECHECK=${PIPESTATUS[0]}"
  cd .. && python3 -I research/tools/catalog.py check --offline | tail -1' > "$out" 2>&1
echo "$name: $(grep -E '^(VITEST|TYPECHECK)=' "$out" | tr '\n' ' ') $(grep -E 'Tests +[0-9]' "$out" | tail -1)"
