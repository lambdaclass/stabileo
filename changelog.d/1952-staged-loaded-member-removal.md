### BREAKING (results)

#### Refuse staged histories that remove a loaded member

Both dimensions refuse removal of members with nonzero internal force with an
explicit #1996 diagnostic, returning no unredistributed displacement or force
results. Exactly unloaded removals and removals before loading retain their
answers. Require global-displacement types at the shared reaction boundary and
solver-displacement types for staged equilibrium checks. See the
[results-change write-up](../docs/results-changes/2026-11-staged-loaded-member-removal.md)
(#1952).
