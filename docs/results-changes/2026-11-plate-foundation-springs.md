# Foundation springs on physical plates

## Review foundation springs after remeshing

The unified PRO foundation form previously stored the springs it generated as ordinary nodal supports. Refining a plate retained its old corner springs and added springs for the new cells. This could overstate the foundation stiffness after remeshing the same area.

Reopen the project, select the entire affected plate, verify its soil stiffness, uplift option and horizontal restraints, and reapply the foundation assignment. Remesh and rerun affected analyses. Inspect any independently authored point restraints before replacing them. Plates sharing a node must agree on uplift and horizontal restraints. Their stiffness contributions are added at that node. A saved mesh with incompatible springs blocks analysis until its assignments agree.
