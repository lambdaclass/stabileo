# Refusal of malformed authored loads

The input boundary rejects unknown load kinds, missing load payloads, unsupported load frames or shell targets, and non-boolean planar direction flags. It identifies the field in a translated message. Basic validates the original load components before projecting a spatial record into XZ or YZ. Fixture import checks the load records before applying them.

The Basic XZ path previously filled a missing spatial force with zero or discarded a non-finite force on the orthogonal axis before the load ledger detected a mismatch. The refusal now names the original input field. The spatial member-load path accepted unknown frames as local or global. It now refuses those frames. A complete spatial load and the supported member-load frames still produce the reactions required by equilibrium in the linear and P-Delta regressions.

Saved-result rechecks inspect each load row for applicability. In planar workspaces they also flag invalid numeric fields a Basic XZ or YZ projection could previously mask. A null row triggers the notice and the remaining rows are still inspected. Rows with a missing or invalid load type can still carry generation and load-case evidence. Basic clears the previous kinematic diagnosis when a new single solve starts and publishes a new diagnosis if it reaches the rank check.

Review any result saved from a malformed load record. Restore the missing component or select a supported load type, frame, and target before rerunning analysis.
