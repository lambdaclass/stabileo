# Load generation for independently supported decks and one-way roof steps

## Gravity on an independently supported bay below a pitched shell

The gravity planner preserves both load paths when a pitched shell overlaps a horizontal beam bay at its eave and the model provides independent supports. The shell vertices and physical bay corners must have direct vertical restraints. The planner checks modeled connectivity through members, plates, shells, connectors and constraints. A truss between fully restrained nodes shares no free displacement. The ownership check preserves independence across that boundary.

The verified shell participates in roof exposure without subtracting the bay's gravity footprint. In the reference model, a 10 m × 6 m bay carries 60 kN at 1 kN/m². The separate shell rises 3 m across the 6 m run and carries 10√45 kN under the same pressure per square metre of shell. Regenerate panel gravity loads to use the corrected ownership.

## Exact step drift on a one-way roof

A horizontal rectangular receiving bay can transfer positive step drift when its declared one-way span is normal to the step and the pressure profile is constant along the step. The generator clips the pressure triangle at the far bearing, integrates the force and its first moment, and distributes the two bearing reactions along the step interval. It verifies continuity of each bearing and checks the delivered force and both plan first moments. Regenerate snow loads to use the corrected transfer.

An unresolved bearing, a selection that excludes a bearing, an unspecified or incompatible span, or a varying pressure profile still blocks generation. The existing below-threshold behavior applies.

## Transfer roof step drift across connected one-way bays

The receiving roof may now consist of several connected rectangular bays with declared one-way spans normal to a constant-height step. The generator checks the roof footprint for consecutive receiving strips, integrates the triangular pressure over the portion on each bay, and transfers either reaction to its actual bearing. A shared bearing takes the sum of the two bay reactions where both bays are loaded. The generator checks the delivered force and both plan first moments against the continuous receiving footprint.

Regenerate snow loads and repeat the analysis for affected roofs. Other receiving geometries still require a known bearing arrangement and a pressure field the generator can integrate.
