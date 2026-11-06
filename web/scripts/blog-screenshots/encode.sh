#!/usr/bin/env bash
set -euo pipefail
out=$1; shift
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() { nix shell --inputs-from "$(git rev-parse --show-toplevel)" nixpkgs#imagemagick nixpkgs#libwebp nixpkgs#libavif --command "$@"; }
if [ $# -eq 1 ]; then
  run magick "$1" -resize 1600x1000^ -gravity north -extent 1600x1000 -strip "$tmp/1600.png"
else
  run magick -size 1600x1000 xc:'#e9edf2' \
    \( "$1" -resize x920 \) -gravity center -geometry -260+0 -composite \
    \( "$2" -resize x920 \) -gravity center -geometry +260+0 -composite -strip "$tmp/1600.png"
fi
run magick "$tmp/1600.png" -resize 800x500 "$tmp/800.png"
for w in 800 1600; do
  run cwebp -quiet -q 80 -m 6 "$tmp/$w.png" -o "$out-$w.webp"
  run avifenc -q 55 -s 4 "$tmp/$w.png" "$out-$w.avif" >/dev/null
done
ls -l "$out"-*
