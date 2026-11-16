# Gravity loads conserve the physical loaded region

Issues #2199, #2200, #2201 and #2210 concern the force and first moments of
physical loaded regions. Regenerate affected D, L and Lr loads and seismic
weights, refresh floor definitions, then rerun analyses, combinations and design
checks. Re-solving previously generated loads alone does not correct them.
The generated-load notice persists until their generation version is current;
the separate floor-definition notice requests reapplication and recalculation.
Both notices cover 2D, 3D and Pro and every recorded analysis kind.

The audit witnesses were reproduced on origin/main 9d925a780:

| Witness | Before | Physical integral / after |
| --- | --- | --- |
| #2199, unit pressure on a 10 by 6 panel, shell width 4.76 | 58.56 vertical force; 59.88743362831858 after rotation by 0.37 radians | 60 in both orientations |
| #2200, shell width 5 on that panel | first moment about Y 225 | 300 |
| #2201, unit pressure on the zone x=0..1, y=0..6 | force 6, first moment about Y 0.6666666666666663 | force 6, first moments 3 and 18 |
| #2210, 10 by 6 panel rotated by pi/4 | plan area and unit superimposed weight 127.99999999999997 | 60 |

Lengths are metres, pressures kN/m², forces kN, and moments kN·m. Expectations
come directly from rectangle area and centroid integrals in the regressions.
#2199 and #2201 return silent wrong results on main. #2200 discloses its
whole-panel distribution approximation. The #2210 witness is conservative in
weight; it still represents the wrong physical area. The coordinator assigned SA-2026-079 to #2199 and SA-2026-080 to #2201; #2200 and #2210 receive none.
Historical release binaries were not replayed.

The [round-2 member-loading record](2026-11-gravity-member-loading.md) supersedes
the first correction's end-node couples and centroid-based carrier transfer.
That record describes the final partition, member loading, shared solver kernel,
hand-solution checks and explicit unsupported paths. Global resultants alone
are not the acceptance criterion. Regenerate all affected generated area loads.
