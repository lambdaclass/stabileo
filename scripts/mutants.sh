#!/usr/bin/env bash
# Mutation testing of the certificate code (engine/src/certify/), the core of
# the linear solver (DOF numbering, assembly, reactions, input validation) and
# the element kernels (engine/src/element/) with cargo-mutants
# (docs/verification/FUZZ_MUTANTS.md).
#
# Equivalent mutants are excluded by name in .cargo/mutants.toml, each with a
# one-line justification; any other missed mutant fails the run.
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
    tests+=(certify certify_bundle duplicate_support_reactions determinate_exact index_exhaustive
      fuzz_regressions solver_mutation_kills)
    ;;&
  element | all)
    files+=(-f 'engine/src/element/**')
    tests+=(element_rigid_body_modes shell_patch_tests shell_rigid_body_modes
      local_axis_convention determinate_exact opensees_differential_regressions)
    ;;
  certify | solver) ;;
  *) echo "MUTANTS_SCOPE must be certify, solver, element or all" >&2; exit 64 ;;
esac

# -C passes each test-target flag to both `cargo test --no-run` and `cargo test`,
# so only the listed targets are built per mutant (`-- …` reaches only the run).
cargo_args=(-C --lib)
for t in $(printf '%s\n' "${tests[@]}" | sort -u); do cargo_args+=(-C --test -C "$t"); done
cargo mutants --package dedaliano-engine "${files[@]}" --timeout-multiplier 3 "${cargo_args[@]}" "$@"
status=$?
if [[ -s mutants.out/missed.txt ]]; then
  echo "Missed mutants (add a test, or exclude in .cargo/mutants.toml with a justification if equivalent):"
  cat mutants.out/missed.txt
fi
# cargo-mutants: 2 = missed mutants, 3 = timeouts only (a timeout is a caught mutant), 4 = baseline failed.
if [[ $status -eq 3 ]]; then
  status=0
fi
exit $status
