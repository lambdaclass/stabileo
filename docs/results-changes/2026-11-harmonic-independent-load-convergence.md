# Independent loads cannot hide unconverged harmonic components (2026-11-10)

PR #1922. Registry entry `harmonic-omitted-modes` covers this follow-up within the
same unmerged PR and includes the change in all six locales.

At review head `6bbc87cad`, the final compensated residual used one global load
norm. An exactly solved independent DOF could enlarge the denominator without
changing a singular block's residual, turning refusal into a finite response.

The regression extends the existing exact singular arrowhead: N = 1024,
t = 1 - 383/2^26, M = I, omega = 1,
K = [[2I, -t 1], [-t 1^T, 1 + N t^2]]. A unit load on its last DOF is
inconsistent with null vector [t 1; 1]. The appended independent DOF has K = 2,
M = 1 and load 1e12. Its dynamic stiffness is one and it is solved exactly.
The same null vector, extended by zero, still proves inconsistency. These are
synthetic test inputs, not recommended engineering inputs.

Before the fix, both direct paths returned real response -104093369406.45923
with zero imaginary part on the singular block's last DOF. Both new refusal
tests failed when explicitly run with their known-wrong-result ignores enabled.
After the fix both tests require the component-relative convergence error.

Both paths build connected components from nonzero entries of the original
complex dynamic matrix. Real and imaginary equations of each DOF belong to the
same component. Exact dynamic cancellation creates no connection. The compensated
residual and load Euclidean norms are scaled and accumulated independently for
each component. Every component must meet the existing MODAL_RESIDUAL_TOL;
a component with zero load must have zero residual. Non-finite residuals or loads
still refuse. Unrelated load magnitudes cannot dilute another component's check.

The existing column scaling, pivot cutoff, two refinement steps, modal selection,
tolerance and storage budget are unchanged. Existing singular and damped
near-resonance assertions keep their tolerances. A new closed-form damped test
also checks independent tiny, zero and large loads together. Component convergence
is a necessary acceptance check, not a forward-error certificate for arbitrary
ill-conditioned connected systems.

**What to re-check:** direct harmonic responses from earlier versions of PR #1922
with differently loaded independent components, especially near singularity.
This correction adds refusal; accepted response values are not modified. No new
advisory is assigned here. Public-main assessment and evidence are recorded in
the worktree handoff for the coordinator.
