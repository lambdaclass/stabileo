#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
here="$root/research/mechanics/biggins-2026"
out="$root/web/public/research-wasm/biggins-2026"
if ! command -v wasm-metadce >/dev/null; then
  exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
python3 -I "$root/research/fracture/shauer-2025/wasm/trim_exports.py" "$tmp/pkg/arches_biggins_2026_bg.wasm" "$tmp/graph.json"
flags=(--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue)
mkdir -p "$out"
wasm-metadce "${flags[@]}" -f "$tmp/graph.json" "$tmp/pkg/arches_biggins_2026_bg.wasm" -o "$tmp/trim.wasm"
wasm-opt -O3 "${flags[@]}" "$tmp/trim.wasm" -o "$out/arches_bg.wasm"
cp "$tmp/pkg/arches_biggins_2026.js" "$out/arches.js"
python3 - "$out" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
names = ['arches.js', 'arches_bg.wasm']
build_id = hashlib.sha256(b''.join((out / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
destination.mkdir(exist_ok=True)
for name in names:
    (destination / name).write_bytes((out / name).read_bytes())
(out / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
PY
node "$here/check-wasm.mjs"
