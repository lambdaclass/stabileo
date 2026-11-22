# Underflow in applied load accounting

The load check adds one smallest positive subnormal per multiplication or division that can underflow. It carries each contribution's allowance through subsequent scaling, moment arms and case summation. Each component still uses the existing relative factor of 128 times machine epsilon. Loads that disappear by more than the resulting allowance still cause a refusal.

Spatial frame assembly passes every nonzero resolved distributed load to the solver, including intensities below the former cutoff. The solver equations and load integrations retain their existing formulas.
