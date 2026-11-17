### Fixed

#### Distributed member diagrams retain finite load integrals

- Integrate distributed member loads without overflowing their intensity slope in shared 2D and 3D force recovery, retaining zero contributions before the load and finite diagrams for supported intervals.
- Correct the self-weight notice regression fixture to cover legacy PRO gravity and explicit rules with exact applicability checks.
