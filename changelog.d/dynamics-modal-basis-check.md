### Fixed
#### Bound the mass Gram error of every returned modal basis (2026-11-10)

Modal analysis now checks the Frobenius norm of the normalized mass Gram matrix against a bound derived from the basis accuracy target and matrix-product rounding. Repeated frequencies receive the same check as separated frequencies. A basis that fails is refused before modes are returned; an exact eigenpair residual alone cannot establish independence. The existing refusal threshold is not increased. Current-main regressions for #759 and #760 already pass, including dense modal references, repeated frequencies, the massless two-DOF analytic response and time-history reciprocity. No new wrong public solver result was reproduced.
