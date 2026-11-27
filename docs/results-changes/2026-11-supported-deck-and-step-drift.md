# Load generation for independently supported decks

## Gravity on an independently supported bay below a pitched shell

The gravity planner preserves both load paths when a pitched shell overlaps a horizontal beam bay at its eave and the model provides independent supports. The shell vertices and physical bay corners must have direct vertical restraints. The planner checks modeled connectivity through members, plates, shells, connectors and constraints. A truss between fully restrained nodes shares no free displacement. The ownership check preserves independence across that boundary.

The verified shell participates in roof exposure without subtracting the bay's gravity footprint. In the reference model, a 10 m × 6 m bay carries 60 kN at 1 kN/m². The separate shell rises 3 m across the 6 m run and carries 10√45 kN under the same pressure per square metre of shell. Regenerate panel gravity loads to use the corrected ownership.

Two decks on separate vertical column paths to restrained supports also retain their own gravity loads inside the headroom band. The planner verifies those paths before subtracting shell coverage.
