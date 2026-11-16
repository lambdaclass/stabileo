# Released rotation basis selection (2026-11-13)

Review #2074 of #2023. Registry entry `released-basis-pivoting`.

At a spatial node with multiple released rotations, sorting physical release
candidates once by alignment could select two almost parallel candidates from
coaxial members before selecting an independent bending direction. Subtracting
those nearly equal directions and normalizing the residual amplified their
component uncertainty by the inverse residual length. The resulting direction
could fail canonicalization even though a well-conditioned physical basis was
available. The reproducer uses two bending releases and roll separation of
1e-13; this number is the review witness, not an engineering limit.

The shared canonicalization now recomputes every remaining candidate's residual
against the selected span and pivots on the largest residual at each step.
Every subtraction and normalization retains its component uncertainty, including
multiplication by the inverse residual length. A residual dominated by its
uncertainty cannot become a basis vector; an incomplete basis cannot certify
a canonical direction. These are data-derived checks, with no new response
allowance or relaxed tolerance. The ordinary stability fallback remains in use
when no canonical physical basis is certified.

The canonicalization is shared by native and WASM static admission, including
initial nonlinear nodal-moment checks. Tests cover coincident axes, separations
below and above the review witness, both member ends, compatible work, signed
genuine moments, and each static entry point. The existing planar release tests
remain controls; planar releases do not construct this spatial basis. Some
SSI controls still report their exact existing singular-stiffness refusal
after initial admission. P-Delta initial-admission controls use a zero iteration
budget, check the complete linear baseline, and require an explicit unconverged
flag. The established corpus separately checks completed P-Delta responses and
the unchanged exact unresolved set. This change does not redesign iteration or
tangent solves.

Re-run spatial frame models with multiple end releases at one node. No silent
wrong answer on origin/main or a release has been established by this review.
The implicated multiple-direction canonicalization was introduced on this
unmerged branch. No advisory is assigned.

The public WASM corpus checker additionally validates every returned P-Delta
linear baseline before recognizing a pinned non-convergence. Missing and
corrupted baselines now fail. The applicability feature includes planar
`axialDistributed` loads applied to truss or cable members, preserving the
existing released-load and transformed-load notices for those models.
