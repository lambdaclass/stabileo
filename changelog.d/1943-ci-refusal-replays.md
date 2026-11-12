### Fixed

#### Preserve oblique truss mechanism diagnostics

- Require translational stiffness to exceed the existing local eigenvalue rounding bound before treating it as resolved. Oblique truss mechanisms again retain every free-translation node (#965, #966, #1095, #1103, #1359, PR #1943).
- Update the staged conditioning regression to require the same exact refusal as the shared linear stability check, while retaining Winkler warnings and healthy staged controls.
