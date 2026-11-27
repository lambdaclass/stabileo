# Exact member force peaks in summaries and exports

The planar force colour map, the default calculation report and workbook
peak fields previously used member ends to find several whole-member peaks.
The spatial workbook combination sheet and spatial force colour map also
depended on sampling stations. They now use the extrema of the member force
diagrams. Case and combination envelopes retain their positive and negative
bounds from the inward member cuts.

For a 6 m simply supported span under 10 kN/m, the support moments are zero.
The section moment at midspan has magnitude `wL²/8 = 45 kN·m`, which now
appears in the whole-member summaries. A 20 kN point load at midspan on the
same span gives `PL/4 = 30 kN·m`. A 4 m cantilever with an axial line load
varying from +8 to −8 kN/m gives zero axial force at the member ends and
`8 × 4 / 4 = 8 kN` in magnitude at midspan.

Spatial section stress now takes its concurrent forces from the same checked
section evaluator as the diagrams. With a 20 kN axial point load at 3 m on a
6 m cantilever, the two axial forces immediately beside the load are 20 kN
and 0 kN. The previous legacy interpolation reported 15 and 5 kN at the
quarter-span cuts. The exact force step is visible in the recovered stresses.

A magnitude combination for which the diagram can give only a conservative
bound cannot supply an exact peak location. The exact-only summary and
workbook paths report that the result is unavailable in this case. The plots
can still show a labelled conservative bound.
