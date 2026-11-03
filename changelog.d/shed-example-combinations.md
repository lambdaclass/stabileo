### Fixed
#### The 3D shed example no longer lists an earthquake combination it has no earthquake for (2026-11-03)

The industrial shed brings its own load cases (dead, roof live and wind) and no combinations, so
opening it in Basic 3D kept Basic's four defaults. The fourth, "1.2D + L + E", took a load case the
shed does not have: the solver skipped that factor and showed 1.2 D + 1.0 Lr under an earthquake
name. Its numbers were those of 1.2 D + 1.0 Lr, which never gave the largest magnitude of any member
force, reaction or displacement, but the name said the shed had been checked for an earthquake. The
shed now opens with the seven CIRSOC 101-2025 §2.3.2 combinations for its dead, roof live and wind
cases, and the stadium canopy, which had Basic's "L" combinations applied to its roof live case,
with the three for its dead and roof live loads. The biaxial cantilever, whose only load sits in its
own "Tip load" case, had every combination at zero; it now has one combination of that case. An
example, workbook or generated model that brings its own load cases and no combinations keeps
Basic's four only when each of their cases is there with the type it was written for and every case
it loads is in one of them; otherwise it gets the CIRSOC 101-2025 strength combinations of its own
cases, and is refused if a case it loads is in none of them (a workbook says so on its LoadCases
sheet and leaves the open model as it was). One with a load in a case it does not have, or whose own
combination names such a case or a factor that is not a number, is refused (a workbook without a
LoadCases sheet reports a load beyond Basic's four cases as a problem), and a share link whose loads
omit their case is read as case 1 and refused when there is no such case. Projects saved with the
old combinations solve as before; open the example again for the new ones.
