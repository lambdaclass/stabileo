# Anchored column ties and minimum shear reinforcement (2026-11-17)

Recheck concrete columns with specified transverse reinforcement. A closed rectangular tie around four corner bars contributes two effective legs in each direction. An interior crosstie contributes a leg only where both hooks can engage opposing longitudinal bars. Declaring extra legs can now reduce the reported shear strength and fail the cage. The seismic confinement check also uses the supported leg count in each direction. CIRSOC 201-2025 requires crosstie hooks to embrace peripheral longitudinal bars and the closure of a rectilinear tie to engage a longitudinal bar. [§25.3.5(d)](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md#c25.3.5), [§25.7.2.3.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md#c25.7.2.3.1).

For each shear direction and concurrent station, exceeding half the unrounded design concrete shear strength requires minimum transverse reinforcement. A cage with insufficient anchored area now fails even when its design shear strength exceeds demand and its spacing passes. The trigger is a strict inequality. Rectangular, circular, T and L columns use the same check. A spiral-only column is held when the minimum applies and the model cannot establish its shear reinforcement area. Small positive secondary shear also goes through the column check when the computed concrete contribution is zero. A shaped cage that only describes perimeter bars cannot substantiate additional interior legs. [§10.6.2.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md#c10.6.2.1), [§10.6.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md#c10.6.2.2).

## Recorded four-bar cages

The two round-16 cages each had four Ø32 corner bars and Ø6 ties at 200 mm with three legs declared in each direction. Rechecking exactly those cages on the recorded frame gives the following results. The strength and minimum-area rows below govern in local Vz. [Saved input cages](2198-round16-column-ties.json).

| Column | Anchored legs, primary / secondary | Vu / φVn (kN) | Provided / minimum area (cm²) | Cage verdict |
| --- | --- | --- | --- | --- |
| 6 | 2 / 2 | 124.17 / 255.37 | 0.566 / 0.8333 | Fail |
| 10 | 2 / 2 | 151.21 / 339.69 | 0.566 / 0.8333 | Fail |

The current search verifies both columns with 24 Ø16 longitudinal bars and two-leg Ø8 ties at 225 mm in each direction. Replaying all 408 members reproduced every recorded member outcome, limiting category and utilization for both lateral declarations. Declared gravity yields 372 verified, 23 search-exhausted and 13 provisional biaxial members. With the lateral role undeclared, the corresponding counts are 350, 45 and 13. [Gravity member digest](2198-round6-undeclared.json), [undeclared member digest](2198-round22-lateral-audit.json).
