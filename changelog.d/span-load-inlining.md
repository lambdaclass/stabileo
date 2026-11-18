### Performance
#### Avoid unused load integrals in span checks (2026-11-17)

Inline member-load evaluation so moment, shear, and rotation queries can omit
unused integrals. Load formulas, arithmetic order, and refusal checks are unchanged.
