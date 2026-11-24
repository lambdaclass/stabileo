# SA-2026-060: Staged artificial rotational stiffness could corrupt translations and member actions

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-13 (drafted 2026-11-11) |
| Issue | [#1846](https://github.com/lambdaclass/stabileo/issues/1846) |
| Fix | PR [#1943](https://github.com/lambdaclass/stabileo/pull/1943), included in 0.6.0 |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | Source-confirmed in v0.2.0, v0.3.0, v0.4.0, v0.5.0 and desktop-v0.1.0-alpha.1 through alpha.3; silent numerical failure verified on main `85c002b3a378a076fe118d75fcb665b5099dba46` |
| Re-check registry | [`staged-orphan-rotations`](../../web/src/lib/provenance/result-changes/staged-orphan-rotations.json) |

## Affected features

Staged 3D construction analysis of frames with local My or Mz end releases,
including partial releases, multi-member frames without rotational supports and
multiple load stages. Both dense and sparse staged paths contain the defect.
Incorrect rotational restraint can redistribute moments and forces throughout
the model and change nodal translations, reactions and derived design demands.
The failure depends on the relationship between translational and rotational
stiffness entries, so changing units or other model stiffness can expose it.

Staged 2D has a related duplicate regularization: an artificial rotational spring
can be added at an all-hinged node even when a real support spring already holds
that rotation. The targeted test reproduces the resulting incorrect spring response.

## What was wrong

Regular linear assembly already identifies free rotations using the rotational
diagonals of the same node. Staged 3D then added another regularization pass:
any My or Mz release marked the whole node as hinged, and the pass judged its
global rotational diagonals against the maximum diagonal of the entire model.
That maximum could be translational stiffness. A comparison across these units
could add a spring to a rotation with real physical stiffness, changing the solved
model without reporting the change.

## Confirmed silent result on main

The exact #1846 fixture is one oblique frame with a local My end release,
translational restraints and selected global rotational restraints. The retained
original and unit-transformed inputs describe the same linear model.

| Node 2 rx | Original input | Unit-transformed input |
|---|---:|---:|
| Native staged | 35.59064052615643 | 0.16535440385032843 |
| Public WASM staged | 35.59064052615643 | 0.16535440385032843 |
| Regular linear | 35.59064052615643 | 35.590640526156434 |
| Independent OpenSees | 35.59064052615686 | 35.59064055794726 |

Both staged results have empty final structured-diagnostic lists in the main
replay. The independent rotational comparison for the transformed regular-linear
result has normalized error 8.932355662425042e-10 against the replay tolerance
1e-6. The existing metamorphic tolerance for the failing component is 1.689e-8.
These are measured fixture values, not an error bound or correction factor for
other structures. The example's large rotations also exceed the small-displacement
screening limit: agreement here establishes the intended linear equations, not
geometric validity of using those equations for a physical design.

The supplied main replay's observations are retained in
[the evidence JSON](replays/SA-2026-060.json), including the actual staged
diagnostics, independent results and input hashes. The exact models are checked
in as [the regression fixture](../../engine/tests/fixtures/staged-orphan-1846.json).
The ignored reproducer commit fails against main production code with the same
incorrect native rotation; the public WASM reproducer also fails before the fix.

## Multi-member and multi-stage comment witnesses

The archived main replay also records silent failures through `solve_staged_3d`
for these exact model-bearing issue comments:

- [#1085 comment 6760749658](https://github.com/lambdaclass/stabileo/issues/1085#issuecomment-6760749658): a five-node, eight-frame model without rotational supports. Both frame ends meeting at interior node 4 release local My while retaining Mz and torsion. The archived unit-copy relation changes node 2 translation from 15.917273251 to 16.002586398 in the transformed length scale. This demonstrates translation corruption and redistribution of member actions in a multi-member frame.
- [#1011 comment 6730900141](https://github.com/lambdaclass/stabileo/issues/1011#issuecomment-6730900141): a local Mz end release under loads applied in two stages. The archived unit-copy translation comparison differs by 3.775e-10 against its retained tolerance 4.380e-15.
- [#1846 comment 6760758840](https://github.com/lambdaclass/stabileo/issues/1846#issuecomment-6760758840): a three-node, two-frame model with local Mz end releases. Its archived rotation relation compares 1.3690211093 with 25.827800947.

Each matching archived staged call records `diagnostic_calls: [[]]` and
`near_mechanism_warning: false`. The unrelated body classifications of #1085
and #1011 do not describe these comment witnesses. The retained evidence below
copies their exact observations and hashes from the supplied main archive;
new native replays with main production sources in this worktree reproduce the
three failing staged comparisons. The exact fixtures are retained in
`engine/tests/fixtures/staged-review-comments.json`. No new independent oracle
or historical release binary replay is claimed for these additional witnesses.

## Affected-version evidence

The defective staged 3D pass was introduced in `da31341f8` on 2026-03-07.
Each release tag listed above descends from that commit and retains the
`release_my_end || release_mz_end` node classification and the
`artificial_k * 0.5` comparison. Historical release binaries were not executed
in this worktree. The source ancestry establishes affected release code; the
silent runtime observation is specifically the main revision named above.

## Fixed behavior

Staged 2D and 3D use regular linear assembly of the active physical model and the
same physical stability implementation as regular linear solves. The existing
stability projection handles free rotations between global axes, constraint
reduction, unsupported loads and loads transmitted indirectly to pinned rotations.
Kinematic analysis uses that physical classification and projection. Legacy
triplet assemblers share the per-node diagonal test. The separate release-count
passes are deleted. Additional staged handling is confined to unloaded reduced
DOFs with exactly zero stiffness and no motion at an active member or shell node.
Constraints are considered per reduced DOF. These DOFs are excluded from the
stability check and pinned only in the solve matrix; physical stiffness and
reactions never contain inactive artificial springs. A genuinely free, unloaded rotation still solves, and unsupported applied
nodal moments remain refused. No existing tolerance or assertion is relaxed.

The [results-change write-up](../results-changes/2026-11-staged-orphan-rotations.md)
describes the correction and targeted tests. The correction is included in 0.6.0 through merged PR #1943.

## What to do with previous results

Re-check staged models with end releases, particularly after changing units or
when soft rotational springs are present. Re-run affected displacements,
rotations, forces and reactions with a corrected build, and reassess any design
demands or conclusions derived from them. A small residual of the old model does
not establish that an artificial spring was physically justified.

For a single stage, regular linear analysis provides an independent comparison
of the same active linear model. It does not replace a construction-history
analysis, and matching a linear solution does not remove its small-displacement
limitations. Independently verify construction-history results pending the fix.
