# Moving base-level mass and structural width in generated seismic loads

PR #2316. 2026-11-18.

The nearest-level mass partition can assign part of a column to the base level,
even though that part moves. The modal solver includes this motion when
computing participation. The seismic load generator now includes that mass in
its modal shear integration and equivalent member loading. Stationary
base-level mass receives no share of that force. The static base shear used
for design and minimum-shear scaling retains its elevated mass basis.

Accidental eccentricity is measured across the structural plan at the level.
Massless framing can therefore increase the eccentricity. The physical mass
centroid and polar mass still determine how the moment is distributed.
If a nonzero moment cannot be distributed, the load plan is blocked.

Modal cases still represent equivalent story shear. Combining the responses
to individual signed mode loads requires a separate change.

Regenerate affected E loads before repeating analyses, load combinations and
design checks.
