### Added
#### Columns and beams drawn on the plan (2026-11-26)

The Building panel no longer needs grid axes: with two levels its tools open. «Draw columns» and
«Draw» on the beams open the plan view with a drawing bar. A column is drawn by two corners, by a
side and the opposite side for a turned one, or by a click with its b × h, and stands from one
level to another on the fixed point chosen. A beam is drawn by its axis, left, centred or right of
the line, or by its two faces, which give its width; its width and depth are set in the bar as it
is drawn. A beam's end inside a column frames into the column and is offset onto the line drawn,
so it can run flush with the column's face; a column it crosses cuts it, and a beam it meets is cut
there. Points snap to the template, the columns' corners, faces and centres, and the nodes; a level
with no template snaps to the one under it. Shift draws orthogonally, and a length typed and Enter
places the next point.

The building is modelled by storeys. A storey runs from its level to the next one, and the Building
panel shows which one is being modelled, with its template or a button to load one. Its template is
that floor's plan: its columns and walls are drawn from its level to the one above, and its beams and
slabs on the one above, its ceiling. The plan view of a storey cuts at its ceiling, so the beams just
drawn show, and draws the ceiling's slab in halftone. What sits on its floor belongs to the storey
below and is hidden with it, except on the lowest level. The levels come first in Levels and grid,
followed by the template and then the axes; until there are two levels, the panel says what is missing.

In 3D, each level's outline covers the templates as they were laid and the axes, with a margin. A
template laid with no axes no longer sits outside its levels.

Columns, beams and slabs are drawn on the plan as rectangles, from «Draw on the plan» at the top of
each tab. A column takes its rectangle as its section and stands from the storey's level to its
ceiling. A beam drawn as a rectangle runs along its longer side, takes the shorter one as its width,
goes on the ceiling and frames into the columns it touches. A slab drawn as a rectangle goes on the
ceiling. While it is drawn, the sides no beam or wall carries are marked, and once placed it says
how many are free. Its sides on beams move onto the beams, so its mesh shares their nodes.

The drawing bar has its own snaps menu. In it, the CAD template's snaps (endpoint, midpoint, center,
quadrant, intersection, perpendicular, nearest) and the model's (columns, beams, nodes, axes,
drawing grid) are each turned on or off. F3 turns them all off to draw freely, and F8 keeps ortho on.

Walls are drawn on the plan as rectangles too, from «Draw walls on the plan». The short side is the
thickness, and the wall stands from the storey's level to its ceiling. An end inside a column goes to
the column's line, and the wall is meshed at once, so the columns and beams in its plane share its
nodes. On the lowest level its base is held.
