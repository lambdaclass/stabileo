# Planar start couples and spatial combination scope

Issue [#2411](https://github.com/lambdaclass/stabileo/issues/2411).

A pure legacy planar couple at the start of a spatial member has a known location even when the member has no usable projection in the load plane. Analysis applies that couple at the start node about the load-plane normal. An interior couple or a load with a force component still requires a usable projection or an explicitly oriented 3D load. Conflicting nonzero moment aliases stop the solve.

In the regression model, a 5 kN·m planar start couple on a global-Z cantilever previously gave zero fixed moment on the released code path in main. The fixed Z reaction is now −5 kN·m in the linear, nonlinear, and P-Delta regressions. The same reaction is recovered when a zero `my` accompanies the nonzero `mz`. See [legacy planar point-couple aliases](2026-11-planar-point-couple-aliases.md).

Combination preparation expands the cases needed for the solve and their source and composite dependencies. A notional case that contributes nothing and has no requested standalone result can no longer block an independent combination during expansion.

Review and rerun affected analyses and design checks. Replace a refused legacy point load with an explicitly oriented 3D load at its intended position.
