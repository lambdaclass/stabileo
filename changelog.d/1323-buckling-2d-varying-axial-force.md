### BREAKING (results)

#### 2D buckling integrates each member's varying axial force (2026-11-03)

2D buckling built each member's geometric stiffness from its mean axial force. Under a load along a member (gravity on a rafter, an axial point load) the force varies along it, and where compression grows toward the end that rotates most the factor came out too high, with no warning: 4.97 instead of 3.48 (+43 %) for a one-member cantilever whose compression rises to its tip, 4.97 instead of 2.96 (+68 %) with an axial point load at mid-span (#1323, SA-2026-042). The geometric stiffness now integrates the whole axial force along the member; one member gives 3.54 and 3.06, and a finer mesh converges to the exact values. Factors of members without loads along their axis do not change.
