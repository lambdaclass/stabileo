### Fixed
#### Fiber-nonlinear analysis stops at its last converged load step (2026-11-03)

Fix #433: when a load increment did not converge, or its tangent was singular (at a plastic
collapse), `solve_fiber_nonlinear_2d/3d` returned the last unconverged iterate, or an error for
the whole run. They now return the state at the last converged increment with
`status: "stopped"`, `lastConvergedLoadFactor` and `stopReason`, plus the history of every
converged increment. The reactions (empty before) and an equilibrium summary are filled for the
returned state, and a state whose residual or global force and moment balance is out of tolerance
is refused. The web app does not call these solvers yet; direct engine callers should read
`status` before using the result.
