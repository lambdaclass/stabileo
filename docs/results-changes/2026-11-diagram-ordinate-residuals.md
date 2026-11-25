# Physical ordinates and stations in member envelopes

A normalized query that is distinct from a load boundary is evaluated at
the product of the query and the member length, including its rounding
residual. On a 3 m member the float immediately above 1/3 is at
1 + 2^-53 m. A point force of 2^54 at 1 m contributes a moment of 2 there.
The browser previously returned 3 and the native and WASM readers returned
zero.

Point-force moment products retain the error from multiplication before
the baseline and load terms are summed. A force of 2^54 + 4 on a 3/4 m
arm contributes 3 × 2^52 + 3. With a starting moment of −(3 × 2^52 + 4),
the result is −1. The previous sum returned zero.

Native and WASM distributed-load ordinates retain the residual of the
integration distance. For a uniform load of 2^54, the shear at
1.25 + 2^-54 m is 1 when the baseline is −1.25 × 2^54. Rounding the cut
to 1.25 m erased the unit contribution and could pick the wrong governing
combination. At the end of a partial uniform load from 0.2 m to 2.7 m,
the stored endpoints also leave a residual in the loaded span. At a
load magnitude of 15, the correctly rounded moment magnitude at the end
of the load is 46.875 + 2^-47.

Envelope metadata retains the rounded distance and signed residual from
the physical cut. Piece assembly translates both words to the parent
member. Spatial moving-load extrema and force reports use the distance
attached to the extremum. The critical Envelope table and worksheet use
the distance, residual and face to export distinct physical cuts that
share a normalized coordinate.

Recompute affected diagrams and envelopes, then regenerate their reports
and critical envelope exports. See #2226, #2437 and PR #2587.
