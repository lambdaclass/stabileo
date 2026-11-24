### Added
#### Adaptive mesh refinement of MITC4 shells, in the engine (2026-11-24)

The engine can refine a shell mesh where its error estimate says the error is, instead of
everywhere: solve, estimate, split the elements that carry most of the error, and repeat down
to a target. A node left on the edge of an unsplit MITC4 quad is tied to the edge's ends, with
the bending term a thin plate needs not to lock. On an L-shaped membrane it reaches a 10 %
estimate with 456 elements where uniform refinement needs 3,072. Meshes of the other shell
families are still refined as a whole. Nothing in the web app calls it yet.
