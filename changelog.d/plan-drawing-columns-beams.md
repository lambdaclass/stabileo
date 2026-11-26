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
