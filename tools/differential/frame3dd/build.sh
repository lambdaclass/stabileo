#!/usr/bin/env bash
# Build Frame3DD 20140514+ from source into tools/differential/.tools/frame3dd/.
#
#   tools/differential/frame3dd/build.sh
#
# The pinned source zip is downloaded (sha256-checked) and patched for use as
# a differential reference. The patches change precision and output only,
# never the mechanics:
#   * every `float` becomes `double` (Frame3DD stores sections, materials,
#     roll angles and loads in single precision: ~6e-8 relative input error),
#     with the matching `%f` -> `%lf` in the scanf calls;
#   * results are printed with %.16e instead of %11.6f / %10.3f, and the
#     "print 0.0 below 1e-8 (displacements) / 1e-4 (forces)" cut-offs are
#     removed.
# A second binary, frame3dd-norot, also drops two terms stabileo's element
# does not model (used for modal comparisons, see README.md): the rotary
# inertia (rho*Iy, rho*Iz) of the consistent mass matrix and the torsional
# geometric-stiffness term N*J/(A*L). P-Delta uses the full binary: stabileo's
# K_G has had the equivalent Wagner term N*(Iy+Iz)/(A*L) since #404, and
# pdelta3d models are generated with J = Iy + Iz.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/.tools/frame3dd"
build="$root/.build/frame3dd"
url="https://downloads.sourceforge.net/project/frame3dd/frame3dd/0.20140514%2B/Frame3DD_20140514%2B_src.zip"
sha="3a048ac15c074f412cede1508d0e552927e38377de23677e72f4af587fc2ae48"
cc="${CC:-cc}"
# Bump when a patch below changes, so that ci.sh rebuilds a stale .tools build.
PATCH_LEVEL=2

rm -rf "$build"
mkdir -p "$build/dl" "$out"
curl -sSL -A "Wget/1.21" -o "$build/dl/src.zip" "$url"
got="$(shasum -a 256 "$build/dl/src.zip" | cut -d' ' -f1)"
[ "$got" = "$sha" ] || { echo "frame3dd: sha256 mismatch ($got)" >&2; exit 1; }
(cd "$build/dl" && unzip -q src.zip)
src="$build/src"
cp -R "$build/dl/Frame3DD/src" "$src"

cd "$src"
perl -pi -e 's/\bfloat\b/double/g' ./*.c ./*.h
perl -pi -e 's/%f/%lf/g if /scanf/' ./*.c
perl -pi -e '
  s/fabs\(D\[6\*j-i\]\) < 1\.e-8/fabs(D[6*j-i]) < 0.0/g;
  s/fabs\(Q\[n\]\[(\w+)\]\) < 0\.0001/fabs(Q[n][$1]) < 0.0/g;
  s/" %11\.6f",\s*D\[/" %.16e", D[/g;
  s/" %10\.3f", Q\[/" %.16e", Q[/g;
  s/" %11\.3f", R\[/" %.16e", R[/g;
  s/" %11\.3e", V\[/" %.16e", V[/g;
  s/f= %lf Hz,  T= %lf sec/f= %.16e Hz,  T= %.16e sec/;
' frame3dd_io.c
# Frame3DD bug (main.c, modal analysis): a restrained DOF i is decoupled with
# `for (j=i+1; ...) K[j][i]=K[i][j]=M[j][i]=M[i][j]=0`, which leaves its
# coupling to every lower-numbered DOF in place: restrained DOFs act as stiff
# springs carrying a mass traceM (0.5% low first frequency on a 4-member
# frame with a partially restrained node). Zero the whole row and column.
perl -0pi -e 's/for \(j=i\+1; j<=DoF; j\+\+\)\n(\s*)K\[j\]\[i\]=K\[i\]\[j\]=M\[j\]\[i\]=M\[i\]\[j\] = 0\.0;/for (j=1; j<=DoF; j++) if (j != i)\n$1K[j][i]=K[i][j]=M[j][i]=M[i][j] = 0.0;/' main.c
grep -q "if (j != i)" main.c || { echo "frame3dd: modal reaction patch did not apply" >&2; exit 1; }

# Frame3DD bug (frame3dd.c, frame_element_force): with the geometric stiffness
# on (geom), K_G carries the torsional term T/L*J/Ax (kg[4][4]), but the end
# torque is computed as -(G*J/Le)*dtheta without it, so the reported torque
# does not balance the solved (K + K_G) u. Add the term (T is 0 without geom,
# so static and modal output do not change). stabileo's end torque includes
# its Wagner term N*(Iy+Iz)/(A*L), the same term for J = Iy + Iz (#404).
perl -pi -e 's/s\[4\]  =   -\(G\*J\/Le\) \*/s[4]  =   -(G*J\/Le + T\/L*J\/Ax) */' frame3dd.c
grep -q "G\*J/Le + T/L\*J/Ax" frame3dd.c || { echo "frame3dd: end-torque patch did not apply" >&2; exit 1; }

srcs="main.c frame3dd.c frame3dd_io.c coordtrans.c eig.c HPGmatrix.c HPGutil.c NRutil.c"
# shellcheck disable=SC2086
"$cc" -O2 -w -o "$out/frame3dd" $srcs -lm
perl -pi -e 's/^(\s*)ry =  d\*Iy;/$1ry = 0.0;/; s/^(\s*)rz =  d\*Iz;/$1rz = 0.0;/;
  s/kg\[4\]\[4\]  = kg\[10\]\[10\] = T\/L\*J\/Ax;/kg[4][4]  = kg[10][10] = 0.0;/' frame3dd.c
grep -q "ry = 0.0;" frame3dd.c && grep -q "kg\[10\]\[10\] = 0.0;" frame3dd.c ||
  { echo "frame3dd: norot patch did not apply" >&2; exit 1; }
# shellcheck disable=SC2086
"$cc" -O2 -w -o "$out/frame3dd-norot" $srcs -lm
echo "$PATCH_LEVEL" > "$out/patch-level"
echo "built $out/frame3dd and $out/frame3dd-norot"
