### Fixed
#### Keep production feature configuration out of browser bundles and restore diagram viewBoxes (2026-11-18)

- Inline the resolved feature switches and omit account and tracking code when the accounts switch is off.
- Load shared viewer translations with the pages that use the viewer.
- Give tool charts and sketches viewBoxes that match the coordinates of their result diagrams.
