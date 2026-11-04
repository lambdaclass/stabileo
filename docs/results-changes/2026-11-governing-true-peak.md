# Governing value and 2D envelope at the true peak (results version 25)

Issue #1389. In plane models with load combinations and loads along members, the governing
moment, shear or axial force of a member (`computeGoverning2D`) and the 2D envelope
(`compute_envelope`) were read at fixed stations: 21 along the member, plus the point loads for
the governing value. A peak that falls between two stations was read low.

## Governing value and 2D envelope at the true peak

Both now read the true peak. Between load discontinuities each diagram is a cubic in x (M) or of
lower degree (V, N). The peak is taken at the stationary points of each piece, on both sides of
every point load, and at the ends. The envelope adds those stations to its 21-point grid, so the
governing value of a member still equals the peak of its envelope.

| Case | Before | True peak | Read low by |
|------|--------|-----------|-------------|
| Simply supported 6 m, triangular 0 → 10 kN/m | 23.0400 kN·m | 23.0940 kN·m | 0.23 % |
| Simply supported 8 m, 50 kN/m over 3.02–3.18 m | 14.8800 kN·m | 15.0381 kN·m | 1.05 % |
| Two combinations whose peaks differ by 1e-6 | the flat one governed | the cubic one governs | wrong combination |

In the committed snapshots, `2d-frame-seismic` member 5's envelope moment goes from −45.840 to
−46.016 kN·m (0.38 %), and `2d-building-3story-dlw` members 7–9 gain stations at their peaks.
Values can rise and never fall. 3D envelopes and governing values are not changed by this entry.
