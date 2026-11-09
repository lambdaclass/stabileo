### Fixed
#### Support-angle validation and rotation consistency (2026-11-09)

Validation and consistency fix: 2D support angles must be finite with magnitude at most 1,000,000 radians; larger inputs are refused with `invalid_support_angle` and a request to give the angle within one turn. Restraint counting, assembly, spring reactions and prescribed translations now share the same angle reduction. Previously, only the diagnostic restraint count could disagree with assembly for excessive angles; assembly consistently used the raw angle. In-range multi-turn angles can change only in their last floating-point digits. No user received a wrong result, and existing projects do not need a recheck notice.
