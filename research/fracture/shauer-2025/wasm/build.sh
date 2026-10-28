#!/usr/bin/env bash
# Build the research page's WASM bundle: compile, keep only this crate's exports (the engine's
# own #[wasm_bindgen] exports would otherwise add ~9 MB), optimise, and place it where the web
# build serves it as a static file (web/public/research-wasm/, ignored by git). Run from anywhere
# inside the repository, within `nix develop`.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
here="$root/research/fracture/shauer-2025/wasm"
out="${1:-$root/web/public/research-wasm/shauer-2025}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
features="--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue"

(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg")
python3 -I "$here/trim_exports.py" "$tmp/pkg/phasefield_shauer_2025_wasm_bg.wasm" "$tmp/graph.json"
nix shell --inputs-from "$root" nixpkgs#binaryen --command bash -c "
  wasm-metadce $features -f '$tmp/graph.json' '$tmp/pkg/phasefield_shauer_2025_wasm_bg.wasm' -o '$tmp/trim.wasm' >/dev/null &&
  wasm-opt -O3 $features '$tmp/trim.wasm' -o '$tmp/opt.wasm'"
mkdir -p "$out"
cp "$tmp/opt.wasm" "$out/phasefield_bg.wasm"
cp "$tmp/pkg/phasefield_shauer_2025_wasm.js" "$out/phasefield.js"
cp "$root/research/fracture/shauer-2025/reference-results/ex2_steps.csv" "$out/reference_ex2_steps.csv"
(cd "$root/research/fracture/shauer-2025" && cargo run --release --quiet --bin replay -- write "$out/replay.bin" && cargo run --release --quiet --bin replay -- verify "$out/replay.bin")
# Shipped gzip-compressed and inflated by the page. Not named .gz: static servers (vite preview,
# Caddy with precompressed files) would add Content-Encoding and the browser would inflate it first.
gzip -9 -n -c "$out/replay.bin" > "$out/replay.srpl" && rm "$out/replay.bin"
( cd "$out" && shasum -a 256 phasefield_bg.wasm phasefield.js reference_ex2_steps.csv replay.srpl > SHA256SUMS )
echo "research wasm: $(wc -c < "$out/phasefield_bg.wasm") bytes -> $out"
