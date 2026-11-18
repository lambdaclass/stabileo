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

The row-2 RC snapshot records changes on members 1 through 4. Secondary
capacity goes from 362.2178444 to 329.8950644 kN at a demand of 74.57289318 kN.
The legs fall short of Table 9.7.6.2.2, so the secondary check and member
verdict both fail. The QA diagnostic snapshot also gains secondary shear rows
for beam members 13 through 26. Their cages fail the transverse leg count
check.

The saved-project registry selects spatial CIRSOC 201 concrete models. Whether
a particular member is exposed depends on its concurrent secondary demand and
the cage and shear width used in the prior verification. Re-run affected members and
review the secondary shear and torsion reinforcement checks against the cage.

## Beam torsion at force stations

Both member verification and provided-reinforcement verification check secondary
shear. Combined shear and torsion uses the largest spacing and the fewest
primary and secondary legs on a beam or wall where the station cage cannot
be established. Existing beam-line records supply the cages used to compute
that bound. A member with complete ordinary support and span cages and known
critical sections can use those cages directly. A gap fails wherever the member has active torsion or secondary
shear. Each actual stirrup diameter is checked with that spacing and leg count.

On a 0.30 × 0.60 m beam with Ø8 stirrups, a 150 mm spacing provides
3.351 cm²/m per outer leg. At 30 kN·m the required 4.271 cm²/m gives
utilization 1.275. The former midpoint selection gave the station the 75 mm
cage and utilization 0.637.

The primary effective depth uses the tension face selected by the station's
moment, with the stirrup diameter and longitudinal bar centroid.
The secondary depth uses the outer longitudinal bars inside the same cage.
For the hogging support witness with Ø12 stirrups, Ø32 bars and 25 mm cover,
the primary depth is 0.547 m. The previous 0.559 m depth gave 0.986
utilization against the correctly calculated 1.012.

[CIRSOC 201-2025 §9.6.4.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.6.4.2)
sets the combined minimum in terms of the shear width. The active secondary
face uses the rotated width. On the 0.20 × 0.80 m minimum-steel witness,
that raises its minimum from 1.667 to 6.667 cm²/m. The just-insufficient
cage changes from 0.683 to 1.001 utilization. Active torsion requires a known closed rectangular
cage, including when secondary shear is zero.

The existing `secondary-stirrup-legs` notice covers these beam cases and
the vertical-member cases above.

The span mesh guard checks the first mesh against exactly 70 hooked ends
and 40 straight ends. It previously expected 66 hooked ends. All other
mesh end counts and the anchorage, cover and per-span limits are unchanged.
The companion trace checks the selected four Ø12 bars and the measured
101.326 kg reinforcement schedule. The former design selected three Ø16
bars and a 132.064 kg schedule.
