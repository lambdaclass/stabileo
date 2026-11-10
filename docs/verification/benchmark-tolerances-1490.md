# Benchmark tolerances audited for #1490

Date: 2026-11-10. This changes tests and CI, with no engine changes or regenerated result snapshots.
The measured data and uncertainty sources are in
[`tolerance_audit_1490.json`](../../engine/tests/benchmarks/tolerance_audit_1490.json).
The assertions were measured with the existing bounds first, then tightened. No bound was widened.

## Navier plate

`navier_case_accuracy_bounds` solves only the six committed cases. The native results agree with
`research/benchmarks/navier-plate/results/stabileo_results.json`.

| Family | Grid | Measured relative error | New relative bound |
| --- | --- | --- | --- |
| DKT | 4 | 0.034755419457 | 0.035 |
| DKT | 8 | 0.008767215786 | 0.009 |
| DKT | 16 | 0.002201849663 | 0.0025 |
| MITC4 soft support | 4 | 0.013576841700 | 0.014 |
| MITC4 soft support | 8 | 0.002567051252 | 0.0027 |
| MITC4 soft support | 16 | 0.010769293683 | 0.011 |

Each bound is the measured error rounded upward, preserving the existing finer DKT check.
The global field is now only a 0.036 ceiling on these case bounds, down from 0.05; the actual
comparison consumes each case's own bound. Both levels are registered and compared against base.
The DKT errors decrease by approximately four for each grid doubling. MITC4 soft support has a
boundary-condition difference from the hard-support Reissner–Mindlin series, so its comparisons
are case bounds, not a claim of convergence to Kirchhoff. The existing hard-support 0.0016 gate,
series truncation checks and 32/64-grid regression checks remain unchanged. This audit did not
run the large grids. Sources and the distinction between hard and soft support remain documented
in [the Navier benchmark](../../research/benchmarks/navier-plate/README.md).

## SHB8 distorted cantilever

The six-element normalized displacement pairs (out of plane, in plane) are:

| Shape | Measured out of plane | Measured in plane |
| --- | --- | --- |
| Regular | 0.978750271041 | 0.978687753654 |
| Trapezoidal | 0.959736783803 | 0.047347230212 |
| Parallelogram | 0.976171587167 | 0.623807922324 |

Every existing reference floor and upper bound remains. An additional relative drift bound of
`1e-5` pins both components for every shape. These are implementation regression pins, not
accuracy tolerances. In-plane distortion locking remains an explicit limitation in the case file;
no convergence is claimed for the locked shapes. MacNeal and Harder (1985), Table 8,
[DOI 10.1016/0168-874X(85)90003-4](https://doi.org/10.1016/0168-874X(85)90003-4),
is the source for the benchmark and the distortion sensitivity. The pins themselves come only
from this measured implementation. They prevent a further stiffness error from passing behind
the old one-sided floors.

## Legacy assertions

| Assertion | Measured relative discrepancy | New relative bound | Basis |
| --- | --- | --- | --- |
| Beam-column amplification | 0.001334407201 at 10 elements; 0.001334398189 at 20; 0.001334397674 at 40 | 0.002 | The existing first-mode amplification approximation has a persistent model difference. |
| Large-deflection shortening | 0.005293706479 at 10; 0.004040875347 at 20; 0.003726812716 at 40 | 0.006 | Finite axial extensibility plus decreasing mesh error. |
| Large-deflection transverse displacement | 0.000799717218 at 10; 0.000607861456 at 20; 0.000560095357 at 40 | 0.001 | Same model distinction; the mesh increments decrease by approximately four. |
| Craig–Bampton, first three modes | Maximum 0.000238828517 with five interior modes; 0.000086546755 with eight | 0.0003 | Reduction truncation relative to the same unreduced discrete eigenproblem. |
| Notional load versus geometric lean | 0.00465914912 | 0.006 | Small-lean cross-method approximation on this discrete frame. |
| Uniform thermal expansion | 4.551914400963e-15 / 1.210143096841e-14 | 1e-8 | Representable affine patch; numerical roundoff allowance. |
| Frame–shell horizontal/vertical balance | 1.989519660128e-14 / 1.953992523340e-14 | 1e-8 | Conservation; no discretisation error budget. |

The large-deflection test previously used `0.0566` and `0.3015` while claiming Mattiasson.
[Nanakorn and Vu (2006), Table 1, printed p. 1245](https://www.imechanica.org/sites/default/files/1-s2.0-S0168874X06000953-main.pdf)
reproduces the inextensible reference as `0.05643` and `0.30172`. The test now uses the existing
independently evaluated elliptic-integral references already recorded in
`spec/mattiasson-1-shortening.json` and `spec/mattiasson-1.json`.
The test's finite axial stiffness differs from that inextensible model; the case file explicitly
accounts for the remaining discrepancy. No engine result was changed to fit a reference.

Craig–Bampton retains both the five-to-eight-mode and existing three-to-eight-mode checks; both
former 0.15 accuracy assertions become 0.0003. The reduced eigenproblem must succeed and return
the compared modes. The notional-load comparison is not an exact published reference; its
case record identifies the approximation uncertainty instead of claiming mesh convergence.
Thermal strain and force balance are exact patch/conservation checks, so a convergence study is
not an uncertainty source for them.

The remaining registry ceilings fall from 0.15 to 0.1 (ANSYS-named legacy file), 0.15 to 0.05
(reduction), 0.15 to 0.05 (shell), and 0.5 to 0.1 (imperfections). They still bound other unaudited
assertions and remain explicitly labelled as ceilings, not published-reference accuracy claims.
The per-assertion audit of those other checks remains with #1482.

## Reproduction

Run `make test.engine.targeted TEST=validation FILTER=<name>` for each of:

- `navier_case_accuracy_bounds`
- `validation_ansys_vm22_cantilever_axial_bending`
- `validation_ansys_vm40_large_deflection_cantilever`
- `benchmark_craig_bampton_frequencies`
- `benchmark_craig_bampton_mode_count`
- `benchmark_notional_load_equivalence`
- `benchmark_shell_thermal_free_expansion`
- `benchmark_mixed_frame_shell_building`

The SHB8 pins use `make test.engine.targeted TEST=shells FILTER=macneal_harder_straight_cantilever`.
