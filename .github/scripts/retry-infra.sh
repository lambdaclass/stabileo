#!/usr/bin/env bash
# Only wrap dependency acquisition, never a combined install/build/test command.
set -uo pipefail
infra_pattern='FlakeHub: cache initialized failed: Unauthenticated|Unable to authenticate to FlakeHub|GitHub Actions Cache throttled Magic Nix Cache|HTTP error 418|Connection reset by peer|429 Too Many Requests|HTTP 429|rate limit exceeded|exceeded a secondary rate limit|ERR_SOCKET_CLOSED_BEFORE_CONNECTION|Error in the HTTP2 framing layer|Failed sending data to the peer|SSL_ERROR_SYSCALL|usually happens due to networking issues|HTTP error 416|\(429\) Too Many Requests|Failed to GetCacheEntryDownloadURL: Rate limited'
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
for attempt in 1 2 3; do
  # A daemon the command starts (sccache) inherits its output; through a pipe, tee would wait for that daemon to exit.
  timeout --kill-after=30 "$limit" "$@" > "$log" 2>&1 &
  pid=$!
  tail -n +1 -f --pid="$pid" "$log" &
  follow=$!
  wait "$pid"
  status=$?
  wait "$follow"
  if (( status == 0 )); then exit 0; fi
  if (( status == 124 || status == 137 )); then
    echo "Download stalled for ${limit}s" >&2
    stalled=1
  else
    stalled=0
  fi
  if (( attempt == 3 )) || { (( ! stalled )) && ! is_infra "$log"; }; then exit "$status"; fi
  echo "Known infrastructure failure; retry $attempt/2" >&2
  sleep "${RETRY_INFRA_DELAY_SECONDS:-$((attempt * 10))}"
done
