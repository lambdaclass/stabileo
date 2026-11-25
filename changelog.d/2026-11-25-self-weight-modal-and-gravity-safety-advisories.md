### Fixed
#### Safety advisories for self-weight, modal mass and automatic gravity (2026-11-25)

[SA-2026-117](../docs/advisories/SA-2026-117-static-shell-self-weight-density.md) covers reversed or omitted shell self-weight. Restore the intended material densities and rerun affected static cases and combinations.

[SA-2026-118](../docs/advisories/SA-2026-118-self-weight-group-targets.md) covers omitted group self-weight. Repair the group target or membership and rerun affected cases and combinations.

[SA-2026-119](../docs/advisories/SA-2026-119-modal-mass-missing-density.md) covers incorrect modal frequencies when a material density was omitted. Restore the density, rebuild the mass source, and rerun affected dynamic analyses.

[SA-2026-120](../docs/advisories/SA-2026-120-gravity-deck-load-placement.md) covers automatic gravity that duplicated or misplaced deck loads and exposure that misplaced snow actions. Regenerate affected gravity, snow and wind plans, verify the loads, and rerun dependent analyses.
