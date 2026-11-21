# Edits to restored planar moments

A legacy planar point couple with only `mz: 5` could be restored into two moment fields. In the two-metre cantilever regression, the restored couple acts one metre from the fixed end. Editing it to zero previously left a 5 kN·m moment jump there in both 2D and 3D. Editing it to 3 kN·m produced an alias-conflict refusal. The two edits now give a zero internal moment and a 3 kN·m jump, respectively. Equilibrium gives these values because the free-end segment is unloaded and the fixed-end segment carries the applied couple.

Restoring or saving a planar point couple or nodal moment keeps a single `my` field for the effective moment. Undo and redo use the same representation. Two different nonzero values are preserved and block analysis until the intended moment is entered. This also prevents a legacy nodal record with genuinely conflicting values from solving with an arbitrary choice.

An empty or invalid edit preserves the original load. Analysis still refuses a conflicting record, and a valid single-field record keeps its previous moment. Enter a finite value to replace the stored moment, including an explicit zero to clear it.

For projects saved after a zero edit in an affected version, the stored fields can be identical to valid legacy input with one nonzero alias. Check the intended load, re-enter its moment, and rerun the affected analyses and downstream design checks.

[Issue #2459](https://github.com/lambdaclass/stabileo/issues/2459)
