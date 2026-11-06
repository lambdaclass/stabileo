### BREAKING (results)

#### 3D material-nonlinear analysis solves a frame without warping beside one with it, and a truss-only node (2026-11-06)

3D material-nonlinear analysis crashed with an out-of-bounds index when one section had a warping constant and another frame's section had none (#1578): that frame was assembled as 12 DOFs over the 14 a warping model gives each member. Its internal forces read the wrong 12 of those 14 as well. Each such frame now uses its own 12 DOFs, as the linear solver does. The tangent stiffness also lacked the small artificial stiffness the linear solver puts on DOFs no member holds (the rotation of a node reached only by trusses, or the warping of a node no warping member reaches), so those models were refused as singular. They now solve, and in the elastic range they give the linear solver's displacements. Models that solved before give the same numbers.
