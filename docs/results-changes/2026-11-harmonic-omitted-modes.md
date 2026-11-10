# Harmonic response resolves omitted modes beyond the dense ceiling (2026-11-10)

Issue #1434. PR #1922. Results-change entry `harmonic-omitted-modes`.
Safety advisory [SA-2026-058](../advisories/SA-2026-058-harmonic-omitted-modes.md),
fixed in PR #1922, pending release.

The harmonic solver already replaced modal responses outside its accepted truncation
range with a full direct solve when the real block system fit the dense ceiling.
Above that ceiling it skipped replacement. A small global load residual could then
admit a response whose target amplitude and phase were inaccurate. Main warned about uncorrected frequencies with q ≥ 1/2, but that warning did
not cover inaccurate, statically corrected frequencies with 1/16 < q < 1/2.

The 2D and 3D regression systems have 3001 independent spring-supported point masses.
Their target is mode 100, with stiffness 10000 and mass 1 in the engine's units.
Loads of 1 on mode 1 and 0.0001 on mode 100 make the missing target response small
in the global residual. Near the target resonance, at 15.756339366097638 Hz, the
previous result was `(1.5508399464958143e-10, -3.2325425313764277e-9)` while an
independent direct two-DOF solve and the scalar closed form agree on
`(1.8265674322904892e-11, -3.029586965358748e-9)`. The full sweep did carry the warning "static correction not applied at 2
frequencies (up to 47.7465 Hz)" and HARM-TRUNCATION. Their source list contains
only indices [4, 5], at 31.830988618379067 and 47.7464829275686 Hz; it excludes
the 8.07902813793105% complex error at 15.756339366097638 Hz and the wrong points
at 15.915494309189533 and 16.07464925228143 Hz. The UI shows warnings once for
the sweep, without frequency markers. See the [main replay](../advisories/replays/SA-2026-058-main-frequency-coverage.txt). These are synthetic test data,
not recommended engineering inputs.

Every frequency outside the existing q limit of 1/16 now receives a full solve
regardless of system size. The existing dense block LU remains below its ceiling;
above it, sparse Gaussian elimination with partial row pivoting solves the same
real block system. Real and imaginary unknowns are interleaved after an AMD
ordering of the stiffness/mass union pattern. No eigenvalue or damping-model
change is involved, and selection remains independent of the load. The modal
residual refusal and truncation threshold remain unchanged.

Both full harmonic paths now scale each block column by the maximum of its
stiffness, inertia and damping contributions before elimination. This retains
the existing 1e-14 pivot cutoff on dimensionless columns, with scale floored at
1 so the former absolute refusal is never relaxed. The dense path still uses
`lu_solve`; other callers of that generic LU routine are unchanged. Scaling
before LU makes its pivot criterion relative to the physical contributions,
including when K and omega² M nearly cancel. The sparse path applies the same
policy. A structural-scale undamped resonance previously returned huge finite
responses from roundoff pivots; both paths now refuse, while damped near-resonance
responses match the scalar closed form.

Sparse storage is admitted against the byte allowance of the existing maximum
dense matrix, with conservative charges of 256 bytes per block-system row and
256 bytes per stored entry, including the column index and temporary pivot copies.
Assembly and fill insertion check this allowance before growing storage. Excessive
fill, singular dynamic stiffness or non-finite arithmetic returns an error; none
returns the original modal approximation. This allowance limits storage, not runtime.

A sweep solved entirely in full reports `direct`; a mixed sweep lists the replaced
frequencies in `directFrequencies`. HARM-TRUNCATION and the uncorrected-mode warning
are removed after replacement. The remaining low-frequency modal response is still
an approximation within the existing acceptance policy. A separate MD-ORTHOGONALITY
diagnostic may still apply to a 3D mixed sweep.

**What to re-check:** harmonic responses from models above 3000 independent free
DOFs, especially near or above the first omitted mode. Check real and imaginary
response, amplitude, phase and the sampled peak, including old results without a
truncation warning. Smaller models retain their existing direct/modal selection.
