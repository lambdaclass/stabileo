# Buckling and multi-case analysis refuse non-finite results (2026-11-08)

Issues #1759 and #1761. Results-change entry `non-finite-analysis-results`.

Buckling validated bending inertia only for frame members, but its per-member output also reads
inertia for trusses. A negative inertia therefore reached the radius-of-gyration square root. The
result contained NaN effective lengths, and the slenderness guard converted a failed radius
calculation to zero. Buckling now validates the inertia of every member section it reads, including
trusses, and refuses a non-finite or unresolved radius instead of substituting zero. A final result
check withholds any remaining non-finite buckling value.

A minimized multi-case input with finite but overflowing analysis values also returned `Ok` with
non-finite numbers. Both the prepared and per-case 2D/3D multi-case paths now run the existing
result-boundary finite check before returning.

Valid models with finite results are unchanged. Previously accepted invalid models now return an
error instead of NaN, infinity or zero slenderness. A positive radius at or below the former
`1e-12` guard is also refused rather than converted to zero slenderness.

**What to re-check:** buckling per-member effective lengths and slenderness for models with custom
section properties, and any multi-case result produced before this change that contains a
non-finite value. See SA-2026-050.
