#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
here="$root/research/optimisation/fairclough-2026"
out="${1:-$root/web/public/research-wasm/fairclough-2026}"
mkdir -p "$out"
wasm-pack build "$here" --release --target web --no-typescript --out-dir "$out" -- --locked --no-default-features
cp "$here/THIRD_PARTY_NOTICES.md" "$out/THIRD_PARTY_NOTICES.md"
