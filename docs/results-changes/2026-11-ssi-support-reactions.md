# SSI returns support reactions and includes soil springs in constraint forces

## SSI returns support reactions and includes soil springs in constraint forces

This retrospectively registers [PR #1675](https://github.com/lambdaclass/stabileo/pull/1675),
merged on 2026-11-07. The change is intended, not a numerical regression. The PR
explicitly replaced `reactions: []` in both SSI solvers. Its claim that no registry
entry was needed because no previously reported number moved was incorrect:
newly available engineering outputs also change a result.

The reactions use the restrained rows of the assembled residual, including soil
springs at the secants used for the final solve. The same residual supplies
constraint forces; restrained-master redistribution and the existing inclined
reaction builders carry those forces to the supports. This covers dense and
sparse SSI, 2D and 3D, linear and nonlinear soil curves. Constraint forces at a
constrained node with a soil spring can change as well. Displacements and member
forces were not changed by this correction.

The frozen audit replay compares the adjacent parent `477adc7b3` with merge
`d2a75e111`. All six previously empty lists acquire support-force records:

| Frozen SSI input suffix | New reaction node | rx | rz |
| --- | ---: | ---: | ---: |
| 05d0301923fe0235 | 21 | -0.022046866023461148 | 0 |
| 169f627ba8e7f8cf | 11 | 0 | 389.144696748935 |
| 1e44a77f97d2f732 | 21 | -0.20789844971358207 | 0 |
| 67ebce54f921280e | 25 | -0.18719306462142526 | 0 |
| 9d1d31be49ba5639 | 21 | -0.20789844971358207 | 0 |
| c703b27bda5f4eb8 | 11 | 0 | 180.70590035965176 |

Values are copied from the [audit](../verification/soundness-regression-audit-2026-11-11.md),
not inferred from an empty list. The PR's independent checks compare SSI without
soil springs against the linear solver and balance reactions, loads and soil
forces for converged spring models. Its retained tests include dense/sparse
paths, inclined restraints, nonlinear soil and constrained nodes. The new exact
WASM corpus replays all six inputs and a 3D no-soil frame control. The
applicability tests cover both dimensions and exclude recorded linear runs and
empty models.

`ssi-support-reactions` applies only to SSI analyses of models with members,
shells, connectors or springs. Missing analysis history retains the existing
conservative policy. It declares `reactions` and `constraintForces`; it cannot
explain a changed displacement or a non-SSI result. This registration changes
no solver output and creates no advisory. The old missing-reaction defect is
already corrected on main; advisory decisions about historical versions remain
with the coordinator.
