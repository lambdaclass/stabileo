#!/usr/bin/env bash
# Trusted-base gate for the Lean proofs (docs/verification/TRUSTED_BASE.md). Run from
# verify/ after `lake build`. Fails on:
# * an unpinned toolchain or Mathlib (lean-toolchain must name an exact release, the
#   lakefile's Mathlib `rev` must be a tag or commit and match lake-manifest.json, and
#   Mathlib's own toolchain must equal ours);
# * `sorry`, `admit` or `native_decide` anywhere in the sources (native_decide trusts the
#   compiler: it adds an axiom per use, and there is no justified use here);
# * an axiom beyond Lean's standard three (propext, Classical.choice, Quot.sound) behind
#   any top-level soundness theorem (`#print axioms`, printed for review), and behind any
#   constant of the Certify library at all (scripts/AxiomScan.lean, which also rejects
#   `axiom`, `@[implemented_by]` and `@[extern]` in Certify).
# The source grep also rejects `axiom`, `implemented_by` and `extern`, and every module
# under Certify/ must be imported by Certify.lean, so `lake build` checks all of them.
#
#   scripts/check-axioms.sh [--scan-only]
#
# --scan-only runs only the exhaustive scan (scripts/test-axiom-gate.sh uses it to show the
# scan alone catches what it plants).
set -euo pipefail
cd "$(dirname "$0")/.."

# Every library module, from the file system (not from Certify.lean's imports).
mapfile -t modules < <(find Certify -name '*.lean' | sort | sed 's|\.lean$||; s|/|.|g')

# The exhaustive scan: every constant of every module above and of CertCheck.
scan() {
	lake build "${modules[@]/#/+}" +CertCheck
	local f
	f=$(mktemp -d)/AxiomScanAll.lean
	{
		printf 'import %s\n' "${modules[@]}" CertCheck
		sed '/^import /d' scripts/AxiomScan.lean
	} > "$f"
	lake env lean "$f"
	rm -rf "$(dirname "$f")"
}

if [ "${1:-}" = "--scan-only" ]; then
	scan
	exit 0
fi

