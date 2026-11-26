### Added
#### Newton-Krylov among the opt-in nonlinear iterations (2026-11-24)

With the `experimental-nonlinear` Cargo feature, `IterationMethod::NewtonKrylov`
solves each Newton step by conjugate gradients on the current tangent,
preconditioned by the tangent the load increment factorized first. It takes
Newton's number of iterations from one factorization per increment: a 3D
building frame of 9,720 unknowns solves in 1.05 s instead of 2.26 s. Default
builds and the web app are unchanged.
