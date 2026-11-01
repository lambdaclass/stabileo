#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
here="$root/research/form-finding/pastrana-2026/wasm"
out="${1:-$root/web/public/research-wasm/pastrana-2026}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
features="--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue"

(cd "$here" && wasm-pack build --release --target web --no-typescript --no-opt --out-dir "$tmp/pkg" --locked)
python3 -I "$here/trim_exports.py" "$tmp/pkg/form_finding_pastrana_2026_wasm_bg.wasm" "$tmp/graph.json"
optimise() {
  wasm-metadce $features -f "$tmp/graph.json" "$tmp/pkg/form_finding_pastrana_2026_wasm_bg.wasm" -o "$tmp/trim.wasm" >/dev/null
  wasm-opt -O3 $features "$tmp/trim.wasm" -o "$tmp/opt.wasm"
}
if command -v wasm-metadce >/dev/null; then
  optimise
else
  export -f optimise
  export features tmp
  nix shell --inputs-from "path:$root" nixpkgs#binaryen --command bash -c optimise
fi
mkdir -p "$out"
cp "$tmp/opt.wasm" "$out/form_bg.wasm"
cp "$tmp/pkg/form_finding_pastrana_2026_wasm.js" "$out/form.js"
( cd "$out" && shasum -a 256 form_bg.wasm form.js > SHA256SUMS )
echo "research wasm: $(wc -c < "$out/form_bg.wasm") bytes -> $out"
