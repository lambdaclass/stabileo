# Kinematic spring checks use local constraint-connected stiffness (2026-11-12)

PR [#1943](https://github.com/lambdaclass/stabileo/pull/1943).
Results-change entry `local-kinematic-spring-rank`.

The unmerged branch replaced every positive support spring by the largest member
free-stiffness diagonal anywhere in the model. With rigid arms, a spring and a
member can restrain complementary reduced directions. Inflating only the spring
using an unrelated component can lose the member direction in the rank test.
The retained `staged-round7.json` fixture reduces the affected pair to
`[[S+1, S-1], [S-1, S+1]]`, up to the rotation sign convention. Its physical
spring has `S=1`; the old replacement uses `S=1e12` from the disconnected member.
Both the 2D and 3D branch checks falsely reported one mechanism.

Spring normalization now uses the maximum member diagonal only among free DOFs
connected through the constraint transform to the spring direction. An
unconnected member cannot participate in that scale. Positive springs in a group
without member stiffness use a common unit rank scale. The same normalization
helper serves both dimensions; physical elastic stiffnesses and the rank
threshold are unchanged. Tests cover the exact fixture, three geometry/unit
scalings, an ordinary and a stiff unrelated component, zero and positive springs,
and tiny positive springs. Native and WASM kinematic exports share the code. The exact model also has
regressions through native 2D limit analysis and the 3D post-hinge carry check,
with zero-spring refusal controls.

The exact unit-spring fixture is solvable in both dimensions in a source replay
of `origin/main` at `c11af4e36316a0c1251a7175cb4fe16660090778`.
This is a branch-introduced false mechanism, not a released silent wrong result.
Re-run spring models whose kinematic checks refused them on this branch.
Mechanism metadata and downstream solve availability can change. The registry
selects spring models conservatively; ordinary elastic component results do not
change through this entry.

The same review repairs latent 2D staged coordinate mistakes. Incremental and
cumulative applied loads now use the assembly's inclined transforms. Cumulative
state stays in the solve basis; recovery transforms a copy to global axes and
uses the shared inclined-reaction builder. Dense and sparse internal regressions
check an independent global-axes cantilever reference and disconnected roller
loads. Public 2D and 3D staged inclined-support refusals remain in force, as on
main and the PR parent, so these latent defects did not return a public staged
answer. Public refusal tests and a flat-roller answer control remain required.
The cancellation oracle now requires exact support-node IDs before zero component
checks; empty, missing, duplicate and unknown reaction rows fail.
