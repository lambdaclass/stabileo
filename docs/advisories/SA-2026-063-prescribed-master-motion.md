# SA-2026-063: Constrained analyses dropped motion prescribed at restrained masters

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-13; fixed in PR #2009, pending release |
| Issue | [#2008](https://github.com/lambdaclass/stabileo/issues/2008) and the PR #2009 prescribed-motion sweep |
| Fix | PR [#2009](https://github.com/lambdaclass/stabileo/pull/2009); pending release |
| Affected versions | Source-confirmed older paths in 0.2.0–0.5.0 and desktop-v0.1.0-alpha.1–alpha.3; planar corotational and arc-length support-motion paths only in later main builds; wrong results replayed on main `60753cb06` |
| Re-check registry | [`prescribed-master-motion`](../../web/src/lib/provenance/result-changes/prescribed-master-motion.json) |

## Affected features

**Engine/native and WASM analyses with a restrained constraint master carrying
nonzero prescribed translation or rotation.** Equal-DOF constraints, rigid links,
linear MPCs and composed constraints can transfer that motion to dependent free
DOFs. The affected solvers omitted that transfer from the solved state or its
equilibrium equation.

| Analysis and entry points | Affected fields and conditions | Behaviour after #2009 |
|---|---|---|
| Staged construction 2D/3D | Slave displacements in every affected stage and the final result; prescribed motion missing from the reduced equilibrium equation | Include the affine motion and its stiffness response; unchanged stages retain it without applying it twice |
| Winkler 2D/3D | Slave displacements and coupled free response | Include prescribed slave motion in the reduced equation and expansion |
| Contact 2D/3D, dense/sparse | Slave displacements and contact-state equilibrium | Include prescribed motion in base and contact-correction blocks |
| Material nonlinear 2D/3D | Slave displacements and nonlinear state used for residual evaluation | Impose the affine state before evaluating equilibrium; existing material/convergence warnings remain |
| Corotational 2D, ordinary and native continuation | Slave displacements and support-driven Newton predictor | Include the support-induced slave increment in tangent forcing and expansion |
| Arc-length 2D, ordinary and native continuation | Slave displacements along the load-scaled support-motion path; equilibrium/load factor can also change | Include support motion in predictor and corrector load directions; fixed-load residual corrections remain homogeneous |
| Time history 2D/3D, Newmark/HHT, ordinary/traced/certified native entries and WASM | Prescribed support displacement ignored, including at the support itself; histories, peaks and derived outputs describe the absent-motion problem | Refuse any nonzero prescribed support displacement or rotation with an explicit unsupported-feature error |
| Dedicated cable 2D/3D, ordinary/pretensioned native entries and WASM | Inputs containing cable elements accepted prescribed motion while reporting restrained and dependent motion as zero | Refuse any nonzero prescribed support displacement or rotation when cable elements are present |

Displacements, member forces and reactions derived from the omitted motion need
re-checking. This correction does **not** certify recovered support reactions:
the separate restrained-master force-transfer and path-recovery defects in
[#1949](https://github.com/lambdaclass/stabileo/issues/1949) / PR
[#1952](https://github.com/lambdaclass/stabileo/pull/1952) still require their own
correction.

Linear constrained 2D/3D already included the particular motion; P-Delta starts
from that affine linear state and is a control for this defect. Corotational 3D
and displacement control already refuse prescribed support motion. Modal shapes,
buckling eigenvectors and Newton residual corrections at fixed supports require
homogeneous expansion. Cable inputs without cable elements still delegate to
linear analysis. Explicitly zero prescribed motion remains accepted; other
existing feature refusals and static motion cutoffs are unchanged.

## What was wrong

The shared constraint expansion returned only `C_ff q`. A total free displacement
also needs the particular motion `C_fr u_r` induced by prescribed restrained
masters. Linear solvers added that term separately; other solvers omitted it.
Staged and foundation equations also missed its stiffness contribution. Material
nonlinear states moved the master without moving the slave. Planar corotational
and arc-length load directions omitted the dependent part of support motion.
Convergence of the reduced system therefore did not establish that the full
state obeyed the input constraints.

The retained [fixture](../../engine/tests/fixtures/prescribed-master-2008.json),
case 0 (2D) and case 54 (3D), has a fixed-root frame whose tip, node 1, is tied
vertically to restrained master node 2. A separately loaded cantilever keeps the
reduced solve nonempty. The support specifies `dz = -0.0013`. Independently of
constitutive assumptions, the equal-DOF equation requires
`uz(1) = uz(2) = -0.0013` for an unscaled solve. Three construction stages must
retain that same motion.

Replay of exact **origin/main `60753cb06`** sources returned:

| Dimension | Analysis | Main master `uz` | Main slave `uz` | Required slave `uz` |
|---|---|---:|---:|---:|
| 2D | Linear control | -0.0013 | -0.0013 | -0.0013 |
| 2D | Staged, Winkler, contact, material nonlinear, corotational | -0.0013 | 0.0 | -0.0013 |
| 2D | Arc-length | -3.899999999995612e-06 | 0.0 | -3.899999999995612e-06 |
| 3D | Linear control | -0.0013 | -0.0013 | -0.0013 |
| 3D | Staged, Winkler, contact, material nonlinear | -0.0013 | 0.0 | -0.0013 |

Every staged snapshot and the final result report the slave at zero. Rotation
cases likewise lose slave rotation; rigid links also lose translation induced by
the imposed rotation and offset. These synthetic replay values are in engine
displacement units, not recommended movements or bounds on the error.

The main arc-length replay has `finalLoadFactor = 0.002999999999996625`; its
required slave motion is the support pattern multiplied by that factor. After
the correction, the replay reaches `finalLoadFactor = 0.002999996831251645`,
master `uz = -3.899995880627138e-06` and slave
`uz = -3.899995880627139e-06`. The changed factor reflects a changed equilibrium
path; the fix does not merely overwrite a displayed displacement. The other
listed corrected slave values are `-0.0013`.

Staged 2D/3D, Winkler 2D, contact 2D/3D and planar corotational/arc-length minimal
replays have no warnings or structured diagnostics. The wider class is **not
uniformly warning-free**: material nonlinear has its existing general nonlinear
warnings and the spatial Winkler fixture has pre-solve notices. Those notices do
not identify dropped prescribed master motion.

### Time history and cable containment

The separate main time-history replay accepted all 324 nonzero-motion probes:
both dimensions, each prescribed translation/rotation component, both signs,
subnormal and small nonzero motion, Newmark/HHT and ordinary/traced/certified
entries. Every complete serialized result was exactly equal to the corresponding
result with prescribed-motion fields absent, including histories, peaks,
reactions and diagnostics.

For the retained 2D Newmark example with `dz = -0.0013`, times
`[0.0, 0.001, 0.002]` have `uz = [0.0, 0.0, 0.0]` at both master node 2 and
slave node 1. The independent loaded cantilever responds: node 4 has
`ux = [0.0, 2.0394289598912307e-06, 2.6120218629742205e-06]`.
This is an ignored input, not an empty or unexcited result. Main already emits
`TH-RECIPROCITY` (#760) and `NL-DYNAMIC-GAPS` (#370) on this beam model; neither
names omitted support motion. Time history is included here as containment scope,
not as an additional warning-free finding.

The supplied cable evidence likewise records accepted prescribed motion with
restrained and constrained-slave motion left at zero. The ordinary and
pretensioned paths now refuse it. Full cable support-motion and dynamic
base-motion implementations are not supplied by #2009. Zero/absent-motion
controls remain accepted and unchanged.

The [retained replay](replays/SA-2026-063.json) contains exact selected static
inputs, complete before/after outputs, selected time-history inputs and outputs,
and source/tag evidence. The main source replay, rather than a release-binary
replay, establishes the numerical observations above.

### Release boundary

Source history and inspection of every available release tag establish the
following boundaries. Introduction commits identify the solver path; constraint
integration is listed separately where it followed the solver. They do not claim
that every later model could run on the initial implementation.

| Path | Introduction commit(s) | Constraint integration / support-motion boundary | Documented releases containing the affected source path |
|---|---|---|---|
| Staged 2D / 3D | `0a53a08cb` / `da31341f8` (2026-03-07) | `b6acfcb5c` (2026-03-09) | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Winkler 2D/3D | `012338d77` (2026-03-08) | `e046a82fe` (2026-03-08) | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Contact 2D/3D | `0e496d83e` (2026-03-08) | `a19cc90e3` (2026-03-08) | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Material nonlinear 2D / 3D | `c57dfb7bb` (2026-03-06) / `be863d6ed` (2026-03-07) | `a19cc90e3` (2026-03-08); later 3D feature integration `571932a9d` (2026-10-17) also precedes 0.2.0 | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Cable 2D/3D | `976bd6d72` (2026-03-07) | `a19cc90e3` (2026-03-08) | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Pretensioned cable wrapper | `0c9af5c5f` (2026-10-22) | Uses the cable solve above | 0.4.0, 0.5.0 |
| Time history 2D / 3D | `c57dfb7bb` (2026-03-06) / `7a6f0d0d7` (2026-03-07) | `e046a82fe` (2026-03-08); traced/certified entries in `8e075bcea` (2026-10-15) | 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| Corotational 2D, including native continuation | Solver `c57dfb7bb` (2026-03-06) | Prescribed motion accepted in `36ed7dd52` (2026-11-09) | Main builds after 0.5.0; none of the available tags |
| Arc-length 2D, including native continuation | Solver `1d4a76138` (2026-03-08) | Prescribed motion accepted in `3fc207b60` (2026-11-09) | Main builds after 0.5.0; none of the available tags |

All three `desktop-v0.1.0-alpha.1`, `desktop-v0.1.0-alpha.2` and
`desktop-v0.1.0-alpha.3` tags contain the older affected paths, including the
pretensioned cable wrapper and traced/certified time-history entries. All seven
available release tags retain homogeneous-only expansion in the affected older
constrained paths and zero restrained response in time history. Their planar
corotational and arc-length entries explicitly refuse prescribed displacement;
those tagged refusals are not silent wrong results from this defect.

This is a **source/tag boundary**, not a replay of historical binaries or proof
that every listed input ran without other warnings in every release. Later
validity guards may warn about or refuse particular models. The exact wrong
results above were replayed on main `60753cb06`; no fixed release or deployment is
claimed. Release records: [0.2.0](../releases/v0.2.0.md),
[0.3.0](../releases/v0.3.0.md), [0.4.0](../releases/v0.4.0.md),
[0.5.0](../releases/v0.5.0.md).

## How to tell if your results are affected

Identify the analysis method and producing engine/build, including direct
native/WASM calls and continuation workflows. In the listed static/nonlinear
analyses, find constraints whose restrained master has nonzero prescribed
translation or rotation. Follow composed constraints and rigid offsets. Compare
reported master and slave motion against the complete constraint equation at
each stage or load factor. Zero master motion is outside this omission; a
plausible nonzero slave value alone does not prove the equation was satisfied.

For time history or a dedicated solve containing cable elements, any prescribed
nonzero support motion needs review even without a constraint. Do not confuse a
ground-acceleration input with the ignored prescribed-displacement fields.
Review histories, peaks and downstream checks, including those with general
nonlinear/dynamic warnings already attached.

The `prescribed-master-motion` re-check entry selects saved models with
settlements conservatively. It cannot reconstruct every past native/API solver
call or continuation history. Absence of an automatic notice does not establish
that a saved result is unaffected; inspect the original input and analysis record.

## Fixed in

Fixed in PR #2009, pending release. Every constraint expansion must now explicitly
choose `MasterMotion::Prescribed` or `MasterMotion::Homogeneous`. The prescribed
case uses one shared particular-motion calculation, also used by affine RHS
corrections and nonlinear state imposition. Linear solvers no longer maintain
separate copies of that calculation. Staged solves apply the prescribed
increment, and the nonlinear load directions carry the same affine motion as
their equilibrium equations.

Cable and time-history inputs with unsupported nonzero prescribed motion now
receive an explicit refusal, including subnormal values; explicit zero remains
accepted. Time-history refusals use the structured input diagnostic envelope and
preserve existing input-error precedence. Numerical tolerances are unchanged.
The separate #1949/#1952 reaction correction must also be integrated before
those reactions can be treated as repaired.

## Workaround

Use an independently verified solver that implements the prescribed motion,
constraints and analysis history together. For a genuinely linear static problem,
the constrained linear solver is an existing control; it does not replace
nonlinear, contact, foundation, staged or dynamic behaviour. Independently verify
its applicability to the intended model.

Do not repair old results by copying a master displacement into the slave after
the solve: the missing motion changes equilibrium and can change load factors,
contact states and member demands. Do not remove a physical prescribed motion
merely to bypass the new refusal. Obtain cable/support-driven dynamic results
from a solver that supports that input, or retain an explicit unavailable result.

## What to do with results you already have

Re-run the complete affected history, including every stage after the first
imposed motion and any continued nonlinear path. Re-check displacements,
serviceability, member forces, connection/foundation demands, reactions and
deliverables derived from them. Include results that converged or whose global
response looked plausible. Review reaction recovery separately under #1949/#1952.
A refusal or unavailable quantity is not zero demand or a passing design check.

## Credits and references

Issue #2008 was isolated through the prescribed-master-motion review and exact
main-source replay; PR #2009 adds the shared kinematic correction and containment.
The coordinator assigned SA-2026-063. The
[results-change write-up](../results-changes/2026-11-prescribed-master-motion.md)
describes the implementation and remaining limits. Retained native regressions
are in `engine/tests/integration/prescribed_master_2008.rs` and
`engine/tests/integration/time_history_2009.rs`; targeted WASM checks are
`make test.engine.prescribed-master-2008-wasm` and
`make test.engine.time-history-2009-wasm`.

The later #2009 corrector review did not reproduce a new arc-length bug: the existing prescribed expansion is required through repeated corrector
iterations. It retained a passing regression, not another numerical fix. This
advisory documents the original main-source defect and changes no engine result.
