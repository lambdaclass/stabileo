### Fixed

#### Avoid duplicate concrete work on meshed spans

- Avoid repeated concrete beam-section and basis kernel queries, prepare each complete biaxial section once per member verification, defer beam calculation-step formatting, reuse complete shared-span checks that retain an explicit longitudinal-torsion hold, and copy station verification records only when requested. Engineering results and verification holds are unchanged. Keep the full meshed-building cache parity oracle in dedicated tests so IFC and detailing regressions measure production work without duplicate reference runs.
