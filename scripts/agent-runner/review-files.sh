#!/usr/bin/env bash
# review-files.sh <name> <instructions-file> <path...>: Codex + Grok review of the CURRENT content of
# the given files in $WT/base (origin/main), inlined in the prompt (no tools needed by Codex).
# Output: $ST/reviews/<name>-<sha>-{codex,grok}.md
set -uo pipefail
BIN=$(cd "$(dirname "$0")" && pwd); . "$BIN/common.sh"
AUTHOR=${AUTHOR_ENGINE:-claude}
first=${REVIEW_FIRST_ENGINE:-$(pick_engine review "$AUTHOR")}; second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != "$AUTHOR" ] || { log "$(basename "$0"): reviewer $first is the author"; exit 2; }
[ "$first" != none ] || { log "$(basename "$0"): no review engine available"; exit 75; }
name=$1; instr=$2; shift 2; R=$ST/reviews; mkdir -p "$R"
cd "$WT/base" || exit 1
full=$(git rev-parse HEAD); sha=${full:0:10}
exec 9>"$R/.lock-$name-$sha"
flock -n 9 || { echo "review-files: a review of $name at $sha is already running" >&2; exit 75; }
T=$(mktemp -d "$R/.run-$name-$sha.XXXXXX")
trap 'rc=$?; for f in "$T"/*; do [ -e "$f" ] || continue; case $rc in 0|75) mv -f "$f" "$R/";; *) mv -f "$f" "$R/$(basename "$f").failed";; esac; done; rmdir "$T" 2>/dev/null' EXIT
p=$T/$name-$sha-prompt.md
mapfile -d '' -t paths < <(git ls-tree -r -z --name-only "$full" -- "$@")
[ "${#paths[@]}" -gt 0 ] || { echo "review-files $name: no files at $full match $*" >&2; exit 1; }
{ cat "$instr"; echo; echo 'End with one line: "VERDICT: clean", "VERDICT: should-fix" or "VERDICT: blocker".'; echo; echo "Repository: lambdaclass/stabileo at $sha. The files under review follow, each fenced with its path."
  for f in "${paths[@]}"; do echo; echo "===== $f"; echo '```'; git show "$full:$f" || exit 1; echo '```'; done; } > "$p" || { echo "review-files $name: could not read the files at $full" >&2; exit 1; }
size=$(wc -c < "$p"); echo "review-files $name: $size bytes"
[ "$size" -lt 950000 ] || { echo "too large for one prompt" >&2; exit 1; }
( "$BIN/run-engine.sh" "$first" review "$WT/base" "$p" "$T/$name-$sha-codex.md"; rc=$?; sed -i "1i FIRST REVIEWER: $first at $full" "$T/$name-$sha-codex.md"; exit $rc ) & p1=$!
if [ "$second" != none ]; then ( "$BIN/run-engine.sh" "$second" review "$WT/base" "$p" "$T/$name-$sha-grok.md"; rc=$?; sed -i "1i SECOND REVIEWER: $second at $full" "$T/$name-$sha-grok.md"; exit $rc ) & p2=$!; else p2=; fi
wait "$p1"; rc1=$?; rc2=0; [ -n "$p2" ] && { wait "$p2"; rc2=$?; }
[ "$rc1" = 0 ] && [ "$rc2" = 0 ] || { log "review-files $name: reviewer exit codes $rc1/$rc2"; exit 1; }
for f in "$T/$name-$sha-codex.md" ${p2:+"$T/$name-$sha-grok.md"}; do
  grep -v '^[[:space:]]*$' "$f" | tail -1 | grep -qixE '[*_ ]*VERDICT:[*_ ]*(clean|should-fix|blocker)[*_ .]*' || { log "review-files $name: incomplete review in $f"; exit 1; }
done
[ -n "$p2" ] || { log "review-files $name: only one reviewer available"; exit 75; }
log "review-files $name $sha: codex $(wc -l < "$T/$name-$sha-codex.md") lines, grok $(wc -l < "$T/$name-$sha-grok.md") lines"
echo "$R/$name-$sha-codex.md $R/$name-$sha-grok.md"
