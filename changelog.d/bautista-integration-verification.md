### Fixed

#### Verify integrated building models and production builds

The rectangular slab and wall checks now open the specific generated buildings in both test profiles. Production parity checks recognize a declared change that has already landed upstream when testing the merged pull request.

Wind generation keeps intermediate floor cuts on tapered carriers and accepts a floor at the apex. Applying model text also replaces the ownership of generated footprint links. [Wind levels](../docs/results-changes/2026-11-wind-at-landings.md) and [plate constraints](../docs/results-changes/2026-11-plate-edit-node-ownership.md).

Automatic beam detailing continues bottom bars into their supports when the calculated cutoff reaches a support face. [Beam bar ends](../docs/results-changes/2026-11-beam-cutoff-and-splice-stock.md).
