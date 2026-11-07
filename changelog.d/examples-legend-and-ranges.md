### Fixed
#### Example drawings say which shape is which, under one title (2026-11-07)

- The outrigger, earthquake frame and beam deflection views drew the undeformed and the deformed
  shape on top of each other with no legend, so they read as two structures. They now label
  both, with the deformed shape's magnification, in all six languages; the tower's mode shapes
  are labelled as normalised.
- Each example viewer had two headers and an editor toolbar. It now has one title: the
  "Stabileo viewer" mark, camera buttons, axis triad and position and zoom readout are gone from
  the example pages. Dragging and the wheel still pan and zoom.
- The reinforced concrete column's width slider ran to 0.8 m, so with the default three bars per
  face every width from 0.5 m was refused for a missing crosstie. It now runs from 0.25 to
  0.45 m, where the defaults always solve. The crosstie check is unchanged.
