#!/usr/bin/env bash
# fixpaper.sh <id>: research/review-fixes-<id> (from its wip/ branch when one exists, else origin/main),
# origin/main merged in, prepared, then the per-paper fix prompt on the first available write engine
# (claude, codex, kimi, grok; engines.py). Research is a fallback scope, so any engine may write it.
# The engine edits files only; I screen (screen-diff.sh), test, commit signed and push.
set -uo pipefail
. "$(dirname "$0")/common.sh"
id=$1; br=research/review-fixes-$id; name=rfix-$id; dir=$WT/$name; scope=${SCOPE:-research}
engine=${ENGINE:-$(pick_engine write)}
[ "$engine" != none ] || { log "fixpaper $id: no write engine available, left in the queue"; exit 75; }
scope_allows "$engine" "$scope" || { log "fixpaper $id: scope $scope waits for claude (picked $engine)"; exit 75; }
start=origin/main
git -C "$REPO" ls-remote --exit-code --heads origin "wip/review-fixes-$id" >/dev/null 2>&1 && {
  git -C "$REPO" fetch -q origin "+refs/heads/wip/review-fixes-$id:refs/remotes/origin/wip/review-fixes-$id"; start=origin/wip/review-fixes-$id; }
log "fixpaper $id: start ($start) with $engine"
if [ "${DRY_RUN:-0}" != 1 ]; then
  "$(dirname "$0")/prep-wt.sh" "$name" "$br" "$start" || { log "fixpaper $id: prep failed"; exit 1; }
  cd "$dir" && git merge -q --no-edit origin/main >/dev/null 2>&1 || { log "fixpaper $id: merge conflict with main, left for me"; exit 2; }
fi
p=$LOGS/rfix-$id.prompt; "$(dirname "$0")/render-prompt.sh" "$id" > "$p"
"$(dirname "$0")/run-engine.sh" "$engine" write "${dir}" "$p" "$LOGS/rfix-$id.out"
rc=$?; log "fixpaper $id: $engine exit=$rc"; exit $rc
