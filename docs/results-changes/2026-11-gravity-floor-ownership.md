# Assign each automatic gravity floor region to one carrier

Panel-mode automatic gravity checks shell and beam-bay footprints before assigning pressure. Shells carry a beam bay when they fully cover the same physical deck. Each shell on a separate deck retains its own pressure. When positive-area overlap leaves shell or bay ownership unresolved, generation stops and identifies the conflicting carriers.

The planner checks that the assigned regions account for the union area and that dead, live, roof live and their patterned alternatives conserve the pressure resultant. It uses plan area for live pressure and actual surface area for dead pressure on a slope.

The original #2499 deck returned READY with 120 kN for a 60 m² deck at 1 kN/m². The overlapping shell geometry now requires explicit load assignment. The #2299 complete rigid-link and eccentric-link boundary models place 60 kN of generated pressure on the shell. Complete coplanar coverage with a shared boundary also lets the shell carry the bay, including shell area extending past its boundary. The ambiguous overlapping-shell models in #2284 continue to refuse. Overlapping beam bays on the same deck identify both sets of boundary members. Generation also stops when a requested pressure cannot be represented by the emitted loads.

The example comparison found only roundoff differences in the stadium
and suspension bridge load integrations after automatic gravity stopped
rounding tributary stations to a decimal grid. The independent Floor Load
tool retains its station handling.

Regenerate panel gravity loads in affected projects before using analysis
or design results.
