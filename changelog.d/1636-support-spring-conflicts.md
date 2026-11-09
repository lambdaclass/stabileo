### BREAKING (results)

#### Rigid restraints and springs on the same DOF are refused in 2D and 3D (2026-11-08)

The engine now refuses a positive spring on a rigidly restrained DOF with a structured `conflicting_support_spring` error naming the support, node and conflicting fields. Previously 2D kept the rigid restraint while 3D freed the DOF and solved it as elastic, changing displacements, reactions, member forces, modal frequencies and buckling factors (#1636–#1646). Dense, sparse, constrained, prepared, typed, certified and load-session paths use the same support rule. Springs on free DOFs remain elastic. Inclined supports retain their normal restraint and global-axis translational springs; these use different frames. See [the results change](../docs/results-changes/2026-11-support-spring-conflicts.md) and [SA-2026-049](../docs/advisories/SA-2026-049-support-spring-conflicts.md). This fix is not yet released or deployed.
