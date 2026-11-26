# Generated floor pressures and rafter gap strips

## Account for use-zone pressure on clipped quadrilaterals

The generated source audit now checks the corner delivery of use-zone pressure on planar bilinear quadrilaterals. The production shape integration supplies the expected corner forces from the entered pressure, and the independent force and moment integral still checks the result on the physical shell. Valid loads that were refused can solve and report their reactions.

## Refuse eccentric attached rafter gap strips

An attached rafter can receive a certified strip as a line load only when both flanking strip edges establish a load centered on its plan axis. The panel-gravity planner blocks a strip with a transverse offset beyond roundoff because the line load cannot carry the resulting moment. Regenerate panel gravity on affected models to check the gap geometry.
