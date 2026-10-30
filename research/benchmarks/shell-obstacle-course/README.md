# Shell obstacle course

Route: `/research/benchmarks/shell-obstacle-course`.

Belytschko et al. (1985), *Stress projection for membrane and shear locking in shell
finite elements*, CMAME 51, 221–258, DOI 10.1016/0045-7825(85)90035-0. Citation metadata
was verified through the catalogue; numerical paper tables remain unverified and
catalogue status remains **proposed**. This page uses production MITC4, not a new
implementation of the paper's stress-projection element.

## Corrected shared models

Native `obstacle::solve` and the live WASM page read
`engine/tests/benchmarks/shell_obstacle_course.json`. The roof and cylinder inputs
are regenerated from the corrected builders in `shell_benchmark.rs`; its
`research_shell_fixture_matches_corrected_builders` test enforces exact JSON value
agreement for geometry, materials, restraints, loads and measurement node.
The builders also supply the existing load-integration and other-element controls.
Hemisphere inputs are unchanged. `cases` contains the browser meshes;
`nativeCases` adds the 32×32 cylinder without increasing the browser workload.

[#810 is a test-model correction](../../../docs/audits/810-mitc4-curved-shells.md),
not an engine failure: remove the roof's artificial crown pin, union complete
symmetry constraints at corners, and retain all tributary gravity loads. The
one-eighth cylinder still uses the original inward quarter load −0.25. No engine
source, reference or 2% tolerance was changed. The historical audit snapshot stays
historical and is not the publication fixture.

Comparison uses signed roof u_z against −0.3024, cylinder u_y against −1.8248e−5,
and hemisphere u_x against +0.185. The hole hemisphere retains quarter loads ±2;
the separate solid-shell ±1 / 0.094 case remains native-only. Wrong-direction
responses fail. The live page computes fresh results rather than loading snapshots.

## Containment

Hemisphere 4×4, 8×8 and 16×16 results are **withheld by the engine (known issue
#798, SH-MITC4-DISTORTION)**. They remain in the denominator with null value/error,
no displacement field and `pass: false`. The page distinguishes this disposition
from an ordinary accuracy failure. Native exports write a refusal record for each
mesh; the WASM parity check requires the same refusal and issue identity from both
runtimes. Roof and cylinder comparisons retain their numeric checks and tolerances.
The native fixture reader evaluates every shared input once, then returns the
requested measurement to each numeric test, or the structured refusal to its
containment test.

## Reproduced results

| Case | Mesh | Signed reference | Computed | Absolute error | Verdict |
|---|---:|---:|---:|---:|---|
| roof | 6 | -0.3024 | -0.307105245101 | 1.555967% | Pass |
| roof | 8 | -0.3024 | -0.304476905273 | 0.686807% | Pass |
| roof | 12 | -0.3024 | -0.302885911279 | 0.160685% | Pass |
| roof | 16 | -0.3024 | -0.302425539214 | 0.008446% | Pass |
| cylinder | 6 | -1.8248e-05 | -1.13360236859e-05 | 37.877994% | Fail |
| cylinder | 8 | -1.8248e-05 | -1.37558255336e-05 | 24.617352% | Fail |
| cylinder | 12 | -1.8248e-05 | -1.60504470647e-05 | 12.042706% | Fail |
| cylinder | 16 | -1.8248e-05 | -1.70116168007e-05 | 6.775445% | Fail |
| hemisphere | 4 | 0.185 | Withheld (#798) | — | Withheld |
| hemisphere | 8 | 0.185 | Withheld (#798) | — | Withheld |
| hemisphere | 16 | 0.185 | Withheld (#798) | — | Withheld |
| cylinder | 32 | -1.8248e-05 | -1.80643677592e-05 | 1.006314% | Pass |

All roof meshes pass. Cylinder 6–16 errors decrease but remain outside the unchanged
2% gate; those four native accuracy tests stay ignored. Cylinder 32 passes.
The hemisphere meshes are withheld and count as not passing. The browser cap is
16×16 (289 nodes), so its finest-mesh headline is **1/3 passing**.
Without containment the hemisphere measured 0.185219186992, 0.185741984976 and
0.186206839041 (errors 0.118479%, 0.401073%, 0.652345%).
This is a workload cap, not a measured browser limit. The editor retains all six
restraint flags, and the viewer projects the actual 3D displacements.

`results/<case-id>.json` records fresh native rows for every shared input;
`results/wasm-results.json` records the fresh browser-wrapper replay. `EVIDENCE.json`
records fixture provenance and verification. The existing `wasm/check.mjs` compares
production WASM values and verdicts against the native rows at relative 1e−8
(absolute floor 1e−12), and requires the #798 refusal from both runtimes for the
hemisphere. It checks the 11 browser cases; cylinder 32 is native-only.

## Reproduction

From the repository root, with the repository Rust/Node toolchain:

```sh
export CARGO_TARGET_DIR=/private/tmp/claude-501/codex-859m-target
export CARGO_BUILD_JOBS=4
# Explicit regeneration; normal test runs only compare the committed inputs.
UPDATE_SHELL_OBSTACLE=1 cargo test --manifest-path engine/Cargo.toml --test validation research_shell_fixture_matches_corrected_builders
# Use a fresh output directory for native replay evidence.
SHELL_OBSTACLE_RESULTS=/tmp/shell-native cargo test --manifest-path engine/Cargo.toml --test validation shell_benchmark
cargo test --manifest-path engine/Cargo.toml --test validation research
make wasm
node research/benchmarks/shell-obstacle-course/wasm/check.mjs /tmp/shell-native
cd web
npx vitest run src/components/research/shell1985/__tests__/cases.test.ts
```

The updated browser e2e spec is `web/e2e/research-shell-obstacle-course.spec.ts`;
Chromium was not launched for this verification.

Verified on 2026-10-30 after merging main into #807: native `shell_benchmark`
**84 passed, 4 ignored**; native `research` **33 passed, 9 ignored**; fresh
WASM/native replay **11/11 matched** (three hemisphere refusals), headline **1/3**.
The exact fixture/builder comparison passes and the hemisphere inputs are unchanged.
