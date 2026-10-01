#!/usr/bin/env bash
set -euo pipefail

installer=$(mktemp)
trap 'rm -f "$installer"' EXIT

# Download completely before executing. Retry connection resets as well as HTTP errors.
curl --fail --silent --show-error --location \
  --retry 3 --retry-all-errors --connect-timeout 15 --max-time 60 \
  https://rustwasm.github.io/wasm-pack/installer/init.sh --output "$installer"

# The installer downloads the release archive itself. Retrying only the curl above
# does not cover a dropped connection during that second download.
for attempt in 1 2 3; do
  if sh "$installer"; then
    wasm-pack --version
    exit 0
  fi
  if [ "$attempt" -lt 3 ]; then
    echo "wasm-pack installation failed (attempt $attempt/3); retrying in 5 seconds" >&2
    sleep 5
  fi
done

echo "wasm-pack installation failed after 3 attempts" >&2
exit 1
