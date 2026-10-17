#!/usr/bin/env bash
# Fail if any proof uses `sorry` or an axiom beyond Lean's standard three
# (propext, Classical.choice, Quot.sound). Run from verify/ after `lake build`.
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -rnw --include='*.lean' -e sorry -e admit Certify Certify.lean; then
	echo "error: sorry/admit found" >&2
	exit 1
fi

theorems=(
	Certify.certified_error_bound
	Certify.posDef_of_interval_cholesky
	Certify.coercive_solution
	Certify.certified_error_bound_gram
	Certify.buckling_enclosure
	Certify.buckling_criticalFactor_mem
	Certify.count_le_of_pos_on
	"Certify.count_le_of_pos_on'"
	Certify.finrank_deletedSubspace
	Certify.count_le_of_deleted
	Certify.count_le_of_finsler
	Certify.count_le_of_finsler_gram
	Certify.exists_eigenvalue_near
	Certify.abs_mulVec_sub_le
	Certify.force_bound
	Certify.kahan_count_of_sep
	Certify.kahan_union_count
	Certify.kahan_lower_count
	Certify.Bundle.check_sound
	Certify.Bundle.check_sound_coercive
)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
{
	echo 'import Certify'
	for t in "${theorems[@]}"; do echo "#print axioms $t"; done
} > "$tmp/Axioms.lean"
out=$(lake env lean "$tmp/Axioms.lean" 2>&1)
echo "$out"
bad=$(echo "$out" | grep -oE '\[[^]]*\]' | tr -d '[]' | tr ',' '\n' | sed 's/^ *//' |
	grep -vxE 'propext|Classical\.choice|Quot\.sound' | grep -v '^$' || true)
if [ -n "$bad" ] || echo "$out" | grep -q 'error:'; then
	echo "error: unexpected axioms or errors: $bad" >&2
	exit 1
fi
echo "axioms ok"
