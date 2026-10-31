#!/usr/bin/env bash
# screen-diff.sh <worktree> [base]: flags what an agent must never do — removed tests, loosened
# tolerances/budgets, skips, slow-ok escapes, isolation-check edits, engine numerics changes.
dir=${1:?}; base=${2:-origin/main}
cd "$dir" || exit 1
d=$(git diff "$base" -- . ':!**/package-lock.json')
echo "files: $(git diff --name-only "$base" | wc -l)"
echo "--- removed tests:"; echo "$d" | grep -E '^-[^-].*(\bit\(|\btest\(|#\[test\]|describe\(|fn test_)' | head -20
echo "--- skips/only/slow-ok added:"; echo "$d" | grep -E '^\+[^+].*(\.skip\(|\.only\(|\.fixme\(|#\[ignore\]|slow-ok|test\.slow)' | head -20
echo "--- tolerance/budget lines changed:"; echo "$d" | grep -E '^[-+][^-+].*(toBeCloseTo|toBeLessThan|toBeGreaterThan|tol\b|tolerance|TOL|epsilon|budget|timeout|rtol|atol|assert.*<)' | head -40
echo "--- isolation / engine / CI paths touched:"; git diff --name-only "$base" | grep -E '^(engine/|\.github/|scripts/check-research|web/scripts/check-research|.*isolation)' | head
