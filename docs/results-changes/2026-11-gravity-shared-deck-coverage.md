# Gravity generation blocks duplicate claims on a deck

Panel-mode gravity generation intersects the plan projections of all
shells that carry area load, including horizontal and sloped pairs. It
compares their heights over each positive-area intersection using the
existing deck tolerance. Starting corner and winding give the same result.
An actual beam bay also refuses when two shells eligible to cover it
share a positive-area part of the bay. Shell edge contact and independent
decks remain supported.

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

A shell-only model with identical 10 × 6 m footprints at height ranges
3.0009996–3.0019995 m and 3.0010006–3.0020005 m returned READY on main.
At 1 kN/m² both shells received dead load and the level summaries totaled
120 kN. The planner now blocks these overlapping claims for all corner
orders. Two flat shells at 3.0002 m and 3.0018 m retain their independent
loads unless they both cover the same part of a beam bay.

On main at `a1d0032fd`, two parallel 10 × 6 m shells rising from
3.000 to 3.002 m and from 3.0001 to 3.0021 m each received the full dead
pressure. At 1 kN/m² the plan and level summaries reported about 120 kN
of superimposed dead load. Replacing the second shell with a horizontal
shell at 3.0015 m produced the same duplicate assignment. A beam bay
with two sloped shells that cover its footprint and a horizontal shell
that claims a 10 m² strip within it reported about 70 kN under that same
pressure. All three models returned READY with no blocking message.
Both panel selection modes now refuse and emit no loads.

Regenerate panel-mode gravity loads in potentially affected projects before
using analysis, design or report results. If generation refuses, resolve
which surface carries the area load. Accepted plans retain the existing
pressure and member-transfer formulas.
