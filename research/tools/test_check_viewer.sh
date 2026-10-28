#!/usr/bin/env bash
# The viewer rule must reject a page that draws its own canvas and accept one that does not.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
tmp=$(mktemp -d web/src/components/research/zz-viewer-probe.XXXX)
trap 'rm -rf "$tmp"' EXIT
echo '<svg><path d="M0 0" /></svg>' > "$tmp/Chart.svelte"
research/tools/check_viewer.sh "$tmp" >/dev/null || { echo "FAIL: rejected an SVG chart"; exit 1; }
for probe in '<canvas bind:this={c}></canvas>' 'const g = c.getContext("webgl2");' "import * as THREE from 'three';" 'new THREE.WebGLRenderer()'; do
  echo "$probe" > "$tmp/View.svelte"
  if research/tools/check_viewer.sh "$tmp" >/dev/null; then echo "FAIL: accepted: $probe"; exit 1; fi
  echo "ok   rejects: $probe"
done
echo "ok   accepts an SVG chart"
