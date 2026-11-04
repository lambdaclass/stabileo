#!/usr/bin/env bash
# Build CalculiX ccx 2.23 for the differential harness into
# tools/differential/.tools/ccx-hp (a nix store symlink, also a GC root).
#
#   tools/differential/calculix/setup.sh
#
# nixpkgs' calculix-ccx (pinned nixpkgs revision below) with one patch that
# changes output precision only, never the mechanics: *NODE PRINT writes
# e24.16 instead of e13.6 (7 significant digits, a ~5e-7 floor right at the
# harness tolerance). The patched lines stay within the 72-column fixed form
# (checked), so no compiler flag changes; lifting the line limit globally
# breaks other sources (hybsvd.f has text past column 72).
#
# Without nix, set CCX_BIN to a ccx 2.23 built the same way (brew's ccx
# prints 7 digits: comparisons then bottom out at ~1e-6 and are not
# meaningful at the default tolerance).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/.tools/ccx-hp"
rev="494ce7fd23ff6a5dff39e1fb11e9b6f2ac74bf25"
mkdir -p "$root/.tools"
nix build --impure --out-link "$out" --expr "
let pkgs = (builtins.getFlake \"github:NixOS/nixpkgs/$rev\").legacyPackages.\${builtins.currentSystem};
in pkgs.calculix-ccx.overrideAttrs (old: {
  pname = \"calculix-ccx-hp\";
  postPatch = (old.postPatch or \"\") + ''
    sed -i 's/e13\\.6/e24.16/g' printoutnode.f
    grep -q 'e24.16' printoutnode.f
    ! awk 'length > 72 && !/^[cC!*]/' printoutnode.f | grep -q .
  '';
  enableParallelBuilding = true;
})"
# ccx -v prints its version and exits with status 201 (CalculiX's STOP code),
# which pipefail would turn into a failure of this script.
ver="$("$out/bin/ccx" -v 2>&1 || true)"
grep -q "2.23" <<<"$ver" || { echo "calculix: unexpected version: $ver" >&2; exit 1; }
echo "built $out/bin/ccx"
