#!/usr/bin/env bash
set -euo pipefail

checker="$(dirname "$0")/revert-check.py"

labels_of() {
  gh api "repos/$GH_REPO/pulls/$1" --jq '[.labels[].name] | join(",")'
}

case "$MODE" in
  pr)
    if ! labels=$(labels_of "$PR") && ! { sleep 5; labels=$(labels_of "$PR"); }; then
      echo "Couldn't read the labels of #$PR live; re-run this check. Until then a reverts-ok label does not count."
      labels=
    fi
    echo "Labels: $labels"
    LABELS=$labels exec python3 -B -I "$checker" "$BASE" "$HEAD" --event ''
    ;;
  queue)
    if ! [[ $QUEUE_BRANCH =~ ^gh-readonly-queue/[^/]+/pr-[0-9]+-([0-9a-f]{40})$ ]]; then
      echo "$QUEUE_BRANCH is not a merge queue branch, so the group's base is unknown."
      exit 1
    fi
    base=${BASH_REMATCH[1]}
    if ! git merge-base --is-ancestor "$base" "$HEAD"; then
      echo "$base, the base $QUEUE_BRANCH names, is not an ancestor of $HEAD."
      exit 1
    fi
    if [ "$(git rev-list --count "$base..$HEAD")" = 0 ]; then
      echo "$HEAD merges nothing onto $base."
      exit 1
    fi
    status=0
    for step in $(git rev-list --first-parent --reverse "$base..$HEAD"); do
      pr=$(git show -s --format=%s "$step" | sed -nE 's/^Merge pull request #([0-9]+) from .*/\1/p')
      if [ -z "$pr" ] || [ "$(gh api "repos/$GH_REPO/pulls/$pr" --jq .head.sha)" != "$(git rev-parse -q --verify "$step^2")" ]; then
        echo "$step is not the merge queue's merge of a pull request's current head, so whose acknowledgement applies is unknown."
        exit 1
      fi
      echo "Pull request #$pr:"
      labels=$(labels_of "$pr") || { echo "Couldn't read the labels of #$pr live; a reverts-ok label does not count."; labels=; }
      LABELS=$labels python3 -B -I "$checker" "$step^1" "$step^2" --event '' || status=1
    done
    exit "$status"
    ;;
  *)
    echo "MODE must be pr or queue, not '$MODE'."
    exit 2
    ;;
esac
