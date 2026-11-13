### Fixed

#### Route staged 3D test models through typed units and retain the advisory draft date (#1952)

The three spatial staged-recovery test models now deserialize through
`ElasticInput3D` before conversion to the solver input, satisfying the existing
units-boundary guard without exemptions. SA-2026-061 and the site retain the
2026-11-12 draft date; a separate 2026-11-13 revision records the clarification
of P-Delta containment, unavailable dynamic forces and determined stage results.
The dynamic-force wording again states that withholding is not recovery.
Engine production code, numerical results and tolerances are unchanged.
