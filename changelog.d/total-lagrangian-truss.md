### Added
#### Experimental total Lagrangian trusses (2026-11-25)
- Experimental total Lagrangian elastic trusses use the shared load-increment and arc-length controllers. The Rust-only API accepts nodal dead loads and fixed translations, checks the initial mechanism and finite arithmetic, and limits Green strain to 1%. Analytical and derivative tests cover rigid rotations, a shallow truss limit point, rejected steps and consistent units. Existing analysis paths are unchanged; this does not certify buckling stability or model member flexural buckling.
