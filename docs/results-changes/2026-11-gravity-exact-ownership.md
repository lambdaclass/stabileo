# Use owned footprints for automatic gravity

Low-headroom trimming starts from the assigned bay polygon, including its openings. A same-level shell in an opening keeps its pressure while the beams carry the part of the remaining bay that overhead carriers leave uncovered. The 6 m square witness retains 8 m² on the beams and 1 m² on the shell. Line loads on inclined fringe members use distance along the member and an intensity that preserves the projected force and its plan first moments.

Automatic generation refuses overlapping beam and shell carriers when a nearby vertical attachment makes ownership ambiguous. A shell over a bay opening does not supply cover to the surrounding annulus. An upper shell is evaluated at its local height, and a member midpoint is tested against the stored footprint using both endpoint coordinates.

Every upper beam bay contributes its footprint to the exposure check, including when the lower bay has no openings or shell cover. A narrower upper bay can leave part of the lower bay exposed. A bay with mixed exposure from a beam bay or a shell requires explicit assignment when roof and floor actions differ. Uniform actions can still be generated.

Headroom trimming compares the shell and bay at the same plan position. A pitched shell can fully shelter a lower bay even when its overhang rises above the headroom limit beyond the bay. When the clearance crosses the limit inside the bay or a member's tributary strip, only the part within the band is removed. Generation stops if the local clearance cannot be established.

Regenerate automatic gravity and roof loads for affected projects before using analysis results.
