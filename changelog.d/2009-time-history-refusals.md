### Fixed

#### Preserve structured time-history refusals

Time-history prescribed-motion refusals now return structured JSON diagnostics through native, traced, certified and WASM entry points (#2009). Input validation takes precedence over unsupported-motion checks in 3D, preserving the original conflicting-support-spring diagnostic. Explicit zero prescribed translations and rotations remain accepted with identical loaded responses.
