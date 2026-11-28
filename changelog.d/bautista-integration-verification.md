### Fixed

#### Verify integrated building models and production builds

The rectangular slab and wall checks now open the specific generated buildings in both test profiles. Both research builds verify that the pull request actually changes every path it declares for production parity.

Wind generation keeps intermediate floor cuts on tapered carriers and accepts a floor at the apex. Applying model text also replaces the ownership of generated footprint links. [Wind levels](../docs/results-changes/2026-11-wind-at-landings.md) and [plate constraints](../docs/results-changes/2026-11-plate-edit-node-ownership.md).

Automatic beam detailing continues bottom bars into their supports when the calculated cutoff reaches a support face. Cutoff verification follows a bar through the joints where it becomes part of a continuous bar. [Beam bar ends](../docs/results-changes/2026-11-beam-cutoff-and-splice-stock.md).

The seven-storey reinforcement audit and design-family counts run on the released model with its core on one support, the model they were measured on. The example with its founded core is audited separately: every beam is verified or refused with its reason, and every bar reaches the 3D scene. [Core foundation](../docs/results-changes/2026-11-example-core-foundation.md).
