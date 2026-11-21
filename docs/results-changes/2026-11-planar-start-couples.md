# Planar start couples and spatial combination scope

Issue [#2411](https://github.com/lambdaclass/stabileo/issues/2411).

A pure legacy planar couple at the start of a spatial member has a known location even when the member has no usable projection in the load plane. Analysis applies that couple at the start node about the load-plane normal. An interior couple, a load with a force component, or a couple with a conflicting nonzero moment alias still requires a usable projection or an explicitly oriented 3D load.

In the regression model, a 5 kN·m planar start couple on a global-Z cantilever previously gave zero fixed moment on the released code path in main. The fixed Z reaction is now −5 kN·m in the linear, nonlinear, and P-Delta regressions. With `my: 0, mz: 5` on the same member, analysis identifies and refuses the record. Both moment fields are checked for activity independently.

Combination preparation expands the cases needed for the solve and their source and composite dependencies. A notional case that contributes nothing and has no requested standalone result can no longer block an independent combination during expansion.

Review and rerun affected analyses and design checks. Replace a refused legacy point load with an explicitly oriented 3D load at its intended position.
