# Rigid restraints and springs on the same DOF are refused

## Rigid restraints and springs on the same DOF are refused

The raw engine input accepted a rigid support and a positive spring on the same DOF. In 2D the
support type kept that DOF rigid; in 3D the positive spring overrode the restraint flag and made
it free. This changed the model's boundary conditions and therefore could change every result,
including the number of modes. The separate 3D settlement validator and the independent
certificate reassembly repeated the spring-precedence rule.

The input contract is now enforced: a rigid restraint and a positive spring on the same DOF
are contradictory and are refused. The refusal is structured JSON with code
`conflicting_support_spring`, severity `error`, node and local DOF references, and a message naming
the support and conflicting fields. Remove the spring to retain a rigid support; release the
restraint to use an elastic support. Neither field silently overrides the other.

The rule comes from PRODUCT_ROADMAP.md's “Contradictory input refused, never resolved silently”
requirement (#504), the support editor and the user guide. Some older solver tests explicitly
expected spring precedence, while the assembly reference documented it as implemented behavior
and proposed refusal in AC-10. Those expectations now include refusal checks and retain their
numerical spring checks with the corresponding DOF explicitly released. No tolerance or baseline
is relaxed.

One support resolver supplies the restraint and spring states to numbering, dense and sparse
assembly, reaction recovery, nonlinear spring readers, kinematic and pre-solve checks, and
certificate reassembly. Validation rejects conflicts before assembly on ordinary, constrained,
prepared, typed, certified and load-session solves. The constrained load-session constructor
also validates supports before retaining its model.
Kinematic support counts now use those same states: they include springs on free DOFs of rigid
support types, and an inclined support contributes its normal restraint rather than ignored
global translation flags. These classification counts can change even on a valid model; the
numerical spring and inclined-support controls retain their existing assertions.

A spring on a free DOF remains a valid elastic boundary condition, including a rotational spring
on a pinned support. Zero stiffness does not conflict with a restraint. Warping follows the same
rule as translations and rotations. At an inclined support, translation numbering is in the
normal/tangent frame while translational springs act in global axes; that established combination
is preserved. Its rotational and warping restraints still cannot carry a spring on the same DOF.

## What moves

| Input | Before | After |
|---|---|---|
| 2D rigid DOF with a positive spring | Solved with the DOF rigid | Structured refusal |
| 3D rigid DOF with a positive spring | Solved with the DOF elastic | Structured refusal |
| A settlement on that DOF | Applied in 2D; refused in ordinary 3D | Same conflict refusal in both |
| Free DOF with a spring | Elastic | Elastic |
| Rigid DOF without a positive spring | Rigid | Rigid |

The eleven issue-body models from #1636 through #1646 are checked in unchanged as JSON fixtures.
Each has twelve path-specific reproducers comparing 2D with the same model embedded in XZ, XY
and YZ. All 132 fail before the fix and pass after it, with the same structured refusal code in
both dimensions. Sparse variants add disconnected free nodes solely to exceed the existing
sparse threshold; refusal happens before matrix assembly. The original unpadded issue models are
also exercised on each reported analysis family. Additional controls check valid springs and
zero stiffness, truss-only numbering, and all seven 3D conflict fields.

The registry entry `support-spring-conflicts-refused` flags projects with springs. This is
intentionally broader than contradictory supports, including legitimate springs that do not
change. The app has filtered stale springs from rigid 3D DOFs since #491; this engine correction
also protects direct engine/WASM callers and other paths that provide the contradictory fields.

This worktree fix is not yet released or deployed. See
[SA-2026-049](../advisories/SA-2026-049-support-spring-conflicts.md).
