# Complete demand for seismic capacity checks

Issue [#2442](https://github.com/lambdaclass/stabileo/issues/2442).

Earlier seismic capacity checks could issue passing column and joint verdicts when a named seismic combination supplied only part of its station grid. A model with gravity-only combinations could also get seismic verdicts, including when a modelled earthquake case was absent from the active combinations.

In the planar frame regression, removing the governing station reduced linear column Ve from 367.07 to 319.07 kN and P-Delta column Ve from 367.16 to 319.16 kN. The column and joint passed in both cases. With only gravity combinations the linear column Ve was 125.50 kN, and both still passed.

Each modelled earthquake case must now contribute with a nonzero factor to an active seismic combination. Each such combination must have forces at every expected station of a checked member. The seismic desk and calculation report withhold the affected member and joint verdicts and give the reason. Soft-storey amplification also requires complete seismic demand where it is applied. Capacity equations and complete-input results are unchanged.

Review earlier seismic capacity verdicts. Include every earthquake case in the active combinations, solve again and rerun the seismic checks.
