# Benchmark accuracy findings

This test-owned ledger records accuracy failures without changing runtime diagnostics.
The production registry is [`engine/src/known_issues.rs`](../../src/known_issues.rs).
It currently has no open shell entry. These findings need solver-owner triage before any
runtime registry entry is added; no runtime issue number is implied here.

## MH-MITC4-DISTORTION

On the MacNeal–Harder straight cantilever (6 × 1, full root clamp), production MITC4 misses
the page's strict 2% accuracy target for both trapezoidal and parallelogram meshes:

| Mesh | Load | Reference | Computed | Relative error |
|---|---|---:|---:|---:|
| Trapezoidal | Out of plane | 0.4321 | 0.4162053612497649 | 3.678463% |
| Trapezoidal | In plane | 0.1081 | 0.008443013508022026 | 92.189627% |
| Parallelogram | Out of plane | 0.4321 | 0.42257240188170075 | 2.204952% |
| Parallelogram | In plane | 0.1081 | 0.010379694543545988 | 90.398062% |

Native and production WASM agree. Reproduce with `shells macneal_harder::browser_cases`
and `research/benchmarks/macneal-harder-1985/wasm/check.mjs`. Inputs, references and the
accuracy threshold are in `macneal_harder.json`. These measurements are evidence of the
specified mesh's accuracy, not proof of a new implementation defect. Existing solid-shell
regression floors document related distortion sensitivity and remain unchanged.

## MH-TWISTED-BEAM-MITC4 and MH-TWISTED-BEAM-MITC9

The MacNeal–Harder twisted beam (L = 12, w = 1.1, t = 0.32, 90° linear twist, E = 29·10⁶,
ν = 0.22, unit tip load) used to enter E = 29·10⁶ into the MPa field, so every shell family
was 1000× too stiff and the ~0.1 % ratios were read as "flat-faceted locking". With E entered
as 29·10³ MPa (consistent units), MITC4 converges to a wrong, too-flexible answer, MITC9 stays
too flexible without converging (load A still rising), and no warning is attached to the result:

| Family | Load | 6×2 (Q9 3×1) | 12×4 (Q9 6×2) | 24×8 (Q9 12×4) | 48×16 |
|---|---|---:|---:|---:|---:|
| MITC4 | A (Pz, 0.005424) | 1.2751 | 1.3047 | 1.3180 | 1.3237 |
| MITC4 | B (Py, 0.001754) | 1.2838 | 1.2653 | 1.2617 | 1.2611 |
| MITC9 | A | 1.6979 | 2.1416 | 2.4142 | |
| MITC9 | B | 2.3611 | 2.3250 | 2.3229 | |
| Curved shell | A | 0.9927 | 0.9938 | 0.9968 | |
| Curved shell | B | 0.8140 | 0.9234 | 0.9755 | |
| SHB8-ANS | B | 4×1: 0.8995 | 8×1: 0.9715 | | |

References: MacNeal & Harder (1985) 0.005424 / 0.001754; Euler–Bernoulli bending of the
twisted strip (`twisted_beam_beam_theory` in `shell_benchmark.rs`) 0.0054259 / 0.0017462.
Altair OptiStruct verification OS-V 0700 reports 0.992 / 0.988 for its QUAD4 on this problem.

The model is not the cause: the curved shell and SHB8-ANS converge to the references on the
same geometry, supports and load, a tip load spread over all tip nodes changes MITC4 by
< 0.03 %, and with zero twist MITC4 and MITC9 match beam theory (A 0.006592 vs 0.006612,
B 5.62·10⁻⁴ vs 5.60·10⁻⁴ plus shear). The error grows with the twist and does not vanish
as the warp per element goes to zero (24×8 → 48×16): MITC4 A is +0.6 % at 15°, +8 % at 45°,
+32 % at 90°; MITC9 A is +5 % at 15°, +45 % at 45°, +141 % at 90° (Q9 12×4, the table's
24×8 column), and MITC9 A is still rising with refinement (1.70 → 2.14 → 2.41). An element
that is consistent on smooth twisted geometry would converge, so this points at the
warped-element treatment (warp offsets / local frame) of `element/quad.rs` and
`element/quad9.rs`, not at locking. Over-flexibility is the conservative direction for
deflection but distributes forces wrongly in a statically indeterminate shell structure.

