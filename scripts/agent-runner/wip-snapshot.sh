#!/usr/bin/env bash
# wip-snapshot.sh <worktree...>: pushes a SIGNED snapshot of each worktree's uncommitted work to
# wip/<branch>-live without touching its index or files (a temporary index + commit-tree -S), so work
# an agent is still editing is safe on the remote and never lands on the PR branch unscreened.
. "$(dirname "$0")/common.sh"
for p in "$@"; do
  b=$(git -C "$p" branch --show-current) || continue
  [ -n "$(git -C "$p" status --porcelain)" ] || { echo "$p: clean"; continue; }
  idx=$(mktemp); cp "$(git -C "$p" rev-parse --git-dir)/index" "$idx"
  GIT_INDEX_FILE=$idx git -C "$p" add -A
  t=$(GIT_INDEX_FILE=$idx git -C "$p" write-tree); rm -f "$idx"
  c=$(git -C "$p" commit-tree -S -p HEAD -m "WIP snapshot of $(basename "$p") (agent still working; unscreened)" "$t")
  git -C "$p" push -q -f origin "$c:refs/heads/wip/${b//\//-}-live" && log "wip-snapshot $(basename "$p") -> wip/${b//\//-}-live ${c:0:9}"
done
