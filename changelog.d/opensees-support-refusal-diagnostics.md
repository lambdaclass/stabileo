### Fixed
#### Require the actual support diagnostic for a correct OpenSees refusal (2026-11-09)

The OpenSees support-contract check now reports `refused` only when the engine identifies an independently detected support defect. Spring conflicts must match the diagnostic code, message, support, node and DOF; settlement refusals must match the support, prescribed direction, value and reason. An unrelated refusal remains `stabileo_failed` with its original error, instead of being counted as correct. Engine calculations, model-wide rotational DOF validation and positive-only spring rules are unchanged. Replaying the same 52 published issue models produced no classification changes: all remain verified support refusals. Addresses review of #1882.
