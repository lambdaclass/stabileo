# Closed pier openings in polygon sections

The CIRSOC concrete section adapter now preserves the interior rings supplied with a polygon. A pier formed by connected walls around an opening uses its net concrete area for axial and flexural resistance. The native section kernel already accepts multiple rings. The earlier polygon adapter passed only the exterior vertices into that kernel.

In the regression fixture the same hollow rectangle is supplied once by dimensions and once by vertices. On main the polygon returned a gross area of 0.09 m² while the dimensioned rectangle returned 0.07999999999999999 m². The adapter now gives identical area, axial resistance, section point, interaction diagram and biaxial check for both representations. The solid control gives identical results throughout.

The closed-pier sheet is opt-in. If an earlier calculation supplied an exterior polygon and interior rings to the JavaScript adapter, recalculate the pier resistance. Published rectangular and circular sections with openings already used their openings. A saved wall design identifies a project where the reviewer can check whether a closed pier was assessed.
