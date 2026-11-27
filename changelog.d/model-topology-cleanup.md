### Added
#### One-step topology cleanup (2026-11-27)

`topologyPreview` inspects coincident nodes, member crossings and nodes lying on
members without changing the model, accounting for the merge that follows.
`connectTopology` merges coincident nodes, removes members they collapse, cuts
members at crossings and existing nodes with the same tolerance, merges any
duplicate intersection nodes, and removes zero-length and duplicate members in
one undo step. The report preserves loads, supports, groups and other
references, and drops self-referential constraints and duplicate supports.
Orphan nodes are left alone.
