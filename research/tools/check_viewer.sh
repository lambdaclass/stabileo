#!/usr/bin/env bash
# Research pages show models and results only through the shared Stabileo viewer
# (web/src/components/viewport/ScalarFieldViewer.svelte and the app's viewport). A research page
# that creates its own canvas, 2D/WebGL context or three.js renderer fails here. Charts are SVG.
#   check_viewer.sh [dir]   (default: web/src/components/research)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
dir="${1:-web/src/components/research}"
pattern='<canvas|getContext\(|WebGLRenderer|WebGL2?RenderingContext|OffscreenCanvas|from .three.|createViewerRenderer'
hits=$(grep -rnE "$pattern" "$dir" --include='*.svelte' --include='*.ts' --include='*.js' | grep -v '/__tests__/' || true)
if [ -n "$hits" ]; then
  echo "A research page draws a model view outside the shared Stabileo viewer:"
  echo "$hits"
  echo "Use ScalarFieldViewer (web/src/components/viewport/) instead; see research/CLAUDE.md."
  exit 1
fi
echo "research viewer rule: ok"
