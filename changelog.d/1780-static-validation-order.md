### BREAKING (results)

#### Static solves and sessions share the first input refusal (2026-11-08)

Regular 2D/3D static solves, typed inputs and load sessions now use the same input validator before preparing or retaining a model. Models with several faults report the same first reason, including unsupported left-handed axes before support conflicts. Sessions validate the supplied input before clearing its initial loads. The support conflict rule stays enforced, and a refused settlement on a free elastic DOF names the spring. Existing valid-model numerical assertions and tolerances are unchanged; regression controls explicitly declare rigid or elastic supports, and additional unchanged fuzz seeds retain the existing solved-model quotas. See [the results change](../docs/results-changes/2026-11-static-validation-order.md).
