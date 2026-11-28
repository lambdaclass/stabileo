# Design thickness of physical plates

A physical plate can retain its original outline thickness after a cell is edited or a mesh is imported. The integrated design reader used that nominal dimension even when the saved analytical cells disagreed. A concrete fire check could therefore report a single thickness for a plate with different cell thicknesses. The physical inspector, masonry checks, reinforcement sheets and drawing generation also consult this reader.

For a meshed plate, design now uses the thickness shared by its actual triangles and quadrilaterals. A mixed or incomplete mesh has no common dimension. Inspect individual cells before using a uniform-section check. In the ordinary build an unmeshed outline supplies no analytical thickness. The unified editor can still read its specified pre-mesh dimension. Uniform cells matching the outline retain their previous result. The finite-element solver is unchanged.
