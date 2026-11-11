### Fixed
#### Validate activation of frozen inactive one-way members (2026-11-11)

BREAKING (results): 2D and 3D contact analyses refuse frozen inactive tension-only
or compression-only members whose full-stiffness trial axial force on the final
geometry requires reactivation beyond the unchanged contact tolerance scaled by
axial stiffness. Recovered axial force sign checks remain in place. Invalid states
return `contact_state_invalid` without results (#1932, follow-up to #1921).
See the [results-change write-up](../docs/results-changes/2026-11-frozen-inactive-one-way-members.md).
