#!/usr/bin/env bash
# review-chunked.sh <pr> [max-bytes]: like review-diff.sh for diffs too large for one prompt: files are
# grouped by area (sorted path order) into chunks of at most max-bytes (default 150000), and each chunk
# gets Codex + the second reviewer (Grok reading the prompt file, else adversarial Codex). Every prompt
# carries the PR title and the complete file list. Output: $ST/reviews/<pr>-<sha>-c<i>-{codex,second}.md
set -uo pipefail
. "$(dirname "$0")/common.sh"
AUTHOR=${AUTHOR_ENGINE:-claude}
first=${REVIEW_FIRST_ENGINE:-$(pick_engine review "$AUTHOR")}; second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != "$AUTHOR" ] || { log "$(basename "$0"): reviewer $first is the author"; exit 2; }
[ "$first" != none ] || { log "$(basename "$0"): no review engine available"; exit 75; }
pr=$1; max=${2:-150000}; R=$ST/reviews; mkdir -p "$R"
head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid,title -q '.headRefName+" "+.headRefOid+" "+.title')
branch=$(echo "$head" | cut -d' ' -f1); want=$(echo "$head" | cut -d' ' -f2); title=$(echo "$head" | cut -d' ' -f3-)
want=${REVIEW_HEAD:-$want}
if [ -n "${REVIEW_HEAD:-}" ]; then
  git -C "$REPO" cat-file -e "$want^{commit}" || { echo "review-chunked: pinned head $want is not available" >&2; exit 1; }
else
  for i in 1 2 3 4 5 6; do git -C "$REPO" fetch origin main "+refs/pull/$pr/head:refs/rv/pr-$pr" >> "$LOGS/review-fetch.log" 2>&1 && [ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr")" = "$want" ] && break; sleep 15; done
  [ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr" 2>/dev/null)" = "$want" ] || { echo "review-chunked: could not fetch PR #$pr" >&2; exit 1; }
fi
sha=${want:0:10}
exec 9>"$R/.lock-$pr-$sha"
flock -n 9 || { echo "review-chunked: a review of #$pr at $sha is already running" >&2; exit 75; }
T=$(mktemp -d "$R/.run-$pr-$sha.XXXXXX")
trap 'rc=$?; for f in "$T"/*; do [ -e "$f" ] || continue; case $rc in 0|75) mv -f "$f" "$R/";; *) mv -f "$f" "$R/$(basename "$f").failed";; esac; done; rmdir "$T" 2>/dev/null' EXIT
range="${REVIEW_BASE:-$(git -C "$REPO" rev-parse origin/main)}...$want"
names=$(mktemp); git -C "$REPO" diff -z --name-only "$range" -- . ':!**/package-lock.json' ':!research/papers.json' ':!web/public/research-wasm/**' ':!web/legacy-projects/**' > "$names" || { rm -f "$names"; echo "review-chunked: git diff failed for #$pr" >&2; exit 1; }
mapfile -d '' -t files < "$names"; rm -f "$names"
[ "${#files[@]}" -gt 0 ] || { echo "review-chunked: #$pr has no changes against main" >&2; exit 1; }
filelist=$(git -C "$REPO" diff --stat=200 "$range" -- . ':!**/package-lock.json' ':!research/papers.json' | tail -400)
chunk=1; cur=0; : > "$T/$pr-$sha-c$chunk.files"
for f in "${files[@]}"; do
  n=$(git -C "$REPO" diff "$range" -- "$f" | wc -c); [ "${PIPESTATUS[0]}" = 0 ] || exit 1
  if [ $((cur + n)) -gt "$max" ] && [ "$cur" -gt 0 ]; then chunk=$((chunk + 1)); cur=0; : > "$T/$pr-$sha-c$chunk.files"; fi
  printf '%s\0' "$f" >> "$T/$pr-$sha-c$chunk.files"; cur=$((cur + n))
done
echo "review-chunked #$pr $sha: $chunk chunks"
for c in $(seq 1 "$chunk"); do
  p=$T/$pr-$sha-c$c-prompt.md
  { echo "Review part $c of $chunk of Stabileo PR #$pr ($title) at $sha. Stabileo is safety-critical structural-engineering software."
    echo "Do NOT run commands or tools. Below: the complete list of changed files (for context), then the full diff of THIS PART's files only. Review this part; use the file list only to understand context, and don't report 'unseen file' issues. Report only real problems as Blockers and Should-fix (file:line, why, fix): wrong results or claims, refusals/containment that can be bypassed or that refuse correct inputs, tests that cannot fail, loosened tolerances/budgets, removed or weakened tests or assertions, missing negative cases, i18n gaps, security. Then Nits (one line each). If clean, say so. Be concise. End with one line: \"VERDICT: clean\", \"VERDICT: should-fix\" or \"VERDICT: blocker\"."
    echo; echo "Changed files:"; echo "$filelist"; echo; echo '```diff'; mapfile -d '' -t part < "$T/$pr-$sha-c$c.files"; git -C "$REPO" diff "$range" -- "${part[@]}" || exit 1; echo '```'; } > "$p" || { echo "review-chunked: could not build chunk $c for #$pr" >&2; exit 1; }
  ( "$(dirname "$0")/run-engine.sh" "$first" review "$REPO" "$p" "$T/$pr-$sha-c$c-codex.md"; rc=$?; sed -i "1i FIRST REVIEWER: $first at $want" "$T/$pr-$sha-c$c-codex.md"; exit $rc ) & p1=$!
  ( if [ "$second" != none ]; then "$(dirname "$0")/run-engine.sh" "$second" review "$REPO" "$p" "$T/$pr-$sha-c$c-second.md"; rc=$?; sed -i "1i SECOND REVIEWER: $second at $want" "$T/$pr-$sha-c$c-second.md"; exit $rc; else echo "SECOND REVIEWER: none available" > "$T/$pr-$sha-c$c-second.md"; fi ) & p2=$!
  wait "$p1"; rc1=$?; wait "$p2"; rc2=$?
  [ "$rc1" = 0 ] && [ "$rc2" = 0 ] || { log "review-chunked #$pr chunk $c: reviewer exit codes $rc1/$rc2"; exit 1; }
  for f in "$T/$pr-$sha-c$c-codex.md" "$T/$pr-$sha-c$c-second.md"; do
    case "$(head -1 "$f")" in *"none available"*) continue;; esac
    grep -v '^[[:space:]]*$' "$f" | tail -1 | grep -qixE '[*_ ]*VERDICT:[*_ ]*(clean|should-fix|blocker)[*_ .]*' || { log "review-chunked #$pr chunk $c: incomplete review in $f"; exit 1; }
  done
done
[ "$second" != none ] || { log "review-chunked #$pr: only one reviewer available"; exit 75; }
log "review-chunked #$pr $sha: $chunk chunks done"
for f in "$T/$pr-$sha-c"*-{codex,second}.md; do echo "$R/${f##*/}"; done
