### BREAKING (results)

#### A load case with an imposed displacement keeps its shell stresses (2026-11-07)

- Fix #1673: in a model with shells, a load case that imposes a support displacement along with its loads lost all of its plate and quad stresses, and every combination and envelope summed the shell stresses of the other cases only, without a word. That case now reports its shell stresses, and the combinations and envelopes include them. Re-check the shell stresses and slab design of any model with imposed displacements in a load case. Every combination of a model with quads now also lists the nodal stresses of its quads (`quadNodalStresses`), summed from the cases'; no other value changes.
