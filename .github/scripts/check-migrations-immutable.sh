#!/usr/bin/env bash
set -euo pipefail

base="${1:?usage: check-migrations-immutable.sh <base-ref>}"

changes=$(git diff --name-status "$base...HEAD" -- 'backend/apps/*/priv/repo/migrations/*')
modified=$(grep '^[MRD]' <<<"$changes" || true)

if [ -z "$modified" ]; then
  echo "No existing migrations were modified."
  exit 0
fi

echo "::error::Already-existing migration files were modified. Migrations are immutable once committed." >&2
cat >&2 <<TXT

Modified migrations:
$modified

Migrations must NEVER be edited after they have been run in production.
Even comment-only changes break the immutable audit trail.
If you need to change database state, create a NEW migration instead.
TXT
exit 1
