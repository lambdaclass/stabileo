# Assign each automatic gravity floor region to one carrier

Panel-mode automatic gravity uses the union of the shell and beam-bay
footprints on each physical floor. Shared nodes, vertical constraint links
and the existing elevation rules associate footprints with a floor.

- A shell owns its footprint before a beam bay can take any of that area.
  The bay transfers pressure over its uncovered region.
- Between vertically coupled shells, the upper shell has precedence only
  where the height separation everywhere over the overlap exceeds the
  existing deck elevation tolerance. Automatic gravity can omit a
  fully covered lower quad. It refuses a partially covered lower quad
  because the surface-load representation acts on the whole quad.
- If shell elevation does not resolve ownership or two beam bays would
  carry the same residual area, the plan refuses and identifies the
  carriers. Edge contact and independent decks retain their loads.

The planner checks that the owner regions account for the union area and
that dead, live, roof live and their patterned alternatives conserve
the pressure resultant. It uses plan area for live pressure and the
actual surface measure for dead pressure on a slope. A lower shell that
loses the area assignment remains part of the structural model and its
self-weight.

The #2499 deck formerly returned READY with 120 kN for a 60 m² deck
at 1 kN/m². The upper shell now receives 60 kN. If the vertical
connection is released, each independent shell keeps its 60 kN.
A partial overlapping variant needs manual assignment and now refuses.
The #2299 rigid-link, eccentric-link and common-master bay witnesses
formerly refused and now put 60 kN on the shell alone. The exterior
strip and fully tied seam witnesses of #2299 and #2347 formerly refused
and now place 72 kN on their shells, including the 12 m² strip extending
beyond the bay. The ambiguous overlapping-shell models in #2284
continue to refuse. Vertically tied beam bays that both retain the same
region now refuse with both sets of boundary members named. The load check
also refuses a requested pressure that cannot be represented in the
generated case.

The example comparison found only roundoff differences in the stadium
and suspension bridge load integrations after automatic gravity stopped
rounding tributary stations to a decimal grid. The independent Floor Load
tool retains its station handling.

Regenerate panel gravity loads in affected projects before using analysis
or design results.
