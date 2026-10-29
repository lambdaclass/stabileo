#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 4 ] || { echo 'usage: record-review.sh <paper-id> <reviewer> <sha> <verdict>' >&2; exit 1; }
REPO=$(git rev-parse --show-toplevel)
exec python3 "$REPO/scripts/review/record_review.py" "$REPO" "$@"
