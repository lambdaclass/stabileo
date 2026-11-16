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
interval. Walls and other structures distribute height-varying fields to the
actual carrier endpoints by their lever arms. Foundation shares are explicit
base loads and are also present in the applied nodal loads. The horizontal
minimum is a separate case, without roof pressure or sign eccentricity; it is
never blended point by point into the calculated pressure field. Effective
dimensions for the gust applicability checks use the same integrated physical
geometry, so a node inserted on one column cannot create a false narrow storey.

| Witness | Parent/main | Corrected |
| --- | ---: | ---: |
| #2204, 12 × 6 × 6 m corner columns, +X, 1 kPa profile: force | 18 kN | 36 kN |
| Same, moment about foundation | 108 kN·m | 108 kN·m |
| Same, force at foundation | 0 kN | 18 kN |
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
original ratio threshold on an eleven-storey fixture, using the corrected
endpoint shape functions. Case-count checks include the additional independent
minimum cases. A zero-projection region still has zero wall force while
retaining its roof loads.

The generators are TypeScript before the analysis boundary; there is no second
native Rust wind generator to fix. Both solver dimensions receive the same
partial-load representation. Solver algorithms and constitutive behaviour are
unchanged. The saved-project notice is scoped to generated W or Wa and remains
until the load basis is regenerated. Manual wind and generated gravity are
negative notice controls.
