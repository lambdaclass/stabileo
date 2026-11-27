# Interior member forces under regenerated wind loads

Regenerating W or Wa can replace a gently varying pressure band with two linear member loads. The pair preserves the four work moments used for equivalent beam end loads. Shear and bending moment at an interior cut depend on integrals over only part of the band and can change after regeneration.

The generator tries compression once per original pressure band. It checks both linear loads against the physical pressure at their endpoints and interior quadrature points, including both intensities at their common endpoint. When a band fails, each subdivided load must meet the original individual work-moment checks. The planar cubic-grid and physical-apex regressions compare interior forces directly with the analytic pressure integrals at the original precision.

Regenerate the wind cases and rerun analyses, combinations and checks that depend on member forces. Opening or solving an older project continues to use its stored loads until regeneration.
