#!/usr/bin/env bash
# Differential test: stabileo vs OpenSees. See tools/opensees/README.md.
#
#   tools/opensees/run.sh                 # default run (fixtures + random models)
#   tools/opensees/run.sh --rich3d 50 -v  # any compare.py arguments
#
# Creates tools/opensees/.venv (openseespy + numpy) on first use and builds the
# solver CLI (engine/examples/solve_json.rs) in release mode.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
venv="$here/.venv"
py="${PYTHON:-python3}"

if [ ! -x "$venv/bin/python" ]; then
  "$py" -m venv "$venv"
  "$venv/bin/pip" install --quiet openseespy numpy
fi

(cd "$repo" && cargo build --release --quiet --example solve_json)

if [ "$#" -eq 0 ]; then
  set -- --fixtures --random2d 300 --random3d 300 --rich2d 300 --rich3d 300 \
    --buckling2d 100 --buckling3d 100 --modal2d 100 --modal3d 100 \
    --pdelta2d 100 --pdelta3d 100 --th2d 50 --th3d 50 --plates 100 --shells 20
fi
exec "$venv/bin/python" "$here/compare.py" "$@"
