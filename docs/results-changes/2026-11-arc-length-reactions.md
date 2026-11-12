# Recover reactions from the reported equilibrium state (2026-11-11)

Issue #1949; PR #1952. Registry entry `arc-length-reactions`.
Safety advisory [SA-2026-061](../advisories/SA-2026-061-path-solver-reactions.md)
records the affected release boundaries, main replay and re-check guidance.

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
Stages with free DOFs and no active physical stiffness explicitly mark their
state unavailable as an equilibrium solution, including constraint-determined
states. Constraint-only force recovery excludes stabilization; this warning
does not certify their displacements as a physical equilibrium solution. Staged
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
for the coordinator's advisory decision. SA-2026-061 now records that decision.


## Saved-project applicability and quantity declarations

The notice requires members, shells, springs or constraints, plus an affected
analysis context: P-Delta, a configured time history, constraints with a
nonlinear or time-history context, or an explicitly identified path analysis.
The frozen arc-length fixtures carry `pathAnalysis` alongside
`analysis:nonlinear`. This marker identifies arc-length/displacement-control
results without treating every unconstrained corotational saved project as
changed. Saved-project feature extraction does not invent this marker for an
ordinary nonlinear solve. Current linear-only stamps remain excluded. An empty
model does not qualify solely because its unknown history includes time history.
Legacy stamps retain the conservative treatment of unrecorded analyses.

The entry declares `equilibrium`, `reactions` and `elementForces`. The snapshot
applicability checker recognizes the `nonlinear.results` family and evaluates
conditions using only that field's analysis context. Both exact frozen arches
therefore qualify for their recovered reactions. Linear forces, displacements,
and generic solve refusals remain unexplained by this entry; it declares neither
`*` nor `solve.ok`.

## Settlement-only and fully restrained states (#1952)

P-Delta now builds a shared free-equation object for both dimensions and both
storage paths. Its RHS includes the current tangent's coupling to prescribed
support displacements and the affine free displacement induced by constraints
on moving restrained masters. The iteration solves that equation and restores
its prescribed free offset; the final residual is normalized by that same
constraint-reduced RHS. The previous applied-load-only denominator could turn
roundoff in settlement-only models into an unavailable-reactions warning.
Constraints tied to settled masters also retain their imposed displacement.
The requested residual and wrench tolerances are unchanged.

Staged analysis accepts models with no free DOFs. Both result builders use one
state-determinacy check for directly restrained DOFs, including agreement with
the actual prescribed state. Constraint-determined free DOFs without physical
stiffness retain the unavailable-state warning. Fully
restrained stages apply prescribed displacements even when there is no active
stiffness. Artificial stabilization is restricted to free DOFs through one
shared lookup, and force recovery reassembles the physical stiffness without stabilization,
so neither restrained nodes nor transferred constraint forces acquire an
artificial support reaction. Loaded fixed nodes without elements recover the negative of
their applied loads. Undetermined stiffness-free stages retain their existing
warning or mechanism refusal, and incompatible support histories remain refused.

Native and WASM regressions include positive and negative axial settlements,
zero motion, constraint ties to moving masters, small dense and sparse models,
fully restrained stages with and without inactive member declarations, and
nonzero prescribed support motion. Existing loaded controls, undetermined
stages, and incompatible histories remain tested.

The independent member-load oracle adds a fully fixed beam to a loaded path
model. Its deformation is exactly zero, so integrating the cubic Hermite shape
functions against the synthetic linear distributed load and evaluating them at
the synthetic point-load position directly gives the four equivalent nodal
loads. Sign-adjusted negatives give the reported end shears and moments.
Neither oracle calls an engine fixed-end-force or recovery function. Tests cover
separate and combined distributed/point loads, zero member loads, a unit-factor
linear control, nonunit final arc/displacement factors, both sides of the
64-free-DOF storage dispatch, and native continuation with its retained start
loads. The force assertions fail with the original pre-fix path recovery and
with numerical force recovery deliberately reverted while scaled load metadata
is retained. No numerical snapshot baseline is changed in this review round.

## Analysis-qualified quantity declarations

The path reaction and member-force declarations use `nonlinear.reactions` and
`nonlinear.elementForces`. The snapshot gate matches these against the result
field's analysis family. The legacy corpus judge captures linear result sets;
its collection matcher cannot treat either qualified name as a static
`reactions` or `elementForces` declaration. This retains coverage for the two
frozen arc-length results while preventing the notice for an unknown saved
analysis history from excusing fabricated static forces. `equilibrium` remains
declared for the added P-Delta diagnostic fields. No engine value changes.

## Restore live frozen coverage after the main merge (2026-11-12)

The #1946 merge removed both corrected arch fixtures from the live frozen
corpus along with their inputs. Restore `solve_arc_length-0015ab84c3baa36f.json`
and `solve_arc_length-022317310499426d.json` using the exact native fixture
inputs and `RESULTS_FROZEN_UPDATE=1 make test.web.results` from this branch's
WASM engine. Their capture includes `pathAnalysis`; the existing
`arc-length-reactions` registration covers these recovered reactions and member
forces. This follow-up changes no engine implementation or numerical tolerance.

Remove only these two names from the #1949 exclusion inventory. The third case,
`solve_arc_length-0006e86e35791232.json`, remains excluded. Historical audit
captures and the earlier corrected regression evidence are preserved. Update
the live inventory review to distinguish the restored outputs from archived
empty reactions.

The shared frozen-corpus test executes every restored input, checks every
serialized field exactly and requires the output inventory to match the
executed corpus. The independent `make test.engine.reactions-frozen` check
reads these same live frozen outputs, sums reactions and input nodal loads
scaled by the final load factor, and checks force and moment balance on the
displaced geometry. Its existing tolerances and member equilibrium assertions
are retained. Per-case restoration regressions require each original input,
its complete set of reactions, the path-analysis feature and exclusion-policy
acceptance, so another named-case deletion cannot silently remove coverage.
