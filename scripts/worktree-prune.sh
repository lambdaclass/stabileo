#!/usr/bin/env bash
# Remove the worktrees that are done: clean, and whose commit is already on origin/main.
# Never forces: a worktree with any change or untracked file stays, and is listed. The main
# checkout and branches are never touched.
set -euo pipefail

main=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
git -C "$main" fetch -q origin main

removed=0
while IFS=$'\t' read -r dir head; do
  [ "$dir" = "$main" ] && continue
  git -C "$main" merge-base --is-ancestor "$head" origin/main 2>/dev/null || continue
  if git -C "$main" worktree remove "$dir" 2>/dev/null; then
    removed=$((removed + 1))
  else
    echo "kept (has changes): $dir"
  fi
done < <(git -C "$main" worktree list --porcelain | awk '/^worktree /{w=$2} /^HEAD /{print w "\t" $2}')
git -C "$main" worktree prune
echo "removed $removed worktree(s)"
