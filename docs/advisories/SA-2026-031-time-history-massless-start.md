# SA-2026-031: Time history dropped a load applied at t = 0 on a massless DOF

| | |
|---|---|
| Severity | Medium |
| Status | Draft |
| Issue | [#760](https://github.com/lambdaclass/stabileo/issues/760) |
| Fix | PR [#1247](https://github.com/lambdaclass/stabileo/pull/1247) |
| Affected versions | every release with linear time history on a singular mass matrix; not bisected |
| Re-check registry | entry `time-history-massless-start` (models run in time history) |

## Affected features

Linear time history (Newmark and HHT-α), 2D and 3D, in the PRO dynamics panel and the WASM entry
points, when the mass matrix is singular (a node or a rotation with no mass: members of a
material without density, nodes carrying only nodal masses, lumped-mass rotations) **and** a
force history is nonzero at t = 0 on such a DOF. In the app that is a step force with its start
at 0 s on a node with no translational mass in its direction. Ground motion is not affected: its
load M·r never acts on a massless DOF. Sine forces start at zero and are not affected.

## What was wrong

The initial acceleration solves M·a₀ = f₀. With a singular M the massless rows were given
a₀ = 0 and their load at t = 0 was dropped, so the first step started out of equilibrium. A load
on a massless DOF was in effect ramped over the first step while a load on a massive DOF was
applied as a step, and with stiffness-proportional damping the massless rows carried the error
for many steps. The discrete operator was no longer symmetric: Maxwell–Betti reciprocity failed
by up to 33× on fuzz models (#760).

Two-DOF chain, ground —k1— A (mass m) —k2— B (massless), step load P on B, Rayleigh damping
C = a0·M + a1·K. With damping, B's relative displacement starts at zero and relaxes,
u_B − u_A = P/k2·(1 − e^(−t/a1)); the trapezoidal rule of Newmark gives P/k2·(1 − ρⁿ) with
ρ = (1 − r/2)/(1 + r/2), r = Δt/a1, after n steps. Undamped, it is P/k2 from t = 0. A is the
damped SDOF m·ü + (a0·m + a1·k1)·u̇ + k1·u = P (`engine/tests/time_history_massless_dofs.rs`):

| Largest error over two periods | Before the fix | After the fix |
|---|---|---|
| u_B − u_A against P/k2·(1 − ρⁿ), Δt = T/400 (below 2·a1) | 24 % of P/k2 | 3·10⁻¹⁵ |
| u_B − u_A against P/k2·(1 − ρⁿ), Δt = T/40 (above 2·a1) | 76 % of P/k2 | 2·10⁻¹⁵ |
| u_B − u_A at t = 0, undamped | 0 (should be P/k2) | P/k2 |
| u_A against the damped SDOF, Δt = T/400, undamped | 0.81 % of P/k1 | 0.023 % |
| u_A against the damped SDOF, Δt = T/400, damped | 0.73 % of P/k1 | 0.013 % |
| u_A against the damped SDOF, Δt = T/40, damped | 7.6 % of P/k1 | 1.3 % |

Against the exact e^(−t/a1), the error at Δt = T/400 falls from 23 % to 1.2 % (the trapezoidal
rule on that decay). At Δt ≥ 2·a1 the trapezoidal rule cannot follow the decay at all: ρ ≤ 0, so
u_B − u_A alternates about P/k2 and, at Δt = T/40 in this chain, overshoots it by 52 % at the
first step. That is the integrator, before and after the fix; HHT-α with α < 0, or a step below
2·a1, damps it.

A 3D cantilever with massless rotations gave a tip rotation under a tip force twice the tip
displacement under the reciprocal moment at the first step.

## How to tell if your results are affected

A time history with a step force starting at t = 0 applied at a node that has no mass in the
force's direction (its members have zero density and it has no nodal mass). Re-run it: the
response near that node changes, most in the first steps.

## Fixed in

PR #1247. At t = 0 the massless rows Z are met by K_ZZ·(u_Z + a1·v_Z) = r_Z: with damping
(C_ZZ = a1·K_ZZ on those rows) the load at t = 0 makes their velocity jump and u_Z(0) stays as
given; undamped, the massless part starts settled (a jump in u). The massive rows take the rest,
massless accelerations stay zero, and every row of step 0 holds. Reciprocity now holds to
round-off on the fuzz models of #760 and on the chain and cantilever above. Two cases that used
to give numbers now refuse, on any time history: a singular mass whose null direction mixes
several DOFs (`TH-MASS-SINGULAR`; the solver divided by the diagonal of M instead), and a massless
direction with no stiffness (`TH-MASSLESS-MECHANISM`; a mechanism integrated on a round-off
pivot). The app shows both in the user's language.
