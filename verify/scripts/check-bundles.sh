#!/usr/bin/env bash
# Re-check linear-static certificate bundles with the verified Lean checker
# (CERTIFY.md, "Independent checking: certificate bundles").
#
#   scripts/check-bundles.sh [--no-generate] [DIR]
#
# Generates bundles for the fixture models plus tampered copies (Rust test
# `certify_bundle::export_bundles`, written to DIR, default ../target/cert-bundles),
# builds `certcheck`, and requires every `*.tampered-*.json` to be REJECTED and every
# other bundle to be ACCEPTED. Run from anywhere inside the verify dev shell.
set -euo pipefail
cd "$(dirname "$0")/.."

generate=1
if [ "${1:-}" = "--no-generate" ]; then
	generate=0
	shift
fi
dir=${1:-../target/cert-bundles}

if [ "$generate" = 1 ]; then
	export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$(cd .. && pwd)/target}
	dir=${1:-$CARGO_TARGET_DIR/cert-bundles}
	(cd ../engine && cargo test --test certify_bundle export_bundles -- --nocapture)
fi

lake build certcheck
shopt -s nullglob
bundles=("$dir"/*.json)
if [ ${#bundles[@]} -eq 0 ]; then
	echo "error: no bundles in $dir" >&2
	exit 1
fi

fail=0
for b in "${bundles[@]}"; do
	set +e
	out=$(.lake/build/bin/certcheck "$b")
	status=$?
	set -e
	echo "$out"
	case "$(basename "$b")" in
	*.tampered-*) want=1 ;;
	*) want=0 ;;
	esac
	if [ "$status" != "$want" ]; then
		echo "error: $(basename "$b"): certcheck exit $status, expected $want" >&2
		fail=1
	fi
done
if [ "$fail" = 1 ]; then
	exit 1
fi
echo "bundles ok (${#bundles[@]} checked)"
