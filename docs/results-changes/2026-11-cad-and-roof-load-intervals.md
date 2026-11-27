# Generated floor pressures

## Account for use-zone pressure on clipped quadrilaterals

The generated source audit clips a uniform use zone to the shell in its physical plane and computes the area and first moments by closed-form polygon formulas. Openings are removed as a union. The audit compares the resulting force and moments with the delivered load before solving.

The audit independently checks each corner force on triangles and affine quadrilaterals. Both support zones with overlapping openings. Analysis refuses clipped pressure on a non-affine quadrilateral and identifies the element because the corner forces cannot be independently certified. Rerun affected analyses after remeshing the affected zones with triangles or parallelograms.
