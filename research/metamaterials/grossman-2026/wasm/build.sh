#!/usr/bin/env bash
# Build the spring-network page's WASM bundle: compile, keep only this crate's exports (the
# engine's own #[wasm_bindgen] exports would otherwise be linked in), optimise, and place it where
# the web build serves it as a static file (web/public/research-wasm/, ignored by git). Run from
# anywhere inside the repository, within `nix develop`.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
here="$root/research/metamaterials/grossman-2026/wasm"
out="${1:-$root/web/public/research-wasm/grossman-2026}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
features="--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue"

(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
python3 -I "$here/trim_exports.py" "$tmp/pkg/springs_grossman_2026_wasm_bg.wasm" "$tmp/graph.json"
optimise() {
  wasm-metadce $features -f "$tmp/graph.json" "$tmp/pkg/springs_grossman_2026_wasm_bg.wasm" -o "$tmp/trim.wasm" >/dev/null
  wasm-opt -O3 $features "$tmp/trim.wasm" -o "$tmp/opt.wasm"
}
if command -v wasm-metadce >/dev/null; then
  optimise
else
  export -f optimise
  export features tmp
  nix shell --inputs-from "$root" nixpkgs#binaryen --command bash -c optimise
fi
mkdir -p "$out"
cp "$tmp/opt.wasm" "$out/springs_bg.wasm"
cp "$tmp/pkg/springs_grossman_2026_wasm.js" "$out/springs.js"
( cd "$out" && shasum -a 256 springs_bg.wasm springs.js > SHA256SUMS )
echo "research wasm: $(wc -c < "$out/springs_bg.wasm") bytes -> $out"
