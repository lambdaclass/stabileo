### BREAKING (results)
#### Buckling round-off bounds follow actual constraint coupling (2026-11-11)

2D and 3D buckling now propagate axial-force round-off bounds only through connected stiffness, member and constraint-transform DOFs. A constraint wholly inside a separate structure no longer makes that structure's large forces suppress a resolved column compression. Native and WASM buckling, the omitted-member check and the certificate entry points use the same bounds. Genuinely coupled round-off compressions still refuse at the unchanged thresholds. See [the results-change evidence](../docs/results-changes/2026-11-buckling-component-round-off.md).

Unconstrained 3D members sharing a free warping DOF also share their round-off bounds, including when all six ordinary joint DOFs are restrained. Compression within that coupled uncertainty can newly be refused. The results-change notice covers member buckling without requiring constraints.
