### Fixed
#### Equilibrium property checks retain force scales through cancellation (2026-11-16)

The 2D and 3D internal-force property checks now share an accumulator that retains member-end, reaction and applied-load magnitudes before cancellation, including moments. A roundoff bound follows `f64::EPSILON` and the number of accumulated terms, with no absolute seed. Existing force-relative allowances remain; 2D member moments are normalized by length without increasing their prior budget. Exact issue reproducers and force/moment imbalance controls cover support-only loads, nonzero member forces and zero applied loads. Production solver results are unchanged (#2108, #2109).
