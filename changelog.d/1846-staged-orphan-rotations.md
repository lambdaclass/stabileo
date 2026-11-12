### BREAKING (results)
#### Staged rotations retain physical stiffness after unit changes (2026-11-11)

Staged 2D and 3D now use regular linear assembly and its shared free-rotation classification. Partial bending releases no longer let unit changes add artificial stiffness to real 3D rotations, and a real 2D rotational spring at a hinged end keeps its answer. Re-run staged models with releases; displacements, member forces, reactions and derived design demands may change (#1846). See the [results-change write-up](../docs/results-changes/2026-11-staged-orphan-rotations.md).
