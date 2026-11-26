# Local roof snow loads and CAD floor joints

## Use the continuous fetch at each roof step interval

The generator traces the upper and lower roof footprints perpendicular to each step. At a change in continuous fetch, it splits the step and computes the one-way bearing reactions for each interval. It stops with the existing translated step-drift diagnostic when the fetch would produce a varying positive profile that this transfer cannot represent. Parapet and sliding loads are clipped to the connected receiving footprints, including openings.

Regenerate snow cases and solve again. Member loads, forces, reactions and displacements may change.

## Minimize the distance of CAD floor joints

An alternating path adds the cost of each new connection and subtracts the cost of each connection it removes. Physical joints keep priority. Among eligible matches the draft can now choose the shorter total snap distance, which can change how forces transfer across floors.

Regenerate affected drafts from their CAD floor plans and solve again.
