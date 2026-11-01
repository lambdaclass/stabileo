#!/usr/bin/env bash
# Only wrap dependency acquisition, never a combined install/build/test command.
set -uo pipefail
infra_pattern='FlakeHub: cache initialized failed: Unauthenticated|Unable to authenticate to FlakeHub|GitHub Actions Cache throttled Magic Nix Cache|HTTP error 418|Connection reset by peer|429 Too Many Requests|HTTP 429|rate limit exceeded|exceeded a secondary rate limit|ERR_SOCKET_CLOSED_BEFORE_CONNECTION|Error in the HTTP2 framing layer|Failed sending data to the peer|SSL_ERROR_SYSCALL|usually happens due to networking issues'
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
for attempt in 1 2 3; do
  "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  if (( status == 0 )); then exit 0; fi
  if (( attempt == 3 )) || ! is_infra "$log"; then exit "$status"; fi
  echo "Known infrastructure failure; retry $attempt/2" >&2
  sleep "${RETRY_INFRA_DELAY_SECONDS:-$((attempt * 10))}"
done
