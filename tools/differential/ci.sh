#!/usr/bin/env bash
# CI entry point of the differential harnesses (.github/workflows/differential.yml).
#
#   tools/differential/ci.sh PROGRAM [SEED_START]
#
# Installs PROGRAM (if needed), builds the stabileo CLI and runs the fixtures
# plus the random models for PROGRAM. Seeds move daily in CI (SEED_START
# defaults to a day-based seed, printed) so that nightly runs cover new
# models; a failure reproduces with run.py and the printed --seed-start.
# Reports and flagged (shrunk) models go to tools/differential/out/ci/.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
program="${1:?program}"
seed="${2:-$(( $(date -u +%s) / 86400 % 1000 * 1000 ))}"
echo "differential $program seed-start $seed"

py="${PYTHON:-python3}"
if [ ! -x "$here/.venv/bin/python" ]; then
  "$py" -m venv "$here/.venv"
fi
pip="$here/.venv/bin/pip"
"$pip" install -q numpy scipy

case "$program" in
  frame3dd) [ "$(cat "$here/.tools/frame3dd/patch-level" 2>/dev/null)" = \
              "$(sed -n 's/^PATCH_LEVEL=//p' "$here/frame3dd/build.sh")" ] || "$here/frame3dd/build.sh" ;;
  pynite) "$pip" install -q "PyNiteFEA==3.2.0" ;;
  mystran) [ -x "$here/.tools/mystran/mystran" ] || "$here/mystran/build.sh" ;;
  kratos) "$pip" install -q "KratosMultiphysics==10.4.4" "KratosStructuralMechanicsApplication==10.4.4" \
            "KratosLinearSolversApplication==10.4.4" ;;
  calculix) [ -n "${CCX_BIN:-}" ] || "$here/calculix/setup.sh" ;;
  *) echo "unknown program $program" >&2; exit 2 ;;
esac

(cd "$repo" && cargo build --release --example diff_solve)

out="$here/out/ci"
mkdir -p "$out"
fixtures=("$repo"/engine/tests/fixtures/*-input.json)
run() { "$here/.venv/bin/python" "$here/run.py" "$program" -j "${JOBS:-4}" --seed-start "$seed" \
          --dump-dir "$out/$program" --shrink "$@"; }

status=0
run "${fixtures[@]}" --report "$out/$program-fixtures.json" || status=$?
case "$program" in
  frame3dd) run --gen frame3d 300 --gen building 200 --gen frame2d 200 --gen modal3d 150 --gen pdelta3d 150 \
              --report "$out/$program-random.json" || status=$? ;;
  pynite) run --gen rich3d_eb 600 --gen building_eb 200 --gen frame2d 200 \
            --report "$out/$program-random.json" || status=$? ;;
  *) run $(cat "$here/$program/ci-gens.txt") --report "$out/$program-random.json" || status=$? ;;
esac
exit $status
