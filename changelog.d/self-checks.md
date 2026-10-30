### BREAKING (results)

#### Static and modal runtime self-checks

Linear static and modal analyses in 2D and 3D now check equilibrium/residuals and modal mass orthogonality before returning results. Failed checks warn visibly; non-finite or severely failed checks refuse publication. Passing checks do not alter numerical results. See [Runtime self-checks](../docs/safety/self-checks.md).

Residuals use dimensionally consistent diagonal energy scaling and no absolute RHS floor. Three-DOF 3D MPC reactions include Z and use 3D force labels. PRO warnings precede results, persist with displayed mode shapes, and appear in printable modal reports; recording controls meet 44 px target and 12 px text minimums.
