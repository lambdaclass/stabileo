#!/usr/bin/env bash
# After rebasing over the open paper PRs, restore their resolved papers.yaml and rerun
# this script to import their entries. Identical entries are skipped; conflicting edits
# stop without deleting the legacy file. Rerunning after success is a no-op.
# known_issues.rs contains executable predicates, not a list to migrate.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$root/scripts/split_registries.py"
