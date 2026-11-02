#!/usr/bin/env bash
# review-diff.sh <pr> [focus-file]: Codex + Kimi review of a PR's diff against origin/main, the diff
# inlined in the prompt (no tools: Codex's sandbox cannot start on this host). Kimi falls back to Grok.
# Output: $ST/reviews/<pr>-<sha>-{codex,kimi}.md
set -uo pipefail
. "$(dirname "$0")/common.sh"
pr=$1; focus=${2:-}; R=$ST/reviews; mkdir -p "$R"
head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid -q '.headRefName+" "+.headRefOid')
branch=${head% *}; want=${head#* }
for i in $(seq 1 12); do head=$(gh pr view "$pr" -R lambdaclass/stabileo --json headRefName,headRefOid -q '.headRefName+" "+.headRefOid'); branch=${head% *}; want=${head#* }; git -C "$REPO" fetch origin main "+refs/pull/$pr/head:refs/rv/pr-$pr" >> "$LOGS/review-fetch.log" 2>&1 && [ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr")" = "$want" ] && break; sleep 15; done
sha=$(git -C "$REPO" rev-parse --short=10 "refs/rv/pr-$pr" 2>/dev/null) || sha=
[ "$(git -C "$REPO" rev-parse "refs/rv/pr-$pr" 2>/dev/null)" = "$want" ] || sha=
[ -n "$sha" ] || { echo "review-diff: could not fetch PR #$pr" >&2; exit 1; }
base=$(git -C "$REPO" rev-parse origin/main)
title=$(gh pr view "$pr" -R lambdaclass/stabileo --json title -q .title)
exec 9>"$R/.lock-$pr-$sha"
flock -n 9 || { echo "review-diff: a review of #$pr at $sha is already running" >&2; exit 75; }
T=$(mktemp -d "$R/.run-$pr-$sha.XXXXXX")
trap 'rc=$?; for f in "$T"/*; do [ -e "$f" ] || continue; case $rc in 0|75) mv -f "$f" "$R/";; *) mv -f "$f" "$R/$(basename "$f").failed";; esac; done; rmdir "$T" 2>/dev/null' EXIT
git -C "$REPO" merge-base "$base" "$want" >/dev/null || { echo "review-diff: no merge base for #$pr at $sha" >&2; exit 1; }
diff=$T/$pr-$sha.diff
git -C "$REPO" diff "$base...$want" -- . ':!**/package-lock.json' ':!research/papers.json' ':!web/public/research-wasm/**' ':!web/legacy-projects/**' > "$diff" || { echo "review-diff: git diff failed for #$pr" >&2; exit 1; }
p=$T/$pr-$sha-prompt.md
{ echo "Review Stabileo PR #$pr ($title) at $sha. Stabileo is safety-critical structural-engineering software."
  echo "Do NOT run commands or tools: the full diff against origin/main is below, except generated files (package-lock.json, research/papers.json, web/public/research-wasm/**, web/legacy-projects/**), whose sources are in the diff. Report only real problems as Blockers and Should-fix (file:line, why, fix): wrong results or claims, tests that cannot fail, loosened tolerances/budgets, removed or weakened tests or assertions, i18n gaps, phone/tablet layout risks, research isolation breaks, production engine numeric changes, security. Then Nits (one line each). If clean, say so. Be concise. End with one line: \"VERDICT: clean\", \"VERDICT: should-fix\" or \"VERDICT: blocker\"."
  [ -n "$focus" ] && cat "$focus"
  echo; echo '```diff'; cat "$diff"; echo '```'; } > "$p"; rm -f "$diff"
size=$(wc -c < "$p"); [ "$size" -gt 900000 ] && { echo "review-diff: #$pr prompt is $size bytes, switching to review-chunked.sh" >&2; rm -rf "$T"; trap - EXIT; REVIEW_HEAD=$want REVIEW_BASE=$base exec "$(dirname "$0")/review-chunked.sh" "$pr"; }; git -C "$REPO" diff --quiet "$base...$want" --; case $? in 1) ;; 0) echo "review-diff: #$pr has no changes against main, not reviewing" >&2; exit 1;; *) echo "review-diff: git diff failed for #$pr" >&2; exit 1;; esac; [ "$size" -gt 400000 ] && echo "warning: prompt is $size bytes" >&2
AUTHOR=${AUTHOR_ENGINE:-claude}
first=${REVIEW_FIRST_ENGINE:-$(pick_engine review "$AUTHOR")}; second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != "$AUTHOR" ] || { log "$(basename "$0"): reviewer $first is the author"; exit 2; }
[ "$first" != none ] || { log "review-diff #$pr: no review engine available"; exit 75; }
log "review-diff #$pr $sha: author $AUTHOR, reviewers $first and ${second}"
( "$(dirname "$0")/run-engine.sh" "$first" review "$REPO" "$p" "$T/$pr-$sha-codex.md"; rc=$?; sed -i "1i FIRST REVIEWER: $first" "$T/$pr-$sha-codex.md"; exit $rc ) & p1=$!
if [ "$second" != none ]; then
  ( "$(dirname "$0")/run-engine.sh" "$second" review "$REPO" "$p" "$T/$pr-$sha-kimi.md"; rc=$?; sed -i "1i SECOND REVIEWER: $second" "$T/$pr-$sha-kimi.md"; exit $rc ) & p2=$!
else
  echo "SECOND REVIEWER: none available (only $first); review again when another engine is back" > "$T/$pr-$sha-kimi.md"; p2=
fi
wait "$p1"; rc1=$?; rc2=0; [ -n "$p2" ] && { wait "$p2"; rc2=$?; }
[ "$rc1" = 0 ] && [ "$rc2" = 0 ] || { log "review-diff #$pr: reviewer exit codes $rc1/$rc2"; exit 1; }
for f in "$T/$pr-$sha-codex.md" "$T/$pr-$sha-kimi.md"; do
  case "$(head -1 "$f" 2>/dev/null)" in *"none available"*) continue;; esac
  grep -v '^[[:space:]]*$' "$f" 2>/dev/null | tail -1 | grep -qixE '[*_ ]*VERDICT:[*_ ]*(clean|should-fix|blocker)[*_ .]*' || { log "review-diff #$pr: incomplete review in $f (no final VERDICT line)"; exit 1; }
done
[ -n "$p2" ] || { log "review-diff #$pr: only one reviewer available"; exit 75; }
log "review-diff #$pr $sha: codex $(wc -l < "$T/$pr-$sha-codex.md") lines, second $(wc -l < "$T/$pr-$sha-kimi.md") lines"
echo "$R/$pr-$sha-codex.md $R/$pr-$sha-kimi.md"
