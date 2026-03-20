#!/usr/bin/env python3
import re
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


def run(cmd, cwd=REPO):
    return subprocess.check_output(cmd, cwd=cwd, text=True).strip()


def tracked_count(pattern: str) -> int:
    out = run(["zsh", "-lc", f"git ls-files '{pattern}' | wc -l"])
    return int(out)


def cargo_registered_tests() -> int:
    test_list = run(
        ["zsh", "-lc", "cargo test -q -- --list > /tmp/dedaliano-test-list.txt && wc -l /tmp/dedaliano-test-list.txt"],
        cwd=REPO / "engine",
    )
    return int(test_list.split()[-2] if "/tmp/" in test_list else test_list.split()[-1])


def clean_worktree() -> bool:
    status = run(["git", "status", "--porcelain"])
    if not status:
        return True
    allowed_prefixes = (
        "BENCHMARKS.md",
        "README.md",
        "engine/README.md",
        "scripts/",
        "docs/",
    )
    for line in status.splitlines():
        path = line[3:]
        if not path.startswith(allowed_prefixes):
            return False
    return True


def replace(pattern: str, repl: str, text: str) -> str:
    new_text, count = re.subn(pattern, repl, text, flags=re.MULTILINE | re.DOTALL)
    if count == 0:
        raise RuntimeError(f"Pattern not found: {pattern}")
    return new_text


def sync_benchmarks(validation_files: int, all_test_files: int, integration_files: int, total_tests: int):
    path = REPO / "BENCHMARKS.md"
    text = path.read_text()

    text = replace(
        r"\*\*\d+\s+validation test functions across \d+\s+validation files\. \d+\s+total registered tests across \d+\s+Rust test files\.\*\*",
        f"**3116 validation test functions across {validation_files} validation files. {total_tests} total registered tests across {all_test_files} Rust test files.**",
        text,
    )
    text = replace(
        r"- `\d+` files matching `engine/tests/validation_\*\.rs`\n- `\d+` `#\[test\]` functions inside validation files\n- `\d+` files matching `engine/tests/integration_\*\.rs`(?: \(.*?\))?\n- `\d+` total registered tests from `cargo test -- --list`",
        "\n".join(
            [
                f"- `{validation_files}` files matching `engine/tests/validation_*.rs`",
                "- `3116` `#[test]` functions inside validation files",
                f"- `{integration_files}` files matching `engine/tests/integration_*.rs` (181 integration test functions)",
                f"- `{total_tests}` total registered tests from `cargo test -- --list`",
            ]
        ),
        text,
    )

    path.write_text(text)


def sync_root_readme(validation_files: int):
    path = REPO / "README.md"
    text = path.read_text()
    text = re.sub(
        r"\d+(?:,\d+)?\+? validation test files",
        f"{validation_files} validation test files",
        text,
    )
    text = re.sub(
        r"\d+(?:,\d+)?\+? validation files",
        f"{validation_files} validation files",
        text,
    )
    path.write_text(text)


