#!/usr/bin/env bash
# Install Kani into ./.tools (it is not packaged in nixpkgs). Run inside `nix develop .#verify`.
set -euo pipefail
version=0.68.0
root=$(git rev-parse --show-toplevel)
if [ "$(cargo kani --version 2>/dev/null | awk 'NR==1{print $4}')" != "$version" ]; then
	cargo install --locked --root "$root/.tools" --version "$version" kani-verifier
fi
# The bundle stays in .tools so a cache hit never downloads it; Kani's toolchain is a
# symlink into ~/.rustup, which a restored .tools cache does not carry.
bundle="$root/.tools/bundles/kani-$version-x86_64-unknown-linux-gnu.tar.gz"
if [ ! -s "$bundle" ]; then
	mkdir -p "$(dirname "$bundle")"
	curl -sSLf --retry 6 --retry-all-errors --retry-delay 30 -o "$bundle.part" \
		"https://github.com/model-checking/kani/releases/download/kani-$version/kani-$version-x86_64-unknown-linux-gnu.tar.gz"
	mv "$bundle.part" "$bundle"
fi
if [ ! -x "${KANI_HOME:-$HOME/.kani}/kani-$version/toolchain/bin/cargo" ]; then
	rm -rf "${KANI_HOME:-$HOME/.kani}/kani-$version"
	cargo kani setup --use-local-bundle "$bundle"
fi
