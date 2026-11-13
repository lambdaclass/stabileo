# Transformed load assembly and exact residual moments (2026-11-13)

Review #2074, round three. Registry entry `transformed-load-assembly`.

The earlier released-load admission on this branch assigned a generic
summation allowance to exact nodal additions. The staged member-removal
reproducer adds 1 and -1 plus or minus one machine epsilon. Those stored
binary values sum exactly to a nonzero residual: the physical moment is
not zero. The previous allowance could hide it and return a response with
no member capable of carrying it. The existing refusal expectations remain.
Exact cancellation without the residual remains admissible in staged history.

One load-vector implementation now serves dense, sequential sparse and
parallel-feature 3D assembly. The 2D builder and its fixed-end-force helpers
likewise carry uncertainty through their actual operations. Each addition
records its error-free summation residual. Member load transforms carry
product, summation and physical frame uncertainty. Inclined support rotations
transform both the values and their bounds at the same DOFs, including the
compensated dot product's difference from its bounded nominal sum. A single
2D member load therefore retains its transform error; a single exact nodal
moment and exact nodal cancellation acquire no invented allowance.

Computed retained fixed-end-force amplitudes remain arbitrary exact
amplitudes for the purpose of this compatibility proof. Condensation sets
the released local moment to zero. Their upstream magnitude error cannot
create physical work on that released spin; the shared accumulator bounds
the subsequent member transform, global additions and support transform.
This is a load-compatibility bound, not an interval certificate for every
recovered force or the material properties.

The initial nonlinear nodal-moment gate now reduces the free prefix of the
load vector through the free constraint transform. Passing restrained rows
to that transform previously panicked on models with both constraints and
released moments. Ordinary models without member end releases retain the
existing Winkler and contact paths. Their warning contracts and the frozen
prescribed-master numerical baselines are preserved. Models with releases
still use the common ordinary solver when those analyses have no features.

The WASM checker requires completion and native comparison when the native
response completed. Only an explicit native unconverged or singular-tangent
outcome can authorize the corresponding existing numerical refusal. Mutation
controls reject unresolved WASM outcomes with successful native references.

Tests include exact rational bounds for inclined 3D load rotation and a
single 2D member fixed-end load; signed exact residuals through native and
WASM static entries; valid zero-load controls; constrained and unconstrained
initial-moment admission; and inclined-support positive and genuine-moment
controls. Existing rounding boundaries, staged histories, exact filed
witnesses, response comparisons and numerical baselines remain unchanged.
Staged analyses retain their explicit inclined-support feature refusal.

Re-run affected models. This corrects regressions introduced on the unmerged
released-load branch; no advisory is assigned here. Existing warnings and
explicit nonlinear numerical refusals remain applicable. The registry covers
members, shells, connectors, springs and constraints because admission uses
the common load assembly throughout static structural models. That assembly
also fixes the order of member and shell contributions across solver paths.
