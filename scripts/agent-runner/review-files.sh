#!/usr/bin/env bash
# review-files.sh <name> <instructions-file> <path...>: Codex + Grok review of the CURRENT content of
# the given files in $WT/base (origin/main), inlined in the prompt (no tools needed by Codex).
# Output: $ST/reviews/<name>-<sha>-{codex,grok}.md
set -uo pipefail
. "$(dirname "$0")/common.sh"
AUTHOR=${AUTHOR_ENGINE:-claude}
first=$(pick_engine review "$AUTHOR"); second=$(pick_engine review "$AUTHOR" "$first")
[ "$first" != none ] || { log "$(basename "$0"): no review engine available"; exit 75; }
name=$1; instr=$2; shift 2; R=$ST/reviews; mkdir -p "$R"
cd "$WT/base" || exit 1
sha=$(git rev-parse --short=10 HEAD); p=$R/$name-$sha-prompt.md
{ cat "$instr"; echo; echo "Repository: lambdaclass/stabileo at $sha. The files under review follow, each fenced with its path."
  for f in $(git ls-files -- "$@"); do echo; echo "===== $f"; echo '```'; cat "$f"; echo '```'; done; } > "$p"
size=$(wc -c < "$p"); echo "review-files $name: $size bytes"
[ "$size" -lt 950000 ] || { echo "too large for one prompt" >&2; exit 1; }
( "$(dirname "$0")/run-engine.sh" "$first" review "$WT/base" "$p" "$R/$name-$sha-codex.md" ) &
( [ "$second" != none ] && "$(dirname "$0")/run-engine.sh" "$second" review "$WT/base" "$p" "$R/$name-$sha-grok.md" ) &
wait
log "review-files $name $sha: codex $(wc -l < "$R/$name-$sha-codex.md") lines, grok $(wc -l < "$R/$name-$sha-grok.md") lines"
echo "$R/$name-$sha-codex.md $R/$name-$sha-grok.md"
