### Fixed

#### Match the snapshot gate positive fixture to its result change (2026-11-10)

Give the deliberate beam-load change test an explicit registration for linear
2D frame results, declared result quantities, and features from the opened
corpus case. Retain rejection of a context-free registration even with a
BREAKING (results) fragment. This corrects the Results Snapshot test fixture
while preserving the gate requirements introduced for #1508.
