# Independent profile components and point couple scaling

Quadratic profile coalescing now compares each component against the sum of
absolute samples in that component alone. The existing multiplier of
32 times Number.EPSILON is unchanged. A constant X component of 1e14 must not
cause adjacent Y profiles [0,1,0] and [0,0,0] to merge into zero. Both the
three-component floor moment path and the two-component physical-region first
moment path use this shared coalescer. Tests permute the large and small
components, reverse the profiles, check both signs and disparate magnitudes,
and exercise both sides of the roundoff threshold. Identical quadratics still
coalesce and separated spans remain separate.

This changes generated member loads when components of different magnitudes
previously hid a smaller varying component. Regenerate affected floor and area
loads, then rerun analyses and dependent checks. The registry entry requires
both floor and general generated-load regeneration. Re-solving alone cannot
repair a stored generated load.

The metamorphic result unit-scaling helper now applies the moment scale to
all three components of each spatial point couple, including optional Y and Z.
The station still uses the length scale; absent components remain absent and
explicit zeros remain zero. This corrects transformed test results, without
changing the solver's physical results or adding a new public solver entry
point. Tests check the dimensional identity and inverse transformation with
nonzero transverse couples, identity scales, and scales above and below one.

Both defects were introduced on the unmerged gravity branch: origin/main has
neither this profile coalescer nor point-couple metadata in the result-scaling
helper. No advisory is introduced. No tolerance, baseline or assertion is
relaxed.
