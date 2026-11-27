### BREAKING (results)
#### Recover member extrema from load intervals (2026-11-25)

Moving-load envelopes, calculation reports and planar diagram scales use
interval extrema. Spatial moving-load envelopes use inward member-end limits.
Point queries preserve jump sides and reject ambiguous extrema, and axles at
stored path endpoints reach the corresponding member ends.

Retain small diagram terms through cancellation, evaluate both transverse
components at the same physical cut, and recover exact transverse SRSS extrema.
Steel verification can report a different governing end for nearly equal end
demands and different last digits of Cb and utilization.
