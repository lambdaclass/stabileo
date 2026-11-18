# CIRSOC 201 secondary stirrup legs (#2171)

CIRSOC 201-2005 and 2025 checks can change for spatial concrete members whose
secondary shear or combined shear and torsion check used more legs than their
cage provides. A closed rectangular stirrup contributes two secondary legs.
A declared secondary crosstie contributes one more leg. An unresolved cage
cannot produce a secondary reinforcement capacity. This includes shaped
columns with secondary shear demand.

The member verifier and the provided reinforcement checker now resolve the
secondary provision from the same cage data. The combined shear and torsion
check compares each active face with its own provision. Torsion still credits
one outer leg for the single-leg requirement. The supporting provisions are
CIRSOC 201-2025 §22.5.8.5.5 for effective leg area and §22.7.6.1 and §9.6.4.2 for
combined transverse reinforcement.

The [issue's column](https://github.com/lambdaclass/stabileo/issues/2171) in
CIRSOC 201-2005 gives a secondary utilization of 0.843 with four credited
legs on main `cf9272470`. With two horizontal legs it gives 1.229 and fails
secondary shear. In 2025 the corresponding ratios are 0.844 and 1.227. The
zero-torque witness from PR #2198 also passes overall on this main revision
in both editions and fails at secondary utilization 1.05 with the corrected
cage. Both models run in the #2171 reproducer.

The row-2 RC snapshot records the secondary shear capacity and ratio change
on members 1 through 4. The capacity goes from 362.2178444 to 329.8950644 kN
for the same demand of 74.57289318 kN. The stored snapshot changes only those
eight secondary-shear values.

The saved-project registry selects spatial CIRSOC 201 concrete models. Whether
a particular member is exposed depends on its concurrent secondary demand and
the cage and shear width used in the prior verification. Re-run affected members and
review the secondary shear and torsion reinforcement checks against the cage.

## Beam torsion at force stations

The member verifier checks the available transverse steel on every active
shear face under non-negligible torsion, including beams. A combined check
that requires an unknown secondary provision is refused. Standalone
secondary shear reporting retains its existing scope.

Beam-line projection retains the transverse zone boundaries in member coordinates.
At each concurrent force station, torsion checks the local cage, including
both cages at a shared boundary. A gap at a station with active torsion
fails for missing reinforcement. Matching saved lines supply their original
zone boundaries on recheck. With equal Ø8 diameters, one witness has two
legs at 100 mm at one end and four legs at 150 mm at the other. Each end
has two effective secondary legs. Their secondary transverse provisions are
10.053 and 6.702 cm²/m, respectively. For the demand just above the looser
end's capacity, its combined utilization is 1.002. Reusing the tighter
cage gave 0.668 and an `ok` torsion check.

On a 0.30 × 0.60 m beam with Ø8 stirrups, two legs spaced at 150 mm
at the loaded station provide 3.351 cm²/m per outer leg. At 30 kN·m,
the required 4.271 cm²/m gives utilization 1.275. The former midpoint
selection gave the station the 75 mm cage and utilization 0.637.
The same new check reports the uncovered variant as missing reinforcement.

The primary effective depth uses the tension face selected by the station's
moment, with the local stirrup diameter and longitudinal bar centroid.
The secondary depth uses the outer longitudinal bars inside the same cage.
For the hogging support witness with Ø12 stirrups, Ø32 bars and 25 mm cover,
the primary depth is 0.547 m. The previous 0.559 m depth gave 0.986
utilization against the correctly calculated 1.012.

[CIRSOC 201-2025 §9.6.4.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.6.4.2)
sets the combined minimum in terms of the shear width. The active secondary
face uses the rotated width. On the 0.20 × 0.80 m minimum-steel witness,
that raises its minimum from 1.667 to 6.667 cm²/m. The just-insufficient
cage changes from 0.683 to 1.001 utilization. A provided-beam check that
requires secondary legs also reads the section's cage eligibility. The
nonrectangular witness above the torsion neglect threshold now refuses
secondary provision.

The existing `secondary-stirrup-legs` notice covers these beam cases and
the vertical-member cases above.
