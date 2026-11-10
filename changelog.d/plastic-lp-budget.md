### Fixed
#### Exact plastic fuzz work follows the LP construction

The plastic fuzz harness now budgets the dense LP tableau from the engine's section samples, load pieces, force variables and bounded refinement loops, rather than counting 3D members alone. Bounded single-artifact replay measures repeated calls in one process, live and peak allocations, allocation traffic, RSS and time. Seeded controls demonstrate that an admitted model with a planted hang or allocation leak still fails the replay watchdog. All fourteen issue artifacts and the measured before/after classifications are preserved in [the replay report](../docs/verification/PLASTIC_LP_BUDGET.md).
