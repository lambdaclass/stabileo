# Gravity loads conserve the physical loaded region

Issues #2199, #2200, #2201 and #2210 concern the force and first moments of
physical loaded regions. Regenerate affected D, L and Lr loads and seismic
weights, refresh floor definitions, then rerun analyses, combinations and design
checks. Re-solving previously generated loads alone does not correct them.
The generated-load notice persists until their generation version is current;
the separate floor-definition notice requests reapplication and recalculation.
Both notices cover 2D, 3D and Pro and every recorded analysis kind.

The audit witnesses were reproduced on origin/main 9d925a780:

| Witness | Before | Physical integral / after |
| --- | --- | --- |
| #2199, unit pressure on a 10 by 6 panel, shell width 4.76 | 58.56 vertical force; 59.88743362831858 after rotation by 0.37 radians | 60 in both orientations |
| #2200, shell width 5 on that panel | first moment about Y 225 | 300 |
| #2201, unit pressure on the zone x=0..1, y=0..6 | force 6, first moment about Y 0.6666666666666663 | force 6, first moments 3 and 18 |
| #2210, 10 by 6 panel rotated by pi/4 | plan area and unit superimposed weight 127.99999999999997 | 60 |

Lengths are metres, pressures kN/m², forces kN, and moments kN·m. Expectations
come directly from rectangle area and centroid integrals in the regressions.
#2199 and #2201 return silent wrong results on main. #2200 discloses its
whole-panel distribution approximation. The #2210 witness is conservative in
weight; it still represents the wrong physical area. No new advisory is assigned
by this change; the coordinator determines advisory numbering and publication.
Historical release binaries were not replayed.

`physical-region-loads.ts` owns polygon union, subtraction and intersection,
area and both first moments, tributary region allocation, and transfer to beam
lines. A transfer requires its eccentric first moments alongside its force
pieces; the floor tool, stored definitions and gravity generator carry those
couples to ordinary global nodal moments. Inclined floors transform the
physical offsets back into global coordinates. One-way zones cut across a span
now transfer their actual clipped region, including the eccentric couple,
instead of being refused. Coplanar shell overlap is loaded once through clipped surface
regions. Distinct physical planes retain their own loads, even when their
mean elevations match; nested sloped shells are compared by plane rather
than mean height. The shell integrator clips regions through the same module.

Boolean sweeps use polygon-clipping, retrying rejected coincident-edge topology
with polyclip-ts 0.16.8 at 80 decimal places and without a snapping epsilon.
A failed high-precision operation propagates; it never substitutes an estimated
region. Rotated coincident-edge regressions exposed the need for this retry.
There is no coverage grid, coverage allowance, percentage cutoff, or
bounding-box area. Bounding boxes only reject shell pairs whose interiors
cannot overlap. Piecewise polygon slicing follows vertex events, not a
sampling grid. Small nonzero regions are retained.

The load transfer is TypeScript upstream of native/WASM and linear/nonlinear
solver selection. No solver equations change. Existing shell shape-function
integration is retained; it receives the exact physical polygon regions.

The existing stored line-load rounding and coalescing conventions remain in
place. Their force and first-moment residuals are retained explicitly as nodal
corrections rather than discarded. Local force components are projections of
the same rounded vertical intensity, avoiding independent component rounding.
Numerical correction nodes are distinguished from physical re-entrant-corner
shares so downstream roof inference cannot mistake roundoff for a new corner.

The invariance helper exercises rotation, mirroring, ID/order permutation and
unequal subdivision with shared inserted nodes. Subdivision respects the existing
minimum member length. The class matrix covers exact audit witnesses, zero,
partial and full coverage, nested/disjoint/overlapping shells, edge and corner
zones, overlapping holes, concave panels, one-way/two-way allocation, uplift,
inclined floors, and width/panel seismic planning. Tests also cover application
and definition refresh in each workspace and regeneration notices after every
recorded analysis kind. Every bundled example supplies physical panel, shell-plan
and strip regions to the same helper, keeping region transfer distinct from
which loads the automatic roof/deck inference selects.

Low-headroom panel fringes and member strips also pass through the shared
region transfer. Polygon vertex events partition their areas, replacing the
previous fixed grid and load bins. A constant carrier piece is centred on the
projected area centroid and its eccentric couple is retained. Equal nearest
carriers share the load. Low-headroom boolean operations use the panel's physical
local frame; their existing coordinate normalization is tightened from the
previous 1e-9/1e-6/1e-4 m retries to 1e-12 m. This avoids rotation-dependent
roundoff slivers without dropping regions by an area percentage. Boolean
failures propagate instead of silently restoring the entire panel.
