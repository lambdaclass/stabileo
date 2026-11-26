### Added
#### Adaptive mesh refinement of MITC4 shells, as an optional advanced check (2026-11-24)

The engine can refine a shell mesh where its error estimate says the error is, instead of
everywhere: solve, estimate, split the elements that carry most of the error, and repeat down
to a target. A node left on the edge of an unsplit MITC4 quad is tied to the edge's ends, with
the bending term a thin plate needs not to lock. On an L-shaped membrane it reaches a 10 %
estimate with 456 elements where uniform refinement needs 3,072. Meshes of the other shell
families are still refined as a whole.

In the app it is optional: the discretization panel of a 3D result has a folded "Advanced:
adaptive mesh refinement" section. Opened, it takes a target error and reports each pass, the
estimate reached and how the largest displacement, moments, stresses and reactions move from
the model as drawn to the refined mesh. It does not change the model.
