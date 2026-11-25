# Refusal of malformed authored loads

The input boundary rejects unknown load kinds, missing load payloads, unsupported load frames or shell targets, and non-boolean planar direction flags. It identifies the field in a translated message. Basic validates the original load components before projecting a spatial record into XZ or YZ. Fixture import checks the load records before applying them.

The Basic XZ path previously filled a missing spatial force with zero or discarded a non-finite force on the orthogonal axis before the load ledger detected a mismatch. The refusal now names the original input field. The spatial member-load path accepted unknown frames as local or global. It now refuses those frames. A complete spatial load and the supported member-load frames still produce the reactions required by equilibrium in the linear and P-Delta regressions.

Review any result saved from a malformed load record. Restore the missing component or select a supported load type, frame, and target before rerunning analysis.

The saved-model notice also covers missing and nonfinite numeric load inputs that analysis refuses before projection, including a missing spatial `fz` or a nonfinite spatial `fy`.

Frame and target selectors must belong to the stated load schema. For example, an inclined member carrying a spatial distributed load with `isGlobal` now reports that field as invalid. Specify a spatial `frame` to state whether the load components follow the global or member axes.

Each load kind now rejects unrecognized fields before the solver can apply a default. A spatial distributed load on an inclined member that spells `frame` as `fram` is refused. Previously it was resolved in the member's local axes, changing the support reactions. A present load collection must be an array. A malformed row triggers the saved-model notice even when another row carries unsupported planar torsion.
