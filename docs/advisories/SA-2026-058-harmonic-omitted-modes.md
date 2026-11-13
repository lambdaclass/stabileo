# SA-2026-058: Large harmonic models could retain inaccurate omitted-mode responses outside the truncation warning’s coverage

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-13 (drafted 2026-11-10) |
| Issue | [#1434](https://github.com/lambdaclass/stabileo/issues/1434) |
| Fix | PR [#1922](https://github.com/lambdaclass/stabileo/pull/1922), included in 0.6.0 |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | 0.5.0 (released 2026-11-07), and subsequent main builds before PR #1922; see release boundary below |
| Re-check registry | results-change entry `harmonic-omitted-modes` |

## Affected features

**App and engine/WASM: 2D and 3D harmonic analysis**, including the public
`solve_harmonic_2d_with_damping` and `solve_harmonic_3d_with_damping` paths and
results derived from their response sweeps.

The defect requires more than 3000 independent free degrees of freedom after
supports and constraints are applied: the real harmonic block system has
`2n > MAX_DENSE_FALLBACK_DOFS`, whose ceiling is 6000. At least one forcing
frequency must lie outside the accepted modal truncation range `q <= 1/16`.
Here `q = |z| / (lambda_omit * |d|)`, `z = omega² - i*a0*omega`,
`d = 1 + i*a1*omega`, `omega` is angular forcing frequency, `a0` and `a1` are
the solver's Rayleigh damping coefficients, and `lambda_omit` is its omitted-mode
eigenvalue bound. This is a frequency/model condition, not a load-size criterion.

## What was wrong

`resolve_unbounded_frequencies` emptied the direct-solve frequency list whenever
the block system exceeded the dense ceiling. It therefore kept modal responses
outside the accepted truncation range if their global residual passed. Weak
excitation of an omitted target mode could hide a substantial target error in
that global residual. With static correction available and `1/16 < q < 1/2`,
the result could carry neither a warning string nor `HARM-TRUNCATION`. At
`q >= 1/2`, the existing uncorrected-frequency warning could appear; absence of
that warning did not establish accuracy.

The retained 2D and 3D reproducers each have 3001 independent spring-supported
point masses, with stiffness `i²` and mass 1 at degree of freedom `i`. Only
DOFs 1 and 100 are loaded, by 1 and 0.0001 respectively; DOF 100 is the target.
These are synthetic engine-unit inputs, not engineering recommendations.
At 15.756339366097638 Hz, both returned:

| Quantity | Before PR #1922 | Independent reference |
|---|---:|---:|
| Target real response | 1.5508399464958143e-10 | 1.8265674322904892e-11 |
| Target imaginary response | -3.2325425313764277e-9 | -3.029586965358748e-9 |

An independent direct two-DOF solve and the scalar closed form agree on the
reference. The relative complex target error,
`|u_old - u_reference| / |u_reference|`, is **8.07902813793105%**. This measures
a response error, not a proven worst case or a conservative correction factor;
no general bound or error direction has been established.

The full six-frequency replay on origin/main `52619652ecb9d801af1868b34936518965c92d69`
returns `ModalStatic` with a warning: "static correction not applied at 2
frequencies (up to 47.7465 Hz)". The warning and `HARM-TRUNCATION` are computed
from `uncorrected`, which contains only indices `[4, 5]`, frequencies
`[31.830988618379067, 47.7464829275686]` Hz. The inaccurate responses at
`15.756339366097638`, `15.915494309189533` and `16.07464925228143` Hz are not
among them: static correction was applied there, with `q < 0.5`, but did not
make those responses accurate. Main warns about two later frequencies; the
8.079% error is at a frequency that warning does not identify or cover.
The warning text prints the count and maximum, not the complete list.

The web UI renders warning strings once for the whole harmonic sweep in
`HarmonicCertificate.svelte`; it has no per-frequency warning markers. The
structured diagnostic is also attached at sweep level, with no frequency
indices, and describes frequencies whose omitted modes are uncorrected.
That display does not extend the warning's numerical coverage to the earlier,
incorrectly corrected points. The 3D sweep additionally carries the separate
`MD-ORTHOGONALITY` diagnostic. Neither complete replay is diagnostic-free.
The earlier claim that the full six-frequency sweep returned `warnings=[]`
was incorrect. See the [retained replay](replays/SA-2026-058-main-frequency-coverage.txt)
for exact warnings, diagnostics, frequencies, indices and truncation ratios.

### Release boundary

`git log -S resolve_unbounded_frequencies` identifies `67e0c8bc2`
(2026-11-06) as introducing the size-dependent empty direct-frequency list.
The companion history search for `MAX_DENSE_FALLBACK_DOFS` distinguishes the
older dense-storage ceiling from this exemption. Inspecting the tagged source
confirms that v0.5.0 contains the exemption.

| Release documented in `docs/releases` | This size-dependent exemption |
|---|---|
| [0.2.0](../releases/v0.2.0.md) | Predates its introduction |
| [0.3.0](../releases/v0.3.0.md) | Predates its introduction |
| [0.4.0](../releases/v0.4.0.md) | Predates its introduction |
| [0.5.0](../releases/v0.5.0.md), released 2026-11-07 | First affected tagged release |

Subsequent main builds retaining the exemption are affected until PR #1922.
This boundary is established from source history and tag ancestry; a released
binary was not independently replayed. It does not certify earlier harmonic
implementations against other defects. SA-2026-043 and SA-2026-046 describe
separate harmonic corrections already included in 0.5.0.

## How to tell if your results are affected

Review saved 2D and 3D harmonic analyses with more than 3000 independent free
DOFs, especially forcing frequencies near or above omitted natural modes.
Use the reduced free-DOF count (`nDof` in the engine result), not a raw node
count. A modal result at a frequency outside `q <= 1/16` that was not replaced
in `directFrequencies` is within the affected selection path. A small
`maxModalResidual`, method `ModalStatic`, or an empty warning list does not
rule out the target error. If the omitted-mode bound is unavailable to you,
re-check the entire sweep of such a large model on the corrected build or
with an independent full harmonic solve.

The registry flags structural projects that can request harmonic analysis,
including spring-only models. It is deliberately broader than the exact DOF
and frequency conditions because project metadata does not establish those
conditions for every saved sweep.

## Fixed in

0.6.0, containing merged PR #1922. Every frequency outside the existing truncation range receives a
full solve regardless of model size. Dense block LU remains below the ceiling;
above it, sparse Gaussian elimination with partial row pivoting solves the
same full harmonic system. Excessive sparse storage or fill, a singular
system, or non-finite arithmetic returns an error instead of the modal
approximation. Frequency selection remains independent of the load, and no
numerical tolerance is loosened.

An entirely replaced sweep reports `Direct`; mixed sweeps list the replaced
frequencies in `directFrequencies`, and sampled peaks are recomputed. The
remaining low-frequency modal approximation and residual refusal policy are
unchanged. This fix does not resolve the separate dynamic-invariance finding
in SA-2026-056 or every modal-basis diagnostic.

## Workaround

On an affected build, independently solve the full harmonic system at the
frequencies used for design. An empty warning list or passing global residual
is not a substitute. Do not coarsen a model solely to fit the dense ceiling
without verifying its physical discretization and convergence. Re-run on the
corrected build when available; no universal response multiplier is established.

## What to do with results you already have

Re-run affected harmonic sweeps and review real and imaginary response,
amplitude, phase, sampled peaks, and demands or deliverables based on them.
Include results saved at frequencies outside the truncation warning. Reassess design and
serviceability decisions using the corrected or independently verified demands.

## Credits and references

The #1434 investigation retained differential regressions through both public
dimensional solvers in `engine/tests/differential/modal_vs_direct.rs`:
`harmonic_2d_above_dense_ceiling_omitted_mode_matches_direct_and_closed_form`
and `harmonic_3d_above_dense_ceiling_omitted_mode_matches_direct_and_closed_form`.
Both failed on the production baseline with the values above and pass after
PR #1922 against the independent direct and closed-form references, including
frequencies around the omitted resonance and sampled-peak checks. See the
[results-change write-up](../results-changes/2026-11-harmonic-omitted-modes.md)
for the algorithm, admission limits and re-check scope. The coordinator
assigned SA-2026-058 because main returns inaccurate responses at frequencies outside the warning’s coverage.
