#!/usr/bin/env bash
# The operational trusted set excludes these external authors and Dependabot.
set -euo pipefail
gh pr list --state open --limit 10000 \
  --json number,title,author,isDraft,mergeStateStatus,autoMergeRequest,statusCheckRollup \
  --jq '
  def failed: (.conclusion // .state) as $s |
    ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"] | index($s) != null;
  def pending: if .__typename == "StatusContext" then .state == "PENDING"
    else .status != "COMPLETED" end;
  ["PR", "TITLE", "STATE", "MERGE", "AUTO-MERGE", "FAILING CHECKS", "PENDING"],
  (.[] | select((.author.login | ascii_downcase) as $a |
    (["dimank92", "brayaniglesias08", "dependabot", "dependabot[bot]", "app/dependabot"] | index($a)) == null) |
    [.number, (.title | gsub("[\\t\\r\\n]"; " ") | .[0:60]),
     (if .isDraft then "draft" else "ready" end), .mergeStateStatus,
     (if .autoMergeRequest then "on" else "off" end),
     ([.statusCheckRollup[]? | select(failed) | (.name // .context)] | join(", ")),
     ([.statusCheckRollup[]? | select(pending)] | length)]) | @tsv'
