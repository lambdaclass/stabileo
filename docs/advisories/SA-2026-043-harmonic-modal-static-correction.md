# SA-2026-043: Harmonic analysis lost the omitted modes' correction when one mode was much softer than the rest

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1371](https://github.com/lambdaclass/stabileo/issues/1371) |
| Fix | this PR |
| Affected versions | every release with the modal-superposition harmonic solver and its static correction; not bisected |
| Re-check registry | results version entry `harmonic-modal-residual-checked` |

## Affected features

- **App: harmonic (frequency response) analysis** in the PRO advanced panel, 2D and 3D.
- **Engine/WASM: `solve_harmonic_2d`, `solve_harmonic_3d`** and their certificates
  (`certify_harmonic_2d`, `certify_harmonic_3d`), which certify the reported values against their
  own solution and so include this error in their bound.

## What was wrong

The harmonic response is a sum over the kept modes plus a correction for the omitted ones. The
correction was computed as the static response K⁻¹f (and K⁻¹MK⁻¹f) minus the kept modes' share of
it. When one kept mode is much softer than the others, that share is almost all of the static
response, and the difference that should be the omitted modes' part was left with round-off of the
soft mode's size instead. The second term is multiplied by ω², so the error grew with frequency,
and the result was reported as `modal+static` with no warning.

| 7-node C2-symmetric frame of #1371, node 4 on the axis, uy | Exact (direct complex solve) | Before | After |
|---|---|---|---|
| Symmetric loading, 0.7 Hz | 5.3·10⁻¹² (zero by symmetry) | 1.67·10⁻³ | equal to the direct solve |
| Symmetric loading, 2.3 Hz | 1.4·10⁻¹³ (zero by symmetry) | 7.27·10⁻³ | equal to the direct solve |
| Antisymmetric loading, 0.7 Hz, \|u\| | 0.434 | 0.520 (+20 %) | 0.434 |
| Antisymmetric loading, 2.3 Hz, \|u\| | 0.0396 | 3.14 (79×) | 0.0396 |

The exact values come from two independent direct solves of (K + iωC − ω²M)u = f (the engine's LU
and a separate Gaussian elimination), which agree to 10⁻⁹, and the symmetric copy's lateral
displacement on the axis is zero by symmetry. The frame's first eigenvalue is 5.4·10⁻³ rad²/s²,
below the second by a factor of 170, and the static correction subtracted 2.6·10⁵ to leave 1.6·10⁻⁶.

## How to tell if your results are affected

You ran a harmonic analysis on a model with a mode far softer than the next (a nearly unrestrained
direction, a light member on a released end) and read the response above the lowest frequencies.
Other models are affected by the same mechanism to a lesser degree, whenever the kept modes carry
nearly all of the static response at the response DOF.

## Fixed in

The omitted modes' correction is now computed directly in their subspace: the load and each static
solution are projected off the kept modes (M-orthogonally) before and after the solve, so nothing
is subtracted from the soft mode's share. As a safety net, the residual of the full dynamic system
is now checked at every frequency in the energy norm, ‖(K + iωC − ω²M)u − f‖_K⁻¹ / ‖f‖_K⁻¹, and a
frequency whose modal residual exceeds 10⁻² is solved directly instead; the result lists those
frequencies in `directFrequencies`, reports the largest modal residual in `maxModalResidual`, and
says so in a warning. When the direct solve is over the dense ceiling, the analysis is refused
instead of reporting the modal value. Tests: `engine/tests/metamorphic/regressions.rs`
(`harmonic_c2_symmetric_frame_matches_direct_solve`).

## Workaround

Run the certificate (`certify_harmonic_2d` / `certify_harmonic_3d`, the app's harmonic
certificate): its bound on each reported value includes this error.

## What to do with results you already have

Run the harmonic analysis again and compare the response curves.
