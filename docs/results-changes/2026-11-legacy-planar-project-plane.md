# Drawing planes in older planar projects

A planar project without a drawing plane could be opened using a plane from the previous project or the XY default. File open could instead switch it to the spatial workspace based on the presence of a Z coordinate. Changing the plane changes the projection of the member geometry and the loads. In the reported example, a member from (0, 0, 0) to (5, 0, 3) has length √34 in XZ and projects to length 5 in XY.

Older projects now use the plane identified by the saved geometry and global loads when they agree on a single plane. A conventional X-axis model keeps XY when the other compatible plane would give the same planar input. When the data do not establish a plane, Basic asks the user to choose explicitly before preparing solver input. The selected plane is saved with the project.

Constraint projection treats rotational coefficients as axial vector components. Under an axis reflection, all rotational coefficients reverse sign together. The independent conversion from spatial rotation about Y to the planar rotation convention still applies when preparing solver input.
