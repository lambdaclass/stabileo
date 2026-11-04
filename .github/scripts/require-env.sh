#!/usr/bin/env bash
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: require-env.sh <NAME>..." >&2; exit 2; }

missing=()
for name in "$@"; do
  [ -n "${!name:-}" ] || missing+=("$name")
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "All required settings are present: $*"
  exit 0
fi

echo "::error::Missing repository or environment settings: ${missing[*]}. See docs/DEPLOY.md." >&2
exit 1
