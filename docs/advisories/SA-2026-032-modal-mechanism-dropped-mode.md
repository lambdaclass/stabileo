# SA-2026-032: Modal analysis dropped the zero mode of a mechanism and returned the rest

| | |
|---|---|
| Severity | Medium |
| Status | Draft |
| Issue | [#338](https://github.com/lambdaclass/stabileo/issues/338) |
| Fix | PR [#1247](https://github.com/lambdaclass/stabileo/pull/1247) |
| Affected versions | every release with modal analysis; not bisected |
| Re-check registry | entry `modal-mechanism-refused` (models run in modal, spectral or seismic analysis) |

## Affected features

Modal analysis, 2D and 3D, and what uses its modes: response-spectrum analysis and the modal step
of the seismic load plan, in the app and the WASM entry points.

## What was wrong

Eigenvalues ω² at or below 1e-10 rad²/s² (a period above a week, or a negative one) were skipped
without a word. A structure that is a mechanism, for instance a member with a moment release at
one end and a free other end, has a zero-frequency mode: it was dropped, and the remaining modes
were returned as if complete, with a cumulative mass participation that did not reach the total.

The MYSTRAN differential model `modal3d_lumped-744196` (#338): MYSTRAN reports the zero mode
(7.9·10⁻⁷ Hz) and its later frequencies are Stabileo's shifted by one; Stabileo returned 3 of the
12 requested modes (0.262, 0.642 and 1.058 Hz) with mass participation X 0.08, Y 0.24, Z 0.24
and no diagnostic. A spectral analysis on those modes combined an incomplete set for a structure
whose true response is unbounded.

## How to tell if your results are affected

A modal or spectral analysis that returned fewer modes than requested, or a low cumulative mass
participation, on a model whose static analysis warns about excessive displacements or a
singular or indefinite stiffness. Re-run it: it now refuses and names the mechanism, or lists the zero mode when it moves no mass.

## Fixed in

PR #1247. Modal analysis refuses when one of its zero-frequency modes (ω² ≤ 1e-10 rad²/s²)
moves a translational DOF that carries mass by more than round-off (10⁻⁸ of its largest
component), has more than 1e-6 of its kinetic energy in translations, or carries more than 1e-6 of
the mass in a direction, naming the node and direction and returning no modes
(`MODAL-MECHANISM`, shown in the user's language). A seesaw, whose ends move opposite ways so that
no rigid translation excites it, is refused too, however far the rest of the model reaches and however much rotary inertia sits at its pivot; so is
any ω² more negative than round-off (10⁻⁹ of the largest eigenvalue found), which is an instability
whatever it moves. A zero mode
that moves no translational mass (a column free to spin about its own axis, which the static
solve accepts and no ground motion excites) is reported in the result's `nullModes`, with its
node and DOF, and the app lists it with the discarded modes instead of dropping it unnoticed
(`engine/tests/modal_mechanism_refusal.rs`). Models without a mechanism return the same modes.
