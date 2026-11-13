### Fixed

#### Verify the physical P-Delta residual with an independent dimensional calculation

Correct the 2D and 3D diagnostic tests to form elastic and geometric force actions separately and scale moment residuals by the model length, matching the physical equilibrium definition. Keep exact equality checks and add exact arithmetic regressions for the oracle. Engine results are unchanged (#1952).
