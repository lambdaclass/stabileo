### Performance
#### Reuse the support plan for a beam's own hook tails (2026-11-17)

The joint threading check read where a beam's hooks stand from a second,
identical support plan. It now reads the plan the verification already made,
so each candidate plans its supports once.
