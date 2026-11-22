# Gravity generation blocks duplicate claims on a deck

Panel-mode gravity generation now refuses overlapping level shells that are assigned
to the same gravity level or are both eligible to cover the same deck elevation.
The same elevation bands determine which footprints can replace beam loading.
Coplanar shell overlaps, including sloped shells, still refuse. Coplanar edge
contact and overlapping projections on separate deck levels are supported.

The planner also recognizes eccentric connections that couple vertical motion.
A vertically coupled offset shell and beam bay with overlapping load regions
trigger the same refusal as a rigid link. The diagnostic identifies the shell
and the members of the bay. A released vertical degree of freedom permits the
independent load paths. The planner uses eccentric links to infer rigid seams
and member alignment only when their offsets agree with the model geometry.

On main at `918a76194`, both the original #2284 and #2299 witnesses already
refuse. Shifting one of the overlapping shells in #2284 from 3 m to 3.0000001 m
still returned READY with 72 kN of superimposed dead load under 1 kN/m².
The two shells and the uncovered strip should account for 60 kN on one
10 × 6 m deck. Two shells at 3.0000001 m and 3.0019999 m above a bay at 3.001 m
returned the same 72 kN despite having different rounded shell levels.
Replacing the four rigid links in #2299 with kinematically equivalent
unreleased eccentric connections returned READY with 120 kN at 1 kN/m²,
twice the applied 60 kN. In both cases the level weights included the
duplicate load. The automatic and explicit panel selections both reproduced
the result without a blocking message. These variants now return BLOCKED
with an empty load plan.

Regenerate panel-mode gravity loads in potentially affected projects before
using analysis, design or report results. If generation refuses, resolve
which surface carries the area load. Accepted plans retain the existing
pressure and member-transfer formulas.
