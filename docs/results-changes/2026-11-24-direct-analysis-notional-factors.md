# Retain nonzero notional factors in direct analysis (2026-11-24)

A small dimensionless load-case factor can multiply a large load into a significant contribution. Direct analysis applied that load in the solve but omitted its explicit notional share when the net factor's magnitude was at most 1e-12. The method could then add its own notional loads or apply them in the wrong direction.

The regression model applies 1e-13 to a notional case carrying 1e13 kN, for a 1 kN contribution. With a negative factor in that model, the cutoff changed the support reaction from approximately 0.49 kN in the equivalent unit-load solve to 0.51 kN. The tip displacement changed as well.

Direct analysis now retains every nonzero net explicit notional factor when it decides how to apply notional loads. Exactly cancelling paths contribute zero. Re-run direct analysis for combinations with small explicit notional factors, including factors reached through composite cases.
