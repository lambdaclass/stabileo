### Fixed
#### Restore gravity regression coverage after merging main

- Exercise an explicit zero-width load alongside the unchanged supported continuous-beam sweep, so the deformation regression checks both refusal and finite answers (#2219).
- Register the active width-mode area and seismic-weight reproducers directly with Vitest so the wrong-result gate recognizes their transition to passing tests (#2269).
