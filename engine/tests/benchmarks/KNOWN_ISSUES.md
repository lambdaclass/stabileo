# Benchmark accuracy findings

This test-owned ledger records accuracy failures and production containment outcomes.
The production registry is [`engine/src/known_issues.rs`](../../src/known_issues.rs).
Distorted MITC4 membrane bending is contained by SH-MITC4-DISTORTION, known issue #798.
MITC4 and MITC9 on twisted surfaces are contained by SH-WARPED-MITC4 and SH-WARPED-MITC9, known issue #1057.

## MH-MITC4-DISTORTION

On the MacNeal–Harder straight cantilever (6 × 1, full root clamp), production MITC4 misses
the page's strict 2% accuracy target for distorted out-of-plane meshes. The two
distorted in-plane cases are now withheld by the engine (known issue #798):

| Mesh | Load | Reference | Computed | Relative error |
|---|---|---:|---:|---:|
| Trapezoidal | Out of plane | 0.4321 | 0.4162053612497649 | 3.678463% |
| Trapezoidal | In plane | 0.1081 | Withheld (#798) | — |
| Parallelogram | Out of plane | 0.4321 | 0.42257240188170075 | 2.204952% |
| Parallelogram | In plane | 0.1081 | Withheld (#798) | — |

The 12 live cases comprise eight accuracy passes, two numeric failures, and two
expected containment refusals. Refusals are not accuracy passes and retain their
cases, inputs, references and tolerances. Native and production WASM must both
refuse with #798 and SH-MITC4-DISTORTION. Reproduce with `shells macneal_harder::browser_cases`
and `research/benchmarks/macneal-harder-1985/wasm/check.mjs`. Inputs, references and the
accuracy threshold are in `macneal_harder.json`. These measurements are evidence of the
specified mesh's accuracy, not proof of a new implementation defect. Existing solid-shell
regression floors document related distortion sensitivity and remain unchanged.

## SH-WARPED-MITC (twisted beam, #1057)

On the MacNeal–Harder twisted cantilever (L 12, width 1.1, t 0.32, 90° twist, E 29000 in the
engine's MPa field, ν 0.22; references 0.005424 for load A and 0.001754 for load B, and
Euler–Bernoulli integration of the twisted strip), MITC4 and MITC9 are too flexible and the
error does not shrink with refinement. Ratio to beam theory, load A / load B:

| Twist | MITC4 6×2 | 12×4 | 24×8 | 48×16 | MITC9 3×1 | 6×2 | 12×4 | 24×8 | Curved shell 48×16 |
|---|---|---|---|---|---|---|---|---|---|
| 0° | 0.986 / 0.993 | 0.994 / 1.001 | 0.996 / 1.004 | 0.997 / 1.005 | 0.994 / 0.986 | 0.996 / 1.002 | 0.997 / 1.004 | 0.997 / 1.005 | 0.997 / 0.984 |
| 15° | 0.995 / 0.995 | 1.003 / 1.002 | 1.006 / 1.004 | 1.007 / 1.005 | 1.019 / 1.000 | 1.036 / 1.006 | 1.046 / 1.009 | 1.051 / 1.009 | 0.997 / 0.985 |
| 45° | 1.062 / 1.040 | 1.075 / 1.040 | 1.080 / 1.041 | 1.082 / 1.041 | 1.211 / 1.229 | 1.337 / 1.209 | 1.414 / 1.214 | 1.452 / 1.215 | 0.997 / 0.991 |
| 90° | withheld (#798) | 1.304 / 1.271 | 1.318 / 1.267 | 1.323 / 1.267 | 1.697 / 2.372 | 2.141 / 2.336 | 2.413 / 2.333 | 2.544 / 2.318 | 0.998 / 0.997 |

The error follows the twist curvature times the thickness (κt; 0.042 at 90°), not the warp
per element: at 90° with the width halved or doubled MITC4 stays at 1.30 to 1.32 (load A),
while halving t gives 1.08 and doubling it 2.21. The engine now withholds both elements above
the measured 5 % level and warns above 1.5 % (docs/verification/CONTAINMENT.md, #1057). The
formulation fix is open in #1057 and must be checked against both references.

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
| hemisphere | 4 | 0.185 | Withheld (#798) | — | Withheld |
| hemisphere | 8 | 0.185 | Withheld (#798) | — | Withheld |
| hemisphere | 16 | 0.185 | Withheld (#798) | — | Withheld |
| cylinder | 32 | -1.8248e-05 | -1.80643677592e-05 | 1.006314% | Pass |

All four roof meshes pass the unchanged strict 2% gate. Cylinder error decreases
with refinement; the four 6–16 checks remain ignored because they still exceed 2%.
The native-only 32×32 cylinder passes at 1.006314% error. The browser retains its
16×16 cap and reports 1/3 finest selected meshes passing (the hemisphere is withheld). The old roof plateau and
cylinder over-compliance were model-definition errors, not engine failures.
See [replay evidence](../../../research/benchmarks/shell-obstacle-course/README.md).
Production withholds the hemisphere meshes under SH-MITC4-DISTORTION (#798), and
their tests assert that refusal. Without containment they measured 0.185219186992,
0.185741984976 and 0.186206839041 (errors 0.118479%, 0.401073%, 0.652345%). These obstacle-course accuracy findings have no assigned runtime
issue numbers; the separate distorted membrane-bending containment is #798.

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
