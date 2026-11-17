"""Which Verify jobs a pull request or merge-group entry needs, from its changed paths on stdin.

Prints `verify=` (lean, symbolic) and `kani=` lines for $GITHUB_OUTPUT. No paths, or as many as
the pull-request files API can list, means it cannot tell what changed, so both run.
"""
import re
import sys

API_FILE_LIMIT = 3000

VERIFY_PATHS = re.compile(
    r'^(verify/|engine/src/|engine/Cargo\.toml$|Cargo\.lock$|testing/docs/|testing/symbolic/'
    r'|engine/tests/symbolic_elements\.rs$|flake\.(nix|lock)$|testing/scripts/kani|\.github/workflows/verify\.yml$'
    r'|\.github/scripts/verify-changes\.py$)')

KANI_MODULES = (
    'engine/src/kani_proofs.rs',
    'engine/src/lib.rs',
    'engine/src/element/',
    'engine/src/linalg/',
    'engine/src/types/',
    'engine/src/ordered.rs',
    'engine/src/check.rs',
    'engine/src/certify/mod.rs',
    'engine/src/certify/interval.rs',
    'engine/src/certify/sparse.rs',
    'engine/src/certify/exact.rs',
    'engine/src/certify/plastic_budget.rs',
    'engine/src/certify/finite.rs',
    'engine/src/certify/linear.rs',
    'engine/src/boundary.rs',
    'engine/src/known_issues.rs',
    'engine/src/postprocess/diagrams.rs',
    'engine/src/postprocess/load_station.rs',
    'engine/src/postprocess/result_summary.rs',
    'engine/src/refusal.rs',
    'engine/src/result_sites/keys.rs',
    'engine/src/result_sites/mod.rs',
    'engine/src/solver/applied_loads.rs',
    'engine/src/solver/assembly.rs',
    'engine/src/solver/cable.rs',
    'engine/src/solver/conditioning.rs',
    'engine/src/solver/conditioning_accuracy.rs',
    'engine/src/solver/constraints.rs',
    'engine/src/solver/contact.rs',
    'engine/src/solver/convergence.rs',
    'engine/src/solver/corotational.rs',
    'engine/src/solver/damping.rs',
    'engine/src/solver/definiteness.rs',
    'engine/src/solver/dof.rs',
    'engine/src/solver/dynamic_validation.rs',
    'engine/src/solver/equilibrium.rs',
    'engine/src/solver/feature_gates.rs',
    'engine/src/solver/fiber_nonlinear.rs',
    'engine/src/solver/geometric_stiffness.rs',
    'engine/src/solver/linear.rs',
    'engine/src/solver/load_work.rs',
    'engine/src/solver/mass_matrix.rs',
    'engine/src/solver/material_nonlinear.rs',
    'engine/src/solver/member_actions.rs',
    'engine/src/solver/member_loads.rs',
    'engine/src/solver/modal_mass.rs',
    'engine/src/solver/pdelta.rs',
    'engine/src/solver/pre_solve_gates.rs',
    'engine/src/solver/prestress.rs',
    'engine/src/solver/reaction_recovery.rs',
    'engine/src/solver/self_checks.rs',
    'engine/src/solver/soil_curves.rs',
    'engine/src/solver/sparse_assembly.rs',
    'engine/src/solver/sparse_tangent.rs',
    'engine/src/solver/ssi.rs',
    'engine/src/solver/stability.rs',
    'engine/src/solver/staged.rs',
    'engine/src/solver/support.rs',
    'engine/src/solver/time_integration.rs',
    'engine/src/solver/validity.rs',
    'engine/src/solver/winkler.rs',
)

KANI_BUILD = re.compile(
    r'^((engine/)?Cargo\.(toml|lock)|(engine/)?\.cargo/.*|(engine/)?build\.rs|rust-toolchain(\.toml)?|flake\.(nix|lock)'
    r'|testing/scripts/kani[^/]*|\.github/workflows/verify\.yml|\.github/scripts/verify-changes\.py)$')


def kani_input(path):
    return path.startswith(KANI_MODULES) or bool(KANI_BUILD.match(path))


def select(paths):
    paths = [p for p in paths if p]
    if not paths or len(paths) >= API_FILE_LIMIT:
        return {'verify': True, 'kani': True}
    return {'verify': any(VERIFY_PATHS.match(p) for p in paths), 'kani': any(kani_input(p) for p in paths)}


if __name__ == '__main__':
    result = select(sys.stdin.read().splitlines())
    for key, value in result.items():
        print(f'{key}={str(value).lower()}')
