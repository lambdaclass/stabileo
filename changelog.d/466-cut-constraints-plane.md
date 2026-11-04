### BREAKING (results)

#### Cutting a 3D model to 2D on Y–Z or X–Y keeps the meaning of its constraints (2026-11-03)

The 2D solver read every constraint as if the model stood in X–Z, so a Y–Z cut dropped a sway tie on uy and applied a tie on ux, out of the plane, as an in-plane one; diaphragms, rigid links, MPCs and eccentric connections were misread the same way on Y–Z and X–Y (#466, SA-2026-036). A cut now rewrites the constraints as if the frame stood in X–Z (axes renamed, the in-plane rotation's sign reversed in MPCs) and restores them with the 3D model, and the 2D results agree with 3D. A constraint that ties a movement in the plane to one out of it (a linear MPC with terms on both, or an eccentric connection offset out of the plane) is now refused on every plane, X–Z included, where it used to be dropped without a word. Re-cut, or solve in 3D, any 2D model with constraints taken from a Y–Z or X–Y cut before this version.

A project with constraints solved in 2D before this version opens with a re-check notice that asks for it to be re-cut from the 3D model or solved in 3D, since the file does not record the plane it was cut from.
