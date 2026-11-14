# SA-2026-061: Path solvers omitted support reactions and recovered member forces at the wrong load factor

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-12; fixed in PR #1952, pending release at draft time; published 2026-11-13 |
| Publication | 2026-11-13; included in 0.6.0 |
| Revision | 2026-11-13: publish for 0.6.0 and clarify P-Delta containment, unavailable dynamic forces and determined staged results; original draft date retained |
| Issue | [#1949](https://github.com/lambdaclass/stabileo/issues/1949) and the PR #1952 result-field sweep |
| Fix | PR [#1952](https://github.com/lambdaclass/stabileo/pull/1952), included in 0.6.0 |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | 0.2.0–0.5.0, desktop-v0.1.0-alpha.1–alpha.3, and subsequent affected main builds through verified `c11af4e36`; continuation has a separate boundary below |
| Re-check registry | [`arc-length-reactions`](../../web/src/lib/provenance/result-changes/arc-length-reactions.json) |

## Affected features

**Engine/native and WASM: planar arc-length and displacement-control analyses.**
Their final `results.reactions` arrays were empty even for converged loaded
models. `results.elementForces` combined the final displacement with reference
member loads instead of member loads multiplied by `finalLoadFactor`. Distributed
and point member loads, recovered end shears and moments, and load metadata could
therefore describe a different applied state. Native arc-length continuation also
needs the start model's loads in addition to the scaled reference pattern.
Native displacement-control `steps[].displacements` were empty; this field is
not serialized by WASM and was not a promised WASM history.

The sweep accompanying #1952 also repairs or explicitly contains these fields:

| Analysis and entry points | Affected result fields and conditions | Behaviour after #1952 |
|---|---|---|
| Guyan 2D/3D, dense/sparse | Reactions omit force transferred to restrained constraint masters; 3D member forces always empty; spring-only 3D reactions can be empty | Full residual and master transfer; recover 3D member forces and spring entries |
| Staged 2D/3D | Stage and final reactions omit master shares; constraint forces empty; constraint-only stages return zero reactions; incompatible support histories can return displacements, reactions and forces for different support states | Joint recovery; recover determined stages; refuse restraint/DOF mismatch; diagnose undetermined stiffness-free states |
| P-Delta 2D/3D | Final reactions omit master shares; small-strain forces may fail moment balance on displaced geometry | Recover master shares; failed physical residual withholds equilibrium forces and stresses in native records and is refused by WASM/certified exports; a passing residual retains small-displacement answers and warns if displaced-geometry moment balance fails |
| Corotational 2D/3D, including native 2D continuation | Reactions omit master shares; constraint forces use tangent times displacement instead of actual nonlinear internal force | Recover both from the actual final internal-minus-applied residual |
| Material nonlinear 2D/3D | Reactions omit master shares; constraint forces can use initial elastic stiffness after yielding | Recover both from the final secant state; existing constitutive/convergence warnings remain |
| Contact, dedicated cable and Winkler 2D/3D | Reactions omit restrained-master shares; cable recovery must retain actual chord tension | Common full-residual recovery with the solver's actual internal force |
| Time history 2D/3D, Newmark/HHT and traced native wrappers | `peakReactions` is an elastic-only displacement-peak estimate, omitting inertia, damping and time-dependent support loading; spring-only entries can be empty | Withhold `peakReactions` as an empty collection and explicitly diagnose unavailable total dynamic reactions/member forces; no total reaction history or reaction envelope is supplied |

Linear 2D/3D, prepared/repeated linear solves, load cases/combinations and SSI
already included restrained-master transfer; they are controls for this defect.
Fiber constraints remain refused. Modal, buckling, Craig-Bampton, harmonic,
response-spectrum, moving-load and plastic-limit schemas do not promise the
same final loaded reaction/member-force fields. An intentionally absent field,
or an empty member-force array in a memberless model, is not this omission.
Existing incremental-plastic, fiber, material and dynamic limitations are not
claimed resolved. Creep/shrinkage obtains static results through its underlying
solver rather than an independent empty-result constructor.

## What was wrong

Arc-length and displacement control built their own final result with literal
empty reaction arrays. Their member recovery received the unscaled reference
input. Several other solvers used only restrained rows of an equilibrium
residual, losing forces transmitted from dependent DOFs to restrained masters.
Constraint-force recovery could also use a stiffness from a different state.
Staged support masks and the DOFs actually solved could disagree without a
refusal. Convergence alone did not validate those reported fields.

A WASM replay built from **origin/main `c11af4e36`** returns `converged: true`,
no warnings or diagnostics, and `results.reactions: []` for both retained frozen
arches. Their final load factors are respectively **2.724999998405937**
(`0015ab84c3baa36f`) and **60.499999707746845** (`022317310499426d`). The corrected
build supplies two reactions for each at the same load factors.

A separate tiny fixture includes a fully fixed beam so its displacement is
exactly zero. Independent integration of the synthetic distributed load and
point-load shape functions determines its end forces without calling engine
recovery code. Main returns the reference-load end shear **17.485185185185188**
in both path analyses:

| Analysis | Final load factor | Main start shear | Correct start shear at that factor |
|---|---:|---:|---:|
| Arc-length | 0.02999999620312573 | 17.485185185185188 | 0.5245554891665059 |
| Displacement control | 1.1111131481603436 | 17.485185185185188 | 19.42801915727771 |

These are synthetic replay values in engine force units, not engineering
recommendations, a worst-case bound or a universal multiplier. The same beam's
unit-factor linear control already returns the correct reference-load values.
The [replay JSON](replays/SA-2026-061.json) retains exact call arguments,
before/after result fields and every returned warning/diagnostic for its cases.

The wider sweep is **not uniformly diagnostic-free**. Several constrained
fixtures carry existing mechanism/conditioning warnings, material analysis
carries its secant-model warning, and time history already warns about #760.
The undetermined 3D stiffness-free stage is already refused as a mechanism.
Those cases document repair/containment scope, not additional claims of a
previously silent result. Silent examples include the path fixtures, the 3D
contact/cable/staged reaction omissions and the staged support-state mismatch;
see the per-call notices in the replay.

### Release boundary

Source history and inspection of every available release tag establish the
following entry-point boundaries. The two commits in a cell are 2D and 3D
respectively. All ordinary paths below are present in **0.2.0**, the first
release documented in `docs/releases`, and in 0.3.0, 0.4.0 and 0.5.0. Their
introductions also precede all three desktop alpha tags, which contain them.

| Path | Introduction commit(s) | First documented release containing the path |
|---|---|---|
| Arc-length and displacement control 2D | `1d4a76138` (2026-03-08) | 0.2.0 |
| Guyan 2D / 3D | `dd2f98237` / `b6acfcb5c` | 0.2.0 |
| Staged 2D / 3D | `0a53a08cb` / `da31341f8` | 0.2.0 |
| P-Delta 2D / 3D | `dedf0713d` / `7fd660fa6` | 0.2.0 |
| Corotational 2D / 3D | `c57dfb7bb` / `08f4d1754` | 0.2.0 |
| Material nonlinear 2D / 3D | `c57dfb7bb` / `be863d6ed` | 0.2.0 |
| Contact 2D/3D | `0e496d83e` | 0.2.0 |
| Cable 2D/3D | `976bd6d72` | 0.2.0 |
| Winkler 2D/3D | `012338d77` | 0.2.0 |
| Time history 2D / 3D | `c57dfb7bb` / `7a6f0d0d7` | 0.2.0 |
| Native arc-length continuation | `3fc207b60` (2026-11-09) | Unreleased main builds after 0.5.0 |
| Native corotational continuation | `36ed7dd52` | Unreleased main builds after 0.5.0 |

Constraint integration (`a19cc90e3`, 2026-03-08) also predates those tags.
Inspection of 0.2.0 source confirms the literal empty path reactions, empty
Guyan 3D member forces, separate restrained-row recovery and the legacy
elastic-only dynamic estimate. This is a source/tag boundary, not a replay of
released binaries or a claim that every listed model runs in every old release.
Later validity guards can warn about or refuse particular models. The exact
silent behaviour above was replayed on current main. No fixed release or
deployment is claimed. Release records: [0.2.0](../releases/v0.2.0.md),
[0.3.0](../releases/v0.3.0.md), [0.4.0](../releases/v0.4.0.md),
[0.5.0](../releases/v0.5.0.md).

## Rotated member loads (round 9)

Corotational 2D/3D recovery also combined reference-frame fixed-end actions
with final-frame elastic actions. A transverse dead member load therefore
omitted its axial projection after chord rotation and reported the unprojected
shear. Spatial fixed-end moments likewise require the final frame. Planar path
solvers and native continuation share the affected recovery.

The `round9NativeReplay` section of the existing
[replay evidence](replays/SA-2026-061.json) retains exact inputs and complete
native outputs from origin/main `144296aadc772a13ec768a58ecb5e387aecb787e`.
Both small-rotation cantilevers converge without warnings or diagnostics but
report nonzero axial force at their unloaded free tip. The large-rotation 3D
accuracy warning therefore does not contain this class. This is a verified
current-main boundary; no additional release boundary is claimed here.

The fix transforms fixed-end force and moment vectors to the final member frame
before combining them with elastic actions. Review member forces under member
loads whenever the chord or spatial member frame rotates. See the
[round-9 write-up](../results-changes/2026-11-corotational-member-load-frame.md)
and re-check entry `corotational-member-load-frame`.

## Staged support springs (round 12)

Staged analysis 2D and 3D did not record support springs in its stage history.
A spring added, removed or replaced after a stage had already carried load left
the member set and the rigid restraint DOFs unchanged, so no history check
fired. Reactions were then recovered with the new spring stiffness applied to
the cumulative displacement, as if the spring had been present from the start.
Main returned these results without warnings or diagnostics.

A replay of origin/main `a8add9c41a2ca033420ba5e3588dbf51652590de` uses two
identical 3 m cantilevers sharing a fixed root, with their tips tied, a 10 kN
load on one tip in stage 1, and a later spring change. Total upward reaction
must equal the 10 kN load in every case:

| Later stage change | Main total reaction (kN) | Correct (kN) |
|---|---:|---:|
| 3000 kN/m spring added at a loaded tip | 16.749999999999993 | 10 |
| That spring present from the start, removed after loading | 5.970149253731339 | 10 |
| Spring removed and a 7000 kN/m spring added at the tied tip | 15.373134328358203 | 10 |

The added spring reported 6.749999999999998 kN although an unloaded spring
activated after loading carries no force. Removal and replacement also left
stale member shears, moments and cumulative displacements; each beam shear in
the removal case was 2.9850746268656696 kN instead of 5. Affected outputs are
the reactions of the stage that changes the spring, every later stage and the
final result. Spring changes before any load or response, unchanged springs and
non-staged analyses are outside this case. Fixture
`engine/tests/fixtures/staged-springs-r12.json` (cases
`spring-{2d,3d}-{added,removed,changed}`, with `unchanged` as the control)
retains the inputs.

The fix builds one stage-history fingerprint from every stiffness contributor,
including support springs, so a spring change is handled like a member change:
results are recovered from a clean activation state or marked unavailable with
`result_quantity_unavailable`. To screen past models, look for staged support
activations, removals or stiffness changes after any stage with nonzero load or
response, and re-check that stage and everything after it. A reaction total
that does not balance the applied load confirms the defect; a balanced total
alone does not prove the result correct.

## Staged removal of a loaded member

Staged analysis 2D and 3D did not redistribute the internal force a member
carried when a later stage removed it. The remaining structure kept the
displacements of the earlier stage, and reactions and member forces were
recovered from that state as if the removed member were still sharing the
load. Main returned these results without warnings or diagnostics
([#1996](https://github.com/lambdaclass/stabileo/issues/1996)).

A replay of origin/main `56caebec4875af81d72a0673f191c2b77b1d1594` uses two
identical parallel 5 m members from a fixed root, each with EA/L = 400000. Stage
1 activates both and applies Fx = 100 at the tip, which correctly gives tip
`ux = 0.000125` and an axial force of 50 in each member. Stage 2 removes one
member with no new load. Equilibrium then requires tip `ux = 0.00025` and a root
reaction of -100. Main kept `ux = 0.000125`, reported a root reaction of -50 and
a force of 50 in the remaining member, in 2D and 3D, and carried that answer
into every later stage and the final result. Fixture
`engine/tests/fixtures/staged-removal-r20.json` retains the inputs.

After #1952, removing a member that carries load after loading refuses the
staged history with a structured error naming #1996. Removing an unloaded
member, or one removed before any load, still solves. Redistribution of the
released force is not implemented. To screen past models, look for staged
member removals after any stage with nonzero load, and re-check that stage and
everything after it. A reaction total that does not balance the applied load
confirms the defect.

## How to tell if your results are affected

Identify the analysis method and the engine/build that produced the saved
result, including research workers, direct engine/WASM calls and advanced
workflows. Review loaded arc-length/displacement-control results with empty
`results.reactions`. If member span loads are present and `finalLoadFactor`
differs from one, compare their reported load metadata and end forces with the
final applied loads; a factor of one does not rule out missing reactions or
constraint-force defects. Review continuation's start loads as well.

For the other swept analyses, check constraints that transfer force to
restrained masters, nonlinear constraint forces after deformation/yielding,
Guyan 3D member forces and spring-only reactions, and each stage's actual active
supports and physical stiffness. Do not treat `peakReactions` as total dynamic
support demands, simultaneous reactions or an envelope. An empty warning list,
a converged flag or small reduced-system residual does not establish that an
omitted field was recovered correctly.

The ordinary PRO advanced tab excludes the planar arc-length and displacement-
control APIs; this advisory does not claim it displayed a normal path-solver
reaction table. Research views mainly consume their paths/displacements.
Native/WASM consumers receive the empty arrays directly. If such a result is
put into the generic results store, the reaction table has an empty body, the
node reaction section is absent and no reaction arrows are drawn. Empty entries
must not be interpreted as zero support demand.

The `arc-length-reactions` re-check entry uses analysis context plus structural
features, constraints, configured time history or an explicit `pathAnalysis`
marker. It excludes recorded linear-only solves and does not invent path
history for an ordinary unconstrained nonlinear project. Legacy stamps are
conservative; saved metadata cannot identify every native/research/Guyan/staged
workflow. Absence of an automatic notice is not evidence that a result is
outside this advisory. Check exported/API results and analysis records directly.

## Fixed in

0.6.0, containing merged PR #1952. Path solvers use the shared corotational
final-result builder with actual final applied loading. Common full-residual
recovery computes reactions and constraint forces together, transfers
restrained-master shares and uses the established spring/inclined-support
mapping. The checked mapper refuses inconsistent restraint/DOF states.
Guyan 3D recovers member forces. Native displacement-control snapshots retain
their displacements.

Staged analysis recovers fully determined constraint-only and fully restrained
states, preserves prescribed motion and prevents artificial stabilization from
creating restrained-node reactions. Settlement-only P-Delta uses the same
prescribed-motion/constraint-reduced equation for iteration and residual
normalization. Numerical tolerances are unchanged.

`result_quantity_unavailable` explicitly identifies unsupported reaction or
stage quantities. A failed P-Delta physical residual withholds equilibrium
forces and stresses; WASM and certified exports refuse that state. A passing
physical residual retains small-displacement answers, with an
`equilibrium_violation` warning if displaced-geometry wrench balance fails.
The P-Delta formulation is unchanged. Time history returns `peakReactions: []`
with an unavailable-quantity diagnostic; this is not recovery of total dynamic forces.
Spatial path solvers are not added; spatial payloads remain refused, as do
unsupported displacement-control inclined/prescribed-support inputs.

## Workaround

On affected builds, independently recover support and constraint forces from
the actual final state and applied loads, or use an independently verified
solver. For path analyses, include the final factor and continuation start
loads in member-load recovery; multiplying all existing nonlinear member forces
by the final factor is not a valid general correction. For a genuinely linear
problem, a verified linear solve at the intended loads can supply its reactions
and member forces. Do not substitute it for a nonlinear equilibrium path.

Use a supported corotational analysis or an independent finite-displacement
check where P-Delta reactions fail displaced-geometry equilibrium. Independently
analyse incompatible staged support histories. Obtain total dynamic support
demands from a solver that includes inertia, damping and support loading;
`peakReactions` is not that result, including after #1952. Re-run on the corrected
build when available and respect any explicit refusal or unavailable quantity.

## What to do with results you already have

Re-run affected analyses and review reactions, connection/foundation demands,
constraint forces, member shears/moments, stage states and deliverables based on
them. Include analyses whose displacements or load factors appeared plausible.
Reassess design decisions using corrected or independently verified demands;
an unavailable result is not a zero demand or a passing check.

## Credits and references

Issue #1949 and the #1952 result-field sweep. The
[results-change write-up](../results-changes/2026-11-arc-length-reactions.md)
describes the shared recovery and remaining limits. Retained native regressions
are in `engine/tests/validation/domains/solver/reaction_recovery.rs`; WASM checks
are `make test.engine.reactions-wasm` and `make test.engine.reactions-frozen`.
The coordinator assigned SA-2026-061 for the silent wrong or missing results on
main. This advisory changes documentation and replay evidence, not engine values.
