#!/usr/bin/env bash
# brief.sh <worktree> <brief-file>: Codex (workspace-write, inside nix develop .#e2e) with a one-off brief.
. "$(dirname "$0")/common.sh"
dir=$1; brief=$2; name=$(basename "$dir")
p=$(sed -e "s|__W__|$dir|g" -e "s|__LOG__|$LOGS/e2e-$name.log|g" "$brief")
cd "$dir" && nix develop .#e2e -c codex exec -s workspace-write -c sandbox_workspace_write.network_access=true --skip-git-repo-check -C "$dir" "$p" < /dev/null > "$LOGS/brief-$name.out" 2> "$LOGS/brief-$name.err"
log "brief $name: codex exit=$?, $(git status --short | wc -l) files changed"
