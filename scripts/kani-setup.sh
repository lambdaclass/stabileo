#!/usr/bin/env bash
# Install Kani into ./.tools (it is not packaged in nixpkgs). Run inside `nix develop .#verify`.
set -euo pipefail
version=0.68.0
root=$(git rev-parse --show-toplevel)
if [ "$(cargo kani --version 2>/dev/null | awk 'NR==1{print $4}')" != "$version" ]; then
	cargo install --locked --root "$root/.tools" --version "$version" kani-verifier
fi
# Kani's toolchain is a symlink into ~/.rustup, which a restored .tools cache
# does not carry: set up again whenever it does not resolve.
if [ ! -x "${KANI_HOME:-$HOME/.kani}/kani-$version/toolchain/bin/cargo" ]; then
	rm -rf "${KANI_HOME:-$HOME/.kani}/kani-$version"
	cargo kani setup
fi
