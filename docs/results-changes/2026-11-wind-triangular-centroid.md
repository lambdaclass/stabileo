# Triangular wind symmetry and band torque support

PR #2220 round 11 withdraws unrestricted triangular carrier partitions from
this unmerged branch. Regenerate W/Wa, then rerun analyses, combinations and
design checks. Re-solving stored loads does not correct their load basis.
No new advisory is assigned for this branch-introduced defect.

The earlier triangular median partition conserves force but puts the load at
the triangle's area centroid. That is generally different from the centroid
of its uniformly loaded projected width. For carriers at (0,0), (0,2) and
(2,0), height 4 and unit +Y pressure, the old distributed loads total 8 but
act at x=2/3. Their vertical-axis moment is 16/3 instead of the hand integral
of x over the projected width [0,2], times height: 8. For +X pressure the
corresponding moment is -16/3 instead of -8. Reversing wind reverses these
moments. These numbers follow directly from that specified model.

The shared carrier partition now refuses a noncollinear triangle unless it
is symmetric about the wind direction. In projected order, the middle
carrier must bisect the transverse span and the two outer carriers must have
the same coordinate along the wind. The existing geometric roundoff scale
is retained. A triangle with the right centroid but no reflection symmetry
also refuses. The diagnostic explicitly identifies the unsupported triangular
centroid. This applies before loads reach any solver, through direct fields,
wind cases, other structures, the planner and complete load plans. A planner
refusal rolls back its wind cases and loads.

For the accepted symmetric subset, the existing median shares remain one
third per distinct carrier location; coincident carriers divide that share.
Their transverse first moment is now guaranteed to coincide with the
projected pressure centroid by the symmetry check. The partition depends on
carrier geometry and the physical wind direction. Rotating both together,
mirroring and subdividing one carrier retain its loads. Tests retain
per-carrier distributed ordinates, shear, bending, torsion and tip deflection
checks through 2D/3D linear and P-delta analyses in WASM and native fixtures.
The former nonsymmetric accepted fixtures are now refusal regressions;
symmetric controls exercise the retained answers at the same tolerances.

A general triangular partition was deliberately not introduced. Correcting
only the resultant by additional nodal forces, end couples, or arbitrary
redistribution would not establish member-level equivalence. A future
extension needs an independently specified physical tributary partition
with per-carrier load and response oracles for asymmetric plans.

Separately, torque support previously used one boolean for the entire height
field. An unsupported lower stick disabled representable eccentric loads on
separated upper carriers even when the lower pressure was zero. Support and
coefficients now belong to each member-load segment in a discriminated
union. Supported bands keep their coefficients. Unsupported segments refuse
eccentric loading only when either pressure ordinate is nonzero; there is
no pressure cutoff. Positive, negative and sign-changing unsupported loads
still refuse, including a zero-resultant load with nonzero local pressure.
Concentric loads keep their answers.

For the checked branching control, the lower stick spans z=0..2 and is
unloaded; its two upper carriers span (0,0,2) to (0,±1,6). Unit pressure on
the upper bands gives width (z-2)/2. Each carrier has density (z-2)/4,
and eccentricity e adds opposite force densities ∓e. The member-length
Jacobian is 4/sqrt(17). Integrating these affine member loads independently
gives the test shear, bending, zero torsion and cantilever deflection. The
field and case-2 entry points run this oracle in both dimensions and solver
modes, including signs, rotation, reflection and subdivisions. Exported
inputs are checked for exact parity with the native fixtures.

Signed reproducer commits 33e76fd59 and 92ab24537 add disabled Vitest
reproducers using `known wrong result: #2220`; enable them with
`RUN_KNOWN_WRONG=2220`. Before the fix, the first file reports 164 failures
and 32 passing boundary controls, and the mechanics file reports 40 failures
at the field-wide refusal. The fix removes the skips. Displacement negatives
remove, duplicate or corrupt a non-first carrier tip; the shared assertion
now checks every required tip with its own carrier scale.
