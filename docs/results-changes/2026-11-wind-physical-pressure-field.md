# Wind enclosure and pressure fields follow the physical structure

Issues #2203, #2204, #2205 and #2206 correct generated CIRSOC 102-2025 wind
loads. The correction is pending merge and release. Existing stored loads are
not rewritten. Review all wall and roof opening areas, reclassify the enclosure,
regenerate W and Wa, then rerun analyses, combinations and design checks.
Re-solving an existing load set alone does not correct its classification or
pressure distribution.

## Source and classification

[Art. 1.2 and Table 1.11-1](../codes/CIRSOC/markdown/cirsoc-102-2025/capitulo-1-cargas-de-viento-requisitos-generales.md)
define an open building by **every wall** satisfying Ao ≥ 0.8 Ag. Partially
closed buildings require Ao > 1.10 Aoi, Ao > min(0.01 Ag, 0.4 m²), and
Aoi/Agi ≤ 0.20. Aoi and Agi include the rest of the walls and the roof.
The enclosed condition applies to each wall that can receive positive pressure;
partially open is the remaining class. Complete per-wall records and a roof
record now replace aggregate inputs. Missing, non-finite, negative, zero-gross
or over-gross areas refuse classification with a reason. An all-open building
is refused by the closed-building pressure procedure: select the free-roof
procedure and declare its roof kind and blockage. A supplied net-pressure
profile remains an explicit pressure input rather than a roof procedure.

The #2203 model has one wall with openings/gross area 90/100 m² and three
closed walls of 100 m² each. A closed roof leaves the same dominant-opening
classification. At the issue's stated speed, exposure, elevation, geometry and
slope, the following values are independently checked against Table 1.11-1
and Eq. (2.4-1).

| Quantity | Parent/main | Corrected |
| --- | ---: | ---: |
| Enclosure | open | partially enclosed |
| Internal pressure coefficient magnitude | 0 | 0.55 |
| Leeward roof pressure with positive internal pressure, N/m² | −424.5423676390101 | −882.3821758771583 |

## Pressure transfer

[Chapter 2, §2.4.1, Figure 2.4-1 and §2.1.5](../codes/CIRSOC/markdown/cirsoc-102-2025/capitulo-2-cargas-de-viento-sobre-edificios-sistemas.md)
provide building pressures, roof zones and the building minimum.
[Chapter 4, §4.4, §4.5 and §4.8](../codes/CIRSOC/markdown/cirsoc-102-2025/capitulo-4-cargas-de-viento-sobre-accesorios-de-edificios.md)
provide other-structure forces and their minimum. Figure 2.4-7 gives the
free-roof zones parallel to the ridge. The checked-in table and equation
functions supply these coefficients; the transfer integrates their physical
fields instead of sampling each member midpoint.

One pressure integrator splits carriers at physical zone boundaries and height
breaks, integrates force and the first moment, and transfers loads with those
same resultants. Roof loads retain partial member intervals and global surface
normal components. Combined directions compare pressures on each intersected
interval. Walls and other structures retain height-varying fields as distributed member
loading over partial carrier intervals, including both endpoint intensities.
The 18 kN foundation share below is an equivalent endpoint diagnostic, not an
explicit applied foundation nodal load. The horizontal minimum is separate
from calculated pressure and roof pressure. Solid signs retain A and B± for
both calculated and minimum pressure, including their prescribed eccentricity. Effective
dimensions for the gust applicability checks use the same integrated physical
geometry, so a node inserted on one column cannot create a false narrow storey.

| Witness | Parent/main | Corrected |
| --- | ---: | ---: |
| #2204, 12 × 6 × 6 m corner columns, +X, 1 kPa profile: force | 18 kN | 36 kN |
| Same, moment about foundation | 108 kN·m | 108 kN·m |
| Same, equivalent endpoint foundation share (diagnostic) | 0 kN | 18 kN |
| Same, columns split at midheight: force | 27 kN | 36 kN |
| #2205, two 12 m roof carriers: uplift | 10.2 kN | 10.2 kN |
| Same, first moment along X | 61.2 kN·m | 45.9 kN·m |
| #2205, 10 × 6 m roof perimeter: uplift | 14.62 kN | 15.3 kN |
| #2206, 6 m height, width 2 m, minimum pressure: force | 9.6 kN | 9.6 kN |
| Same, overturning moment, chimney/open sign/lattice/solid sign | 57.6 kN·m | 28.8 kN·m |

The roof perimeter's independent uplift integral is
2 × 0.85 × (0.9 × 3 + 0.5 × 3 + 0.3 × 4) +
0.85 × 6 × (0.9 + 0.3) = 15.3 kN. The two 12 m carriers' first moment is
2 × 0.85 × (0.9 × 9/2 + 0.5 × 27/2 + 0.3 × 108/2) = 45.9 kN·m.
These are geometric integrals of the checked-in Figure 2.4-1 zones, not
new coefficient assumptions.

