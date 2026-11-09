# SA-2026-049: a rigid support with a spring on the same DOF was solved as elastic in 3D

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-09 (fixed after 0.5.0; live on stabileo.com since 2026-11-09) |
| Issues | [#1636](https://github.com/lambdaclass/stabileo/issues/1636) through [#1646](https://github.com/lambdaclass/stabileo/issues/1646) |
| Fix | PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780) (merged 2026-11-09 07:41:41 UTC) |
| Affected versions | Engine code in v0.2.0, v0.3.0, v0.4.0 and v0.5.0 retains spring precedence in 3D; also confirmed on the nightly commit 4d1797daa and this worktree's starting commit eab3eda06. Introduction before v0.2.0 has not been bisected. |
| Re-check registry | `support-spring-conflicts-refused` |

## Affected features

The engine and WASM analyses of models containing a positive support spring on a DOF also
marked rigidly restrained. This includes plane models solved in 3D. The affected input fields
are `kx`, `ky`, `kz`, `krx`, `kry`, `krz`, and `kw` together with the matching 3D restraint flags.
The 2D support types imply their rigid DOFs instead of using flags.

The web app's #491 change clears stale springs on rigid DOFs and filters them from its 3D export.
[SA-2026-011](SA-2026-011-springs-on-fixed-supports.md) described that app correction. It did not
remove the engine's conflicting interpretation of raw support input. A project exported through
that filter need not be affected even if its saved data contains stale spring fields.

## What was wrong

In 2D the rigid support type kept its DOF rigid even if it carried a positive spring. In 3D a
positive spring made the same DOF free despite its restraint flag. The same intended structure
could therefore acquire a different boundary condition when solved in 3D.

Displacements, reactions, member forces, modal frequencies, mode counts and buckling factors
could change. In some models a settlement was applied in 2D but refused in 3D because the spring
had freed its DOF. The eleven issue bodies contain reduced examples of these differences. The
error has no general conservative direction: support stiffness changes redistribute demand.

## How to tell if your results are affected

Inspect the actual solver input, including inputs produced outside the web app's normal export.
A 3D support is affected if a positive spring and its matching rigid restraint flag are both
present. A supposedly rigid DOF may then show nonzero displacement or rotation. Warping has the
same conflict with `rw` and `kw`.

A global-axis translational spring at an inclined support is expressed in a different frame
from the normal restraint and is not classified by those flag pairs. A spring on an unrestrained
DOF is valid and is unaffected by this correction.

## Fixed in

After 0.5.0; live on stabileo.com since 2026-11-09.

A shared support resolver preserves rigid restraints in numbering and rejects contradictory
support input before numerical analysis. The structured `conflicting_support_spring` error names
the support, node and fields and carries node and DOF references. This applies in both dimensions,
including dense, sparse, constrained, prepared, typed, certified and load-session paths.

The checked-in issue fixtures have twelve path-specific reproducers per issue. All 132 fail on
the old engine and pass with the correction. Existing spring reaction and warping tests retain
their numerical assertions with explicitly free spring DOFs and additionally require refusal of
the contradictory form.

The same PR also [corrects the diagnostic degree-of-indeterminacy count for inclined 3D normal restraints and global-axis springs](../results-changes/2026-11-inclined-3d-restraint-directions.md) by counting their independent directions in a common frame.

## Workaround

Decide which boundary condition is intended. For a rigid DOF, remove its spring field. For an
elastic DOF, release that restraint and retain the spring. Do not rely on dimension-specific
precedence to choose the boundary condition.

## What to do with results you already have

Re-check results obtained from contradictory support input. Correct the input explicitly, solve
again and review displacements, reactions, member forces, frequencies and buckling factors used
for design. The re-check registry flags projects with springs broadly, including valid inputs.

## Credits and references

Cause triage dated 2026-11-08; nightly metamorphic plane-embedding findings #1636–#1646.
See [the results-change write-up](../results-changes/2026-11-support-spring-conflicts.md),
[the input and assembly contract](../solver/assembly-constraints.md), and SA-2026-011.
