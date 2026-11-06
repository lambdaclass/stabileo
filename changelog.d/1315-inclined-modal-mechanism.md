### BREAKING (results)

#### Modal analysis refuses a mechanism that slides along inclined supports (2026-11-03)

- Fix #1315 (follows SA-2026-032): the check that refuses a mechanism read the mass it moves in global axes, but at an inclined support the solver works in the support's own axes, so a mechanism that slides only along inclined rollers or inclined 3D supports was taken as massless: its zero mode was dropped and the other modes came back as complete. The mass is now read in the support's axes, so modal analysis, and the spectral and seismic analyses that use it, refuse such a model and name the mechanism. Models without inclined supports are unchanged.
