# Spatial diagram geometry and nested ABS bounds

Preparing a piecewise spatial diagram captures the parent length, each piece's
start and end, and the length used by its force curve. A prepared query uses
these same dimensions for cut locations, normalized stations and physical
distances, even when its first call comes after a geometry edit.

In the regression fixture, integrating the 8 kN/m load over the first 0.5 m of
the second piece gives 4 kN at the original normalized station 0.75. Extending
the second piece from 1 m to 2 m previously changed the prepared answer to
3 kN. It now stays at 4 kN. A new evaluator maps station 0.75 to 1.25 m into the
second piece and returns 10 kN.

An ABS combination that contains an ABS term uses a conservative bound for
its extrema. Pointwise combination values are still evaluated at the requested
section. The governing selector withholds an exact claim when the bound exceeds
the best exact candidate. In the regression fixture, the two disjoint axial
pulses each peak at 10 kN, giving an outward-rounded upper bound just above
20 kN. A constant 15 kN candidate receives no exact governing label. A constant
21 kN candidate still governs. A single-level ABS combination can still report
exact extrema when its constituents supply signed force polynomials.
