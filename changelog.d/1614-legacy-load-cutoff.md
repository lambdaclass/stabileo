### Fixed
#### Diagrams keep a member's load at any magnitude (2026-11-06)

- A 2D member whose results carry only the legacy start/end load values lost that load from its
  moment and shear diagrams, and from the diagram gaps the certificate checks, when both values
  were at or below 1e-10. Any nonzero value now counts, so a model scaled as a whole draws the same
  diagrams. The results snapshot corpus is unchanged (#1614).
