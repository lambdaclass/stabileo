# Preserve automatic gravity on independent decks and lower roofs

Panel gravity uses the assigned beam-bay regions for overhead coverage and
checks their tributary transfers before using them to build load cases.
The affected projects should regenerate panel gravity loads before using
analysis results.

Independent decks can share a vertical restraint. In the review witness,
two 10 m by 6 m platforms share one fixed vertical master. At 1 kN/m²
each platform retains 60 kN, for a total of 120 kN. The earlier ownership
implementation on PR #2512 suppressed one platform and returned 60 kN.
Deck attachment requires paired plan stations in independent vertical
constraint components. Shell elements can also share an edge, including a
coincident edge joined by full-motion ties. The eccentric shell deck in
#2499 retains its single pressure assignment.

When a shell lies below a linked beam bay, the shell can own all or part
of the bay's plan footprint. Only the remaining bay region contributes
overhead bay coverage. In the full and partial coverage witnesses, the
owned lower shell now receives the same maintenance roof pressure as
the shell in isolation. An independent overhead bay still covers the
shell. The separate concentrated-roof generation blocker continues to
apply to the preview of these witnesses.

The planner checks every positive bay assignment against the unit-pressure
resultant of the member and nodal loads. The check covers an absent transfer,
a partial transfer and excess load. A concave 83.55 m² bay at 1 kN/m² had
no two-way tributary transfer and fell back to member widths. With a
specified width of 1 m this generated about 56.34 kN. The planner now
refuses with the elevation of the bay and supplies no load cases or
combinations. The same model with the verified one-way transfer generates
its full 83.55 kN. An approved roof-fringe transfer also has its own
resultant check against its retained area.
