### Fixed
#### Support-angle validation and rotation consistency (2026-11-09)

Validation and consistency fix: 2D support angles must be finite with magnitude at most 1,000,000 radians; larger inputs are refused with `invalid_support_angle` and a request to give the angle within one turn. Restraint counting, assembly, spring reactions and prescribed translations now share the same angle reduction. Previously, the diagnostic restraint count reduced angles while assembly used the raw angle. Accepted angles (`|angle| <= 1e6` radians) are reduced to one turn with an orientation change of at most about 1.29e-10 radians.
