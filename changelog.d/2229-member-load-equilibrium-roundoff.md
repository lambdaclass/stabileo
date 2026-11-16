### Fixed
#### Equilibrium property checks bound cancellation across member loads (2026-11-16)

The native 2D and 3D internal-force property checks now accumulate each member-load resultant together with the absolute sum of its individual contributions. Their shared roundoff floor uses `γ_n · Σ|term|` instead of the largest individual member-load term, including length-normalized moments. Cancelling point and distributed member loads no longer reject an analytically correct zero result. Existing relative allowances and imbalance assertions are unchanged; production solver results are unchanged (#2229).
