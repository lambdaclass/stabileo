### Performance
#### Draw a 3D diagram's closing lines and markers once each (2026-11-18)

A 3D force diagram drew, for every member, two closing lines and up to two
marker spheres as objects of their own: on a 3,414-member model 14,429 objects
a diagram, each a draw call every frame. The closing lines of a diagram are
now one set of segments and its markers one instanced mesh, so the same
diagram is 6,831 objects. The segments, the markers' positions, the colours
and the draw order of the markers are the same; each member keeps its own fill
and outline, which the hover reading uses.
