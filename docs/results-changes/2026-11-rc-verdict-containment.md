# Reinforced concrete verdict containment (2026-11-21)

## Beam ductility (#2213)

[CIRSOC 201-2025 §9.3.3.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.3.3.1) requires tension-controlled behaviour for nonprestressed beams up to and including the stated axial limit, with the strain criterion in [Table 21.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-21-factores-de-reduccion-de-resistencia.md). The provided reinforcement verifier now checks applicability and strain at the same station and combination. It envelopes the resulting ductility checks independently of the flexural strength envelope. The reported beam with excessive support steel still fails the ductility check when a separate axial-only combination is added.

## Provided-beam shear and report summary (#2355)

The span shear verifier used complete support bar layers to decide whether its assumed effective depth was too large under hogging. If the outer bars ended before a loaded cut, that guard could accept the regional depth even though only the inner bars reached the cut. With a cutoff in the credited top layout, the check is now withheld and the reason identifies the missing extent. The extent check runs before the shear capacity, minimum steel, and spacing checks.

The report groups a refused shear row with the corresponding shear strength rows. Any unevaluated row in a summary cell yields N.E. with its reason, including when another cut in the same cell has a passing ratio. The check details retain the original rows.

## Seismic frame detailing (#2216, #2351)

A primary member with incomplete reinforcement, section or demand data now produces an unevaluated entry, including a reason in the editor and the report. The same applies to a joint whose primary inputs are incomplete. Secondary members remain outside this check. The capacity-design module identifies the support face as the origin of the hoop run under §18.6.4. The frame checker now uses the model's critical-section geometry when available and withholds the check if it cannot locate the faces. A run that reaches the nominal hoop length measured from the axis end can therefore fail once the part inside the support is excluded.

Re-run provided reinforcement verification and seismic checks before issuing an updated report.
