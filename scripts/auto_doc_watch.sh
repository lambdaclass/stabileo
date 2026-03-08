#!/bin/zsh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$REPO/.doc-sync-last-head"
LOG_FILE="$REPO/.doc-sync.log"

cd "$REPO"

touch "$LOG_FILE"
[[ -f "$STATE_FILE" ]] || git rev-parse HEAD > "$STATE_FILE"

while true; do
  {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] tick"

    if [[ -n "$(git status --porcelain)" ]]; then
      echo "skip: dirty worktree"
      sleep 600
      continue
    fi

    git pull --rebase origin main || {
      echo "skip: git pull failed"
      sleep 600
      continue
    }

    CURRENT_HEAD="$(git rev-parse HEAD)"
    LAST_HEAD="$(cat "$STATE_FILE")"

    if [[ "$CURRENT_HEAD" == "$LAST_HEAD" ]]; then
      echo "no new commits"
      sleep 600
      continue
    fi

    python3 scripts/sync_solver_docs.py

    if [[ -n "$(git status --porcelain -- BENCHMARKS.md README.md engine/README.md)" ]]; then
      git add BENCHMARKS.md README.md engine/README.md
      git commit -m "Refresh benchmark and README status"
      git push
      CURRENT_HEAD="$(git rev-parse HEAD)"
      echo "$CURRENT_HEAD" > "$STATE_FILE"
      echo "docs refreshed and pushed"
    else
      echo "$CURRENT_HEAD" > "$STATE_FILE"
      echo "no doc changes needed"
    fi

    sleep 600
  } >> "$LOG_FILE" 2>&1
done
