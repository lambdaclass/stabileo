#!/usr/bin/env bash
set -euo pipefail

base="${1:?usage: new-migrations.sh <base-ref>}"

git diff --name-only --diff-filter=A "$base...HEAD" -- 'backend/apps/*/priv/repo/migrations/*.exs' |
  sed 's|^backend/||'
