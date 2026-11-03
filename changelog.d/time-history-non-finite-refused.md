### Fixed

#### Time history refuses a response that is not finite (2026-11-02)

A linear time history could return NaN or infinite displacements with no refusal: with damping,
a model with fewer than two modes that carry mass (a single member whose rotations have no mass)
anchored its Rayleigh damping on an infinite frequency, and the run blew up. The damping is now
anchored on the finite modes only, and any response that is still not finite is refused with
`TH-NONFINITE`, translated in the app, instead of being shown (nightly #1196, #1205, #1207,
#1208, #1210, #1212).
