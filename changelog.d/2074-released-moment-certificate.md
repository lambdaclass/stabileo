### Fixed

#### Keep released-rotation certificates specific to moments

- Limit released-rotation load certificates to nodal moments. Translational forces and warping loads always undergo the shared orphan-load check (#2074, #2023).
- Compare released-load WASM responses against native references, reject scaled and sign-reversed responses, and complete all result-change translations.
