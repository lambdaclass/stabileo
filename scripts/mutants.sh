#!/usr/bin/env bash
# Mutation testing of the certificate code (engine/src/certify/), the core of
# the linear solver (DOF numbering, assembly, reactions, input validation) and
# the element kernels (engine/src/element/) with cargo-mutants
# (docs/verification/FUZZ_MUTANTS.md).
#
# Equivalent mutants are excluded by name in .cargo/mutants.toml, each with a
# one-line justification, and the equivalent index-arithmetic mutants by
# scripts/mutants-equivalent.py; any other missed mutant fails the run.
#
# Usage (from anywhere in the repo):
#   scripts/mutants.sh                          # certify + solver + element
#   scripts/mutants.sh --shard 3/64 --jobs 2    # extra arguments go to cargo-mutants
# Env: MUTANTS_SCOPE = certify | solver | element | all (default all).
# Exit status: 0 when every mutant is caught (or unviable / timed out), 2 when one is missed.
set -uo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

scope=${MUTANTS_SCOPE:-all}
files=()
tests=()  # integration test targets, besides the library unit tests
case $scope in
  certify | all)
    files+=(-f 'engine/src/certify/**')
    for t in engine/tests/certify*.rs; do tests+=("$(basename "$t" .rs)"); done
    tests+=(fuzz_regressions)
    ;;&
  solver | all)
    files+=(-f engine/src/solver/dof.rs -f engine/src/solver/assembly.rs -f engine/src/solver/linear.rs)
    # core (linear_2d, linear_3d, ...), integration, properties_2d and
    # solver_invariants exercise the plain 2D/3D static paths of linear.rs; the
    # next ones the sparse, PCG and sparse-dense-LU paths (nf >= 64) and their
    # diagnostics. Without them 272 of 305 mutants of the 2D static solver went
    # uncaught (#339).
    tests+=(certify certify_bundle duplicate_support_reactions determinate_exact index_exhaustive
      fuzz_regressions solver_mutation_kills core integration properties_2d solver_invariants
      pcg_solver_tests sparse_ex_analysis_regressions nan_output_gates conditioning_adversarial
      assembly_paths feature_matrix certify_end_to_end certify_end_to_end_mutations)
    ;;&
  element | all)
    files+=(-f 'engine/src/element/**')
    tests+=(element_rigid_body_modes shell_patch_tests shell_rigid_body_modes
      local_axis_convention determinate_exact opensees_differential_regressions
      certify_end_to_end certify_end_to_end_mutations)
    ;;
  certify | solver) ;;
  *) echo "MUTANTS_SCOPE must be certify, solver, element or all" >&2; exit 64 ;;
esac

# The test binary a test file belongs to: the top-level engine/tests/*.rs files are modules of a
# few binaries (engine/tests/<binary>/main.rs, `#[path = "../<file>.rs"]`); a directory target
# (core, integration) is its own binary. A binary runs all its modules, a superset of the file.
binary_of() {
  local main
  main=$(grep -l "^#\[path = \"\.\./$1\.rs\"\]" engine/tests/*/main.rs) || { echo "$1"; return; }
  basename "$(dirname "$main")"
}
# -C passes each test-target flag to both `cargo test --no-run` and `cargo test`,
# so only the listed targets are built per mutant (`-- …` reaches only the run).
cargo_args=(-C --lib)
for t in $(for t in "${tests[@]}"; do binary_of "$t"; done | sort -u); do cargo_args+=(-C --test -C "$t"); done
# A shared binary runs every module in it, not just the listed files: since the test files became
# modules of a few binaries (#611), each mutant also ran the shell convergence studies, the perf
# gates and the rest (baseline 155 s -> 400 s, a survivor ~800 s), and no shard finished within
# its budget. With nextest, a filterset keeps the run to the listed files (test names are
# `<file>::<test>`), as before #611; the plain `cargo test` runner runs the whole binaries.
filter=(kind\(lib\))
for t in $(printf '%s\n' "${tests[@]}" | sort -u); do
  b=$(binary_of "$t")
  if [[ $b == "$t" ]]; then filter+=("binary(=$t)"); else filter+=("(binary(=$b) & test(/^$t::/))"); fi
done
test_args=()
case " $* " in
  *" --test-tool nextest "* | *" --test-tool=nextest "*)
    expr=${filter[0]}
    for f in "${filter[@]:1}"; do expr+=" | $f"; done
    test_args=(-- -E "$expr")
    ;;
esac
# Equivalent mutants in constant index arithmetic (k[0 * 6 + 0] -> k[0 * 6 - 0]):
# found on the current source by scripts/mutants-equivalent.py, which keeps a
# mutant out only when the mutated index has exactly the same value.
excl=()
while IFS= read -r re; do excl+=(--exclude-re "$re"); done < <(
  cargo mutants --list --json --package dedaliano-engine "${files[@]}" | python3 scripts/mutants-equivalent.py --regex)
echo "excluded $(( ${#excl[@]} / 2 )) equivalent index-arithmetic mutants (scripts/mutants-equivalent.py)"
cargo mutants --package dedaliano-engine "${files[@]}" "${excl[@]}" --timeout-multiplier 3 "${cargo_args[@]}" "$@" "${test_args[@]}"
status=$?
if [[ -s mutants.out/missed.txt ]]; then
  echo "Missed mutants (add a test, or exclude in .cargo/mutants.toml with a justification if equivalent):"
  cat mutants.out/missed.txt
fi
# cargo-mutants: 2 = missed mutants, 3 = timeouts (a timeout is a caught mutant), 4 = baseline
# failed. 3 wins over 2: a shard with a timeout and missed mutants exits 3, and mapping every 3 to
# success hid its missed mutants (shards 91, 92, 100, 102, 107, 108, 110, 111, 116 and 8 passed
# with 14 to 125 missed each). Whatever the code, missed.txt decides.
if [[ $status -eq 3 ]]; then
  status=0
fi
if [[ $status -eq 0 && -s mutants.out/missed.txt ]]; then
  status=2
fi
exit $status
