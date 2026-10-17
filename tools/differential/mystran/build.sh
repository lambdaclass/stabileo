#!/usr/bin/env bash
# Build MYSTRAN from source into tools/differential/.tools/mystran/.
#
#   tools/differential/mystran/build.sh
#
# Pinned to a MYSTRAN commit (and its pinned submodules: SuperLU, METIS,
# GKlib, Reference-LAPACK); the git commit hash is the content check.
# Needs git, cmake >= 3.18, make, a C compiler and gfortran. FC / CC / CMAKE
# override the tools (default: gfortran / cc / cmake on PATH, else the nix
# links tools/differential/.tools/{gfortran,cmake} if present).
#
# One patch, to output precision only (never the mechanics): the F06 prints
# displacements / eigenvectors / SPC forces, element nodal forces and the
# eigenvalue table with 7 significant digits (ES14.6 / ES20.6); they are
# printed with ES24.16 instead, so the comparison is not limited by printed
# digits (see README.md).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/.tools/mystran"
src="$root/.build/src/mystran"
build="$root/.build/mystran"
url="https://github.com/MYSTRANsolver/MYSTRAN.git"
commit="3a5913a904ee1adbda9fbcaf9c0a6af8e10f0f9f"

pick() { command -v "$1" 2>/dev/null || { [ -x "$2" ] && echo "$2"; } || true; }
FC="${FC:-$(pick gfortran "$root/.tools/gfortran/bin/gfortran")}"
CC="${CC:-$(pick cc "$root/.tools/gfortran/bin/cc")}"
CMAKE="${CMAKE:-$(pick cmake "$root/.tools/cmake/bin/cmake")}"
[ -n "$FC" ] && [ -n "$CMAKE" ] || { echo "mystran: need gfortran and cmake" >&2; exit 1; }

if [ ! -d "$src/.git" ]; then
  mkdir -p "$(dirname "$src")"
  git clone -q "$url" "$src"
fi
git -C "$src" fetch -q origin "$commit" 2>/dev/null || true
git -C "$src" checkout -q --force "$commit"
[ "$(git -C "$src" rev-parse HEAD)" = "$commit" ] || { echo "mystran: commit mismatch" >&2; exit 1; }
git -C "$src" submodule update --init --recursive --force -q

# Output precision patch (applied on a clean checkout).
git -C "$src" checkout -q -- Source
L91="$src/Source/LK9/L91"
# grid outputs (displacements, eigenvectors, SPC forces)
perl -pi -e 's/^(\s*)WRITE\(F06,\x27\(A\)\x27\) LINE_BUF\s*$/$1WRITE(F06,\x27(6X,2(1X,I8),6(1X,ES24.16E3))\x27) GID_OUT_ARRAY(I,1), GID_OUT_ARRAY(I,2), (OGEL(I,J),J=1,6)\n/' "$L91/WRITE_GRD_PRT_OUTPUTS.f90"
# element nodal forces
perl -pi -e 's/WRITE\(F06,221\) EID_OUT_ARRAY\(I,1\),GID_OUT_ARRAY\(I,J\),\(OGEL_CHAR\(K\),K=1,6\)/WRITE(F06,221) EID_OUT_ARRAY(I,1),GID_OUT_ARRAY(I,J),(OGEL(L,K),K=1,6)/;
  s/WRITE\(F06,222\) GID_OUT_ARRAY\(I,J\),\(OGEL_CHAR\(K\),K=1,6\)/WRITE(F06,222) GID_OUT_ARRAY(I,J),(OGEL(L,K),K=1,6)/;
  s/^(\s*221 FORMAT\(6X,2\(1X,I8\),)6A\)/${1}6(1X,ES24.16E3))/; s/^(\s*222 FORMAT\(16X,I8,)6A\)/${1}6(1X,ES24.16E3))/' \
  "$L91/WRITE_ELEM_NODE_FORCE.f90"
# eigenvalue summary (LINK4)
perl -pi -e 's/^(95302 FORMAT\(1X,2I8,)1ES20\.6,A,1ES19\.6,3\(1ES20\.6\)\)/${1}1ES24.16E3,A,1ES24.16E3,3(1ES24.16E3))/' \
  "$src/Source/LK4/EIG_SUMMARY.f90"
perl -pi -e 's/^95402 FORMAT\(1X,2I8,5\(1ES20\.6\)\)/95402 FORMAT(1X,2I8,5(1ES24.16E3))/' \
  "$src/Source/LK4/EIG_SUMMARY.f90"
# eigenvalue table (frequencies)
perl -pi -e 's/^98004 FORMAT\(1X,2I8,5\(1ES20\.6\)\)/98004 FORMAT(1X,2I8,5(1ES24.16E3))/' "$src/Source/LK5/LINK5.f90"
grep -q "ES24.16E3))\x27) GID_OUT_ARRAY" "$L91/WRITE_GRD_PRT_OUTPUTS.f90" &&
  [ "$(grep -c "OGEL(L,K),K=1,6" "$L91/WRITE_ELEM_NODE_FORCE.f90")" = 2 ] &&
  [ "$(grep -c "ES24.16E3" "$L91/WRITE_ELEM_NODE_FORCE.f90")" = 2 ] &&
  grep -q "^95302 FORMAT(1X,2I8,1ES24.16E3" "$src/Source/LK4/EIG_SUMMARY.f90" &&
  grep -q "^98004 FORMAT(1X,2I8,5(1ES24.16E3))" "$src/Source/LK5/LINK5.f90" &&
  grep -q "^95402 FORMAT(1X,2I8,5(1ES24.16E3))" "$src/Source/LK4/EIG_SUMMARY.f90" ||
  { echo "mystran: precision patch did not apply" >&2; exit 1; }

rm -rf "$build"
mkdir -p "$build" "$out"
"$CMAKE" -S "$src" -B "$build" -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_Fortran_COMPILER="$FC" -DCMAKE_C_COMPILER="$CC" -DGIT_SUBMODULE=OFF \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 >"$build/configure.log" 2>&1 ||
  { tail -30 "$build/configure.log" >&2; exit 1; }
make -C "$build" -j"${MAKE_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}" mystran >"$build/build.log" 2>&1 ||
  { tail -40 "$build/build.log" >&2; exit 1; }
bin="$(find "$src/Binaries" "$build" -type f -name mystran -perm -u+x 2>/dev/null | head -1)"
[ -n "$bin" ] || { echo "mystran: binary not found" >&2; exit 1; }
cp "$bin" "$out/mystran"
echo "built $out/mystran"