## Verification and unaffected controls

Commit `8a53218c1` adds the ignored Vitest reproducers first. Run each with
`RUN_KNOWN_WRONG=2203`, `2204`, `2205` or `2206` and the corresponding targeted
`make test.web.unit FILE=...` target. Names contain the exact
`known wrong result: #N` reason because Vitest has no Rust ignore attribute.
All four issues fail on its parent, main `9d925a780`. The fix removes the skips.

Tests check each physical roof carrier's force and all moment components,
coarse/uniform/uneven meshes, plan rotation and reflection, all wind directions,
flat and sloped roofs, free-roof kinds, W/Wa profiles, foundation forces,
variable widths and pressure-boundary/refusal cases. Classification tests cover
every class and both sides of each inequality. Actual WASM reaction tests cover roof, wall and chimney loads through both
2D and 3D linear and nonlinear analyses. Saved-project tests cover 2D, 3D and
pro, including re-solving linear and nonlinear analyses.

The enclosed, zero-opening control retains its original classification. The
code-table and worked wind examples retain their existing assertions. The
windward-edge roof pressure and the minimum other-structure force stay the
same; the corrected moment tests retain their magnitude checks too. Existing
midpoint-pressure expectations are replaced by independent physical integrals
at their original tolerances. No tolerance or baseline is relaxed. The pressure-growth check retains its
original ratio threshold on an eleven-storey fixture, using the integrated
member pressure field. Case-count checks include the additional independent
minimum cases. A zero-projection region still has zero wall force while
retaining its roof loads.

The generators are TypeScript before the analysis boundary; there is no second
native Rust wind generator to fix. Both solver dimensions receive the same
partial-load representation. Solver algorithms and constitutive behaviour are
unchanged. The saved-project notice is scoped to generated W or Wa and remains
until the load basis is regenerated. Manual wind and generated gravity are
negative notice controls.

## PR #2220 second review: eccentric plan couples and sign faces

The second review found two defects on the unmerged branch `bbba79b0f`.
They are not additional main/release exposure. Cases 2 and 4 applied each
integrated endpoint force as a singleton level; their eccentric moment became
a column torque instead of a force couple across the plan. Total Mz was
preserved, but member bending, torsion and reactions changed. The height-field
representation now requires an integrated unit-eccentricity couple. At each
pressure station the shared plan distributor forms the couple on the active
cross-section and retains all components as distributed member loads.
The same representation carries solid-sign eccentricity. A cross-section that would require distributed local torque refuses explicitly.

Solid-sign B used every model level, including supports below the face. A
2 m face on a 6 m base therefore took B = 6 for the coefficient and the
prescribed eccentricity. Width now comes from the same physical carriers
clipped to [clearance, H], including intersections at clearance. A clearance
inside the taper is tested as well as one at the face boundary. Empty faces
retain the existing refusal.

Signed reproducer commit `7289a015a` retains the ignored tests first, using
Vitest's `RUN_KNOWN_WRONG=2204`, `2206` and `2203` switches. Against its parent
`bbba79b0f`, the wall tests fail on nodal force distribution and on member
forces/reactions in linear and nonlinear WASM solves. The sign test fails
because it reads B = 6 instead of B = 2. The editor test fails because it
cannot remove wall records. The fix removes those skips. Target the
`wind-round2.test.ts` and `wind-enclosure-editor.test.ts` files with
`make test.web.unit FILE=...`.

The independent rectangular-frame distribution uses the checked-in exposure C
power-law pressure integral and its first moment, plus the plan polar sum of
the corner coordinates. It checks cases 1–4, both senses on both axes,
foundation shares, service wind, coarse/uniform/uneven meshes, rotations and
reflections. Member-force and reaction comparisons cover 2D projections and
3D linear/nonlinear analyses, with a diaphragm as a separate spatial case.
The sign tests cover both axes, a support wider than the face, clearance
intersections, and both sides of the face and empty-face boundaries. Correct
case 1 and service distributions and a zero-clearance sign remain controls.
No native Rust wind generator exists: these loads are generated in TypeScript
before the common solver load boundary.

The enclosure editor shares the classifier's minimum record count and allows
individual records to be removed, so a triangular building needs no fictitious
fourth wall. Spanish instructions use voseo. The coordinator assigned
[SA-2026-076](../advisories/SA-2026-076-wind-enclosure.md) to #2203,
[SA-2026-077](../advisories/SA-2026-077-wind-wall-height-transfer.md) to #2204 and
[SA-2026-078](../advisories/SA-2026-078-wind-roof-pressure-zones.md) to #2205.
Their catalogs and regeneration notice cover all public locales and Hungarian. #2206's
main witness is conservative and has no advisory.

The [fourth-review correction](2026-11-wind-triangular-and-sign-minimum.md)
restores triangular carrier partitions and eccentric minimum sign cases on
this unmerged branch.
