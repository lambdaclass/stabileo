#!/usr/bin/env bash
# Re-check certificate bundles (linear static, plastic collapse, load combinations) with
# the verified Lean checker (CERTIFY.md, "Independent checking: certificate bundles").
#
#   scripts/check-bundles.sh [--no-generate] [DIR...]
#
# Generates bundles for the fixture models (Rust tests `certify_bundle::export_*`, written
# to ../target/cert-bundles) unless --no-generate, builds `certcheck`, and checks every
# bundle in the generated directory plus the committed samples in samples/ (or in the
# DIRs given):
# * `NAME.json` must be ACCEPTED, carry a provenance, and its `inputSha256` must be the
#   SHA-256 of the shipped canonical input `NAME.input.json`;
# * `NAME.tampered-*.json` must be REJECTED by certcheck;
# * `NAME.wronghash*.json` is accepted by certcheck but its hash must NOT match the input
#   (this script must catch it);
# * `NAME.badformat*.json` (unknown format) must be refused with exit 2;
# * a `stabileo.linear-certificate.v1` bundle (no provenance) must be accepted.
# Run from anywhere inside the verify dev shell.
set -euo pipefail
cd "$(dirname "$0")/.."

generate=1
if [ "${1:-}" = "--no-generate" ]; then
	generate=0
	shift
fi

export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$(cd .. && pwd)/target}
if [ $# -gt 0 ]; then
	dirs=("$@")
else
	dirs=(samples)
	if [ "$generate" = 1 ]; then
		dirs+=("$CARGO_TARGET_DIR/cert-bundles")
	fi
fi

if [ "$generate" = 1 ]; then
	(cd ../engine && cargo test -j 4 --test certify_bundle export_ -- --nocapture)
fi

sha256() {
	if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

lake build certcheck
shopt -s nullglob
bundles=()
for d in "${dirs[@]}"; do
	for f in "$d"/*.json; do
		case "$f" in *.input.json) ;; *) bundles+=("$f") ;; esac
	done
done
if [ ${#bundles[@]} -eq 0 ]; then
	echo "error: no bundles in ${dirs[*]}" >&2
	exit 1
fi

fail=0
for b in "${bundles[@]}"; do
	name=$(basename "$b")
	set +e
	out=$(.lake/build/bin/certcheck "$b")
	status=$?
	set -e
	echo "$out"
	case "$name" in
	*.tampered-*) want=1 ;;
	*.badformat*) want=2 ;;
	*) want=0 ;;
	esac
	if [ "$status" != "$want" ]; then
		echo "error: $name: certcheck exit $status, expected $want" >&2
		fail=1
		continue
	fi
	[ "$want" != 0 ] && continue
	if [ "$(jq -r .format "$b")" = "stabileo.linear-certificate.v1" ]; then
		echo "  format v1: no provenance to check (read for backward compatibility)"
		continue
	fi
	# provenance: the recorded hash against the shipped input
	input="$(dirname "$b")/${name%%.*}.input.json"
	recorded=$(jq -r '.provenance.inputSha256 // empty' "$b")
	if [ -z "$recorded" ] || [ ! -f "$input" ]; then
		echo "error: $name: no provenance hash or no shipped input $(basename "$input")" >&2
		fail=1
		continue
	fi
	actual=$(sha256 "$input")
	case "$name" in
	*.wronghash*)
		if [ "$recorded" = "$actual" ]; then
			echo "error: $name: wrong-hash sample matches its input" >&2
			fail=1
		else
			echo "  input hash MISMATCH (expected for this negative sample): recorded $recorded, $(basename "$input") has $actual"
		fi
		;;
	*)
		if [ "$recorded" = "$actual" ]; then
			echo "  input hash ok: $(basename "$input")"
		else
			echo "error: $name: input hash mismatch: recorded $recorded, $(basename "$input") has $actual" >&2
			fail=1
		fi
		;;
	esac
done
if [ "$fail" = 1 ]; then
	exit 1
fi
echo "bundles ok (${#bundles[@]} checked)"
