# Interior member forces under regenerated wind loads

When regenerating W or Wa, the generator integrates pressure separately between declared curvature breaks before fitting linear member loads. A narrow pressure peak between quadrature stations contributes to all four work moments used for equivalent beam end loads. Correcting those moments can change support reactions as well as member forces.

A single linear load can match all four moments of a varying pressure band and still lose shear at an interior cut. Where the intervals of convex or concave pressure are known, the generator checks each half of the band before emitting either one load or a pair. On each half, the integral of the absolute pressure error must be at most one ten-thousandth of the integral of the absolute physical pressure. This bounds the force error over every portion of that half. A pair must also meet the local pressure limits at the fit stations, including both sides of the midpoint.

The same check applies to refined parts and to a constant multiple of the pressure, such as the load on a vertical carrier with fixed tributary width and share. A field without curvature information uses the original single-load refinement based on work moments.

Regenerate the wind cases and rerun dependent analyses, combinations and checks. Opening or solving an older project continues to use its stored loads until regeneration.
