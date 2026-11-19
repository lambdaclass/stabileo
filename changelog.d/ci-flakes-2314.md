### Fixed
#### CI timing and layout flakes (2026-11-19)

The Timing Budgets job runs wall-clock browser checks on the dedicated runner for trusted CI runs. Research layout checks wait for the live page, and each of the 32 generated plastic mechanism cases runs under its own test deadline. (#2314, #2311, #2290)
