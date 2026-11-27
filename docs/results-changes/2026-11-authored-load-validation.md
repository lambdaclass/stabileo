# Authored load validation

The analysis names unknown fields and selectors that are assigned to the wrong load kind. Previously a misspelled frame on a spatial distributed load could be treated as the default local frame and change support reactions. Correct the field and recalculate. The solver also identifies invalid planar nodal moments and missing or invalid numeric input before projection.

The saved-model notice also covers missing and nonfinite numeric load inputs that analysis refuses before projection, including a missing spatial `fz` or a nonfinite spatial `fy`.

Frame and target selectors must belong to the stated load schema. For example, an inclined member carrying a spatial distributed load with `isGlobal` now reports that field as invalid. Specify a spatial `frame` to state whether the load components follow the global or member axes.

Each load kind now rejects unrecognized fields before the solver can apply a default. A spatial distributed load on an inclined member that spells `frame` as `fram` is refused. Previously it was resolved in the member's local axes, changing the support reactions. A present load collection must be an array. A malformed row triggers the saved-model notice even when another row carries unsupported planar torsion.

Planar nodal loads now validate both supplied moment fields before resolving the current `my` name and the legacy `mz` alias. Recheck identifies a saved string or null moment as malformed. Solve and fixture apply report its field.
