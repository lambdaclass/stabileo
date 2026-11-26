### Performance
#### Reuse section capacities across the passes of a code check (2026-11-17)

Verifying an element sizes it, verifies it again with the shared steel fixed,
and rechecks it against the engine; each pass asked for the same column and
biaxial capacities. Within one element's verification a capacity is now
computed once per exact section, bars and demand, and discarded when that
verification ends.