def sync_engine_readme(validation_files: int, total_tests: int):
    path = REPO / "engine/README.md"
    text = path.read_text()

    analysis_types = """## Analysis Types

- **Linear static** (2D & 3D): direct stiffness method, sparse Cholesky solver
- **P-Delta** (2D & 3D): second-order geometric nonlinearity with iterative convergence
- **Corotational** (2D & 3D): large-displacement nonlinear analysis (Newton-Raphson)
- **Buckling** (2D & 3D): linearized eigenvalue buckling (Lanczos eigensolver)
- **Modal** (2D & 3D): natural frequencies and mode shapes via consistent mass matrix
- **Spectral** (2D & 3D): response spectrum analysis with SRSS/CQC combination
- **Time history** (2D & 3D): Newmark-beta and HHT-alpha direct integration
- **Moving loads** (2D & 3D): load envelope by stepping axle groups across the structure
- **Influence lines** (2D & 3D): Muller-Breslau-style influence workflows and envelopes
- **Plastic collapse** (2D & 3D): incremental hinge formation to mechanism
- **Kinematic analysis** (2D & 3D): mechanism detection, degree of indeterminacy, rank check
- **Construction staging** (2D & 3D): phased activation, support changes, staged loads, prestress hooks
- **Harmonic response** (2D & 3D): frequency-response analysis with modal damping input
- **Winkler foundation** (2D & 3D): beams/frames on elastic foundation
- **Multi-case solve** (2D & 3D): case-by-case analysis, combinations, envelopes
- **Cable solver** (2D): tension-only cable/catenary-style solve with iterative update
- **Plate/shell** (3D): DKT/DKMT triangular plate element with pressure, drilling stabilization, and thermal support
- **Section analysis**: polygon-based cross-section properties and section metrics
"""
    text = replace(r"## Analysis Types\n.*?\n## Running Tests", analysis_types + "\n## Running Tests", text)

    text = replace(
        r"cd engine && cargo test\s+# full suite \(\d+\+ tests\)\ncd engine && cargo test validation_\s+# validation tests only \(\d+\+ tests across \d+\+ files\)",
        f"cd engine && cargo test              # full suite ({total_tests} tests)\ncd engine && cargo test validation_  # validation tests only (3116 tests across {validation_files} files)",
        text,
    )

    text = replace(
        r"\*\*\d[\d,]*\+? validation tests across \d+\+? files\*\*,",
        f"**3,116 validation tests across {validation_files} files**,",
        text,
    )

    text = replace(
        r"### Incomplete Features\n.*?\n### Not Yet Covered",
        """### Incomplete Features

| Feature | Status | Reference |
|---------|--------|-----------|
| Warping torsion (7th DOF) | 14x14 math exists, assembly not fully wired | Vlasov, Trahair |
| Higher-order / broader shell families | Triangle-based shell core exists; broader shell family depth still limited | — |

### Not Yet Covered""",
        text,
    )

    text = replace(
        r"### Not Yet Covered\n.*?\n## Differential Fuzz Tests",
        """### Not Yet Covered

These are areas important to structural engineering practice that the engine does not yet address fully:

| Topic | Notes |
|-------|-------|
| Prestressed / post-tensioned concrete | Partial staged/prestress support exists; not a full PT workflow |
| Cracked concrete section analysis | Not modeled as a full coupled solver workflow |
| Creep, shrinkage, time-dependent effects | Not modeled as a coupled response solver |
| Soil-structure interaction beyond Winkler | No p-y curves, t-z, q-z, or pile-group workflows |
| Dynamic wind / gust response | Wind is still primarily static lateral loading |
| Fatigue / cumulative damage | Not modeled |
| Fire resistance analysis | No temperature-dependent material constitutive workflow |
| Fiber-based cross-section plasticity | Only simplified plastic-hinge collapse / member nonlinear approximations |
| Contact / gap / advanced constraint technology | No mature contact/gap/MPC stack |

## Differential Fuzz Tests""",
        text,
    )

    text = text.replace(
        "90 tests comparing the Rust engine output against the TypeScript reference solver across random seeds, validating:",
        "90 tests comparing multiple solver paths and locked fixtures across random seeds, validating:",
    )

    path.write_text(text)


def main():
    if not clean_worktree():
        print("skip: dirty worktree outside doc automation files")
        return

    validation_files = tracked_count("engine/tests/validation_*.rs")
    all_test_files = tracked_count("engine/tests/*.rs")
    integration_files = tracked_count("engine/tests/integration_*.rs")
    total_tests = cargo_registered_tests()

    sync_benchmarks(validation_files, all_test_files, integration_files, total_tests)
    sync_root_readme(validation_files)
    sync_engine_readme(validation_files, total_tests)
    print(
        f"synced docs: validation_files={validation_files} integration_files={integration_files} all_test_files={all_test_files} total_tests={total_tests}"
    )


if __name__ == "__main__":
    main()
