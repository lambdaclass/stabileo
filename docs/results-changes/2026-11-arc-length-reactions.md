# Recover reactions from the reported equilibrium state (2026-11-11)

Issue #1949. Registry entry `arc-length-reactions`.

Arc-length and displacement control previously returned an empty reaction array
for converged loaded models. Their member-force recovery also used the reference
member loads rather than the loads at the final load factor. Both now use the
corotational final-result builder. Continuation adds the start model's loads to
the scaled reference pattern. Displacement-control snapshots also retain their
nodal displacements for native callers, as arc-length snapshots already did.

The common force recovery takes the full internal-minus-applied residual in the
assembled support frames. It recovers the dependent constraint forces, transfers
their restrained-master share, and maps reactions through the same spring and
inclined-support functions used by linear analysis. Reactions and constraint
forces are recovered together. Corotational constraint forces use the actual
nonlinear internal force, and material-nonlinear constraint forces use the final
secant state, rather than multiplying displacement by an unrelated tangent or
the initial elastic stiffness.

This corrects omitted restrained-master reactions in staged, P-Delta,
corotational, material-nonlinear, contact, cable, Winkler and Guyan analyses in both dimensions.
The linear and SSI reference paths already included this transfer. The three
linear constraint paths now call the same restrained-master transfer helper. Guyan recovery also retains spring reactions when every DOF is free. Fiber
constraints remain explicitly refused. Guyan 3D also recovers member forces using
the normal 3D member-force builder instead of returning an empty array.

Reaction mapping checks that the model's active restraint mask agrees with the
DOFs actually used by the solve. A mismatch returns a structured error instead
of reporting reactions, displacements and member forces for different supports.
This catches staged support activation/removal with incompatible global DOF
numbering. Per-stage renumbering and construction history have not been rebuilt.
Undetermined stages without active physical stiffness explicitly mark their
state unavailable as an equilibrium solution. Fully determined constraint-only
stages recover their actual reactions and retain their valid answers. Staged
final results require an actual stage result; there is no empty-result fallback.

P-Delta still uses its existing small-strain second-order model. The recovered
state now receives a force/moment check on its displaced geometry using the
same wrench checker as fiber analysis, together with the actual reduced residual.
If those checks fail the requested tolerance, `equilibrium` reports the failure
and `result_quantity_unavailable` with phase `reactions` explains that finite-
displacement reactions are unavailable and directs the caller to corotational
analysis. The inclined-support class exposes this limitation; its assertions
are not relaxed. Ordinary balanced P-Delta controls retain numerical reactions.
No constitutive or geometric P-Delta solve is silently substituted.

Time history still does not recover total dynamic support reactions or member
forces. Its `peakReactions` field contains a legacy elastic-only estimate from the
displacement-peak selector, not total reactions or a reaction envelope.
Every time-history result now carries `result_quantity_unavailable` with phase
`peakReactions`, explaining the omitted inertia, damping and time-dependent
support loading. Spring-only models retain support entries instead of returning
an empty array. This is containment of an unavailable quantity; it is not a
validation of total dynamic equilibrium.

The exact two requested frozen arch inputs and their previous outputs were
retrieved from local Git object `dbc3cbe5338e4f268a43e5b56827a36873682ad8`, where
the empty arrays were explicitly marked known wrong. They were not present in
this worktree's base. The regenerated outputs contain reactions, remove that
known-wrong marker, and are checked through WASM without rounding or tolerance
when comparing deterministic result fields. Their independent equilibrium assertions are
separate from the exact snapshot comparison. The existing PRO portal and tower
snapshots gain fourteen P-Delta equilibrium fields each; none of their existing
numerical values change.

Arc-length and displacement control remain planar APIs. There is no spatial
arc-length/displacement-control solver. Spatial payloads are explicitly rejected
by these APIs. Displacement control continues to refuse inclined supports and
prescribed support motion. These refusals are tested; this change does not add
new analysis methods or silently project spatial input into a plane.

Targeted native and WASM tests cover both exact arches, applied final load
factors, force and moment balance, restrained masters, rigid-arm offsets,
inclined supports in supported solvers, both sparse/dense path-following paths,
nonlinear constraint forces, unavailable quantities, and correct control inputs.
The handoff records parent failures, final results and the origin/main evidence
for the coordinator's advisory decision. No advisory is assigned here.


## Saved-project applicability and quantity declarations

The notice requires members, shells, springs or constraints, plus an affected
analysis context: P-Delta, a configured time history, or constraints with a
nonlinear or time-history context. A current stamp recording only linear
analysis does not receive the notice for an ordinary frame or shell. An empty
model does not qualify solely because its unknown history includes time history.
Legacy stamps retain the existing conservative treatment of unrecorded analyses.

The linear and SSI paths already transferred restrained-master forces; factoring
that transfer into a shared helper does not change their answers. Unconstrained
corotational results use the same internal residual as before. Neither is a
reason to mark every saved member or shell model as affected. Planar arc-length
and displacement-control research/API results are not saved-project analysis
kinds; their direct numerical regressions remain covered by the native and WASM
reproducers rather than a blanket declaration over saved linear results.

The only result fields this entry declares to the snapshot and legacy gates are
`equilibrium`. The changed committed PRO snapshots add P-Delta equilibrium fields;
their existing reactions, displacements and member forces remain unchanged.
Advanced stage refusals are not ordinary linear solve refusals, and corrected
advanced forces are not arbitrary changes in saved linear forces. Consequently
the entry declares neither `*` nor `solve.ok`. Historical truss force errors and
fabricated bridge forces, displacements or reactions must remain unexplained.
