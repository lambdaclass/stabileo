#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
here="$root/research/mechanics/vella-2024"
out="$root/web/public/research-wasm/vella-2024"
if ! command -v wasm-opt >/dev/null && command -v nix >/dev/null && [[ -z ${VELLA_BINARYEN_SHELL:-} ]]; then
  VELLA_BINARYEN_SHELL=1 exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
mkdir -p "$out"
if command -v wasm-opt >/dev/null; then
  wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue \
    "$tmp/pkg/snap_symmetry_vella_2024_bg.wasm" -o "$out/snap_bg.wasm"
else
  cp "$tmp/pkg/snap_symmetry_vella_2024_bg.wasm" "$out/snap_bg.wasm"
fi
cp "$tmp/pkg/snap_symmetry_vella_2024.js" "$out/snap.js"
python3 - "$out" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
names = ['snap.js', 'snap_bg.wasm']
build_id = hashlib.sha256(b''.join((out / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
destination.mkdir(exist_ok=True)
for name in names:
    (destination / name).write_bytes((out / name).read_bytes())
(out / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
PY
node "$here/check-wasm.mjs"
