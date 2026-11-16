# Continuous settlement references and initial shaft stiffness (2026-11-11)

PR #1940, issue #761, round 4.

The common nonlinear equilibrium metric computes its centroid and extent in
node-relative coordinates. Coincident nodes have exactly zero geometric extent
at the origin and after translation, so their physical point-model scaling
cannot be bypassed by centroid roundoff.

Active support-to-free forcing and admissible applied force jointly set the
reference through their maximum. A tiny applied force no longer discards a
settlement reference. Restrained-only reactions still cannot supply that
reference. At a fully unloaded continuation step, the support-motion extent,
starting admissible load and starting free internal force supply a physical
fallback. This also permits relaxation after a support is removed. Current
nonzero forcing retains precedence over the fallback.

The t-z shaft curve uses a linear initial segment through the existing sampling
point at one millionth of its ultimate displacement. Force and secant stiffness
come from that same segment on both signs, including zero and subnormal motion.
The square-root and saturated segments above it are retained. This removes the
singular stiffness jump introduced on this branch near zero displacement.

Displacement control divides by every nonzero finite control response, checking
the resulting load-factor step for finiteness. A dimensional response cutoff no
longer refuses a valid small target. The signed achieved displacement is checked
by native and WASM regression tests.

Saved linear 3D results with per-case imposed displacements now receive the
prescribed-motion recheck notice, including projects without inclined supports.

Re-run affected nonlinear, SSI and prescribed-motion analyses. Convergence,
accepted displacements and forces can change. No advisory is assigned here.
