# Initial plastic refusals and unloaded staged rotations (2026-11-12)

PR [#1943](https://github.com/lambdaclass/stabileo/pull/1943).
Results-change entry `initial-plastic-refusals-and-stage-cancellation`.

Initial 3D plastic states could enter the soft-spring hinge fallback whenever
kinematic rank metadata was unsolvable. The initial stability guard exempted
conditioning refusals, expecting the regular linear solve to propagate them.
That solve was skipped when the rank test lost a direction. The fallback could
then report collapse instead of refusing the initial elastic state.

The retained `final-review-plastic-conditioning.json` fixture is an oblique
cantilever with translations free and rotations held at its loaded end. Both
bending inertias are positive. On PR parent `6d2d7082ef`, the regular solve
refuses with `Reason::Conditioning`, kinematics reports unsolvable metadata, and
raw plastic analysis returns a zero collapse factor with no diagnostics. On
main `02b4dd5d2b07e14faf2d7f53b78c986b0ff4b031`, the same fixture's regular
solve refuses as a mechanism, while plastic again silently returns zero collapse
with no steps or diagnostics. Main has the same kinematic branch into the
soft-spring fallback, without the PR's initial guard. These are native source
replays in this worktree; no released binary was replayed.

Every initial plastic state now goes directly through the regular linear solve.
The hinge fallback remains reachable only for a state after hinge formation.
This removes the duplicated initial numerical gate and the dependency on
kinematic rank metadata for propagation of elastic refusals. Raw and certified
native and WASM exports share that path. Existing 2D plastic containment remains
in force; it does not call the changed 3D path.

A separate staged false refusal occurred when a later stage both removed a frame
and cancelled its previously applied nodal moment. The incremental moment was
nonzero, but the accumulated moment was exactly zero. A direction with an exactly
zero physical stiffness column cannot carry earlier member forces; its load
compatibility is determined by accumulated applied loads. The shared stage solve
now uses those loads as the right-hand side in such directions, before deciding
whether they are inactive or unloaded free rotations. Every nonzero physical
column continues to use its incremental right-hand side. The same exact column
classification serves inactive-DOF detection. No numerical tolerance changes.

Main accepts seven of the eight reviewed cancellation variants with zero final
forces and reactions. Its 2D sparse truss-connected variant refuses with singular
tangent stiffness. The shared correction permits all eight valid cancellations;
no special case preserves that unrelated main refusal. Tests cover both dimensions,
both dispatch paths, removed and retained members, disconnected and truss-connected
nodes, exactly zero accumulated moment and nonzero moments on either side of zero.
Real positive stiffness still gives its incremental response.

Re-run affected 3D plastic analyses and staged member-removal histories. Plastic
collapse factors previously returned for refused initial states may now be
withheld. Valid unloaded stage histories can now succeed. Forces, reactions,
stage results and solve status can change. The registry conservatively selects
models with members or saved construction phases.

The settlement WASM reference also now requires exact node IDs for displacements
and reactions and exact element IDs for member forces. Duplicate, missing,
unknown and absent IDs fail even when all component values coincide; reordered
complete results remain valid. This strengthens the oracle without changing its
numerical bounds. The earlier staged-rotation write-up now describes the existing
active-stiffness scaling of inactive solve diagonals accurately.
