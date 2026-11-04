### BREAKING (results)

#### Time history: a load at t = 0 on a massless DOF starts from equilibrium (2026-11-03)

- Fix #760 (SA-2026-031): with a singular mass matrix, a force already on at t = 0 on a massless
  direction was left out of the initial state, so the first step started out of equilibrium:
  Maxwell–Betti reciprocity failed by up to 33× on fuzz models, and a two-DOF chain with a
  massless tip was 24 % of P/k2 off its discrete closed form. The load at t = 0 on massless
  rows now makes their velocity jump when damped (their displacement, when undamped), and the
  massive rows take the rest. A singular mass
  mixing several DOFs, or a massless part with no stiffness, now refuses instead of dividing by
  the diagonal of M or integrating a mechanism. Re-run time histories with step forces at 0 s on
  nodes without mass.
