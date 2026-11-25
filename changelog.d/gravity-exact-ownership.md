### BREAKING (results)

#### Use owned footprints for automatic gravity

Automatic gravity preserves openings during headroom clipping, places inclined fringe loads at physical member stations, checks actual overhead footprints and refuses ambiguous ownership. See [the gravity results change](../docs/results-changes/2026-11-gravity-exact-ownership.md). (#2543)

#### Check Explore pressures before computing modal mass

The mass source refuses a shell pressure that differs from the Explore request, including in reference cases used solely for mass. See [the modal mass results change](../docs/results-changes/2026-11-modal-mass-pressure-verification.md). (#2543)
