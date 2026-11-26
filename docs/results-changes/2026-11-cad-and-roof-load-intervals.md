# CAD bearings and generated floor and roof loads

## Account for use-zone pressure on clipped quadrilaterals

The generated source audit now checks the corner delivery of use-zone pressure on planar bilinear quadrilaterals. The production shape integration supplies the expected corner forces from the entered pressure, and the independent force and moment integral still checks the result on the physical shell. Valid loads that were refused can solve and report their reactions.

## Restore CAD snapping beyond certified slab bearings

The tighter geometric check applies at the stations covered by certified slab edges. The draft establishes those shared edges first, then uses the usual CAD snap tolerance on the other parts of the beam. Regenerate affected drafts from their source and rerun analysis. The restored wall bearing can change the support reactions, member forces and displacements.

## Refuse eccentric attached rafter gap strips

An attached rafter can receive a certified strip as a line load only when both flanking strip edges establish a load centered on its plan axis. The panel-gravity planner blocks a strip with a transverse offset beyond roundoff because the line load cannot carry the resulting moment. Regenerate panel gravity on affected models to check the gap geometry.

## Apply adjacent snow drift over its measured intervals

Roof edges separated by a positive gap beyond roundoff go through the clearance and variable-width checks, even for millimetre-scale gaps. The generator refuses a clear separated span with varying width. For explicitly entered adjacent roofs, only the intervals where a matching modeled source already applies are removed. Regenerate generated snow loads. The affected cases can change their surcharge and reactions or require a different model before snow loads can be generated.
