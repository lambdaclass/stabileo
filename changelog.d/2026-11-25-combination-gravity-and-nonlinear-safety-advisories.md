### Fixed
#### Safety advisories fixed after 0.6.4 (2026-11-25)

[SA-2026-114](../docs/advisories/SA-2026-114-saved-combination-load-groups.md) covers saved rules that silently applied factors to the wrong load group. Regenerate affected combinations and composite cases from the intended groups, then rerun their analyses and envelopes.

[SA-2026-115](../docs/advisories/SA-2026-115-gravity-floor-region-ownership.md) covers automatic gravity that loaded the same floor region through multiple carriers. Regenerate affected gravity plans, resolve conflicting load assignments and rerun the affected analyses.

[SA-2026-116](../docs/advisories/SA-2026-116-nonlinear-continuation-and-inclined-loads.md) covers incorrect arc-length paths and co-rotational results. Rerun affected planar nonlinear and spatial co-rotational analyses, including curved frames with shear-centre offsets.
