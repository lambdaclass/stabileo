# SA-2026-046: Harmonic analysis chose between modal superposition and the direct solve per load, breaking superposition and reciprocity

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | [#1537](https://github.com/lambdaclass/stabileo/issues/1537), [#1538](https://github.com/lambdaclass/stabileo/issues/1538), [#1539](https://github.com/lambdaclass/stabileo/issues/1539), [#1540](https://github.com/lambdaclass/stabileo/issues/1540), [#1541](https://github.com/lambdaclass/stabileo/issues/1541) |
| Fix | PR [#1587](https://github.com/lambdaclass/stabileo/pull/1587) (merged 2026-11-06), released in v0.5.0 |
| Affected versions | no tagged release. stabileo.com from 2026-11-05 19:19 UTC (the deploy of #1423) until #1587 was deployed, and engine/WASM builds of `main` from a9d72cbe6 (#1423) until #1587. 0.4.0 and earlier have the modal solver without this switch (see SA-2026-043 for theirs) |
| Re-check registry | results version entry `harmonic-modal-or-direct-per-frequency` |

## Affected features

- **App: harmonic (frequency response) analysis** in the PRO advanced panel, 2D and 3D.
- **Engine/WASM: `solve_harmonic_2d`, `solve_harmonic_3d`** and their certificates
  (`certify_harmonic_2d`, `certify_harmonic_3d`).

## What was wrong

The fix for SA-2026-043 (#1423) added a safety net: at each frequency, the relative residual of
the modal response was checked, and a frequency whose residual exceeded 10⁻² was solved directly
instead. That residual depends on the load. The choice between two different linear operators was
therefore made per load:

- a sum of loads could be solved one way and each load the other, so the response to the sum was
  not the sum of the responses (superposition, #1537 and #1540);
- a unit load in one direction could be solved modally and one in another directly, so the
  transfer from A to B was not the transfer from B to A (reciprocity, #1538, #1539 and #1541);
- a modal response accepted under 10⁻² could still be far from the exact steady state: an
  energy-norm residual of 10⁻² does not bound a node's displacement near resonance.

The results carried no warning about this. A 2D frame got only the rotary-inertia warning.

| Model (nightly reproducer) | Accepted as modal | Error at a node against the exact solve |
|---|---|---|
| 2D frame, 6 DOFs (#1537) | loads A and A + B at 2.3 Hz (residuals 4.8·10⁻³ and 6.1·10⁻³); B solved directly | 20 % (node 3, uy); 23 % (A + B, node 3, ux) |
| 3D cantilever, 6 DOFs (#1538) | unit Fz at 2.3 Hz; Fx and Fy solved directly | 11.5 % at 0.7 Hz |
| 3D cantilever (#1539) | the same switch | 3.3 % |
| 3D cantilever (#1540) | each half of the loads (residuals 2.1·10⁻³ and 5.2·10⁻³); their sum solved directly | ux at 0.7 Hz: −9.14 instead of 139.4 (107 %) |
| 3D frame (#1541) | unit Fx (residual 4.7·10⁻³); Fy and Fz solved directly | 27 % in amplitude, 8.6 times in the imaginary part |

The exact values come from two independent direct complex solves of (K + iωC − ω²M)u = f (the
engine's LU and a separate Gauss–Jordan elimination), which agree to 10⁻⁹.

## How to tell if your results are affected

Two kinds of harmonic analysis are affected:

- analyses run on stabileo.com between 2026-11-05 19:19 UTC and the deploy of #1587;
- analyses run with an engine or WASM build of `main` from a9d72cbe6 (#1423) up to, but not
  including, #1587, whenever they were run. Such a build stays affected after the website is
  fixed; rebuild from a revision that contains #1587.

Among those:

- every frequency that was solved by modal superposition may be wrong. The harmonic certificate
  names the method used (`modal` or `modal+static`). A warning saying that modal superposition
  left a residual over 10⁻² and some frequencies were solved directly means that the run mixed
  the two methods;
- results combined from separate load runs, or transfer functions read in both directions, are
  the most exposed, because each run could use a different method at the same frequency.

A run whose certificate reports the method `direct` at every frequency is not affected.

## Fixed in

0.5.0.

The choice now depends on the model and the frequency only, never on the load
([#1587](https://github.com/lambdaclass/stabileo/pull/1587)):

- a model with fewer than 64 free degrees of freedom is solved directly at every frequency. The
  direct solve is exact, linear and reciprocal;
- a larger model keeps the modal response at a frequency only where the omitted modes are bounded,
  q = |ω² − i a₀ω| / (λ_omit |1 + i a₁ω|) ≤ 1/16, so their error is under q² ≤ 0.4 % of their
  share. The other frequencies are solved directly, the same ones for every load;
- a modal response kept that way whose residual still exceeds 10⁻² is refused, not re-solved for
  that load alone;
- past the dense ceiling (more than 3000 degrees of freedom) no frequency is re-solved, and
  HARM-TRUNCATION ([#1434](https://github.com/lambdaclass/stabileo/issues/1434)) still warns where
  the omitted modes are not corrected.

Tests: `engine/tests/metamorphic/harmonic_linearity.rs` replays each issue's nightly model and
checks every reported value against the two direct solves; the per-PR metamorphic tier checks
harmonic superposition and reciprocity on every curated model.

## Workaround

None. Re-run the analysis on a version with #1587.

## What to do with results you already have

Run the harmonic analysis again and compare the response curves, at every load you solved
separately and at their combination.
