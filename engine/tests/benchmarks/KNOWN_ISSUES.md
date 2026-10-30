# Benchmark accuracy findings

This test-owned ledger records accuracy failures and production containment outcomes.
The production registry is [`engine/src/known_issues.rs`](../../src/known_issues.rs).
Distorted MITC4 membrane bending is contained by SH-MITC4-DISTORTION, known issue #798.

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

## MH-REFERENCE-PROVENANCE

Geometry of the straight cantilever is Fig. 4, p. 7; patch geometry is Fig. 2, p. 5, and
patch boundary fields are Table 2, p. 10. A preview of the paper supports these locators.
The numerical tables were not accessible. Values 0.4321 and 0.1081 retain provenance from
`solid_shell_locking.rs`; verify the numerical table/page against the full paper before
claiming a verified transcription. Frame cases are explicitly analytical adaptations.

## MATTIASSON-REFERENCE-AND-ACCURACY

The Mattiasson page remains **proposed**. Its four reference pairs are copied
unchanged from `BENCHMARK_REFERENCES.md`, which says to verify them against the
original paper. The Table 1 attribution and numerical transcription are not
verified. Citation metadata was checked through the catalogue checker; this is
not a check of published numbers.

Fresh production native results (L = 2, 16 elements, settings in
`mattiasson_elastica.json`):

| PL²/EI | Reference u/L, v/L | Computed u/L, v/L | Relative errors | Page classification |
|---:|---|---|---|---|
| 1 | 0.0566, 0.3015 | 0.0557827218712, 0.302243545400 | 1.443954%, 0.246615% | Pass (provisional) |
| 2 | 0.1632, 0.4929 | 0.159191217091, 0.495808283573 | 2.456362%, 0.590035% | Fail |
| 5 | 0.4054, 0.6647 | 0.385315745120, 0.722972888604 | 4.954182%, 8.766795% | Fail |
| 10 | 0.5584, 0.6854 | Not computed at requested load | — | Fail: nonconvergence, load factor 0.1 |

Native and production WASM agree on all 21 cases, including every nodal
displacement and rotation for complete solves. Parameters 7.5 and 9.5 also fail
to converge; the curves show gaps, never a line through a missing result.

For parameter 10 the solver returns a last-converged state at 10% of the requested
load. The page intentionally does not plot or compare that state at parameter 10.
The page target is strict relative error below 2% in **both signed components**;
it is a new exploratory comparison, not an existing native accuracy assertion.
Every existing native assertion, tolerance and regression floor is unchanged.
The moment regression (ML/EI = 1) converges with u/L = 0.158392041418 and
v/L = -0.459772523245 under the page's downward-positive convention. It has no
paper accuracy reference and does not demonstrate a full circle.

Do not infer a solver defect solely from discrepancies with these unverified
references. Confirm paper transcription, load convention and extensibility
assumptions; then ask the solver owner to triage accuracy and convergence.
The production runtime registry has not been changed and no runtime issue ID is
claimed. Reproduce via `research/benchmarks/mattiasson-elastica/README.md`.
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
