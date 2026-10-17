#!/usr/bin/env bash
# Code_Aster environment for the differential harness (see README.md).
#
# Code_Aster has no macOS build. conda-forge publishes code-aster for
# linux-64 only; the official simvia/code_aster image is built for `zen`
# (AVX2) and dies with SIGILL under Rosetta. The conda-forge build targets
# baseline x86-64, so it runs under Rosetta in an amd64 container (OrbStack /
# Docker Desktop on Apple silicon) as well as natively on Linux CI.
#
#   setup.sh            build the local image stabileo-codeaster:18.1.10
#   setup.sh --native   install into ./.work/conda with micromamba (Linux)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# micromamba 2.3.3-debian12-slim, linux/amd64
BASE=mambaorg/micromamba@sha256:a63579e4d48716fd7de283cf9a7cf09c54d8318777135843f15b9ad6c2638448
PKGS="code-aster=18.1.10 python=3.12"
IMAGE=stabileo-codeaster:18.1.10
DOCKER="${DOCKER:-docker}"

if [ "${1:-}" = "--native" ]; then
  micromamba create -y -p "$here/.work/conda" -c conda-forge $PKGS
  exit 0
fi
if "$DOCKER" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "$IMAGE already built"; exit 0
fi
cid=$("$DOCKER" run -d --platform linux/amd64 "$BASE" sleep infinity)
trap '"$DOCKER" rm -f "$cid" >/dev/null' EXIT
"$DOCKER" exec "$cid" micromamba install -y -n base -c conda-forge $PKGS
"$DOCKER" commit "$cid" "$IMAGE" >/dev/null
echo "built $IMAGE"
