#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
here="$root/research/mechanics/vella-2024"
out="$root/web/public/research-wasm/vella-2024"
if ! command -v wasm-opt >/dev/null && command -v nix >/dev/null && [[ -z ${VELLA_BINARYEN_SHELL:-} ]]; then
  VELLA_BINARYEN_SHELL=1 exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
mkdir -p "$out"
tmp=$(mktemp -d "$out/.staging.XXXXXXXX")
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
mkdir "$tmp/bundle"
if command -v wasm-opt >/dev/null; then
  wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue \
    "$tmp/pkg/snap_symmetry_vella_2024_bg.wasm" -o "$tmp/bundle/snap_bg.wasm"
else
  cp "$tmp/pkg/snap_symmetry_vella_2024_bg.wasm" "$tmp/bundle/snap_bg.wasm"
fi
cp "$tmp/pkg/snap_symmetry_vella_2024.js" "$tmp/bundle/snap.js"
node "$here/check-wasm.mjs" "$tmp/bundle"
python3 - "$tmp" "$out" <<'PUBLISH'
import hashlib, json, pathlib, sys
stage, out = map(pathlib.Path, sys.argv[1:])
bundle = stage / 'bundle'
names = ['snap.js', 'snap_bg.wasm']
build_id = hashlib.sha256(b''.join((bundle / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
try:
    bundle.rename(destination)
except OSError:
    if not all((destination / name).read_bytes() == (bundle / name).read_bytes() for name in names):
        raise
manifest = stage / 'build.json'
manifest.write_text(json.dumps({'build_id': build_id}) + '\n')
manifest.replace(out / 'build.json')
PUBLISH
