# Width-mode level mass follows loaded carriers

Width-mode gravity now uses the tributary areas of the carriers that actually
receive its loads. A closed region is unnecessary: for full-width horizontal
carriers the level area is tributary width times their summed plan lengths.
The same carrier-area records feed member loading and level mass in both gravity
modes, including roof classification and partial width spans. Width-loaded
sloping members retain dead load per member length and live load per plan length.

The #2269 witness has two parallel 10 m members, tributary width 3 m, section
area 0.1 m² and synthetic material weight density 25 kN/m³. With superimposed
pressure 1 kN/m² and the selected vivienda occupancy, the generated member
loads are D = -3 kN/m and L = -6 kN/m on each carrier. The correct level area
is 60 m², self-weight 50 kN, superimposed dead load 60 kN, unreduced live load
120 kN and participating live load 30 kN, giving total weight 140 kN.

Origin/main silently reports area 30 m² and weight 95 kN for separation 3 m,
using the node bounding box. Moving one carrier to separation 6 m changes main's
reported area to 60 m² without changing either member load. Before this fix,
PR #2219 instead reported zero area and weight 50 kN for both separations,
because neither model contains a closed region. Both now give the correct
60 m² and 140 kN, also after plan rotation by 37 degrees, mirroring and splitting
one carrier into three members.

Regressions check each member's D and L line loads and every level total.
Independent cantilever solutions check each carrier's shear, bending and torsion
at five stations per member and its tip deflection through the linear and
P–Delta WASM exports. Their load and internal-force checks already passed before
the fix; their area and weight assertions failed. With live participation zero,
level weight equals the integrated generated D loads plus structural self-weight;
with participation enabled it also includes participating live load. Zero width
and the already correct panel-mode width fallback retain their answers.

Regenerate affected gravity plans and seismic weights, then regenerate seismic
loads and rerun dependent analyses, combinations and design checks. Re-solving
stored generated loads alone does not update the weights or seismic actions.
The results registry is scoped to generated loads with seismic actions. No
advisory is added or numbered; the handoff records the silent main-source witness
for the coordinator's assessment. No release was tested.
