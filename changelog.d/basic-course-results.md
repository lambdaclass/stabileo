### BREAKING (results)
#### Basic: plastic collapse, second order and moment influence lines give different numbers (2026-11-02)

- Plastic collapse no longer stops early under distributed loads. A hinge that would unload as the
  structure turned into a false mechanism now closes and the analysis continues: the portal frame
  example gave 64.06 instead of 71.30. A run that does not reach an admissible mechanism within
  its step limit is reported as not confirmed instead of as a collapse.
- P-Δ and critical load split each member into 4 elements at the solve by default, and B₂ is
  1/(1 − 1/λ₁). Displacements, forces, B₂ and λcr move toward the converged values.
- Influence lines of M take M positive when it puts the bottom fibre in tension.

Re-check plane plastic collapse factors, second-order and buckling results. See
[the affected results](../docs/results-changes/2026-11-basic-course.md).
