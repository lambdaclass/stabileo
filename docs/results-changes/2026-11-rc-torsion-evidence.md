
# CIRSOC torsion and shear verification evidence

- **#2225**. Active CIRSOC 201-2025 torsion now checks the combined minimum transverse steel against each face's web width and available legs, including pure torsion. The 300 × 600 mm witness requires 5.00 cm²/m on the wide face. Its cage supplies 3.77 cm²/m, so the transverse check fails. The rule uses [CIRSOC 201-2025 §9.6.4.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.6.4.2).
- **#2310**. Active torsion with secondary shear requires resolved secondary-face geometry. A numerical depth or beam or wall bar diameters alone cannot establish that geometry. Rectangular and shaped column results retain small secondary shear demands at the reporting threshold.
- **#2369 and #2373**. Fixed verification with active torsion requires longitudinal bars to be verified around the perimeter at the cut. A scalar steel area or an omitted provision cannot establish this. Section capacity already established independently of the longitudinal check is retained alongside the refusal.
- **#2373**. Where the cage is evaluated, the conservative concrete contribution to the torsion section limit also applies at zero shear. Primary shear verification checks hogging with active shear inside interpolation intervals. Drawn tension steel must substantiate the area credited at the cut. Where Table 22.5.5.1(c) uses that area, distinct bars present at the cut can satisfy the evidence requirement together if their combined effective depth also substantiates the calculation. Two pieces sharing a lap seat contribute at most one bar to this check.
- **#2412**. Drawn perimeter bars can count straight development beyond a member only within contiguous members with a confirmed common hoop diameter. The check refuses reliance on straight development that would extend through a joint with different generated bar seats.

In the 408-member flagship, automatic design retains its member-by-member verdicts. The stored secondary shear demand retains its full precision in 122 rows. Verifying the accepted reinforcement as drawn withholds the span shear check for 105 beams. Forty previously passing drawn member verdicts now refuse because their active tension face cannot substantiate the credited steel area.

## Seven-storey gallery example after #2409

The remeshed building processes 168 beams. Compared with main at `0c0413a9e`, every beam retains its design verdict and certificate status. The verified and provisional reinforcement candidates are identical. The committed building has 63 designed and 105 refused beams. The test variant with five rolled beams has 59 verified beams, three biaxial proposals and 106 other refusals. The design-family report counts proposals as refusals, giving 109.

The search retains a different failed candidate for some beams when torsion with concurrent secondary shear requires resolved secondary-face geometry. The selected failures show `diag.rcTorsionSecondaryFace` and `diag.rcTorsionPerimeter` at the support and in the span. The limiting labels describe the retained search candidate.

| Rolled variant | Change in limiting labels | Member evidence |
| --- | --- | --- |
| Scene completeness | 32 move from anchorage, torsion and unsupported check to anchorage, minimum steel and unsupported check. | The search retains different failing reinforcement after the secondary-face refusal. Beam 198 is one of these members. |
| Scene completeness | Beam 190 moves from congestion, minimum steel and unsupported check to anchorage, minimum steel and unsupported check. | The retained candidate fails start anchorage where the prior candidate failed joint threading. |
| Scene completeness and provisional projections | Seven move from minimum steel and unsupported check to anchorage and unsupported check. | Beams 91, 118, 127, 136, 145, 206 and 219 retain the torsion refusals with anchorage as the other search limit. |
| Scene completeness and provisional projections | Beam 88 moves from shear, torsion and unsupported check to anchorage, shear and unsupported check. | The retained candidate adds the anchorage limit. The secondary shear failure remains, with explicit torsion evidence refusals. |

The provisional-projection test therefore counts 104 of the 106 bare beams with an anchorage or congestion limit, up from 96. The design-family report counts the same eight additions to that group and retains its exact family totals. In the unrolled building, the beam-detailing diagnostic now checks beam 198 for minimum steel in its retained search limits and for both torsion refusal diagnostics. It still requires the three verified beams from the original report to carry their own main steel and cage.

Affected projects should be reverified. The analysis forces are unchanged.
