# Interior member forces under regenerated wind loads

When regenerating W or Wa, the generator integrates pressure separately between declared curvature breaks before fitting linear member loads. For example, a triangular peak with declared endpoints and apex contributes to the member force even on a tapered carrier. Correcting the generated loads can change support reactions, member forces and displacements.

A single linear load can match all four work moments of a varying pressure band and still lose shear at an interior cut. Where the intervals of convex or concave load density are known, the generator bounds the integral of the absolute pressure error on each original half-band by one ten-thousandth of the integral of the absolute physical pressure there. This bounds the force error over every portion of that half. A pair must also meet the local pressure limits at the fit stations, including both sides of the midpoint. Its combined loads must satisfy the same four work-moment limits as a single load after enforcing the physical sign of the endpoint intensities.

When a fit fails, the generator splits at an interior declared break if one is present. Each refined part receives a share of the original half-band’s absolute cut-force budget in proportion to its length within that half. This lets a smooth pressure that touches zero refine while preserving the half-band limit. The curvature check applies to fixed tributary geometry. On varying geometry the generator still integrates the complete density and torsional components between the declared pressure breaks and checks the fitted work moments.

Regenerate the wind cases and rerun dependent analyses, combinations and checks. Opening or solving an older project continues to use its stored loads until regeneration.
