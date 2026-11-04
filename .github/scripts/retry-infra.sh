#!/usr/bin/env bash
# Only wrap dependency acquisition, never a combined install/build/test command.
set -uo pipefail
infra_pattern='FlakeHub: cache initialized failed: Unauthenticated|Unable to authenticate to FlakeHub|GitHub Actions Cache throttled Magic Nix Cache|HTTP error 418|Connection reset by peer|429 Too Many Requests|HTTP 429|rate limit exceeded|exceeded a secondary rate limit|ERR_SOCKET_CLOSED_BEFORE_CONNECTION|Error in the HTTP2 framing layer|Failed sending data to the peer|SSL_ERROR_SYSCALL|usually happens due to networking issues|HTTP error 416|\(429\) Too Many Requests|Failed to GetCacheEntryDownloadURL: Rate limited|error downloading [^ ]+: HTTP 50[0234]'
is_infra() { grep -v 'warning: unable to download' "$1" | grep -Ei "$infra_pattern" >/dev/null; }
if [[ ${1:-} == --matches ]]; then
  is_infra "$2"
  exit $?
fi
if [[ $# == 0 ]]; then
  echo 'usage: retry-infra.sh COMMAND [ARG ...]' >&2
  exit 2
fi
log=$(mktemp)
trap 'rm -f "$log"' EXIT
limit=${RETRY_INFRA_TIMEOUT_SECONDS:-900}
locks=${RETRY_INFRA_LOCKS-/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock}

lock_held() {
  local lock
  for lock in $locks; do
    [[ -e $lock ]] || continue
    { sudo -n fuser "$lock" || fuser "$lock"; } > /dev/null 2>&1 && return 0
  done
  return 1
}

# sudo runs its command in a session of its own, so a root child (apt-get) survives the kill and is waited out by the lock it holds.
reap() {
  local session=$1 waited=0
  pkill -TERM -s "$session" 2> /dev/null
  while pgrep -s "$session" | grep -qvx "$session" && (( waited < 30 )); do sleep 1; waited=$((waited + 1)); done
  pkill -KILL -s "$session" 2> /dev/null
  waited=0
  while lock_held && (( waited < ${RETRY_INFRA_LOCK_SECONDS:-600} )); do
    (( waited % 30 == 0 )) && echo "Waiting for the previous attempt to release its lock" >&2
    sleep 1
    waited=$((waited + 1))
  done
}

for attempt in 1 2 3; do
  # A daemon the command starts (sccache) inherits its output; through a pipe, tee would wait for that daemon to exit.
  : > "$log"
  setsid "$@" >> "$log" 2>&1 &
  pid=$!
  tail -n +1 -f --pid="$pid" "$log" &
  follow=$!
  stalled=0
  idle=0
  size=-1
  while kill -0 "$pid" 2> /dev/null; do
    now=$(stat -c %s "$log")
    if [[ $now != "$size" ]]; then
      size=$now
      idle=0
    elif (( idle >= limit )); then
      stalled=1
      break
    fi
    sleep 1
    idle=$((idle + 1))
  done
  if (( stalled )); then
    echo "Download stalled for ${limit}s" >&2
    reap "$pid"
  fi
  wait "$pid"
  status=$?
  wait "$follow"
  if (( stalled )); then status=124; fi
  if (( status == 0 )); then exit 0; fi
  if (( attempt == 3 )) || { (( ! stalled )) && ! is_infra "$log"; }; then exit "$status"; fi
  echo "Known infrastructure failure; retry $attempt/2" >&2
  sleep "${RETRY_INFRA_DELAY_SECONDS:-$((attempt * 10))}"
done
