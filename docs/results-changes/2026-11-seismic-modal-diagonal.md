# Modal seismic load generation blocks the 45° case

PR #2316. 2026-11-18.

The seismic load planner blocks Apply when the modal method and the 45°
direction are requested together. The previous construction could change
the sign of a story force when forming the diagonal case. Two signed
story forces of −20 and +100 kN along the direction sum to 80 kN. Taking
their magnitudes before summing produces 120 kN. Builds that skipped
modal reduction when only 45° was selected could silently substitute
static loads for the requested modal loads.

Static 45° cases and modal X and Y cases remain available. If a previous
build generated a 45° modal E case, review it and its dependent analyses,
combinations and design checks. Use a verified 45° load case before
rerunning checks that require that direction.
