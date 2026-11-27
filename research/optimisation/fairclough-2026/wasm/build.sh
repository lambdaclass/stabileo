#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
source "$root/research/remap-rust-paths.sh"
here="$root/research/optimisation/fairclough-2026"
out="${1:-$root/web/public/research-wasm/fairclough-2026}"
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
research_workspace "$here" "$tmp/cargo"
wasm-pack build "$wasm_crate" --release --target web --no-typescript --out-dir "$out" -- --locked --no-default-features
cp "$here/THIRD_PARTY_NOTICES.md" "$out/THIRD_PARTY_NOTICES.md"
