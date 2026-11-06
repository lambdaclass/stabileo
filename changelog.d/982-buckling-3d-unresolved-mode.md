### BREAKING (results)

#### 3D buckling names the modes that round-off in the axial forces can move (2026-11-06)

3D buckling had no counterpart of 2D's BU-UNRESOLVED-MODE check (#982). A model with a real compression beside a member whose axial force is only round-off could return a mode driven by that member, with λ ≈ 1e10, and no warning saying it was not resolved: the #982 model placed in 3D did so in most orientations. 3D buckling now names, as 2D does, every mode whose geometric work round-off in the axial forces can change by more than 1 %, and the members that drive it. Load factors are unchanged; re-check any 3D buckling result that now carries this warning.
