### Fixed
#### The 3D shed example no longer lists an earthquake combination it has no earthquake for (2026-11-03)

The industrial shed brings its own load cases (dead, roof live and wind) and no combinations, so
opening it in Basic 3D kept Basic's four defaults. The fourth, "1.2D + L + E", took a load case the
shed does not have: the solver skipped that factor and showed 1.2 D + 1.0 Lr under an earthquake
name. Its numbers were those of 1.2 D + 1.0 Lr, which never gave the largest magnitude of any member
force, reaction or displacement, but the name said the shed had been checked for an earthquake. The
shed now opens with the seven CIRSOC 101-2025 §2.3.2 combinations for its dead, roof live and wind
cases, and the stadium canopy, which had Basic's "L" combinations applied to its roof live case,
with the three for its dead and roof live loads. An example, workbook or generated model that brings
its own load cases now keeps only the combinations whose every case it has, with the type the
combination was written for, and one whose own combination names a missing case is refused. Projects
saved with the old combinations solve as before; open the example again for the new ones.
