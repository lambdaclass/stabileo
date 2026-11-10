### Fixed
#### Non-finite metamorphic values fail before a comparison becomes inconclusive (2026-11-10)

The verification harness now rejects NaN and infinite response values before conditioning or modal-gap limits can classify them as inconclusive. Published effective-mass and shell-stress replays retain their existing inconclusive and refusal counts. No engine results, numerical tolerances or reliability limits change. Separate unresolved numerical and convergence reproducers remain ignored and documented in `docs/verification/HARNESS_SMALL_CLUSTERS.md`.
