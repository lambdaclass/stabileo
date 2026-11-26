# Member cuts and bounded diagram scales

A point query in a beam interval under uniform load returns the moment when
the physical cut and the interval extremum can be shown to round to the same
value. This restores the midpoint query for the attached-roof gap case in
#2295. The browser and engine still refuse an ambiguous station when the
ordinates differ. In a physical planar section query, a shear jump from
10 kN to 2 kN at I now yields 2 kN.

A spatial diagram whose combination supplies a magnitude bound includes the
exterior I ordinate in the plotted scale. For an ABS combination containing an
SRSS constituent with a shear or axial jump at I, the scale therefore covers
both visible faces.

The spatial stress panel suggests cuts at stationary bending points on both
axes. A simply supported span of length L under a triangular transverse load
rising from zero to its peak at J has its bending peak at L/√3. An action
applied at the I support can change the exterior shear without changing this
cut. Rerun affected analyses to refresh diagrams and section suggestions.
