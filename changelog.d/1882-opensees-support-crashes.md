### Fixed
#### Record OpenSees support-check crashes per model (2026-11-09)

The OpenSees comparison now runs support-contract checks inside the existing engine failure handlers. A solver crash or malformed engine output is recorded for the affected model instead of aborting the comparison run. Regression tests require a flagged failure when the reference stiffness is regular, with the engine exit status and diagnostic preserved. Engine calculations and comparison tolerances are unchanged.
