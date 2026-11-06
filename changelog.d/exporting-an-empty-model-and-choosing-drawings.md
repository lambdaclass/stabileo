### Changed
#### Exporting an empty model, and choosing which drawings come out (2026-10-28)

PRO's export buttons were greyed out until the model had a node; they are offered at once, as in
Basic. Every export dialog of both modes says when the model is still empty, the file still comes
out, and one notice says it came out with no data, in place of the solver's errors about a model
with nothing to solve. PRO's report now opens on an empty model too.

Drawings opens on what to include, with three quick sets (model only, model and diagrams,
everything) above the checks, and, when more than one drawing is chosen, whether they come out
on one sheet or one file each in a .zip. PRO's DXF offers the same: one drawing with a layer per
content, or a .zip with the model's drawing and one per result with the model underneath.
