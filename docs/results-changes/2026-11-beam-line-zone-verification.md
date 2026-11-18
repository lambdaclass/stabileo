# Beam-line stirrup zones and torsion closure (#2171)

Recheck CIRSOC 201 concrete beam lines with edited stirrup zones, moved
supports, or seismic hoop edits. A saved zone layout uses distances from the
member start. A layout measured on a different member length blocks
verification until the line is reprojected onto the current geometry.

The provided-reinforcement verifier checks both cages at each zone boundary,
even when the force stations straddle the entire zone. A gap under active
torsion fails for missing reinforcement. The solver's torsion field is affine
between force stations on each analysis element. With constant, known shear
on the same interval, the boundary check uses that field and the smaller
effective depth of the two bending signs. If the transverse demand cannot be
bounded across an active torsion interval at a zone boundary, the verifier
holds that check. A declared unknown cage cannot provide the closed outer
leg required for torsion, including when secondary shear is zero.

For the 4 m witness with a 0.30 × 0.60 m section and constant torque of
30 kN·m, the Ø8 outer-leg requirement is 4.271 cm²/m. A 150 mm spacing
inside a short zone gives 3.351 cm²/m and a utilization of 1.275. The
75 mm cages at the adjoining force stations alone give 0.637. Removing the
middle cage entirely fails for missing reinforcement even though both force
stations still have stirrups. These values use the single-leg requirement in
[CIRSOC 201-2025 §22.7.6.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.7.6.1).

Applying seismic detailing extends the saved end-zone boundaries and
replaces their cages in the same edit. Detailing uses that layout after the
old saved line becomes stale.

## Longitudinal torsion and saved cage edits

Each boundary with active torsion and bounded concurrent demand also
contributes to the longitudinal check. The check uses the local cage
perimeter, effective depth and bending moment. On the 4 m witness above,
two Ø16 bars per face and a constant bending moment chosen between the
two longitudinal capacities give a ratio of 0.987 at the Ø8 force
stations and 1.013 in a short Ø16 zone. Both cages at 75 mm spacing pass
the transverse check. The longitudinal failure now governs in the span.

A regional spacing edit preserves each cage's diameter, legs, closure
and crosstie declaration, and retains any gaps. A legacy saved line
whose member reinforcement still matches the saved record requires a
current matching line for projection. If regrouping prevents projection,
verification reports unresolved stirrup-zone geometry.

## V2 design trace

At the interior support, the fixture gives a hogging moment of 41.647 kN·m
with concurrent torque of 6.362 kN·m. The 0.20 × 0.50 m section with 25 mm
cover and Ø6 stirrups has a 0.144 × 0.444 m cage centerline and 1.176 m
perimeter. The longitudinal torsion minimum gives 3.292 cm² total. With
4Ø12 at the tension face, its effective depth is 0.463 m. The flexural
allowance of 2.644 cm² plus half the torsion minimum gives 4.290 cm² against
4.524 cm² provided, or 0.9483 utilization. Using the nominal Ø8 stirrup in
the depth instead gives 0.9509, just above the design search target of 0.95.

Both V2 spans therefore select 4Ø12 in place of 3Ø16. The station trace
retains the 0.659 / 4.682 / 0.659 m region lengths and the Ø6 stirrup layout.
The bending schedule yields 101.326 kg for V2, down from 132.064 kg.
