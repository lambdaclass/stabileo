# Gravity reaches each carrier as member loading

PR #2219, round 2, corrects the unmerged correction at `42f79f5f6`. It does
not establish additional advisory exposure on main. The coordinator assigned
[SA-2026-079](../advisories/SA-2026-079-gravity-shell-coverage.md) to #2199 and
[SA-2026-080](../advisories/SA-2026-080-floor-zone-eccentricity.md) to #2201.
The original main-source witnesses are retained in the
[physical-region record](2026-11-gravity-physical-regions.md).

Matching global force and first moments is insufficient. The previous correction
put eccentric moments on end nodes. A restrained member could therefore have
zero torsion while its supports absorbed the couples. Generic region transfer
also assigned axis-sliced cells by centroid, changing the carriers under rotation.

## Physical carrier partition and member loads

One shared partition clips convex polygon pieces by the carriers' distance
bisectors and projection ranges. Connected collinear subdivisions share the same
physical supporting line. Polygon slicing only decomposes a region for clipping
and integration; it never selects its owner. Nonconvex regions restrict eligibility
to the actual carrier projection. A coverage check refuses incomplete partitions.
The check accounts for floating-point coordinate-operation error, independently of
load pressure; engineering test tolerances and baselines remain unchanged.

A two-way 6 by 4 rectangle under unit pressure gives each long carrier area 8
and each short carrier area 4. Along each carrier the force density is
`d(x) = min(x, L-x, 2)`; the eccentric moment density about its axis is
`-d(x)^2/2`. One-way strips partition at their physical midline before transfer.
No tributary-region force or couple is moved to an end node. Stored force
rounding and approximate slope merging are removed. Overlapping linear pieces
are summed before coalescing into a member profile.

Member moment density is quadratic, stated at the two ends and midpoint of its
loaded interval. The typed wire represents it as force, i.e. moment per length.
The shared element load kernel integrates it against torsional and Timoshenko
section-rotation shape functions. Assembly, fixed-end recovery, nonlinear load
scaling, member splitting, combinations, diagrams and section stress retain it.

## Independent member solution

The end-to-end WASM tests isolate every physical carrier and restrain its two
ends. They test floor-tool and generic-region loading, rotation, mirroring and
unequal subdivision. Both linear and P–Delta results are compared with independent
piecewise polynomial integrals, at member stations and the physical midpoint.

For a long carrier, total force is 8, support shear is 4, and the fixed-end
bending moment is `-44/9`. Torsion at the first end is `10/3`; on the first
2 units it is `10/3-x^3/6`, then `6-2x` through the middle interval. The opposite
half follows antisymmetry. Midpoint twist is `-7/(GJ)`. Deflection is calculated
by twice integrating bending curvature. The short carriers use the same independent
integrals with length 4. These are derived polynomial expectations, not values
from a design table. Native tests separately cover uniform and quadratic moments,
linear, P–Delta and corotational solves, and centered-load controls.

## Supported paths and refusals

Nonzero distributed moments require a spatial frame without warping. Trusses,
cables and warping members refuse them. The independent certificate and educational
step-by-step solvers explicitly refuse this new load field rather than omit it.
Plane distributed loads reject unsupported fields. Moment spans must be finite,
positive and within the member, allowing only the calculated floating-point endpoint
roundoff. Zero-moment loads retain their ordinary path. No existing engineering
inequality or solver iteration tolerance is relaxed.

## Saved loads and recovery

Regenerate all affected generated area loads. Refresh floor definitions or replace
orphaned expanded shares with loads regenerated from their physical regions. Then
rerun analyses, combinations and design checks. Re-solving saved loads does not
repair their loading. Corrected floor shares carry their generation version;
orphaning preserves this marker, including version zero for legacy shares.
The floor correction notice survives a current solve while stale shares remain.

The two advisory documents and all seven locale catalogs, including Hungarian state
"PR #2219; pending merge and release". Historical release binaries were not replayed.

## Slivers and the separate engine issue #2222

The engine's existing partial-force kernel discards spans below `1e-12`.
That kernel is unchanged here and its native boundary witness remains ignored
with `known wrong result: #2222`; the separate engine branch owns its correction.
Gravity output instead passes through `memberLoadSpans`, with a minimum emitted
span of `1e-9`. Short force pieces become member point loads at their resultant
positions; short quadratic moment densities become concentrated member couples
at their resultant positions. Signed densities with no interior resultant keep
separate point contributions. No load is transferred to a support to evade the
cutoff. The source width is retained before conversion to member coordinates,
even when subtracting coordinates rounds both endpoints to the same number.
The same check handles floor definitions, planned area loads and final load-plan
output. Member subdivision also uses it, retaining short intersections that the
previous clipping threshold discarded. A short projected fragment requires its
member geometry; splitting without that geometry refuses explicitly.

Tests straddle the kernel cutoff and the gravity minimum, for both load signs
and one-way/two-way transfer. WASM linear and P–Delta solves check the independent
concentrated-load limit: for unit downward force at 1.5 on a fixed-ended beam
of length 6, the left reaction is 0.84375. With the explicitly assigned stiffness
in the fixture, the displacement at 3 is -0.0005625. A unit-depth tributary strip
also supplies moment -0.5 there; the torsion on the two sides is 0.375 and -0.125.
These expectations follow the fixed-ended point-force shape functions and the
linear torsional displacement interpolation, and are encoded in the tests.

## Snapshot audit

Only `snow-hip-facets` and `snow-roof-rotation` are regenerated, using the documented
`make snapshots-update` procedure with those two names selected. The hip test
checks the hand profile at every emitted endpoint and midpoint in all nine cases,
as well as independent interior stations on every carrier. The eave force width
is the central bisector depth, offset by `1/sqrt(2)` at the corners and capped at
3.5 on the long sides, plus the triangular near-eave regions implied by the
existing elevation tolerance and slope. The ridge carriers retain their uniform
averaged pressure. Snow pressures and pattern factors follow the existing snow
code functions; no design coefficient or assertion tolerance changes.

The old hip snapshot contained cell-average steps. It now retains the continuous
linear force pieces of the same physical partition, including the varying-width
fringes. The rotated-step snapshot changes only two arithmetic residual intensities
of order `1e-27`, with deltas of order `1e-29`; their physical endpoint value is zero.
The snapshot comparator, numerical tolerances and all unrelated snapshots remain
unchanged. Complete required snapshot tests are rerun after regeneration.
