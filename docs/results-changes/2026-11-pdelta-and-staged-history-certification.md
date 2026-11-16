# Physical P-Delta residuals and staged history containment (2026-11-12)

PR #1952, review round 11; loaded-member removal is tracked as #1996.

The P-Delta certificate in both dimensions used the stabilized tangent residual,
while support reactions excluded artificial rotational stiffness. Opposite
moments on two independently stabilized released rotations can therefore have a
zero tangent residual and zero net wrench while their physical free residual is
nonzero. The certificate now reads the physical residual stored by the same
recovery object that supplies reactions and constraint forces. Dense and sparse
assembly use one certification function. The normalizer and acceptance tolerance
are unchanged. Direct public nodal moments on released rotations remain refused
by the existing linear preflight; the supplied-state unit regression exercises
the downstream certificate without bypassing that refusal in a public solve.

Staged recovery multiplied the current stiffness by total cumulative displacement.
An added member therefore acquired forces from deformation before its activation.
Removing a force-carrying member also retained the previous displacement instead
of releasing its forces and redistributing the existing load. The containment
tracks the active member and shell sets, previous deformation and force response,
and nonzero assembled stage loads. A changed active set after a prior response
makes force recovery unavailable for that stage and every later stage. Reactions,
member forces, constraint forces and spatial shell stresses are returned as empty
collections with structured `result_quantity_unavailable` warnings naming the
quantities. `stageResults` also explicitly states that retained cumulative
incremental displacements are not a certified equilibrium solution. Final results
carry the same containment. Stages with unchanged active stiffness, or topology
changes before any response, retain their numerical results.

This deliberately does not implement strain since activation, cumulative member
prestress recovery, released-force redistribution or a new staged solver. The
containment is conservative: a prior nonzero assembled load remains remembered,
so a later topology change can be unavailable even after apparent unloading.
No numerical threshold was added for deciding whether earlier loading or motion
is zero. Every staged result builder requires the recovery classification;
there is no unchecked recovery call for the zero-free-DOF or skipped-stage path.

The shared fixture is `engine/tests/fixtures/reaction-recovery-r11.json`. Native
regressions cover both dimensions, signed and zero loads, nonzero loads scaled
by `1e-12`, loaded removal with no new load, later-stage propagation, fully
restrained loaded-member removal, and dense/sparse dispatch boundaries. Existing
two-phase, support-addition, prop-removal and frame-erection tests now require
containment where their previous force assertions accepted these histories.
The full redistribution test for #1996 remains ignored; its active counterpart
requires diagnostics and empty force collections. WASM runs the same fixtures
through both exported staged APIs and checks linear/P-Delta public refusal and
correct-input controls. Target: `make test.engine.reactions-r11-wasm`.

A native replay against `origin/main` in this worktree returns fictitious added
member forces and unbalanced removal reactions silently in both dimensions.
The replay input/output pairs, source revision, exact commands and observed
numbers are recorded in the untracked round-11 handoff and evidence files for
the coordinator. No advisory was added or modified in this round.

The staged history registry entry requires both members or shells and explicit
`pathAnalysis` context. Structural elements alone do not imply a saved path
analysis: ordinary linear frames and shells receive no staged history notice.
This uses the existing path feature shared by path result registrations, while
retaining the `stages` and `finalResults` quantity limits. The metadata correction
changes no engine result and does not expand the P-Delta entry.
