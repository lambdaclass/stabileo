# Generated floor pressures

## Account for use-zone pressure on clipped quadrilaterals

The generated source audit clips a uniform use zone to the shell in its physical plane and computes the area and first moments by closed-form polygon formulas. Openings are removed as a union. The audit compares the resulting force and moments with the delivered load before solving.

Triangles and affine quadrilaterals also have independent checks for each corner force. For a non-affine quadrilateral, accounting checks the delivered corner IDs and force directions along with the resultant. Valid clipped pressure, including zones with overlapping openings, can solve and report its reactions. An inconsistent delivery is refused. Rerun affected analyses.
