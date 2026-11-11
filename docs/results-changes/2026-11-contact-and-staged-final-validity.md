# Final contact bearing and staged cable solver refusals (2026-11-11)

PR #1921 final review; issues #432 and #417. Registry entry `contact-and-staged-final-validity`.

The previous frozen-contact check accepted geometric penetration with zero or near-zero
assembled force. Active frozen contacts now require the assembled force divided by stiffness
to be no greater than the negative penetration plus the existing contact tolerance. An AL
multiplier may provide additional compression. Final opening and assembled signed traction
are checked separately. Invalid frozen states return `contact_state_invalid` without results.
Every closed surface pair is also checked for tensile or non-finite assembled traction,
including unfrozen pairs. Reported normal force uses the signed assembled force without a
zero clamp; tensile assembled states are refused before results are built. Validation and
reporting share the same computed force.

Staged cable iteration previously labeled factorization failure and exhaustion of its existing
iteration budget as `cable_analysis_required`. Factorization failures now return `singular_matrix`
and preserve the sparse solver's failure details. Exhaustion returns `solver_non_convergence`.
Both use severity error and phase `staged_cable_iteration`, name the cable members and withhold
results. `cable_analysis_required` remains the input gate and the recovered tension check.
That check now searches by element id without assuming result order. Current force recovery
explicitly sorts by id, so an unsorted vector is not reachable through this public staged path.

The restricted 2D staged exception remains: cables first added in the final stage after stages
with no assigned loads; only nodal loads throughout the input; no constraints, prestress in any
stage, or nonzero prescribed support displacement. Iteration must converge and every active
cable must have finite strictly positive recovered axial forces at both ends. Compressive
staged cases remain refused. No tolerance, baseline, assertion or iteration budget is loosened.

The frozen-contact regression previously accepted penetration with zero and near-zero traction;
it now refuses those states while retaining matching penalty and additional AL compression.
The staged regressions exercise a single cable under compression and under a small tensile
load, with grounded frame padding selecting the dense and sparse paths. The compressive fixture
derives axial stiffness from the initial chord strain so Ernst reduction drives the next chord
into slackness; its transverse spring leaves the axial mechanism exposed. They previously returned
the input refusal for iteration failures and now require the distinct solver diagnostic codes.
The panel replay seeds a successful result in both panel state and the shared results store
before recalculation, and requires both to clear on refusal.

These corrections follow acceptance and diagnostics introduced on this unmerged branch.
Recorded origin/main retains native `NL-13` and `SP-14` warnings; this change does not establish
a new silent main or release result. Advisory decisions remain with the coordinator.
