#!/usr/bin/env bash
# review-diff.sh <pr> [focus-file]: Codex + Kimi review of a PR's diff against origin/main, the diff
# inlined in the prompt (no tools: Codex's sandbox cannot start on this host). Kimi falls back to Grok.
# Output: $ST/reviews/<pr>-<sha>-{codex,kimi}.md
set -uo pipefail
. "$(dirname "$0")/common.sh"
pr=$1; focus=${2:-}; R=$ST/reviews; mkdir -p "$R"
head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid -q '.headRefName+" "+.headRefOid')
branch=${head% *}; want=${head#* }
for i in $(seq 1 12); do head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid -q '.headRefName+" "+.headRefOid'); branch=${head% *}; want=${head#* }; git -C "$REPO" fetch origin main "+refs/heads/$branch:refs/rv/pr-$pr" >> "$LOGS/review-fetch.log" 2>&1 && [ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr")" = "$want" ] && break; sleep 15; done
sha=$(git -C "$REPO" rev-parse --short=10 "refs/rv/pr-$pr" 2>/dev/null) || sha=
[ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr" 2>/dev/null)" = "$want" ] || sha=
[ -n "$sha" ] || { echo "review-diff: could not fetch PR #$pr" >&2; exit 1; }
title=$(gh pr view "$pr" -R lambdaclass/stabileo --json title -q .title)
p=$R/$pr-$sha-prompt.md
{ echo "Review Stabileo PR #$pr ($title) at $sha. Stabileo is safety-critical structural-engineering software."
  echo "Do NOT run commands or tools: the full diff against origin/main is below. Report only real problems as Blockers and Should-fix (file:line, why, fix): wrong results or claims, tests that cannot fail, loosened tolerances/budgets, removed or weakened tests or assertions, i18n gaps, phone/tablet layout risks, research isolation breaks, production engine numeric changes, security. Then Nits (one line each). If clean, say so. Be concise."
  [ -n "$focus" ] && cat "$focus"
  echo; echo '```diff'; git -C "$REPO" diff "origin/main...refs/rv/pr-$pr" -- . ':!**/package-lock.json' ':!research/papers.json' ':!web/public/research-wasm/**' ':!web/legacy-projects/**' ':!**/__fixtures__/**'; echo '```'; } > "$p"
size=$(wc -c < "$p"); [ "$size" -gt 900000 ] && { echo "review-diff: #$pr prompt is $size bytes, switching to review-chunked.sh" >&2; exec "$(dirname "$0")/review-chunked.sh" "$pr"; }; [ "$size" -gt 3000 ] || { echo "review-diff: diff for #$pr is empty ($size bytes), not reviewing" >&2; exit 1; }; [ "$size" -gt 400000 ] && echo "warning: prompt is $size bytes" >&2
AUTHOR=${AUTHOR_ENGINE:-claude}
first=$(pick_engine review "$AUTHOR"); second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != none ] || { log "review-diff #$pr: no review engine available"; exit 75; }
log "review-diff #$pr $sha: author $AUTHOR, reviewers $first and ${second}"
( "$(dirname "$0")/run-engine.sh" "$first" review "$REPO" "$p" "$R/$pr-$sha-codex.md"; sed -i "1i FIRST REVIEWER: $first" "$R/$pr-$sha-codex.md" ) &
if [ "$second" != none ]; then
  ( "$(dirname "$0")/run-engine.sh" "$second" review "$REPO" "$p" "$R/$pr-$sha-kimi.md"; sed -i "1i SECOND REVIEWER: $second" "$R/$pr-$sha-kimi.md" ) &
else
  echo "SECOND REVIEWER: none available (only $first); review again when another engine is back" > "$R/$pr-$sha-kimi.md"
fi
wait
log "review-diff #$pr $sha: codex $(wc -l < "$R/$pr-$sha-codex.md") lines, second $(wc -l < "$R/$pr-$sha-kimi.md") lines"
echo "$R/$pr-$sha-codex.md $R/$pr-$sha-kimi.md"
