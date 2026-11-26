# Conditioned staged response refinement (2026-11-26)

A conditionally admitted dense staged solve applied the response accuracy
audit directly to the factorization result. Ordinary static analysis on
the same branch first applied compensated residual refinement. This led to
different recovered member forces on the archived #1846 stage with an
unchanged stiffness and all its loads applied together.

Dense staged solves now call the same compensated refinement and response
audit as ordinary static solves. The routine uses the prepared stage
equation and its incremental load. The stiffness rank check, accuracy
limit, and physical recovery are still applied. Recheck saved staged
analysis of models with extreme stiffness contrasts.
