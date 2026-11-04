### BREAKING (results)

#### A member's governing value and the 2D envelope read the diagram's true peak (2026-11-04)

- #1389: in plane models with combinations and loads along members, the governing moment, shear
  or axial force of a member and the 2D envelope were read at fixed stations, so a peak between
  two stations was read low: 0.23 % under a triangular load, 1.05 % under a short partial load,
  and a combination peaking between stations could lose the governing title. Both now take the
  true peak (both sides of each point load, the stationary points between load discontinuities).
  Governing values and envelope peaks can rise; they never fall. Results version 25.
