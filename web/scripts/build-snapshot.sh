#!/usr/bin/env bash
# Build the site kept under its commit, /@<first 7 hex of the commit>/ (web/scripts/snapshot.ts,
# docs/DEPLOY.md "Snapshots"), into web/dist-snapshot/. Needs the engine and research WASM already
# built (make wasm research.wasm) and web/ installed; run inside `nix develop`. The commit is
# GITHUB_SHA when set (CI: the commit being built), else HEAD.
set -euo pipefail
cd "$(dirname "$0")/.."
commit=${SNAPSHOT_COMMIT:-${GITHUB_SHA:-$(git rev-parse HEAD)}}
[ "$(git rev-parse HEAD)" = "$commit" ] || { echo "build-snapshot: HEAD is not $commit" >&2; exit 1; }
export BASE_PATH="/@${commit:0:7}/" SNAPSHOT_COMMIT="$commit"
npx vite build --outDir dist-snapshot --emptyOutDir
PRERENDER_OUT=dist-snapshot npx tsx scripts/prerender.ts
python3 scripts/snapshot-manifest.py dist-snapshot
echo "snapshot ${BASE_PATH}: $(du -sk dist-snapshot | cut -f1) KiB in web/dist-snapshot"
