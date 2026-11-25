# Use owned footprints for automatic gravity

Low-headroom trimming starts from the assigned bay polygon, including its openings. A same-level shell in an opening keeps its pressure while the beams carry the part of the remaining bay that overhead carriers leave uncovered. The 6 m square witness retains 8 m² on the beams and 1 m² on the shell. Line loads on inclined fringe members use distance along the member and an intensity that preserves the projected force and its plan first moments.

Automatic generation refuses overlapping beam and shell carriers when a nearby vertical attachment makes ownership ambiguous. A shell over a bay opening does not supply cover to the surrounding annulus. An upper shell is evaluated at its local height, and a member midpoint is tested against the stored footprint using both endpoint coordinates. When a bay has mixed roof and floor exposure and the requested actions depend on that distinction, assign the actions explicitly.

Regenerate automatic gravity and roof loads for affected projects before using analysis results.
