"""Which Verify jobs a pull request or merge-group entry needs, from its changed paths on stdin.

Prints `verify=` (lean, symbolic) and `kani=` lines for $GITHUB_OUTPUT. No paths, or as many as
the pull-request files API can list, means it cannot tell what changed, so both run.
"""
import re
import sys

API_FILE_LIMIT = 3000

VERIFY_PATHS = re.compile(
    r'^(verify/|engine/src/|engine/Cargo\.toml$|Cargo\.lock$|docs/verification/|tools/symbolic/'
    r'|engine/tests/symbolic_elements\.rs$|flake\.(nix|lock)$|scripts/kani|\.github/workflows/verify\.yml$'
    r'|\.github/scripts/verify-changes\.py$)')

KANI_MODULES = (
    'engine/src/kani_proofs.rs',
    'engine/src/lib.rs',
    'engine/src/element/',
    'engine/src/linalg/',
    'engine/src/types/',
    'engine/src/ordered.rs',
    'engine/src/certify/mod.rs',
    'engine/src/certify/interval.rs',
    'engine/src/certify/sparse.rs',
    'engine/src/certify/exact.rs',
    'engine/src/certify/finite.rs',
    'engine/src/certify/linear.rs',
)

KANI_BUILD = re.compile(
    r'^((engine/)?Cargo\.(toml|lock)|(engine/)?\.cargo/.*|(engine/)?build\.rs|rust-toolchain(\.toml)?|flake\.(nix|lock)'
    r'|scripts/kani[^/]*|\.github/workflows/verify\.yml|\.github/scripts/verify-changes\.py)$')


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
