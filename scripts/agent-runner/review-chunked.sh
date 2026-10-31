#!/usr/bin/env bash
# review-chunked.sh <pr> [max-bytes]: like review-diff.sh for diffs too large for one prompt: files are
# grouped by area (sorted path order) into chunks of at most max-bytes (default 150000), and each chunk
# gets Codex + the second reviewer (Grok reading the prompt file, else adversarial Codex). Every prompt
# carries the PR title and the complete file list. Output: $ST/reviews/<pr>-<sha>-c<i>-{codex,second}.md
set -uo pipefail
. "$(dirname "$0")/common.sh"
AUTHOR=${AUTHOR_ENGINE:-claude}
first=$(pick_engine review "$AUTHOR"); second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != none ] || { log "$(basename "$0"): no review engine available"; exit 75; }
pr=$1; max=${2:-150000}; R=$ST/reviews; mkdir -p "$R"
head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid,title -q '.headRefName+" "+.headRefOid+" "+.title')
branch=$(echo "$head" | cut -d' ' -f1); want=$(echo "$head" | cut -d' ' -f2); title=$(echo "$head" | cut -d' ' -f3-)
for i in 1 2 3 4 5 6; do git -C "$REPO" fetch origin main "+refs/heads/$branch:refs/rv/pr-$pr" >> "$LOGS/review-fetch.log" 2>&1 && [ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr")" = "$want" ] && break; sleep 15; done
[ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr" 2>/dev/null)" = "$want" ] || { echo "review-chunked: could not fetch PR #$pr" >&2; exit 1; }
sha=${want:0:10}; range="origin/main...refs/rv/pr-$pr"
files=$(git -C "$REPO" diff --name-only "$range" -- . ':!**/package-lock.json' ':!research/papers.json' ':!web/public/research-wasm/**' ':!web/legacy-projects/**' ':!**/__fixtures__/**')
filelist=$(git -C "$REPO" diff --stat=200 "$range" -- . ':!**/package-lock.json' ':!research/papers.json' | tail -400)
chunk=1; cur=0; : > "$R/$pr-$sha-c$chunk.files"
for f in $files; do
  n=$(git -C "$REPO" diff "$range" -- "$f" | wc -c)
  if [ $((cur + n)) -gt "$max" ] && [ "$cur" -gt 0 ]; then chunk=$((chunk + 1)); cur=0; : > "$R/$pr-$sha-c$chunk.files"; fi
  echo "$f" >> "$R/$pr-$sha-c$chunk.files"; cur=$((cur + n))
done
echo "review-chunked #$pr $sha: $chunk chunks"
for c in $(seq 1 "$chunk"); do
  p=$R/$pr-$sha-c$c-prompt.md
  { echo "Review part $c of $chunk of Stabileo PR #$pr ($title) at $sha. Stabileo is safety-critical structural-engineering software."
    echo "Do NOT run commands or tools. Below: the complete list of changed files (for context), then the full diff of THIS PART's files only. Review this part; use the file list only to understand context, and don't report 'unseen file' issues. Report only real problems as Blockers and Should-fix (file:line, why, fix): wrong results or claims, refusals/containment that can be bypassed or that refuse correct inputs, tests that cannot fail, loosened tolerances/budgets, removed or weakened tests or assertions, missing negative cases, i18n gaps, security. Then Nits (one line each). If clean, say so. Be concise."
    echo; echo "Changed files:"; echo "$filelist"; echo; echo '```diff'; git -C "$REPO" diff "$range" -- $(cat "$R/$pr-$sha-c$c.files"); echo '```'; } > "$p"
  ( "$(dirname "$0")/run-engine.sh" "$first" review "$REPO" "$p" "$R/$pr-$sha-c$c-codex.md" ) &
  ( if [ "$second" != none ]; then "$(dirname "$0")/run-engine.sh" "$second" review "$REPO" "$p" "$R/$pr-$sha-c$c-second.md"; sed -i "1i SECOND REVIEWER: $second" "$R/$pr-$sha-c$c-second.md"; else echo "SECOND REVIEWER: none available" > "$R/$pr-$sha-c$c-second.md"; fi ) &
  wait
done
log "review-chunked #$pr $sha: $chunk chunks done"
ls "$R/$pr-$sha-"c*-{codex,second}.md
