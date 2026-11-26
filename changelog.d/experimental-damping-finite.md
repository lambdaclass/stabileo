### Fixed
#### Refuse overflowing experimental pseudo-transient damping (2026-11-25)

Reject an unrepresentable damped tangent before factorization in 2D and 3D. If retry damping overflows, restore the rejected trial and stop with an explicit error. Finite arithmetic and existing convergence and conditioning limits are unchanged.
