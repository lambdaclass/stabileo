# Reinforced concrete verdict containment (2026-11-21)

## Beam ductility (#2213)

[CIRSOC 201-2025 §9.3.3.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.3.3.1) requires tension-controlled behaviour for nonprestressed beams up to and including the stated axial limit, with the strain criterion in [Table 21.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-21-factores-de-reduccion-de-resistencia.md). The provided reinforcement verifier now checks applicability and strain at the same station and combination. It envelopes the resulting ductility checks independently of the flexural strength envelope. The reported beam with excessive support steel still fails the ductility check when a separate axial-only combination is added.

## Provided-beam shear and report summary (#2355)

The span shear verifier used complete support bar layers to decide whether its assumed effective depth was too large under hogging. If the outer bars ended before a loaded cut, that guard could accept the regional depth even though only the inner bars reached the cut. At an active hogging cut where the credited top layout changes, the verifier checks the effective depth of the bars that reach the cut, preserving the physical seating of the remaining layers. It withholds span shear if the depth cannot be established or is below the depth assumed by the shear calculation. Remaining outer bars can substantiate that depth after an inner layer ends. The depth check precedes the capacity, minimum steel, and spacing calculations and applies between solver stations as well.

The report gives the shear refusal and strength rows the same check title key and clause. Any unevaluated row in a summary cell yields N.E. with its reason, including when another cut in the same cell has a passing ratio. The check details retain the original rows.

## Seismic frame detailing (#2216, #2351)

A primary member with incomplete reinforcement, section or demand data now produces an unevaluated entry, including a reason in the editor and the report. An incomplete joint reports one unevaluated row for each applicable check. At the roof, only joint shear is applicable. A present gravity case result with an absent force array is handled as missing forces. Secondary members remain outside this check. The capacity-design module identifies the support face as the origin of the hoop run under §18.6.4. The frame checker now uses the model's critical-section geometry when available and withholds the check if it cannot locate the faces. A run that reaches the nominal hoop length measured from the axis end can therefore fail once the part inside the support is excluded.

Re-run provided reinforcement verification and seismic checks before issuing an updated report.
