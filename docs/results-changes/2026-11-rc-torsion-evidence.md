
# CIRSOC torsion and shear verification evidence

- **#2225**. Active CIRSOC 201-2025 torsion now checks the combined minimum transverse steel against each face's web width and available legs, including pure torsion. The 300 × 600 mm witness requires 5.00 cm²/m on the wide face. Its cage supplies 3.77 cm²/m, so the transverse check fails. The rule uses [CIRSOC 201-2025 §9.6.4.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.6.4.2).
- **#2310**. Active torsion with secondary shear requires resolved secondary-face geometry. A numerical depth or beam or wall bar diameters alone cannot establish that geometry. Rectangular and shaped column results retain small secondary shear demands at the reporting threshold.
- **#2369 and #2373**. Fixed verification with active torsion requires longitudinal bars to be verified around the perimeter at the cut. A scalar steel area or an omitted provision cannot establish this. Section capacity already established independently of the longitudinal check is retained alongside the refusal.
- **#2373**. Where the cage is evaluated, the conservative concrete contribution to the torsion section limit also applies at zero shear. Primary shear verification checks hogging with active shear inside interpolation intervals. Drawn tension steel must substantiate the area credited at the cut.
- **#2412**. Drawn perimeter bars can count straight development beyond a member only within contiguous members with a confirmed common hoop diameter. The check refuses reliance on straight development that would extend through a joint with different generated bar seats.

In the 408-member flagship, automatic design retains its member-by-member result. Verifying the accepted reinforcement as drawn withholds the span shear check for 105 beams. Forty previously passing drawn member verdicts now refuse because their active tension face cannot substantiate the credited steel area.

Affected projects should be reverified. The analysis forces are unchanged.
