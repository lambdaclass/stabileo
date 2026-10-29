### BREAKING (results)

#### Static and modal runtime self-checks

Linear static and modal analyses in 2D and 3D now check equilibrium/residuals and modal mass orthogonality before returning results. Failed checks warn visibly; non-finite or severely failed checks refuse publication. Passing checks do not alter numerical results. See [Runtime self-checks](../docs/safety/self-checks.md).
