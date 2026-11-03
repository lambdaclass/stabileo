### BREAKING (results)

#### Modal analysis refuses a mechanism instead of dropping its zero mode (2026-11-03)

- Fix #338 (SA-2026-032): modes with ω² ≤ 1e-10 rad²/s² were skipped silently, so a mechanism
  (a member with a moment release and a free end) returned its other modes as complete: 3 of 12
  on the MYSTRAN differential model, with no diagnostic. Modal analysis, and the spectral and
  seismic analyses that use it, now refuse and name the mechanism.