# --- pins ---------------------------------------------------------------------------
toolchain=$(tr -d '[:space:]' < lean-toolchain)
if ! [[ $toolchain =~ ^leanprover/lean4:v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "error: lean-toolchain '$toolchain' is not an exact release" >&2
	exit 1
fi
lake_rev=$(sed -n '/name = "mathlib"/,/^\[/s/^rev = "\(.*\)"/\1/p' lakefile.toml)
manifest_rev=$(jq -r '.packages[] | select(.name == "mathlib") | .inputRev' lake-manifest.json)
manifest_commit=$(jq -r '.packages[] | select(.name == "mathlib") | .rev' lake-manifest.json)
if [ -z "$lake_rev" ] || ! [[ $lake_rev =~ ^(v[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f]{40})$ ]]; then
	echo "error: Mathlib rev '$lake_rev' in lakefile.toml is not a release tag or commit" >&2
	exit 1
fi
if [ "$lake_rev" != "$manifest_rev" ] || ! [[ $manifest_commit =~ ^[0-9a-f]{40}$ ]]; then
	echo "error: lake-manifest.json (inputRev $manifest_rev, rev $manifest_commit) does not pin lakefile's $lake_rev" >&2
	exit 1
fi
if [ -f .lake/packages/mathlib/lean-toolchain ]; then
	ml_toolchain=$(tr -d '[:space:]' < .lake/packages/mathlib/lean-toolchain)
	if [ "$ml_toolchain" != "$toolchain" ]; then
		echo "error: Mathlib wants $ml_toolchain, lean-toolchain says $toolchain" >&2
		exit 1
	fi
fi
echo "pins ok: $toolchain, mathlib $lake_rev ($manifest_commit)"

# --- forbidden tactics and declarations ------------------------------------------------
if grep -rnwE --include='*.lean' -e 'sorry|admit|native_decide' Certify Certify.lean CertCheck.lean; then
	echo "error: sorry/admit/native_decide found" >&2
	exit 1
fi
if grep -rnE --include='*.lean' -e '^[[:space:]]*(@\[[^]]*\][[:space:]]*)?((private|protected|noncomputable|unsafe)[[:space:]]+)*axiom[[:space:]]' \
	-e 'implemented_by|@\[extern|[[:space:],]extern[[:space:]]+"' Certify Certify.lean CertCheck.lean; then
	echo "error: axiom / implemented_by / extern declaration found" >&2
	exit 1
fi

# --- every module is part of the library build ------------------------------------------
missing=()
for m in "${modules[@]}"; do
	grep -qxF "import $m" Certify.lean || missing+=("$m")
done
if [ ${#missing[@]} -gt 0 ]; then
	echo "error: Certify.lean does not import: ${missing[*]} (lake build would not check them)" >&2
	exit 1
fi

# --- axioms of the top-level soundness theorems (printed) -------------------------------
theorems=(
	# linear static: dense interval Cholesky, Gram/Gershgorin, bundle checker
	Certify.coercive_solution
	Certify.error_bound
	Certify.coercive_of_posDef
	Certify.certified_error_bound
	Certify.posDef_of_interval_cholesky
	Certify.certified_error_bound_gram
	Certify.end_to_end_bound
	Certify.virtual_work
	Certify.vnorm_mulVec_le_of_rows
	Certify.coercive_of_gram
	Certify.Bundle.check_sound
	Certify.Bundle.check_sound_coercive
	# interval arithmetic (abstract outward rounding down x ≤ x ≤ up x)
	Certify.Interval.mem_add
	Certify.Interval.mem_sub
	Certify.Interval.mem_mul
	Certify.Interval.mem_div
	Certify.Interval.mem_sqrt
	Certify.Interval.mem_square
	# buckling
	Certify.buckling_enclosure
	Certify.buckling_criticalFactor_mem
	# modal: counting (Sylvester/Finsler), eigenvalue inclusion, Kahan
	Certify.count_le_of_pos_on
	"Certify.count_le_of_pos_on'"
	Certify.count_le_of_pos_on_ker
	Certify.finrank_deletedSubspace
	Certify.count_le_of_deleted
	Certify.count_le_of_finsler
	Certify.count_le_of_finsler_gram
	Certify.exists_eigenvalue_near
	Certify.kahan_count_of_sep
	Certify.kahan_union_count
	Certify.kahan_lower_count
	# member forces
	Certify.abs_mulVec_sub_le
	Certify.force_bound
	# plastic collapse
	Certify.Plastic.bern_bound
	Certify.Plastic.static_sound
	Certify.Plastic.kinematic_sound
	Certify.Plastic.check_sound
	# load combinations and envelopes
	Certify.Combo.case_sound
	Certify.Combo.check_sound_disp
	Certify.Combo.check_sound_quantities
)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
{
	echo 'import Certify'
	for t in "${theorems[@]}"; do echo "#print axioms $t"; done
} > "$tmp/Axioms.lean"
out=$(lake env lean "$tmp/Axioms.lean" 2>&1) || true  # errors are reported below
echo "$out"
bad=$(echo "$out" | grep -oE '\[[^]]*\]' | tr -d '[]' | tr ',' '\n' | sed 's/^ *//' |
	grep -vxE 'propext|Classical\.choice|Quot\.sound' | grep -v '^$' || true)
if [ -n "$bad" ] || echo "$out" | grep -qE 'error:|sorryAx'; then
	echo "error: unexpected axioms or errors: $bad" >&2
	exit 1
fi
if [ "$(echo "$out" | grep -c 'depends on axioms\|does not depend on any axioms')" -ne "${#theorems[@]}" ]; then
	echo "error: expected ${#theorems[@]} '#print axioms' reports" >&2
	exit 1
fi

# --- every constant of the library ------------------------------------------------------
scan
echo "axioms ok"
