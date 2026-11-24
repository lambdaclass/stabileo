### Fixed
#### Generated wind reaches each member as a few loads, not thousands (2026-11-24)

The wind generator gave a member under a pressure that grows with height (every member above 5 m
under CIRSOC 102) as many linear loads as it took for each one to match the field's four work
moments by itself: a few millimetres each, some 49 000 loads for a two-storey house and 391 000
for a seven-storey building, which then took minutes to open and to solve. Each stretch is now
two linear loads that carry the four moments together, so reactions, member end forces and node
displacements are as before, and the diagram inside a member is within 0.1 % of its largest
value. Regenerate the wind of a model generated before to get the lighter loads.
