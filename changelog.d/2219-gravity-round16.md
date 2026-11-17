### Fixed
#### Preserve corotational recovery templates and identify curved-member endpoints (2026-11-17)

Corotational elastic recovery now returns end actions in a separate type. Complete
member results always use the linear recovery template, including validated
moment-density profiles. Native and WASM regressions verify the zero-resultant
quadratic torque profile, and native small-displacement checks compare all three
moment axes against linear recovery. These profiles already passed on the parent;
this refactor changes no engine answers.

Curved-member stations retain their element coordinate. Joint checks select the
actual member ends instead of counting nearby floating-point samples as ends,
fixing the Web Unit failure while retaining every sampled value and the existing
force assertions (#2219).
