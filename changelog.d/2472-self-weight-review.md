### BREAKING (results)

#### Refuse missing group membership and flag invalid static shell density

Self-weight rules now identify and refuse referenced groups with missing membership. Earlier static results are flagged for recheck when a covered shell has invalid density, including a saved null value. See [the group membership change](../docs/results-changes/2026-11-invalid-solver-numbers.md#refuse-self-weight-with-missing-group-membership) and [the static shell density change](../docs/results-changes/2026-11-invalid-solver-numbers.md#flag-invalid-density-in-static-shell-self-weight). (#2472)
