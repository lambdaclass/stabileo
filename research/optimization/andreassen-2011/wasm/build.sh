#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd)
here="$root/research/optimization/andreassen-2011/wasm"
out="${1:-$root/web/public/research-wasm/andreassen-2011}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --no-opt --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
python3 "$here/trim_exports.py" "$tmp/pkg/topopt_andreassen_2011_wasm_bg.wasm" "$tmp/graph.json"
features="--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue"
optimise() {
  wasm-metadce $features -f "$tmp/graph.json" "$tmp/pkg/topopt_andreassen_2011_wasm_bg.wasm" -o "$tmp/trim.wasm"
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
cp "$tmp/pkg/topopt_andreassen_2011_wasm.js" "$out/topopt.js"
cp "$tmp/opt.wasm" "$out/topopt_bg.wasm"
python3 "$here/package_replay.py" "$out"
(cd "$out" && shasum -a 256 topopt.js topopt_bg.wasm ft1.srpl ft2.srpl ft1.json ft2.json > SHA256SUMS)
node "$here/check.mjs" "$out"
python3 "$here/publish.py" "$out"
