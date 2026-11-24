### Added
#### Pseudo-transient continuation among the opt-in nonlinear iterations (2026-11-24)

With the `experimental-nonlinear` Cargo feature, the co-rotational drivers can
iterate by pseudo-transient continuation (`pseudoTransient` with a first
`damping`): each step solves the tangent plus a share of its own diagonal, and
the share falls as the steps stop overshooting, until they are Newton's. On
nine hard frames in a single load increment it reaches the right solution in
all nine, where plain Newton reaches it in five and a different equilibrium in
two. The line search does the same in fewer iterations and stays the first
choice. Default builds and the web app are unchanged.
