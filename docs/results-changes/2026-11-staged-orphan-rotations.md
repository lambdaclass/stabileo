# Staged rotations retain physical stiffness after unit changes (2026-11-11)

Issue [#1846](https://github.com/lambdaclass/stabileo/issues/1846).
Results-change entry `staged-orphan-rotations`.

Staged 3D analysis added a second artificial rotational spring after ordinary
linear assembly. An end releasing either local My or Mz marked its entire node
as hinged. The staged code then compared each global rotational diagonal with
the largest diagonal anywhere in the model, including translational stiffness.
That comparison mixes units: changing length and force units could add a spring
to a rotation that already had physical stiffness. Both dense and sparse paths
contained this code. Staged 2D separately added a spring at every all-hinged node,
even when a real rotational support spring already held the rotation.

On main `85c002b3a378a076fe118d75fcb665b5099dba46`, the exact unit-transformed
#1846 input returns node 2 rx = 0.16535440385032843 from staged 3D, versus
35.590640526156434 from regular linear. The retained candidate replay independently
compared both original and transformed inputs with OpenSees and confirmed the
linear answer. Native and public WASM staged exports returned the wrong rotation
without final structured diagnostics. These observations come from
`candidate-replay/docs/verification/candidate-replay-2026-11-11.md` and its JSON
record (`staged_followups`), supplied for this task; the two exact inputs are now
retained in `engine/tests/fixtures/staged-orphan-1846.json`.

Both staged dimensions now assemble their active physical model through regular
linear assembly with legacy artificial rotational stiffness disabled. Regular
linear preparation and staged solves share `analyze_free_stiffness_excluding`: it reduces
constraints through the existing constrained stability path, classifies physical
stiffness in the existing node-local rotational subspaces, refuses unresolved
mechanisms and pins only unloaded free rotations. The shared pin load checks also
verify that the solved response does not load a pinned direction indirectly. This
handles a release rotated between global axes, as well as an axis-aligned zero
rotation. No stability threshold changes.

Only unloaded reduced DOFs with an exactly zero stiffness column and no motion
at an active member or shell node receive inactive stage treatment. Constraints
are projected per DOF; they never activate an entire node. Inactive DOFs are
excluded from stability analysis, then assigned a unit solve diagonal. Physical
stiffness and support reactions contain no inactive artificial springs. Older
serial and parallel 2D triplet assemblers use the existing per-node rotational
check instead of hinge counts. Kinematic analysis uses the same physical
stiffness classification and pin projection instead of another orphan threshold.
Real rotational springs retain their response; unloaded orphan rotations remain
solvable and unsupported nodal moments remain refused. Extremely soft inactive
springs receive the regular solver's refusal instead of a false answer from an
artificial spring.

Re-run staged models with member releases, particularly models transformed
between units or with soft rotational springs. Rotations, displacements, forces,
reactions and demands derived from affected results can change. The re-check
registry conservatively selects models with hinges, springs or truss members; it does not assume a saved
analysis stamp records staged construction separately.

The defect was introduced with staged 3D in `da31341f8` (2026-03-07). Source
inspection finds the same defect in releases v0.2.0, v0.3.0, v0.4.0, v0.5.0 and
desktop-v0.1.0-alpha.1 through alpha.3. Those historical binaries were not replayed
here; the numerical silent failure above is verified on main. The reserved [SA-2026-060 draft](../advisories/SA-2026-060-staged-orphan-rotations.md)
records the evidence; publication remains with the coordinator.

Targeted native tests compare staged and linear results for both exact inputs,
My-only, Mz-only, both-bending and all-rotation releases, unreleased controls,
unit scales, coordinate-axis rotations, oblique members, dense/sparse dispatch
boundaries, true orphans, real support springs and unsupported moments. They also
check legacy 2D assembly paths, kinematics and nonlinear consumers. The public
WASM test covers the same staged release family and nonlinear controls. No
existing tolerance, baseline or assertion was relaxed.

Review of PR #1943 also found that the replacement 2D stage assembly added
prestress to the force vector after ordinary assembly had rotated it for inclined
supports. Prestress is now represented as ordinary global nodal loads before
assembly, so both dense and sparse paths use the regular load assembler and its
single support transformation. Native internal regressions compare assembled
loads, displacements and reactions against regular linear solves with independent
equivalent loads for straight, parabolic and harped tendons, including zero force.

Public staged 2D and 3D still explicitly refuse inclined supports, as main does.
This internal correction does not enable them or claim a public inclined-support
result changed. Native and WASM tests retain those refusals on both sides of dense
and sparse dispatch. Staged 3D has no implementation that consumes its stage
prestress field; adding that physics is separate work, not part of this coordinate
correction. The WASM comparison now requires every displacement component for the
selected dimension to be a finite number before checking the existing tolerance.

Second review of PR #1943 corrects inactive DOF handling in genuine multi-stage
and partially constrained models. Nonzero reduced loads on free inactive DOFs
are refused rather than carried by artificial springs. This does not validate
premature member or shell loads, out-of-range load indices, loads that reduce to
zero through constraints, or prestress on inactive elements. Those cases retain
their pre-existing behavior. An unconnected support with
settlement produces zero stiffness reaction. Positive one-direction springs keep
their physical response without stiffening their unloaded transverse directions.
Sparse stages use the assembler's free matrix directly, avoiding a second
summation order through the full matrix. Dense physical matrices preserve exact
nonzeros; sparse staged matrices use the regular sparse assembler's existing
entry filtering. Stage solves require SPD Cholesky, conditional refinement and
finite solutions, matching regular linear analysis.

Kinematic solvability distinguishes elastic conditioning refusals from geometric
mechanisms, so rigid-plastic analysis retains geometrically stable inputs.
Mechanism diagnostics retain Spanish text and identify free translations;
the sparse proof checks the same physical stability as the dense path. Hinged
nodes with positive rotational springs on pinned or roller supports now carry
nodal moments through raw, certified and staged 2D solves.

The exact archived comment models `1085-6760749658-0`, `1011-6730900141-0`
and `1846-6760758840-0` are retained in
`engine/tests/fixtures/staged-review-comments.json`. Their staged unit-copy
failures reproduce with main production sources in this worktree. The class can
change translations and member actions in multi-member 3D frames without
rotational supports and across multiple load stages, rather than only a single
member's rotation. Targeted tests compare translations, rotations and member
force/moment groups across unit scales and both dispatch paths. The public WASM
regression target is now an explicit step of the CI WASM job.

The additional `staged-free-stiffness` registry entry covers these review changes
conservatively for members, shells, constraints, springs and settlements. This
broader entry is necessary because loads on free inactive DOFs and the solution
accuracy checks can affect unreleased frames too. The original
`staged-orphan-rotations` entry retains its release/spring/mixed-member scope.

Final review retains the sparse 2D assembler's inclined-support transforms with
its stiffness and uses those same transforms when rebuilding cumulative loads
for reaction recovery. Internal tests compare dense and sparse reactions and
global force/moment equilibrium for nodal loads and independent prestress
equivalents. Public staged inclined-support refusals remain in place in both
dimensions; this correction enables no new public support configuration.

## Saved-model applicability and numerical scope

The saved-model notice requires nonempty construction phases in `designData.site.phases`, in addition to the structural features in the entry. The advanced panel keeps manually entered stages and their results locally; they are not saved as base linear results. A saved model without construction phases has no persisted staged history to recheck. The numerical declarations cover `stages` and `finalResults`, plus solve status, rather than unrelated base forces, reactions or displacements.
