# Benchmark accuracy findings

This test-owned ledger records accuracy failures without changing runtime diagnostics.
The production registry is [`engine/src/known_issues.rs`](../../src/known_issues.rs).
Entries here are not runtime registry entries; a GitHub issue link tracks the finding, not
a runtime diagnostic.

## MH-MITC4-DISTORTION

On the MacNeal–Harder straight cantilever (6 × 1, full root clamp), production MITC4 misses
the page's strict 2% accuracy target for both trapezoidal and parallelogram meshes:

| Mesh | Load | Reference | Computed | Relative error |
|---|---|---:|---:|---:|
| Trapezoidal | Out of plane | 0.4321 | 0.4162053612497649 | 3.678463% |
| Trapezoidal | In plane | 0.1081 | 0.008443013508022026 | 92.189627% |
| Parallelogram | Out of plane | 0.4321 | 0.42257240188170075 | 2.204952% |
| Parallelogram | In plane | 0.1081 | 0.010379694543545988 | 90.398062% |

Tracked as [#798](https://github.com/lambdaclass/stabileo/issues/798). Native and production
WASM agree. `shells macneal_harder::browser_cases` pins each computed value above (`nativeBounds`,
relative drift below 1e-8) and every case's pass/fail outcome (`expectedPass`), so a change in
these numbers fails CI; `research/benchmarks/macneal-harder-1985/wasm/check.mjs` requires WASM
to match. Inputs, signed references and the accuracy threshold are in `macneal_harder.json`. These measurements are evidence of the
specified mesh's accuracy, not proof of a new implementation defect. Existing solid-shell
regression floors document related distortion sensitivity and remain unchanged.

## MH-REFERENCE-PROVENANCE

Geometry of the straight cantilever is Fig. 4, p. 7; patch geometry is Fig. 2, p. 5, and
patch boundary fields are Table 2, p. 10. A public transcription of the paper places 0.4321
(out-of-plane) and 0.1081 (in-plane) in Table 3, p. 10, as theoretical tip displacements in
the load direction; the publisher's scan was not inspected. `macneal_harder::shell_references_match_timoshenko_beam_theory`
recomputes both from the case inputs (Timoshenko beam, shear factor 5/6: 0.4320936 and
0.1080936) and requires them to round to the printed values. Frame cases are analytical
Euler–Bernoulli adaptations with signed references (`every_reference_lies_along_its_load`).

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
