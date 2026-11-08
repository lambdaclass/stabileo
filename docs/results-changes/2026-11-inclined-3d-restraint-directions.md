# 3D inclined supports count restraints in a common frame

## 3D inclined supports count restraints in a common frame

At an inclined 3D support, `support_dofs_3d` describes the rigid translation in the
normal/tangent frame: slot zero is the normal restraint. Its translational spring fields
remain global X, Y and Z. Commit `01d8ed3da` combined these arrays slot by slot with OR.
A normal restraint along global Z and a global-X spring therefore occupied the same slot
in that count, although their directions are orthogonal.

The count now uses the rank of those directions in global coordinates. Positive springs
supply their global axes. The normal supplies one further independent direction exactly
when it has a nonzero component outside the span of those spring axes. Coincident or
already-spanned directions count once, and the translational rank cannot exceed three.
Rotations retain their existing count; warping is outside this six-DOF static-degree formula.

## What moves

The kinematic `degree`, and potentially its `classification` and `diagnosis`, change for
3D inclined supports with translational springs. For the checked-in cantilever fixture,
there is one frame element, two nodes and six restraints at its fixed base. The other
support has normal `(0, 0, 1)` and a positive global-X spring. Their dot product is zero,
so they contribute two independent directions. The degree is derived in the test as
`6 * 1 + 6 + 2 - 6 * 2 = 2`; the branch returned 1. With only a global-Z spring at that
normal, the rank is one; the branch counted two. Both cantilever cases remain hyperstatic.
Other models can cross a classification boundary.

`issue_1780_inclined_z_normal_and_global_x_spring_are_independent_restraints` checks the
exact review finding. `issue_1780_inclined_restraint_count_matches_global_direction_rank`
checks six normals and all eight global spring subsets (48 cases), deriving the expected
rank from cross products and determinants independently of the implementation. These
include coincident, opposite, non-unit and oblique normals and fully spanned translations.
Both tests fail when explicitly run in reproducer commit `977684c86`, where they carry
`#[ignore = "known wrong result: #1780"]`, and pass with the correction and ignores removed.

The registry entry `inclined-3d-restraint-directions` flags projects with inclined supports
and springs. It deliberately includes unaffected 2D models and supports whose springs
are elsewhere. It explains a kinematic counting change; this patch does not change the
assembled stiffness, loads or numerical static solution.

This is a correction to the unmerged support-rule branch in
PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780), not a release or deployment
claim. The exact review case was counted correctly by the earlier counter inspected in
tags v0.2.0 through v0.5.0; other legacy inclined-support counting combinations have not
been exhaustively audited. The degree-of-indeterminacy count is a diagnostic, not a design
result, so this counting correction does not warrant a safety advisory.
