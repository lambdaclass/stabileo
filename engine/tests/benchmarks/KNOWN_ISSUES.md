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

The production MITC4 page preserves the existing `shell_benchmark.rs` models exactly,
including their support precedence at symmetry/diaphragm corners. It is not a new
implementation of Belytschko et al.'s stress-projection element. Its strict 2% accuracy
policy is inherited from the benchmark-page format; all historical native assertions
remain unchanged. Native regression success does not establish published accuracy.

Fresh native and production WASM measurements agree (rounded below):

| Case | Mesh | Reference | Computed | Error | Page verdict |
|---|---:|---:|---:|---:|---|
| roof | 6 | 0.3024 | 0.2551645854 | 15.62018% | Fail |
| roof | 8 | 0.3024 | 0.255375241 | 15.55052% | Fail |
| roof | 12 | 0.3024 | 0.2555954865 | 15.47768% | Fail |
| roof | 16 | 0.3024 | 0.2555908778 | 15.47921% | Fail |
| cylinder | 6 | 1.8248e-05 | 1.900068993e-05 | 4.12478% | Fail |
| cylinder | 8 | 1.8248e-05 | 1.997897942e-05 | 9.48586% | Fail |
| cylinder | 12 | 1.8248e-05 | 2.035360372e-05 | 11.53882% | Fail |
| cylinder | 16 | 1.8248e-05 | 2.022948432e-05 | 10.85864% | Fail |
| hemisphere | 4 | 0.185 | 0.185219187 | 0.11848% | Pass |
| hemisphere | 8 | 0.185 | 0.185741985 | 0.40107% | Pass |
| hemisphere | 16 | 0.185 | 0.186206839 | 0.65235% | Pass |

The roof plateaus below reference; the cylinder moves away from reference under the
available refinement. Do not describe either as converging to the reference. Their
boundary conditions warrant solver-owner review before attributing the discrepancies
to locking. The runtime registry has no open shell entry; these are test-ledger findings,
not assigned runtime issue numbers. No engine source or numerical behaviour is changed.

The live hemisphere is the NAFEMS LE3-labelled 18°-hole case in
`benchmark_hemisphere_hole_convergence`: quarter loads ±2, reference 0.185. The solid-shell
`hemisphere_with_hole` instead uses quarter loads ±1 and reference 0.094 (with 0.0924 also
cited). That native-only case is explicitly listed, not compared with 0.185.

Paper metadata: Belytschko, Stolarski, Liu, Carpenter and Ong (1985), CMAME 51, 221–258,
DOI 10.1016/0045-7825(85)90035-0; Crossref metadata checked by the catalogue checker.
References are inherited from the named tests. Exact numerical table/page provenance,
NAFEMS load convention and the relationship to the 1985 paper remain unverified against
primary text. Status stays proposed. Browser selection is bounded at 16 divisions (289 nodes) for every model. Cylinder
12/16 extend the existing builder geometry and restraints without altering assertions.
The workload cap is not a browser capacity measurement. Chromium was not launched.