Tests: `benchmark_twisted_beam_load_{a,b}` and `benchmark_q9_twisted_beam_load_{a,b}` pin the
present ratios (±0.001) so any change fails; `benchmark_twisted_beam_mitc4_accuracy` and
`benchmark_q9_twisted_beam_accuracy` are the ignored strict 2 % checks
(`cargo test --test validation twisted -- --ignored`). Needs solver-owner triage, a runtime
`known_issues.rs` entry or a warping warning, and a GitHub issue.

## MH-REFERENCE-PROVENANCE

Geometry of the straight cantilever is Fig. 4, p. 7; patch geometry is Fig. 2, p. 5, and
patch boundary fields are Table 2, p. 10. A preview of the paper supports these locators.
The numerical tables were not accessible. Values 0.4321 and 0.1081 retain provenance from
`solid_shell_locking.rs`; verify the numerical table/page against the full paper before
claiming a verified transcription. Frame cases are explicitly analytical adaptations.

## MATTIASSON-REFERENCE-AND-ACCURACY

Resolved benchmark-input and reference errors (review round 2, 2026-10-30).
The live model now uses A=1 m², 100 increments and tolerance 1e-8 for force cases.
All 21 cases reach full load; four force checks and the one-radian circular-arc
moment check pass the strict 0.1% signed-component limit. The current numerical
report and reproduction commands are in
[`README.md`](../../../research/benchmarks/mattiasson-elastica/README.md) and
[`RESULTS.json`](../../../research/benchmarks/mattiasson-elastica/RESULTS.json).

References are independent elliptic integrals, corroborated by Nanakorn & Vu
(2006), Table 1, p.1245; moment references are circular-arc formulas. No direct
transcription of Mattiasson's original table is claimed. Historical 1/4 and 3/4
counts used superseded references or mismatched area/stepping. No production
numerical change or solver-defect attribution is needed.

## SHELL-OBSTACLE-COURSE

The shared MITC4 inputs include the [#810 test-model correction](../../../docs/audits/810-mitc4-curved-shells.md):
remove the artificial roof crown support, retain all gravity loads, and union complete
symmetry constraints at intersecting edges. No engine source or tolerance changed.
The fixture is checked against the corrected builders. This is not an implementation
of Belytschko et al.'s stress-projection element.

Fresh native measurements (signed, with direction-aware relative error):

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
| hemisphere | 4 | 0.185 | 0.185219186992 | 0.118479% | Pass |
| hemisphere | 8 | 0.185 | 0.185741984976 | 0.401073% | Pass |
| hemisphere | 16 | 0.185 | 0.186206839041 | 0.652345% | Pass |
| cylinder | 32 | -1.8248e-05 | -1.80643677592e-05 | 1.006314% | Pass |

All four roof meshes pass the unchanged strict 2% gate. Cylinder error decreases
with refinement; the four 6–16 checks remain ignored because they still exceed 2%.
The native-only 32×32 cylinder passes at 1.006314% error. The browser retains its
16×16 cap and reports 2/3 finest selected meshes passing. The old roof plateau and
cylinder over-compliance were model-definition errors, not engine failures.
See [replay evidence](../../../research/benchmarks/shell-obstacle-course/README.md).

The live hemisphere is the NAFEMS LE3-labelled 18°-hole case in
`benchmark_hemisphere_hole_convergence`: quarter loads ±2, reference 0.185. The solid-shell
`hemisphere_with_hole` instead uses quarter loads ±1 and reference 0.094 (with 0.0924 also
cited). That native-only case is explicitly listed, not compared with 0.185.

Paper metadata: Belytschko, Stolarski, Liu, Carpenter and Ong (1985), CMAME 51, 221–258,
DOI 10.1016/0045-7825(85)90035-0; Crossref metadata checked by the catalogue checker.
References are inherited from the named tests. Exact numerical table/page provenance,
NAFEMS load convention and the relationship to the 1985 paper remain unverified against
primary text. Status stays proposed. Browser selection is bounded at 16 divisions (289 nodes) for every model. Cylinder
12/16 use corrected models and retain their explicit ignored 2% accuracy checks.
The workload cap is not a browser capacity measurement. Chromium was not launched.
