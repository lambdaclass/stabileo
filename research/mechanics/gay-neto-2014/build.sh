#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
here="$root/research/mechanics/gay-neto-2014"
out="$root/web/public/research-wasm/gay-neto-2014"
if ! command -v wasm-opt >/dev/null; then
  exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
(cd "$here" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
mkdir -p "$out"
wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue \
  "$tmp/pkg/risers_gay_neto_2014_bg.wasm" -o "$out/riser_bg.wasm"
cp "$tmp/pkg/risers_gay_neto_2014.js" "$out/riser.js"
python3 - "$out" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
names = ['riser.js', 'riser_bg.wasm']
build_id = hashlib.sha256(b''.join((out / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
destination.mkdir(exist_ok=True)
for name in names:
    (destination / name).write_bytes((out / name).read_bytes())
(out / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
PY
