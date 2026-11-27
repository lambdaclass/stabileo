#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
source "$root/research/remap-rust-paths.sh"
here="$root/research/mechanics/heyman-1966"
out="$root/web/public/research-wasm/heyman-1966"
if ! command -v wasm-opt >/dev/null && command -v nix >/dev/null; then
  exec nix shell --inputs-from "$root" nixpkgs#binaryen --command bash "$here/build.sh"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
research_workspace "$here" "$tmp/cargo"
(cd "$wasm_crate" && wasm-pack build --release --target web --no-typescript --out-dir "$tmp/pkg" --locked)
mkdir -p "$out"
if command -v wasm-opt >/dev/null; then
  wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals --enable-reference-types --enable-multivalue \
    "$tmp/pkg/masonry_arches_heyman_1966_bg.wasm" -o "$out/arch_bg.wasm"
else
  cp "$tmp/pkg/masonry_arches_heyman_1966_bg.wasm" "$out/arch_bg.wasm"
fi
cp "$tmp/pkg/masonry_arches_heyman_1966.js" "$out/arch.js"
python3 - "$out" <<'PY'
import hashlib, json, pathlib, re, shutil, sys
out = pathlib.Path(sys.argv[1])
names = ['arch.js', 'arch_bg.wasm']
build_id = hashlib.sha256(b''.join((out / name).read_bytes() for name in names)).hexdigest()
destination = out / build_id
for stale in out.iterdir():
    if stale.is_dir() and stale.name != build_id and re.fullmatch(r'[0-9a-f]{64}', stale.name):
        shutil.rmtree(stale)
destination.mkdir(exist_ok=True)
for name in names:
    (destination / name).write_bytes((out / name).read_bytes())
(out / 'build.json').write_text(json.dumps({'build_id': build_id}) + '\n')
PY
