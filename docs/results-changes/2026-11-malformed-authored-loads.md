# Refusal of malformed authored loads

The input boundary rejects unknown load kinds, missing load payloads, unsupported load frames or shell targets, and non-boolean planar direction flags. It identifies the field in a translated message. Basic validates the original load components before projecting a spatial record into XZ or YZ. Fixture import checks the load records before applying them.

The Basic XZ path previously filled a missing spatial force with zero or discarded a non-finite force on the orthogonal axis before the load ledger detected a mismatch. The refusal now names the original input field. The spatial member-load path accepted unknown frames as local or global. It now refuses those frames. A complete spatial load and the supported member-load frames still produce the reactions required by equilibrium in the linear and P-Delta regressions.

Saved-result rechecks inspect each load row for applicability. In planar workspaces they also flag invalid numeric fields a Basic XZ or YZ projection could previously mask. A null row triggers the notice and the remaining rows are still inspected. Rows with a missing or invalid load type can still carry generation and load-case evidence. Basic clears the previous kinematic diagnosis when a new single solve starts and publishes a new diagnosis if it reaches the rank check.

Review any result saved from a malformed load record. Restore the missing component or select a supported load type, frame, and target before rerunning analysis.

Basic live solves and saved-result rechecks use the same vertical-component check for planar nodal loads. A row with neither `fz` nor its legacy alias `fy` requires correction. A finite `fy` on its own passes that check. Fixture replay, examples and generated-model application report a missing or non-array `loads` collection before alias conversion or model replacement. Saved-result rechecks also flag a present non-array collection in either the current or original stored snapshot. An empty array describes an unloaded model.

Fixture preflight now refuses loads whose node, member or shell ID is absent from the corresponding collection in the source fixture. Example and generator application identify the offending load field before replacing the current model. Previously, a pressure load that named a missing quad could land on a different quad that acquired that ID during replay. The saved model carries the replayed IDs, so check the source fixture to confirm which quad the load was intended to act on.
The saved-model notice also covers missing and nonfinite numeric load inputs that analysis refuses before projection, including a missing spatial `fz` or a nonfinite spatial `fy`.

Frame and target selectors must belong to the stated load schema. For example, an inclined member carrying a spatial distributed load with `isGlobal` now reports that field as invalid. Specify a spatial `frame` to state whether the load components follow the global or member axes.

Each load kind now rejects unrecognized fields before the solver can apply a default. A spatial distributed load on an inclined member that spells `frame` as `fram` is refused. Previously it was resolved in the member's local axes, changing the support reactions. A present load collection must be an array. A malformed row triggers the saved-model notice even when another row carries unsupported planar torsion.

Planar nodal loads now validate both supplied moment fields before resolving the current `my` name and the legacy `mz` alias. Recheck identifies a saved string or null moment as malformed. Solve and fixture apply report its field.
