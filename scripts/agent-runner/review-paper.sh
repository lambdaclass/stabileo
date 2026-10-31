#!/usr/bin/env bash
# review-paper.sh <id>: final Codex + Grok review of one paper's current main code (paper-files.tsv);
# Kimi is added when its quota is back (recorded in queue/kimi-owed.txt).
. "$(dirname "$0")/common.sh"
id=$1; files=$(awk -F'\t' -v id="$id" '$1==id{print $2}' "$Q/paper-files.tsv")
[ -n "$files" ] || { echo "no files for $id" >&2; exit 1; }
git -C "$WT/base" fetch -q origin main && git -C "$WT/base" checkout -q --detach origin/main
"$(dirname "$0")/review-files.sh" "paper-$id" "$Q/paper-review-instructions.md" $files
grep -qx "paper-$id" "$Q/kimi-owed.txt" 2>/dev/null || echo "paper-$id" >> "$Q/kimi-owed.txt"
