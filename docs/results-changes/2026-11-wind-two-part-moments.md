# Interior member forces under regenerated wind loads

Regenerating W or Wa can replace a gently varying pressure band with two linear member loads. The pair preserves the four work moments used for equivalent beam end loads. Shear and bending moment at an interior cut depend on integrals over only part of the band and can change after regeneration.

Compression now requires a bound over each half of the original band. The integral of the absolute pressure error must be at most one ten-thousandth of the integral of the absolute physical pressure on that half. This bounds the force error over every portion of the half, including cuts between pressure samples. Each fitted midpoint intensity must also meet its own local pressure limit.

The generator uses this bound where it knows the intervals on which the pressure is convex or concave. It also knows those intervals for a constant multiple of the pressure, such as the load on a vertical carrier with fixed tributary width and share. If the shape information is unavailable or either half exceeds the limit, the entire band keeps its original per-load refinement.

Regenerate the wind cases and rerun analyses, combinations and checks that depend on member forces. Opening or solving an older project continues to use its stored loads until regeneration.
