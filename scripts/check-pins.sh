#!/usr/bin/env bash
# One version of each tool, everywhere. rust-toolchain.toml and .nvmrc are the pins; flake.nix
# reads the first and names the second's major; every workflow must use the same. Runs in CI's
# lint job. With nix on the PATH it also checks the flake's wasm-pack against the workflows'.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# cargo-fuzz's sanitizers and llvm-cov --branch need a nightly: this dated one, only there.
NIGHTLY=nightly-2026-10-15

fail=0
bad() { echo "check-pins: $*" >&2; fail=1; }

[ -z "$(git ls-files '*rust-toolchain*' | grep -vx rust-toolchain.toml)" ] || bad "a second rust-toolchain file: $(git ls-files '*rust-toolchain*' | grep -vx rust-toolchain.toml)"

channel=$(sed -n 's/^channel *= *"\(.*\)"/\1/p' rust-toolchain.toml)
[ -n "$channel" ] || bad "rust-toolchain.toml has no channel"

while IFS= read -r line; do
  v=${line##*toolchain: }
  [ "$v" = "$channel" ] || [ "$v" = "$NIGHTLY" ] || bad "${line%%:*}: toolchain $v, not $channel"
done < <(grep -rn 'toolchain: ' .github/workflows/*.yml | grep -v '^\s*#')

grep -rn 'dtolnay/rust-toolchain@\(stable\|nightly\|beta\)' .github/workflows/*.yml && bad "a floating toolchain ref"
grep -rno 'cargo +[a-z0-9.-]*' .github/workflows/*.yml | grep -v "cargo +$NIGHTLY" && bad "cargo +<toolchain> other than $NIGHTLY"

node=$(tr -d ' \n' < .nvmrc)
grep -rn 'node-version:' .github/workflows/*.yml && bad "a node-version: in a workflow (use node-version-file: .nvmrc)"
grep -q "pkgs.nodejs_${node}\b" flake.nix || bad "flake.nix does not use nodejs_${node} (.nvmrc says ${node})"

wasm=$(grep -rho 'wasm-pack@[0-9.]*' .github/workflows/*.yml | sort -u)
[ "$(printf '%s\n' "$wasm" | wc -l)" -eq 1 ] || bad "workflows disagree on wasm-pack: $wasm"
if command -v nix >/dev/null 2>&1; then
  flake_wasm=$(nix develop --command wasm-pack --version 2>/dev/null | tail -1 | awk '{print $2}')
  [ "wasm-pack@$flake_wasm" = "$wasm" ] || bad "flake has wasm-pack $flake_wasm, workflows $wasm"
fi

mold=$(grep -rho 'mold-version: [0-9.]*' .github/workflows/*.yml | sort -u)
[ "$(printf '%s\n' "$mold" | wc -l)" -eq 1 ] || bad "workflows disagree on mold: $mold"
if command -v nix >/dev/null 2>&1; then
  flake_mold=$(nix eval --raw --impure --expr "let f = builtins.getFlake (toString ./.); in (import f.inputs.nixpkgs { system = \"x86_64-linux\"; }).mold.version" 2>/dev/null)
  [ "mold-version: $flake_mold" = "$mold" ] || bad "flake has mold $flake_mold, workflows ${mold#mold-version: }"
fi

[ "$fail" -eq 0 ] && echo "check-pins: rust $channel, node $node, $wasm, mold ${mold#mold-version: }"
exit "$fail"
