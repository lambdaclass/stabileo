#!/usr/bin/env bash
# render-prompt.sh <id>: the per-paper fix prompt for a Claude subagent (template + extra-<id>.txt).
. "$(dirname "$0")/common.sh"
id=$1; dir=$WT/rfix-$id; br=research/review-fixes-$id
sed -e "s|__W__|$dir|g" -e "s|__B__|$br|g" -e "s|__S__|$S|g" -e "s|__ID__|$id|g" -e "s|__ROADMAP__|$ROADMAP|g" "$ST/fixpaper-prompt-claude.txt"
[ -f "$Q/extra-$id.txt" ] && { echo; echo "Also for this paper:"; cat "$Q/extra-$id.txt"; }
