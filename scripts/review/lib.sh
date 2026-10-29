#!/usr/bin/env bash
# Shared Bash 3.2 review runner. Sourced by the two entry points.
review_die() { echo "review: $*" >&2; exit 1; }

review_cleanup() {
  local rc=$?
  trap - EXIT
  # Wait before removing the checkout, including when the foreground is interrupted.
  [ -z "${CODEX_PID:-}" ] || wait "$CODEX_PID" || :
  [ -z "${SECOND_PID:-}" ] || wait "$SECOND_PID" || :
  if [ -n "${WORKTREE:-}" ]; then
    git -C "$REPO" worktree remove --force "$WORKTREE" || rc=1
  fi
  [ -z "${BASE_REF:-}" ] || git -C "$REPO" update-ref -d "$BASE_REF" || rc=1
  [ -z "${WORK_ROOT:-}" ] || rmdir "$WORK_ROOT" || rc=1
  exit "$rc"
}

review_setup() {
  [ "$#" -ge 1 ] && [ "$#" -le 3 ] || review_die 'usage: <pr> [prompt-file] [sha]'
  PR=$1
  case "$PR" in ''|*[!0-9]*) review_die 'PR must be a number';; esac
  REPO=$(git rev-parse --show-toplevel)
  local prompt_file=${2:-$REVIEW_SCRIPTS/review-generic-prompt.txt}
  local expected=${3:-} timeout=${REVIEW_SHA_TIMEOUT:-600} interval=${REVIEW_SHA_INTERVAL:-5}
  case "$timeout:$interval" in *[!0-9:]*|:*|*:) review_die 'timeouts must be integer seconds';; esac
  [ "$interval" -gt 0 ] || review_die 'poll interval must be positive'
  if [ -n "$expected" ]; then
    [[ "$expected" =~ ^[0-9a-fA-F]{4,40}$ ]] || review_die 'sha must be a full or abbreviated commit SHA'
    if [ "${#expected}" -lt 40 ]; then
      expected=$(git rev-parse --verify "$expected^{commit}") || review_die 'cannot resolve abbreviated SHA'
    fi
    expected=$(printf '%s' "$expected" | tr 'A-F' 'a-f')
  fi
  PROMPT=$(cat "$prompt_file")
  PROMPT=${PROMPT//\{\{PR\}\}/$PR}
  cd "$REPO" || review_die "cannot enter repository"
  local start=$SECONDS
  while :; do
    SHA=$(gh pr view "$PR" --json headRefOid -q .headRefOid)
    [ -z "$expected" ] || [ "$SHA" != "$expected" ] || break
    [ -n "$expected" ] || break
    [ "$((SECONDS - start))" -lt "$timeout" ] || review_die "timed out: PR #$PR reports $SHA, expected $expected"
    local delay=$interval remaining=$((timeout - SECONDS + start))
    [ "$delay" -le "$remaining" ] || delay=$remaining
    sleep "$delay"
  done
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || review_die 'GitHub returned an invalid head SHA'
  OUT=${REVIEW_OUT:-${TMPDIR:-/tmp}/stabileo-reviews}
  mkdir -p "$OUT" "${REVIEW_WORKTREES:-$(dirname "$REPO")}"
  OUT=$(cd "$OUT" && pwd)
  WORK_ROOT=$(mktemp -d "${REVIEW_WORKTREES:-$(dirname "$REPO")}/stabileo-review-$PR.XXXXXX")
  trap review_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  # Retain diagnostics in a unique directory, even for concurrent runs of one SHA.
  OUT=$(mktemp -d "$OUT/run-$PR-${SHA:0:12}.XXXXXX")
  PREFIX=$OUT/review-$PR-${SHA:0:12}
  BASE_REF=refs/review-runs/${OUT##*/}/main
  # Neither FETCH_HEAD nor origin/main is shared writable state between runs.
  git fetch -q --no-write-fetch-head --no-tags --refmap= origin "$SHA" "+refs/heads/main:$BASE_REF"
  PROMPT=${PROMPT//origin\/main/$BASE_REF}
  git worktree add -q --detach "$WORK_ROOT/checkout" "$SHA"
  WORKTREE=$WORK_ROOT/checkout
  echo "review: PR #$PR pinned at $SHA"
}

review_complete() {
  # Progress narration, permission requests and verdicts followed by more prose
  # are incomplete. Ignore only trailing blank lines / line-ending whitespace.
  awk 'NF { last=$0; sub(/[[:space:]]+$/, "", last) }
    END { exit !(last == "ready" || last == "ready after should-fix items" || last == "not ready") }' "$1"
}

review_attempt() {
  local name=$1
  shift
  local raw=$PREFIX-$name.raw err=$PREFIX-$name.err rc=0
  (cd "$WORKTREE" && "$@" < /dev/null) > "$raw" 2> "$err" || rc=$?
  printf '%s\n' "$rc" > "$PREFIX-$name.exit"
  [ "$rc" -eq 0 ] || return 1
  review_complete "$raw" || return 1
  # Provider availability markers, never arbitrary prose such as "failed".
  if grep -Eiq '(^|[^0-9])429([^0-9]|$)|usage limit|quota|rate.limit.exceeded' "$raw" "$err"; then
    return 1
  fi
}

review_publish() {
  local name=$1 label=$2
  local destination=$PREFIX-$name.md
  { printf 'REVIEWER: %s\nSHA: %s\n\n' "$label" "$SHA"; cat "$PREFIX-$name.raw"; } > "$destination.tmp" || return 1
  mv "$destination.tmp" "$destination"
}

review_codex() {
  review_attempt codex codex exec --sandbox read-only --skip-git-repo-check -C "$WORKTREE" "$PROMPT" || return 1
  review_publish codex Codex
}

review_second() {
  local name label adversarial
  if review_attempt kimi kimi -p "$PROMPT"; then
    name=kimi; label=Kimi
  elif review_attempt grok grok -p "$PROMPT" --permission-mode plan; then
    name=grok; label=Grok
  else
    adversarial=$(cat "$REVIEW_SCRIPTS/review-adversarial-prompt.txt")
    adversarial=${adversarial//\{\{PR\}\}/$PR}
    adversarial=${adversarial//origin\/main/$BASE_REF}
    review_attempt adversarial codex exec --sandbox read-only --skip-git-repo-check -C "$WORKTREE" "$adversarial" || return 1
    name=adversarial; label='adversarial Codex'
  fi
  review_publish "$name" "$label"
}

review_run() {
  local mode=$1 rc=0
  shift
  review_setup "$@"
  if [ "$mode" = both ]; then
    review_codex & CODEX_PID=$!
  fi
  review_second & SECOND_PID=$!
  if [ -n "${CODEX_PID:-}" ]; then
    wait "$CODEX_PID" || rc=1
    CODEX_PID=
  fi
  wait "$SECOND_PID" || rc=1
  SECOND_PID=
  [ -z "$(git -C "$WORKTREE" status --porcelain)" ] || review_die 'reviewers modified the checkout'
  [ "$rc" -eq 0 ] || review_die "reviewer unavailable; inspect $PREFIX-*.err and *.exit"
  echo "review: results in $PREFIX-*.md (verdicts require human review)"
}
