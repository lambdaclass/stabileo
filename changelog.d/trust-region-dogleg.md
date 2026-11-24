### Added
#### A trust-region iteration among the opt-in nonlinear iterations (2026-11-24)

With the `experimental-nonlinear` Cargo feature, the co-rotational drivers can
iterate by Newton inside a trust region (`trustRegion`), by the dogleg. A step
that releases too little energy is undone and shortened without factorizing
again, and where Newton's step is not a descent a second direction is taken.
On nine hard frames in a single load increment it reaches the right solution
in all nine in 121 linearizations; the line search takes 143 and plain Newton
reaches it in five. Default builds and the web app are unchanged.
