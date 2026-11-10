#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
here="$root/research/stability/feher-sipos-varkonyi-2026"
out="$root/web/public/research-wasm/feher-sipos-varkonyi-2026"
if ! command -v wasm-opt >/dev/null && command -v nix >/dev/null; then
  exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
mkdir -p "$out"
if command -v wasm-opt >/dev/null; then
  wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue \
    "$tmp/pkg/shape_control_feher_2026_bg.wasm" -o "$out/shape_bg.wasm"
else
  cp "$tmp/pkg/shape_control_feher_2026_bg.wasm" "$out/shape_bg.wasm"
fi
cp "$tmp/pkg/shape_control_feher_2026.js" "$out/shape.js"
python3 - "$out" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
names = ['shape.js', 'shape_bg.wasm']
build_id = hashlib.sha256(b''.join((out / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
destination.mkdir(exist_ok=True)
for name in names:
    (destination / name).write_bytes((out / name).read_bytes())
(out / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
PY
