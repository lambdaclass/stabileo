### Added
#### One-step topology cleanup (2026-11-27)

`topologyPreview` inspects coincident nodes, member crossings and nodes lying on
members without changing the model. `connectTopology` merges coincident nodes,
cuts members at crossings and existing nodes, merges any duplicate intersection
nodes, and removes zero-length and duplicate members in one undo step. The
report preserves loads, supports, groups and other references, and drops
self-referential constraints and duplicate supports. Orphan nodes are left alone.
